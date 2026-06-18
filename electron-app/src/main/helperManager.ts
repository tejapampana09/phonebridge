import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import * as fs from 'fs'

class HelperManager {
  private pythonProcess: ChildProcess | null = null
  private responseQueue: ((value: any) => void)[] = []
  private isShuttingDown = false
  private helperPath = ''

  constructor() {
    // Determine path to helper.py
    const devPath = join(app.getAppPath(), '../phonebridge-helper/helper.py')
    const prodPath = join(app.getAppPath(), 'phonebridge-helper/helper.py')
    const directPath = join(__dirname, '../../phonebridge-helper/helper.py')

    if (fs.existsSync(directPath)) {
      this.helperPath = directPath
    } else if (fs.existsSync(devPath)) {
      this.helperPath = devPath
    } else {
      this.helperPath = prodPath
    }

    console.log(`[HelperManager] Helper script path resolved to: ${this.helperPath}`)
  }

  public start(): void {
    if (this.pythonProcess) {
      return
    }

    this.isShuttingDown = false
    console.log('[HelperManager] Spawning python audio helper...')

    try {
      this.pythonProcess = spawn('python', [this.helperPath])

      let stdoutBuffer = ''
      this.pythonProcess.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString('utf-8')
        const lines = stdoutBuffer.split('\n')
        // Keep the last partial line in the buffer
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
            console.error('[HelperManager] Error parsing helper JSON line:', err, 'Line:', trimmed)
          }
        }
      })

      this.pythonProcess.stderr?.on('data', (data: Buffer) => {
        console.warn(`[Helper stderr]: ${data.toString('utf-8').trim()}`)
      })

      this.pythonProcess.on('close', (code) => {
        console.log(`[HelperManager] Python helper process closed with code ${code}`)
        this.pythonProcess = null
        this.responseQueue.forEach(resolve => resolve({ status: 'error', error: 'Process closed' }))
        this.responseQueue = []

        if (!this.isShuttingDown) {
          console.log('[HelperManager] Unexpected exit. Restarting in 3 seconds...')
          setTimeout(() => this.start(), 3000)
        }
      })
    } catch (err) {
      console.error('[HelperManager] Failed to spawn python helper:', err)
    }
  }

  public stop(): void {
    this.isShuttingDown = true
    if (this.pythonProcess) {
      console.log('[HelperManager] Stopping python helper process...')
      this.pythonProcess.kill()
      this.pythonProcess = null
    }
  }

  private sendCommand(command: string, args: object = {}): Promise<any> {
    return new Promise((resolve) => {
      if (!this.pythonProcess) {
        resolve({ status: 'error', error: 'Helper process is not running' })
        return
      }

      const payload = JSON.stringify({ command, args }) + '\n'
      this.responseQueue.push(resolve)
      this.pythonProcess.stdin?.write(payload)
    })
  }

  public async getAudioDevices(): Promise<any[]> {
    try {
      const res = await this.sendCommand('LIST_DEVICES')
      if (res && res.status === 'success') {
        return res.devices || []
      }
      console.error('[HelperManager] LIST_DEVICES failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error fetching audio devices:', err)
    }
    return []
  }

  public async startLoopback(
    phoneInput: string | number,
    phoneOutput: string | number,
    pcInput: string | number,
    pcOutput: string | number
  ): Promise<boolean> {
    try {
      const res = await this.sendCommand('START_LOOPBACK', {
        phone_input: phoneInput,
        phone_output: phoneOutput,
        pc_input: pcInput,
        pc_output: pcOutput
      })
      if (res && res.status === 'success') {
        console.log('[HelperManager] Loopback started successfully:', res.rates)
        return true
      }
      console.error('[HelperManager] START_LOOPBACK failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error starting loopback:', err)
    }
    return false
  }

  public async stopLoopback(): Promise<boolean> {
    try {
      const res = await this.sendCommand('STOP_LOOPBACK')
      if (res && res.status === 'success') {
        console.log('[HelperManager] Loopback stopped successfully.')
        return true
      }
      console.error('[HelperManager] STOP_LOOPBACK failed:', res?.error)
    } catch (err) {
      console.error('[HelperManager] Error stopping loopback:', err)
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
