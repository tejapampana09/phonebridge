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
  getCalendarEvents,
  clearAllData,
  markThreadRead
} from './database'
import { sendToPhone, getConnectedCount, getConnectedDeviceNames, disconnectAllClients } from './server'
import { isBluetoothAvailable, sendViaBluetooth, isBluetoothConnected, disconnectBluetoothClient } from './bluetooth'
import { helperManager } from './helperManager'

let mainWindow: BrowserWindow | null = null

function sendMsgToPhone(payload: any): boolean {
  if (getConnectedCount() > 0) {
    sendToPhone(payload)
    return true
  } else if (isBluetoothAvailable()) {
    return sendViaBluetooth(payload)
  }
  return false
}

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
  // Start python helper process
  helperManager.start()

  // Clean shutdown
  app.on('before-quit', () => {
    helperManager.stop()
  })

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
    const success = sendMsgToPhone(payload)

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
    return sendMsgToPhone(payload)
  })

  // 4.5. Dial Number from PC
  ipcMain.handle('dial-number', async (_, number) => {
    const payload = {
      type: 'DIAL_NUMBER',
      number
    }
    console.log(`[IPC] Dialing number: ${number}`)
    return sendMsgToPhone(payload)
  })

  // 4.6. Reply to Notification from PC
  ipcMain.handle('reply-notification', async (_, { id, message }) => {
    const payload = {
      type: 'REPLY_NOTIFICATION',
      id,
      message
    }
    console.log(`[IPC] Replying to notification ${id}: ${message}`)
    return sendMsgToPhone(payload)
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
    return sendMsgToPhone(payload)
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
    return sendMsgToPhone(payload)
  })

  // 4.8. App launcher handler
  ipcMain.handle('launch-app', async (_, packageName: string) => {
    const payload = { type: 'LAUNCH_APP', package: packageName }
    return sendMsgToPhone(payload)
  })

  // 4.9. Mark thread as read
  ipcMain.handle('mark-thread-read', async (_, threadId: string) => {
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
    return sendMsgToPhone(payload)
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
      sendMsgToPhone(startPayload)

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
        sendMsgToPhone(chunkPayload)

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
      sendMsgToPhone(endPayload)
      
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
    return sendMsgToPhone({ type: 'ANSWER_CALL' })
  })

  // reject-call
  ipcMain.handle('reject-call', async () => {
    const success = sendMsgToPhone({ type: 'REJECT_CALL' })
    // Immediately close the incoming call modal on PC without waiting for Android confirmation
    emitToRenderer('phone-event', { type: 'CALL_UPDATE', data: { status: 'ended' } })
    return success
  })

  // 6. Request Sync
  ipcMain.handle('request-sync', async () => {
    console.log('[IPC] Requesting sync')
    return sendMsgToPhone({
      type: 'REQUEST_SYNC',
      what: 'all'
    })
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
    return sendMsgToPhone({ type: 'DELETE_SMS', msgId: id })
  })

  // create-contact handler
  ipcMain.handle('create-contact', async (_, { name, number }) => {
    return sendMsgToPhone({ type: 'CREATE_CONTACT', name, number })
  })

  // update-contact handler
  ipcMain.handle('update-contact', async (_, { contactId, name, number }) => {
    return sendMsgToPhone({ type: 'UPDATE_CONTACT', contactId, name, number })
  })

  // delete-contact handler
  ipcMain.handle('delete-contact', async (_, contactId: string) => {
    deleteContact(contactId)
    return sendMsgToPhone({ type: 'DELETE_CONTACT', contactId })
  })

  // list-phone-files handler
  ipcMain.handle('list-phone-files', async (_, path: string) => {
    return sendMsgToPhone({ type: 'LIST_FILES', path })
  })

  // download-phone-file handler
  ipcMain.handle('download-phone-file', async (_, filePath: string) => {
    return sendMsgToPhone({ type: 'REQUEST_FILE_PATH', filePath })
  })

  // delete-phone-file handler
  ipcMain.handle('delete-phone-file', async (_, filePath: string) => {
    return sendMsgToPhone({ type: 'DELETE_FILE', filePath })
  })

  // rename-phone-file handler
  ipcMain.handle('rename-phone-file', async (_, { filePath, newName }) => {
    return sendMsgToPhone({ type: 'RENAME_FILE', filePath, newName })
  })

  // delete-photo handler
  ipcMain.handle('delete-photo', async (_, id: string) => {
    deletePhoto(id)
    return sendMsgToPhone({ type: 'DELETE_PHOTO', fileId: id })
  })

  // get-calendar-events handler
  ipcMain.handle('get-calendar-events', async () => {
    return getCalendarEvents()
  })

  // create-calendar-event handler
  ipcMain.handle('create-calendar-event', async (_, { title, description, start, end, location }) => {
    return sendMsgToPhone({ type: 'CREATE_EVENT', title, description, start, end, location })
  })

  // delete-calendar-event handler
  ipcMain.handle('delete-calendar-event', async (_, eventId: string) => {
    return sendMsgToPhone({ type: 'DELETE_EVENT', eventId })
  })

  // toggle-flashlight
  ipcMain.handle('toggle-flashlight', async (_, enabled: boolean) => {
    return sendMsgToPhone({ type: 'TOGGLE_FLASHLIGHT', enabled })
  })

  // ring-phone
  ipcMain.handle('ring-phone', async () => {
    return sendMsgToPhone({ type: 'RING_PHONE' })
  })

  // stop-ringing
  ipcMain.handle('stop-ringing', async () => {
    return sendMsgToPhone({ type: 'STOP_RINGING' })
  })

  // locate-device
  ipcMain.handle('locate-device', async () => {
    return sendMsgToPhone({ type: 'LOCATE_DEVICE' })
  })

  // start-mirroring (Disabled - Feature Frozen)
  ipcMain.handle('start-mirroring', async () => {
    console.log('[IPC] start-mirroring requested but feature is currently frozen.')
    return false
  })

  // stop-mirroring (Disabled - Feature Frozen)
  ipcMain.handle('stop-mirroring', async () => {
    console.log('[IPC] stop-mirroring requested but feature is currently frozen.')
    return false
  })

  // check-for-updates
  ipcMain.handle('check-for-updates', async () => {
    return { success: true, updateAvailable: false, version: '1.0.0' }
  })

  // 10. Native Call Audio Loopback
  ipcMain.handle('get-audio-devices', async () => {
    return helperManager.getAudioDevices()
  })

  ipcMain.handle('get-calling-status', async () => {
    return helperManager.getCallingStatus()
  })

  ipcMain.handle('start-pairing', async () => {
    return helperManager.startPairing()
  })

  ipcMain.handle('start-call-audio', async (_, args) => {
    const { phoneInput, phoneOutput, pcInput, pcOutput } = args as {
      phoneInput: string | number
      phoneOutput: string | number
      pcInput: string | number
      pcOutput: string | number
    }
    return helperManager.startLoopback(phoneInput, phoneOutput, pcInput, pcOutput)
  })

  ipcMain.handle('stop-call-audio', async () => {
    return helperManager.stopLoopback()
  })

  ipcMain.handle('set-call-mute', async (_, muted: boolean) => {
    return helperManager.setMute(muted)
  })
}

export async function startAudioLoopback(): Promise<boolean> {
  const settings = getSettings()
  const phoneInput = settings.phoneInput || 'auto'
  const phoneOutput = settings.phoneOutput || 'auto'
  const pcInput = settings.pcInput || 'auto'
  const pcOutput = settings.pcOutput || 'auto'
  console.log(`[IPC] Starting automatic call audio loopback: PhoneInput=${phoneInput}, PhoneOutput=${phoneOutput}, PCInput=${pcInput}, PCOutput=${pcOutput}`)
  return helperManager.startLoopback(phoneInput, phoneOutput, pcInput, pcOutput)
}

export async function stopAudioLoopback(): Promise<boolean> {
  console.log('[IPC] Stopping automatic call audio loopback')
  return helperManager.stopLoopback()
}
