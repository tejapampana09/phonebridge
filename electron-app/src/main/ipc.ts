import { ipcMain, BrowserWindow } from 'electron'
import { generateQR } from './qr'
import {
  getNotifications,
  getCalls,
  getSmsThreads,
  getSmsMessages,
  getPhotos,
  getDeviceStatus,
  saveSmses,
  dismissNotification as dbDismissNotification
} from './database'
import { sendToPhone, getConnectedCount, getConnectedDeviceNames } from './server'
import { isBluetoothAvailable, sendViaBluetooth } from './bluetooth'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export function emitToRenderer(event: string, data: any): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, data)
  }
}

export function registerIpcHandlers(): void {
  // 1. Get QR Code
  ipcMain.handle('get-qr-code', async () => {
    try {
      const qrDataUrl = await generateQR()
      return qrDataUrl
    } catch (err) {
      console.error('Failed to generate QR in IPC handler:', err)
      throw err
    }
  })

  // 2. Get Connection Status
  ipcMain.handle('get-connection-status', () => {
    const wsConnected = getConnectedCount() > 0
    // Simple placeholder logic for Bluetooth connection status — if we sent something successfully or have client
    const btConnected = false // Handled inside bluetooth.ts triggers
    const devices = getConnectedDeviceNames()
    const deviceName = devices.length > 0 ? devices[0] : 'Android Phone'
    
    return {
      wsConnected,
      btConnected,
      deviceName,
      btAvailable: isBluetoothAvailable()
    }
  })

  // 3. Send SMS from PC
  ipcMain.handle('send-sms', async (_, { to, message }) => {
    const payload = {
      type: 'SEND_SMS',
      to,
      message
    }
    console.log(`[IPC] Sending SMS to ${to}: ${message}`)
    
    // Try sending over WS first, fallback to Bluetooth
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }

    if (success) {
      const now = new Date().toISOString()
      saveSmses({
        threads: [
          {
            id: to,
            address: to,
            name: to,
            lastMessage: message,
            timestamp: now,
            messages: [
              {
                id: `sms_sent_${Date.now()}`,
                threadId: to,
                address: to,
                name: to,
                body: message,
                timestamp: now,
                direction: 'out'
              }
            ]
          }
        ]
      })
    }
    return success
  })

  // 4. Dismiss Notification
  ipcMain.handle('dismiss-notification', async (_, id) => {
    const payload = {
      type: 'DISMISS_NOTIFICATION',
      id
    }
    console.log(`[IPC] Dismissing notification ${id}`)
    
    dbDismissNotification(id)
    
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    return success
  })

  // 4.5. Dial Number from PC
  ipcMain.handle('dial-number', async (_, number) => {
    const payload = {
      type: 'DIAL_NUMBER',
      number
    }
    console.log(`[IPC] Dialing number: ${number}`)
    
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    return success
  })

  // 4.6. Reply to Notification from PC
  ipcMain.handle('reply-notification', async (_, { id, message }) => {
    const payload = {
      type: 'REPLY_NOTIFICATION',
      id,
      message
    }
    console.log(`[IPC] Replying to notification ${id}: ${message}`)
    
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    return success
  })

  // 5. Database queries
  ipcMain.handle('get-notifications', async () => {
    return getNotifications(50)
  })

  ipcMain.handle('get-calls', async () => {
    return getCalls(100)
  })

  ipcMain.handle('get-sms-threads', async () => {
    return getSmsThreads()
  })

  ipcMain.handle('get-sms-messages', async (_, threadId) => {
    return getSmsMessages(threadId)
  })

  ipcMain.handle('get-photos', async () => {
    return getPhotos()
  })

  ipcMain.handle('get-device-status', async () => {
    return getDeviceStatus()
  })

  // 6. Request Sync
  ipcMain.handle('request-sync', async () => {
    const payload = {
      type: 'REQUEST_SYNC',
      what: 'all'
    }
    console.log('[IPC] Requesting sync')
    
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    return success
  })
}
