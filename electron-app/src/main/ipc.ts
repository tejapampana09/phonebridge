import { ipcMain, BrowserWindow, app, dialog, clipboard } from 'electron'
import { generateQR } from './qr'
import * as fs from 'fs'
import { join } from 'path'
import {
  getNotifications,
  getCalls,
  getSmsThreads,
  getSmsMessages,
  getPhotos,
  getDeviceStatus,
  saveSmses,
  getContacts,
  getApps,
  dismissNotification as dbDismissNotification,
  deleteSmsMessage,
  readData,
  addContact,
  deleteContact,
  deletePhoto,
  getCalendarEvents
} from './database'
import { sendToPhone, getConnectedCount, getConnectedDeviceNames } from './server'
import { isBluetoothAvailable, sendViaBluetooth, isBluetoothConnected, disconnectBluetoothClient } from './bluetooth'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export function emitToRenderer(event: string, data: any): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, data)
  }
}

const settingsPath = join(app.getPath('userData'), 'settings.json')

export function getSettings(): any {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    }
  } catch (err) {
    console.error('Error reading settings:', err)
  }
  return {}
}

export function saveSettings(s: object): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf8')
  } catch (err) {
    console.error('Error writing settings:', err)
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

  // 1.1 settings handlers
  ipcMain.handle('get-settings', () => getSettings())
  ipcMain.handle('set-setting', (_, key: string, value: unknown) => {
    const s = getSettings()
    s[key] = value
    saveSettings(s)
    if (key === 'openAtLogin') {
      app.setLoginItemSettings({ openAtLogin: Boolean(value) })
    }
    return true
  })

  // 1.2 file dialog handler
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // 2. Get Connection Status
  ipcMain.handle('get-connection-status', () => {
    const wsConnected = getConnectedCount() > 0
    const btConnected = isBluetoothConnected()
    const devices = getConnectedDeviceNames()
    const deviceName = devices.length > 0 ? devices[0] : 'Android Phone'
    
    return {
      wsConnected,
      btConnected,
      deviceName,
      btAvailable: isBluetoothAvailable()
    }
  })

  // 2.1 Unlink Device
  ipcMain.handle('unlink-device', async () => {
    console.log('[IPC] Unlinking device...')
    const { disconnectAllClients } = require('./server')
    const { clearAllData } = require('./database')

    disconnectBluetoothClient()
    disconnectAllClients()
    clearAllData()

    return true
  })

  // 3. Send SMS from PC
  ipcMain.handle('send-sms', async (_, args) => {
    const { to, message } = args as { to: string; message: string }
    const payload = {
      type: 'SEND_SMS',
      to,
      body: message
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

  // Trigger Notification Action
  ipcMain.handle('trigger-notification-action', async (_, { id, index, message }) => {
    const payload = {
      type: 'NOTIFICATION_ACTION',
      id,
      index,
      message
    }
    console.log(`[IPC] Triggering notification action for ${id}, index ${index}, msg: ${message}`)
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    return success
  })

  // 4.7. Clipboard handlers
  ipcMain.handle('get-clipboard', () => clipboard.readText())
  ipcMain.handle('set-clipboard', (_, text: string) => {
    clipboard.writeText(text)
    return true
  })
  ipcMain.handle('send-clipboard-to-phone', async (_, text: string) => {
    const payload = {
      type: 'SET_CLIPBOARD',
      text
    }
    console.log(`[IPC] Sending clipboard to phone: ${text}`)
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    return success
  })

  // 4.8. App launcher handler
  ipcMain.handle('launch-app', async (_, packageName: string) => {
    const payload = { type: 'LAUNCH_APP', package: packageName }
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    return success
  })

  // 4.9. Mark thread as read
  ipcMain.handle('mark-thread-read', async (_, threadId: string) => {
    const { markThreadRead } = require('./database')
    markThreadRead(threadId)
    return true
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

  // get-contacts
  ipcMain.handle('get-contacts', async () => {
    return getContacts()
  })

  // get-apps
  ipcMain.handle('get-apps', async () => {
    return getApps()
  })

  // get-photo-data
  ipcMain.handle('get-photo-data', async (_, id) => {
    try {
      const dbData = readData()
      const pMeta = dbData.photos.find(p => p.id === id)
      const ext = pMeta && pMeta.isVideo ? 'mp4' : 'jpg'
      const mime = pMeta && pMeta.isVideo ? 'video/mp4' : 'image/jpeg'
      
      const photosDir = join(app.getPath('userData'), 'photos')
      const filePath = join(photosDir, `${id}.${ext}`)
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath)
        return `data:${mime};base64,${data.toString('base64')}`
      }
    } catch (err) {
      console.error('Failed to read local photo:', err)
    }
    return null
  })

  // download-photo
  ipcMain.handle('download-photo', async (_, id) => {
    const payload = {
      type: 'REQUEST_FILE',
      fileId: id,
      fileType: 'photo'
    }
    console.log(`[IPC] Requesting photo download for: ${id}`)
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      return true
    } else if (isBluetoothAvailable()) {
      return sendViaBluetooth(payload)
    }
    return false
  })

  // send-file-to-phone
  ipcMain.handle('send-file-to-phone', async (_, { filePath }) => {
    try {
      if (!fs.existsSync(filePath)) return false
      const stat = fs.statSync(filePath)
      const fileName = require('path').basename(filePath)
      const fileSize = stat.size
      const fileId = `file_${Date.now()}`
      
      const CHUNK_SIZE = 64 * 1024 // 64 KB
      const buffer = fs.readFileSync(filePath)
      const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)

      // Send start
      const startPayload = {
        type: 'FILE_TRANSFER_START',
        fileId,
        fileName,
        fileSize,
        totalChunks
      }
      if (getConnectedCount() > 0) {
        sendToPhone(startPayload)
      } else if (isBluetoothAvailable()) {
        sendViaBluetooth(startPayload)
      }

      // Send chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, fileSize)
        const chunk = buffer.subarray(start, end)
        const dataBase64 = chunk.toString('base64')

        const chunkPayload = {
          type: 'FILE_TRANSFER_CHUNK',
          fileId,
          chunkIndex: i,
          data: dataBase64
        }
        if (getConnectedCount() > 0) {
          sendToPhone(chunkPayload)
        } else if (isBluetoothAvailable()) {
          sendViaBluetooth(chunkPayload)
        }

        // Emit progress update to renderer
        emitToRenderer('phone-event', {
          type: 'FILE_TRANSFER_PROGRESS',
          data: {
            fileId,
            fileName,
            direction: 'upload',
            progress: Math.round(((i + 1) / totalChunks) * 100),
            chunkIndex: i,
            totalChunks
          }
        })

        // Delay to prevent network packet congestion
        await new Promise((resolve) => setTimeout(resolve, 15))
      }

      // Send end
      const endPayload = {
        type: 'FILE_TRANSFER_END',
        fileId
      }
      if (getConnectedCount() > 0) {
        sendToPhone(endPayload)
      } else if (isBluetoothAvailable()) {
        sendViaBluetooth(endPayload)
      }
      
      emitToRenderer('phone-event', {
        type: 'FILE_TRANSFER_PROGRESS',
        data: {
          fileId,
          fileName,
          direction: 'upload',
          progress: 100,
          chunkIndex: totalChunks,
          totalChunks
        }
      })

      console.log(`[IPC] File sent: ${fileName}`)
      return true
    } catch (err) {
      console.error('[IPC] Failed to send file to phone:', err)
      return false
    }
  })

  // answer-call
  ipcMain.handle('answer-call', async () => {
    const payload = { type: 'ANSWER_CALL' }
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      return true
    } else if (isBluetoothAvailable()) {
      return sendViaBluetooth(payload)
    }
    return false
  })

  // reject-call
  ipcMain.handle('reject-call', async () => {
    const payload = { type: 'REJECT_CALL' }
    let success = false
    if (getConnectedCount() > 0) {
      sendToPhone(payload)
      success = true
    } else if (isBluetoothAvailable()) {
      success = sendViaBluetooth(payload)
    }
    // Immediately close the incoming call modal on PC without waiting for Android confirmation
    emitToRenderer('phone-event', { type: 'CALL_UPDATE', data: { status: 'ended' } })
    return success
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

  // search-sms handler
  ipcMain.handle('search-sms', async (_, query: string) => {
    const data = readData()
    const q = query.toLowerCase()
    return data.sms_messages.filter(m =>
      m.body.toLowerCase().includes(q) ||
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.address && m.address.includes(q))
    ).slice(0, 100)
  })

  // delete-sms-message handler
  ipcMain.handle('delete-sms-message', async (_, id: string) => {
    deleteSmsMessage(id)
    sendToPhone({ type: 'DELETE_SMS', msgId: id })
    return true
  })

  // create-contact handler
  ipcMain.handle('create-contact', async (_, { name, number }) => {
    sendToPhone({ type: 'CREATE_CONTACT', name, number })
    return true
  })

  // update-contact handler
  ipcMain.handle('update-contact', async (_, { contactId, name, number }) => {
    sendToPhone({ type: 'UPDATE_CONTACT', contactId, name, number })
    return true
  })

  // delete-contact handler
  ipcMain.handle('delete-contact', async (_, contactId: string) => {
    deleteContact(contactId)
    sendToPhone({ type: 'DELETE_CONTACT', contactId })
    return true
  })

  // list-phone-files handler
  ipcMain.handle('list-phone-files', async (_, path: string) => {
    sendToPhone({ type: 'LIST_FILES', path })
    return true
  })

  // download-phone-file handler
  ipcMain.handle('download-phone-file', async (_, filePath: string) => {
    sendToPhone({ type: 'REQUEST_FILE_PATH', filePath })
    return true
  })

  // delete-phone-file handler
  ipcMain.handle('delete-phone-file', async (_, filePath: string) => {
    sendToPhone({ type: 'DELETE_FILE', filePath })
    return true
  })

  // rename-phone-file handler
  ipcMain.handle('rename-phone-file', async (_, { filePath, newName }) => {
    sendToPhone({ type: 'RENAME_FILE', filePath, newName })
    return true
  })

  // delete-photo handler
  ipcMain.handle('delete-photo', async (_, id: string) => {
    deletePhoto(id)
    sendToPhone({ type: 'DELETE_PHOTO', fileId: id })
    return true
  })

  // get-calendar-events handler
  ipcMain.handle('get-calendar-events', async () => {
    return getCalendarEvents()
  })

  // create-calendar-event handler
  ipcMain.handle('create-calendar-event', async (_, { title, description, start, end, location }) => {
    sendToPhone({ type: 'CREATE_EVENT', title, description, start, end, location })
    return true
  })

  // delete-calendar-event handler
  ipcMain.handle('delete-calendar-event', async (_, eventId: string) => {
    sendToPhone({ type: 'DELETE_EVENT', eventId })
    return true
  })

  // toggle-flashlight
  ipcMain.handle('toggle-flashlight', async (_, enabled: boolean) => {
    sendToPhone({ type: 'TOGGLE_FLASHLIGHT', enabled })
    return true
  })

  // ring-phone
  ipcMain.handle('ring-phone', async () => {
    sendToPhone({ type: 'RING_PHONE' })
    return true
  })

  // stop-ringing
  ipcMain.handle('stop-ringing', async () => {
    sendToPhone({ type: 'STOP_RINGING' })
    return true
  })

  // locate-device
  ipcMain.handle('locate-device', async () => {
    sendToPhone({ type: 'LOCATE_DEVICE' })
    return true
  })

  // start-mirroring
  ipcMain.handle('start-mirroring', async () => {
    sendToPhone({ type: 'START_MIRRORING' })
    return true
  })

  // stop-mirroring
  ipcMain.handle('stop-mirroring', async () => {
    sendToPhone({ type: 'STOP_MIRRORING' })
    return true
  })

  // check-for-updates
  ipcMain.handle('check-for-updates', async () => {
    return { success: true, updateAvailable: false, version: '1.0.0' }
  })
}
