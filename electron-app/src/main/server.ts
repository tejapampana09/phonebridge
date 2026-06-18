import { WebSocketServer, WebSocket } from 'ws'
import * as os from 'os'
import { app, clipboard } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'
import { generateECKeyPair, deriveAESKey, encryptAES_GCM, decryptAES_GCM } from './encryption'
import {
  saveNotification,
  saveCalls,
  saveSmses,
  savePhotos,
  updateDeviceStatus,
  saveContacts,
  saveApps,
  dismissNotification,
  saveCalendarEvents,
  readData,
  setDatabaseEncryptionKey,
  clearDatabaseEncryptionKey
} from './database'
import { emitToRenderer, startAudioLoopback, stopAudioLoopback } from './ipc'
import { showNotification, showCallNotification } from './notifications'

interface ConnectedClient {
  ws: WebSocket
  deviceName: string
  lastPong: number
  privateKey?: crypto.KeyObject
  aesKey?: Buffer
  handshakeComplete?: boolean
}

const clients = new Map<WebSocket, ConnectedClient>()
let wss: WebSocketServer | null = null
let pingInterval: NodeJS.Timeout | null = null

// ─── Clipboard polling ────────────────────────────────────────────────────────
let lastClipboardText = ''
let suppressNextClipboard = false
let clipboardPollInterval: NodeJS.Timeout | null = null

function startClipboardPolling(): void {
  if (clipboardPollInterval) return
  lastClipboardText = clipboard.readText()
  clipboardPollInterval = setInterval(() => {
    try {
      const text = clipboard.readText()
      if (suppressNextClipboard) {
        suppressNextClipboard = false
        lastClipboardText = text
        return
      }
      if (text && text !== lastClipboardText) {
        lastClipboardText = text
        sendToPhone({ type: 'SET_CLIPBOARD', text })
      }
    } catch {
      // clipboard read can fail if no content
    }
  }, 1000)
}

function stopClipboardPolling(): void {
  if (clipboardPollInterval) {
    clearInterval(clipboardPollInterval)
    clipboardPollInterval = null
  }
}

export function startWebSocketServer(): void {
  wss = new WebSocketServer({ port: 8765 })

  wss.on('listening', () => {
    console.log('[WS] WebSocket server listening on port 8765')
  })

  wss.on('connection', (ws: WebSocket, req) => {
    const remoteAddr = req.socket.remoteAddress || 'unknown'
    console.log(`[WS] Client connected from ${remoteAddr}`)

    const keys = generateECKeyPair()
    const client: ConnectedClient = {
      ws,
      deviceName: 'Android Phone',
      lastPong: Date.now(),
      privateKey: keys.privateKey,
      handshakeComplete: false
    }
    clients.set(ws, client)

    // Send acknowledgement with PC public key in plaintext
    sendToClient(ws, {
      type: 'CONNECT_ACK',
      pcName: os.hostname(),
      publicKey: keys.publicKeyBase64
    })

    // Notify renderer
    emitToRenderer('connection-changed', {
      connected: true,
      count: clients.size
    })

    ws.on('message', (data: Buffer) => {
      try {
        const text = data.toString()
        const rawJson = JSON.parse(text)
        const c = clients.get(ws)
        if (!c) return

        if (rawJson.encrypted === true) {
          if (c && c.aesKey) {
            try {
              const decryptedText = decryptAES_GCM(rawJson.ciphertext, rawJson.iv, c.aesKey)
              const decryptedJson = JSON.parse(decryptedText)
              handleIncoming(decryptedJson, { type: 'ws', ws })
            } catch (decErr) {
              console.error('[WS] Decryption failed. Terminating connection:', decErr)
              ws.terminate()
            }
          } else {
            console.error('[WS] Received encrypted payload but AES key is not derived. Terminating connection.')
            ws.terminate()
          }
        } else {
          // Plaintext message is only allowed for CLIENT_ACK (which completes handshake)
          if (rawJson.type === 'CLIENT_ACK') {
            const clientPublicKey = rawJson.publicKey as string
            if (c && c.privateKey && clientPublicKey) {
              try {
                const derivedKey = deriveAESKey(c.privateKey, clientPublicKey)
                c.aesKey = derivedKey
                c.handshakeComplete = true
                console.log('[WS] Handshake complete. Derived AES-256 key successfully.')

                // Activate database encryption with this key
                setDatabaseEncryptionKey(derivedKey)

                // Notify renderer that connection has changed (so it updates tabs/status)
                emitToRenderer('connection-changed', {
                  connected: true,
                  count: clients.size
                })
              } catch (dhErr) {
                console.error('[WS] ECDH derivation failed. Terminating connection:', dhErr)
                ws.terminate()
              }
            } else {
              console.error('[WS] Invalid CLIENT_ACK public key. Terminating connection.')
              ws.terminate()
            }
          } else {
            console.warn('[WS] Received unauthorized plaintext message. Terminating connection.')
            ws.terminate()
          }
        }
      } catch (err) {
        console.error('[WS] Failed to parse incoming message. Terminating connection:', err)
        ws.terminate()
      }
    })

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${remoteAddr}`)
      clients.delete(ws)
      if (clients.size === 0) {
        clearDatabaseEncryptionKey()
      }
      emitToRenderer('connection-changed', {
        connected: clients.size > 0,
        count: clients.size
      })
    })

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err)
      clients.delete(ws)
    })

    ws.on('pong', () => {
      const c = clients.get(ws)
      if (c) c.lastPong = Date.now()
    })
  })

  wss.on('error', (err) => {
    console.error('[WS] Server error:', err)
  })

  // Auto-ping every 30 seconds
  pingInterval = setInterval(() => {
    const now = Date.now()
    clients.forEach((client, ws) => {
      if (now - client.lastPong > 90000) {
        // No pong for 90s → terminate
        console.warn(`[WS] Client ${client.deviceName} timed out`)
        ws.terminate()
        clients.delete(ws)
        return
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
        // Also send JSON PING
        sendToClient(ws, { type: 'PING', timestamp: now })
      }
    })
  }, 30000)

  // Start clipboard polling when server is up
  startClipboardPolling()
}

const activeFileStreams = new Map<string, fs.WriteStream>()
interface TransferMeta {
  fileName: string
  totalChunks: number
  chunksReceived: number
}
const activeTransferMeta = new Map<string, TransferMeta>()

export function handleIncoming(msg: Record<string, unknown>, source?: { type: 'ws' | 'bt', ws?: WebSocket }): void {
  const type = msg.type as string

  switch (type) {
    case 'DELETE_SMS_ACK': {
      emitToRenderer('phone-event', { type: 'DELETE_SMS_ACK', data: { msgId: msg.msgId, success: msg.success } })
      break
    }

    case 'CONTACTS_HISTORY': {
      const contacts = (msg.contacts as Array<Record<string, unknown>>) || []
      const normalized = contacts.map((c) => ({
        id: (c.id as string) || `contact_${Date.now()}`,
        name: (c.name as string) || 'Unknown',
        number: (c.number as string) || '',
        avatar: (c.avatar as string) || undefined
      }))
      saveContacts(normalized)
      emitToRenderer('phone-event', { type: 'CONTACTS_HISTORY', data: normalized })
      break
    }

    case 'FILES_LIST': {
      emitToRenderer('phone-event', { type: 'FILES_LIST', data: { path: msg.path, entries: msg.entries } })
      break
    }

    case 'APPS_HISTORY': {
      const apps = (msg.apps as Array<Record<string, unknown>>) || []
      const normalized = apps.map((a) => ({
        name: (a.name as string) || 'App',
        package: (a.package as string) || '',
        icon: (a.icon as string) || undefined
      }))
      saveApps(normalized)
      emitToRenderer('phone-event', { type: 'APPS_HISTORY', data: normalized })
      break
    }

    case 'FILE_TRANSFER_START': {
      const fileId = msg.fileId as string
      const fileName = msg.fileName as string
      const fileType = msg.fileType as string
      const totalChunks = (msg.totalChunks as number) || 1

      try {
        let filePath = ''
        if (fileType === 'photo') {
          const dbData = readData()
          const pMeta = dbData.photos.find(p => p.id === fileId)
          const ext = pMeta && pMeta.isVideo ? 'mp4' : 'jpg'
          
          const photosDir = join(app.getPath('userData'), 'photos')
          fs.mkdirSync(photosDir, { recursive: true })
          filePath = join(photosDir, `${fileId}.${ext}`)
        } else {
          filePath = join(os.homedir(), 'Downloads', fileName)
        }

        const stream = fs.createWriteStream(filePath)
        activeFileStreams.set(fileId, stream)
        activeTransferMeta.set(fileId, {
          fileName,
          totalChunks,
          chunksReceived: 0
        })
        console.log(`[WS] Prepared to receive file: ${filePath}`)
      } catch (err) {
        console.error('[WS] Failed to start file write stream:', err)
      }
      break
    }

    case 'FILE_TRANSFER_CHUNK': {
      const fileId = msg.fileId as string
      const dataBase64 = msg.data as string
      
      const stream = activeFileStreams.get(fileId)
      if (stream) {
        const buffer = Buffer.from(dataBase64, 'base64')
        stream.write(buffer)
      }

      const meta = activeTransferMeta.get(fileId)
      if (meta) {
        meta.chunksReceived++
        const progress = Math.round((meta.chunksReceived / meta.totalChunks) * 100)
        emitToRenderer('phone-event', {
          type: 'FILE_TRANSFER_PROGRESS',
          data: {
            fileId,
            fileName: meta.fileName,
            direction: 'download',
            progress: Math.min(progress, 100),
            chunkIndex: meta.chunksReceived,
            totalChunks: meta.totalChunks
          }
        })
      }
      break
    }

    case 'FILE_TRANSFER_END': {
      const fileId = msg.fileId as string
      const stream = activeFileStreams.get(fileId)
      if (stream) {
        stream.end()
        activeFileStreams.delete(fileId)
        activeTransferMeta.delete(fileId)
        console.log(`[WS] File transfer complete: ${fileId}`)
        emitToRenderer('phone-event', { type: 'PHOTO_DOWNLOADED', data: { id: fileId } })
      }
      break
    }

    case 'NOTIFICATION': {
      const notif = {
        id: (msg.id as string) || `notif_${Date.now()}`,
        app: (msg.app as string) || 'Unknown',
        appPackage: (msg.appPackage as string) || '',
        title: (msg.title as string) || '',
        message: (msg.message as string) || '',
        timestamp: (msg.timestamp as string) || new Date().toISOString(),
        icon: (msg.icon as string) || undefined,
        replyable: Boolean(msg.replyable),
        actions: (msg.actions as Array<{ index: number; title: string; isReply: boolean }>) || undefined
      }
      saveNotification(notif)
      showNotification(notif.app, notif.title, notif.message)
      emitToRenderer('phone-event', { type: 'NOTIFICATION', data: notif })
      break
    }

    case 'CALL_INCOMING': {
      const call = {
        number: (msg.number as string) || 'Unknown',
        name: (msg.name as string) || 'Unknown',
        avatar: (msg.avatar as string) || undefined
      }
      showCallNotification(call.name, call.number)
      emitToRenderer('phone-event', { type: 'CALL_INCOMING', data: call })
      break
    }

    case 'CALL_ACTIVE': {
      startAudioLoopback()
      emitToRenderer('phone-event', { type: 'CALL_ACTIVE' })
      emitToRenderer('phone-event', {
        type: 'CALL_UPDATE',
        data: { status: 'answered' }
      })
      break
    }

    case 'CALL_ENDED': {
      stopAudioLoopback()
      emitToRenderer('phone-event', { type: 'CALL_ENDED' })
      emitToRenderer('phone-event', {
        type: 'CALL_UPDATE',
        data: { status: 'ended' }
      })
      break
    }

    case 'CALL_UPDATE': {
      const status = msg.status as string
      if (status === 'answered' || status === 'dialing') {
        startAudioLoopback()
      } else if (status === 'ended' || status === 'declined') {
        stopAudioLoopback()
      }
      emitToRenderer('phone-event', {
        type: 'CALL_UPDATE',
        data: {
          status: msg.status,
          number: msg.number,
          name: msg.name,
          duration: msg.duration
        }
      })
      break
    }

    case 'CALL_HISTORY': {
      const calls = (msg.calls as Array<Record<string, unknown>>) || []
      const normalized = calls.map((c, index) => ({
        id: (c.id as string) || `call_${Date.now()}_${index}`,
        number: (c.number as string) || '',
        name: (c.name as string) || '',
        callType: (c.callType as string) || 'incoming',
        duration: (c.duration as number) || 0,
        timestamp: (c.timestamp as string) || new Date().toISOString()
      }))
      saveCalls(normalized)
      emitToRenderer('phone-event', { type: 'CALL_HISTORY', data: normalized })
      break
    }

    case 'SMS_RECEIVED': {
      const sms = {
        id: (msg.id as string) || `sms_${Date.now()}`,
        address: (msg.address as string) || '',
        name: (msg.name as string) || '',
        body: (msg.body as string) || '',
        timestamp: (msg.timestamp as string) || new Date().toISOString()
      }
      const threadId = (msg.threadId as string) || (sms.address as string)
      saveSmses({
        threads: [
          {
            id: threadId,
            address: sms.address,
            name: sms.name,
            lastMessage: sms.body,
            timestamp: sms.timestamp,
            messages: [
              {
                ...sms,
                threadId: threadId,
                direction: 'in' as const
              }
            ]
          }
        ]
      })
      emitToRenderer('phone-event', { type: 'SMS_RECEIVED', data: { ...sms, threadId } })
      break
    }

    case 'SMS_HISTORY': {
      const threads = msg.threads as Array<Record<string, unknown>>
      if (threads) {
        saveSmses({ threads: threads as Parameters<typeof saveSmses>[0]['threads'] })
        emitToRenderer('phone-event', { type: 'SMS_HISTORY', data: threads })
      }
      break
    }

    case 'PHOTO_METADATA': {
      const photos = (msg.photos as Array<Record<string, unknown>>) || []
      const normalized = photos.map((p) => ({
        id: (p.id as string) || `photo_${Date.now()}`,
        name: (p.name as string) || 'photo.jpg',
        size: (p.size as number) || 0,
        timestamp: (p.timestamp as string) || new Date().toISOString(),
        thumbnail: (p.thumbnail as string) || undefined,
        isVideo: Boolean(p.isVideo),
        duration: (p.duration as number) || undefined
      }))
      savePhotos(normalized)
      emitToRenderer('phone-event', { type: 'PHOTO_METADATA', data: normalized })
      break
    }

    case 'CALENDAR_HISTORY': {
      const events = (msg.events as Array<Record<string, unknown>>) || []
      const normalized = events.map((e) => ({
        id: (e.id as string) || `event_${Date.now()}`,
        title: (e.title as string) || '',
        description: (e.description as string) || '',
        start: (e.start as string) || new Date().toISOString(),
        end: (e.end as string) || new Date().toISOString(),
        location: (e.location as string) || '',
        allDay: Boolean(e.allDay)
      }))
      saveCalendarEvents(normalized)
      emitToRenderer('phone-event', { type: 'CALENDAR_HISTORY', data: normalized })
      break
    }

    case 'DEVICE_STATUS': {
      const status = {
        battery: (msg.battery as number) || 0,
        charging: Boolean(msg.charging),
        network: (msg.network as string) || 'offline',
        signal: (msg.signal as number) || 0,
        deviceName: (msg.deviceName as string) || 'Android Phone'
      }
      if (source?.type === 'ws' && source.ws) {
        const client = clients.get(source.ws)
        if (client) client.deviceName = status.deviceName
      }
      updateDeviceStatus(status)
      emitToRenderer('phone-event', { type: 'DEVICE_STATUS', data: status })
      break
    }

    case 'PONG': {
      if (source?.type === 'ws' && source.ws) {
        const client = clients.get(source.ws)
        if (client) client.lastPong = Date.now()
      }
      break
    }

    case 'CLIPBOARD_CHANGED': {
      const text = msg.text as string
      if (text) {
        // Set suppress flag so the PC clipboard poller skips echoing this back to phone
        suppressNextClipboard = true
        clipboard.writeText(text)
        emitToRenderer('phone-event', { type: 'CLIPBOARD_CHANGED', data: { text } })
      }
      break
    }

    case 'NOTIFICATION_REMOVED': {
      const id = msg.id as string
      if (id) {
        dismissNotification(id)
        emitToRenderer('phone-event', { type: 'NOTIFICATION_REMOVED', data: { id } })
      }
      break
    }

    case 'MIRROR_FRAME': {
      // Ignored - Feature Frozen
      break
    }

    case 'LOCATE_DEVICE_RESP': {
      emitToRenderer('phone-event', { type: 'LOCATE_DEVICE_RESP', data: msg })
      break
    }

    default:
      console.log(`[WS] Unknown message type: ${type}`)
  }
}

function sendToClient(ws: WebSocket, message: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    const c = clients.get(ws)
    if (!c) return

    // CONNECT_ACK is the only message that is allowed to be sent in plaintext,
    // because it contains the PC's public key to start the handshake.
    const isHandshakeInit = (message as any).type === 'CONNECT_ACK'

    if (isHandshakeInit) {
      const finalPayload = JSON.stringify(message)
      ws.send(finalPayload)
      return
    }

    if (c.handshakeComplete && c.aesKey) {
      try {
        const plaintext = JSON.stringify(message)
        const encrypted = encryptAES_GCM(plaintext, c.aesKey)
        const finalPayload = JSON.stringify({
          encrypted: true,
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext
        })
        ws.send(finalPayload)
      } catch (encErr) {
        console.error('[WS] Encryption failed. Terminating connection:', encErr)
        ws.terminate()
      }
    } else {
      console.warn('[WS] Attempted to send message before handshake complete. Terminating connection.')
      ws.terminate()
    }
  }
}

export function sendToPhone(message: object): void {
  clients.forEach((_, ws) => {
    sendToClient(ws, message)
  })
}

export function broadcast(message: object): void {
  sendToPhone(message)
}

export function getConnectedCount(): number {
  return clients.size
}

export function getConnectedDeviceNames(): string[] {
  return Array.from(clients.values()).map((c) => c.deviceName)
}

export function stopWebSocketServer(): void {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
  stopClipboardPolling()
  clients.forEach((_, ws) => ws.terminate())
  clients.clear()
  wss?.close()
  wss = null
}

export function disconnectAllClients(): void {
  sendToPhone({ type: 'UNLINK' })
  setTimeout(() => {
    clients.forEach((_, ws) => {
      try {
        ws.terminate()
      } catch (e) {
        console.error('[WS] Failed to terminate ws:', e)
      }
    })
    clients.clear()
    emitToRenderer('connection-changed', {
      connected: false,
      count: 0
    })
  }, 100)
}
