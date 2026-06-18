import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import * as fs from 'fs'

class HelperManager {
  private nativeProcess: ChildProcess | null = null
  private responseQueue: ((value: any) => void)[] = []
  private isShuttingDown = false
  private helperPath = ''

  constructor() {
    // Determine path to phonebridge-native.exe
    const devPath = join(app.getAppPath(), '../phonebridge-native/bin/Debug/net8.0-windows10.0.19041.0/phonebridge-native.exe')
    const prodPath = join(process.resourcesPath, 'phonebridge-native/phonebridge-native.exe')
    const directPath = join(__dirname, '../../phonebridge-native/bin/Debug/net8.0-windows10.0.19041.0/phonebridge-native.exe')

    if (fs.existsSync(directPath)) {
      this.helperPath = directPath
    } else if (fs.existsSync(devPath)) {
      this.helperPath = devPath
    } else {
      this.helperPath = prodPath
    }

    console.log(`[HelperManager] Native service path resolved to: ${this.helperPath}`)
  }

  public start(): void {
    if (this.nativeProcess) {
      return
    }

    this.isShuttingDown = false
    console.log('[HelperManager] Spawning phonebridge-native helper...')

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
            const resolve = this.responseQueue.shift()
            if (resolve) {
              resolve(parsed)
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
      if (!this.nativeProcess) {
        resolve({ status: 'error', error: 'Helper process is not running' })
        return
      }

      const payload = JSON.stringify({ command, args }) + '\n'
      this.responseQueue.push(resolve)
      this.nativeProcess.stdin?.write(payload)
    })
  }

  public async getCallingStatus(): Promise<any> {
    try {
      const res = await this.sendCommand('GET_CALLING_STATUS')
      if (res && res.status === 'success') {
        return res.data
      }
      console.error('[HelperManager] GET_CALLING_STATUS failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error fetching calling status:', err)
    }
    return null
  }

  public async startPairing(): Promise<boolean> {
    try {
      const res = await this.sendCommand('START_PAIRING')
      return res && res.status === 'success'
    } catch (err) {
      console.error('[HelperManager] Error triggering pairing:', err)
    }
    return false
  }

  public async getAudioDevices(): Promise<any[]> {
    try {
      const res = await this.sendCommand('LIST_DEVICES')
      if (res && res.status === 'success') {
        return res.data?.devices || []
      }
      console.error('[HelperManager] LIST_DEVICES failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error fetching audio devices:', err)
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
      if (res && res.status === 'success') {
        console.log('[HelperManager] Audio routing started successfully.')
        return true
      }
      console.error('[HelperManager] START_AUDIO_ROUTING failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error starting routing:', err)
    }
    return false
  }

  public async stopLoopback(): Promise<boolean> {
    try {
      const res = await this.sendCommand('STOP_AUDIO_ROUTING')
      if (res && res.status === 'success') {
        console.log('[HelperManager] Audio routing stopped successfully.')
        return true
      }
      console.error('[HelperManager] STOP_AUDIO_ROUTING failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error stopping routing:', err)
    }
    return false
  }

  public async setMute(muted: boolean): Promise<boolean> {
    try {
      const res = await this.sendCommand('SET_MUTE', { muted })
      if (res && res.status === 'success') {
        return true
      }
      console.error('[HelperManager] SET_MUTE failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error setting mute status:', err)
    }
    return false
  }
}

export const helperManager = new HelperManager()
