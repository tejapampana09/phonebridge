import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import * as fs from 'fs'
import * as net from 'net'

class HelperManager {
  private nativeProcess: ChildProcess | null = null
  private responseQueue: ((value: any) => void)[] = []
  private pendingRequests = new Map<string, (value: any) => void>()
  private nextRequestId = 1
  private isShuttingDown = false
  private helperPath = ''

  constructor() {
    // Determine path to phonebridge-helper.exe
    const devPath = join(app.getAppPath(), '../phonebridge-native/bin/Debug/net8.0-windows10.0.19041.0/win-x64/publish/phonebridge-helper.exe')
    const prodPath = join(process.resourcesPath, 'phonebridge-native/phonebridge-helper.exe')
    const directPath = join(__dirname, '../../phonebridge-native/bin/Debug/net8.0-windows10.0.19041.0/win-x64/publish/phonebridge-helper.exe')

    if (fs.existsSync(directPath)) {
      this.helperPath = directPath
    } else if (fs.existsSync(devPath)) {
      this.helperPath = devPath
    } else {
      this.helperPath = prodPath
    }

    console.log(`[HelperManager] Native helper service path resolved to: ${this.helperPath}`)
  }

  public start(): void {
    if (this.nativeProcess) {
      return
    }

    this.isShuttingDown = false
    console.log('[HelperManager] Spawning phonebridge-helper process...')

    try {
      this.nativeProcess = spawn(this.helperPath)

      let stdoutBuffer = ''
      this.nativeProcess.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString('utf-8')
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed)
            const reqId = parsed.requestId
            if (reqId && this.pendingRequests.has(reqId)) {
              const resolve = this.pendingRequests.get(reqId)
              this.pendingRequests.delete(reqId)
              if (resolve) {
                resolve(parsed)
              }
            } else {
              const resolve = this.responseQueue.shift()
              if (resolve) {
                resolve(parsed)
              }
            }
          } catch (err) {
            console.error('[HelperManager] Error parsing native JSON line:', err, 'Line:', trimmed)
          }
        }
      })

      this.nativeProcess.stderr?.on('data', (data: Buffer) => {
        console.warn(`[Helper stderr]: ${data.toString('utf-8').trim()}`)
      })

      this.nativeProcess.on('close', (code) => {
        console.log(`[HelperManager] Native helper process closed with code ${code}`)
        this.nativeProcess = null
        this.responseQueue.forEach(resolve => resolve({ status: 'error', error: 'Process closed' }))
        this.responseQueue = []
        this.pendingRequests.forEach(resolve => resolve({ status: 'error', error: 'Process closed' }))
        this.pendingRequests.clear()

        if (!this.isShuttingDown) {
          console.log('[HelperManager] Unexpected exit. Restarting in 3 seconds...')
          setTimeout(() => this.start(), 3000)
        }
      })
    } catch (err) {
      console.error('[HelperManager] Failed to spawn native helper:', err)
    }
  }

  public stop(): void {
    this.isShuttingDown = true
    if (this.nativeProcess) {
      console.log('[HelperManager] Stopping native helper process...')
      this.nativeProcess.kill()
      this.nativeProcess = null
    }
  }

  private sendCommand(command: string, args: object = {}): Promise<any> {
    return new Promise((resolve) => {
      const requestId = String(this.nextRequestId++)
      const payload = JSON.stringify({ command, args, requestId }) + '\n'
      let isResolved = false

      const safeResolve = (val: any) => {
        if (!isResolved) {
          isResolved = true
          resolve(val)
        }
      }

      // Try sending via TCP to port 5050 on 127.0.0.1 (IPv4 loopback) to match C# listener exactly
      const client = net.connect({ port: 5050, host: '127.0.0.1' }, () => {
        client.write(payload)
      })

      let dataBuffer = ''
      client.on('data', (data) => {
        dataBuffer += data.toString('utf-8')
        const lines = dataBuffer.split('\n')
        dataBuffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed)
            safeResolve(parsed)
            client.destroy()
            return
          } catch (err) {
            console.error('[HelperManager] Error parsing TCP JSON:', err)
          }
        }
      })

      client.on('error', (err) => {
        if (isResolved) return
        // Fallback to stdin/stdout if TCP connection fails
        console.warn('[HelperManager] TCP IPC failed, falling back to stdin/stdout:', err.message)
        if (!this.nativeProcess) {
          safeResolve({ status: 'error', error: 'Helper process is not running' })
          return
        }
        this.pendingRequests.set(requestId, safeResolve)
        this.nativeProcess.stdin?.write(payload)
      })

      // Timeout after 15 seconds to allow slow bluetooth paired scan operations
      client.setTimeout(15000)
      client.on('timeout', () => {
        console.warn('[HelperManager] TCP IPC timeout, destroying socket.')
        client.destroy()
        safeResolve({ status: 'error', error: 'TCP IPC timeout' })
      })
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HFP Helper APIs
  // ──────────────────────────────────────────────────────────────────────────

  public async listDevices(): Promise<any[]> {
    try {
      const res = await this.sendCommand('LIST_DEVICES')
      if (Array.isArray(res)) return res
      if (res && res.status === 'success') {
        if (Array.isArray(res.data)) return res.data
        if (res.data && Array.isArray(res.data.devices)) return res.data.devices
      }
      if (res && Array.isArray(res.devices)) return res.devices
    } catch (err) {
      console.error('[HelperManager] listDevices failed:', err)
    }
    return []
  }

  public async connectHfp(deviceId: string): Promise<any> {
    try {
      return await this.sendCommand('CONNECT_HFP', { deviceId })
    } catch (err) {
      console.error('[HelperManager] connectHfp failed:', err)
      return { success: false, error: String(err) }
    }
  }

  public async disconnectHfp(deviceId: string): Promise<any> {
    try {
      return await this.sendCommand('DISCONNECT_HFP', { deviceId })
    } catch (err) {
      console.error('[HelperManager] disconnectHfp failed:', err)
      return { success: false, error: String(err) }
    }
  }

  public async getHfpStatus(): Promise<any> {
    try {
      return await this.sendCommand('GET_HFP_STATUS')
    } catch (err) {
      console.error('[HelperManager] getHfpStatus failed:', err)
    }
    return { connected: false, device: null }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Compatibility Wrappers for existing UI
  // ──────────────────────────────────────────────────────────────────────────

  public async getCallingStatus(includePairedDevices: boolean = false): Promise<any> {
    try {
      const status = await this.getHfpStatus()
      let pairedDevices: any[] = []
      let connectedDevice: any = null

      if (includePairedDevices) {
        pairedDevices = await this.listDevices()
        connectedDevice = pairedDevices.find(d => d.connected)
      }

      return {
        connected: status.connected,
        device: status.device,
        connectedPhone: status.connected ? {
          name: status.device,
          id: connectedDevice?.id || status.deviceId || '',
          hfpVerified: true
        } : null,
        pairedDevices,
        audioDevices: {
          phoneInput: status.connected ? { id: 'auto', name: 'Hands-Free AG Audio' } : null,
          phoneOutput: status.connected ? { id: 'auto', name: 'Hands-Free AG Audio' } : null,
          pcInput: { id: 'auto', name: 'Default PC Microphone' },
          pcOutput: { id: 'auto', name: 'Default PC Speakers' }
        },
        audioRoutingActive: false,
        isMuted: false
      }
    } catch (err) {
      console.error('[HelperManager] getCallingStatus failed:', err)
    }
    return null
  }

  public async startPairing(): Promise<boolean> {
    try {
      const res = await this.sendCommand('START_PAIRING')
      return res && (res.status === 'success' || res.message !== undefined)
    } catch (err) {
      console.error('[HelperManager] Error triggering pairing:', err)
    }
    return false
  }

  public async getAudioDevices(): Promise<any[]> {
    try {
      const res = await this.sendCommand('GET_AUDIO_DEVICES')
      let rawDevices: any[] = []
      if (Array.isArray(res)) {
        rawDevices = res
      } else if (res && res.status === 'success' && Array.isArray(res.data)) {
        rawDevices = res.data
      }

      return rawDevices.map((d: any) => ({
        index: d.id || d.Id,
        name: d.name || d.Name,
        max_input_channels: (d.flow || d.Flow) === 'Capture' ? 1 : 0,
        max_output_channels: (d.flow || d.Flow) === 'Render' ? 1 : 0
      }))
    } catch (err) {
      console.error('[HelperManager] getAudioDevices failed:', err)
    }
    return []
  }

  public async startLoopback(
    phoneInput?: string | number,
    phoneOutput?: string | number,
    pcInput?: string | number,
    pcOutput?: string | number
  ): Promise<boolean> {
    try {
      const phoneInputId = typeof phoneInput === 'string' ? phoneInput : undefined
      const phoneOutputId = typeof phoneOutput === 'string' ? phoneOutput : undefined
      const pcInputId = typeof pcInput === 'string' ? pcInput : undefined
      const pcOutputId = typeof pcOutput === 'string' ? pcOutput : undefined

      const res = await this.sendCommand('START_AUDIO_ROUTING', {
        phoneInputId,
        phoneOutputId,
        pcInputId,
        pcOutputId
      })
      return res && (res.status === 'success' || res.message !== undefined)
    } catch (err) {
      console.error('[HelperManager] Error starting routing:', err)
    }
    return false
  }

  public async stopLoopback(): Promise<boolean> {
    try {
      const res = await this.sendCommand('STOP_AUDIO_ROUTING')
      return res && (res.status === 'success' || res.message !== undefined)
    } catch (err) {
      console.error('[HelperManager] Error stopping routing:', err)
    }
    return false
  }

  public async setMute(muted: boolean): Promise<boolean> {
    try {
      const res = await this.sendCommand('SET_MUTE', { muted })
      return res && (res.status === 'success' || res.muted !== undefined)
    } catch (err) {
      console.error('[HelperManager] Error setting mute status:', err)
    }
    return false
  }
}

export const helperManager = new HelperManager()
