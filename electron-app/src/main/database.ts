import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

const dbPath = join(app.getPath('userData'), 'phonebridge_db.json')
const tempDbPath = join(app.getPath('userData'), 'phonebridge_db.tmp')

export interface NotificationRecord {
  id: string
  app: string
  appPackage: string
  title: string
  message: string
  timestamp: string
  icon?: string
  dismissed?: boolean
  replyable?: boolean
}

export interface CallRecord {
  id: string
  number: string
  name: string
  callType: string
  duration: number
  timestamp: string
}

export interface SmsThreadRecord {
  id: string
  address: string
  name: string
  lastMessage: string
  timestamp: string
  messages?: SmsMessageRecord[]
  unread?: boolean
}

export interface SmsMessageRecord {
  id: string
  threadId: string
  address: string
  name: string
  body: string
  timestamp: string
  direction: 'in' | 'out'
}

export interface PhotoRecord {
  id: string
  name: string
  size: number
  timestamp: string
  thumbnail?: string
}

export interface DeviceStatusRecord {
  battery: number
  charging: boolean
  network: string
  signal: number
  deviceName: string
}

export interface ContactRecord {
  id: string
  name: string
  number: string
}

export interface AppRecord {
  name: string
  package: string
  icon?: string
}

interface DatabaseSchema {
  notifications: NotificationRecord[]
  calls: CallRecord[]
  sms_threads: SmsThreadRecord[]
  sms_messages: SmsMessageRecord[]
  photos: PhotoRecord[]
  device_status: DeviceStatusRecord
  contacts: ContactRecord[]
  apps: AppRecord[]
}

const initialData: DatabaseSchema = {
  notifications: [],
  calls: [],
  sms_threads: [],
  sms_messages: [],
  photos: [],
  device_status: {
    battery: 0,
    charging: false,
    network: 'offline',
    signal: 0,
    deviceName: 'Android Phone'
  },
  contacts: [],
  apps: []
}

let dbCache: DatabaseSchema | null = null

// Helper: read data from JSON file
function readData(): DatabaseSchema {
  if (dbCache) return dbCache
  try {
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf8')
      dbCache = JSON.parse(content)
      return dbCache!
    }
  } catch (err) {
    console.error('[DB] Error reading database file:', err)
  }
  dbCache = JSON.parse(JSON.stringify(initialData))
  return dbCache!
}

// Helper: write data atomically
function writeData(data: DatabaseSchema): void {
  dbCache = data
  try {
    fs.writeFileSync(tempDbPath, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tempDbPath, dbPath)
  } catch (err) {
    console.error('[DB] Error writing database file atomically:', err)
  }
}

export function initDatabase(): void {
  console.log('[DB] Initializing file database at:', dbPath)
  if (!fs.existsSync(dbPath)) {
    writeData(initialData)
    console.log('[DB] File database created with initial schema.')
  } else {
    // Validate schema
    const data = readData()
    let dirty = false
    if (!data.notifications) { data.notifications = []; dirty = true }
    if (!data.calls) { data.calls = []; dirty = true }
    if (!data.sms_threads) { data.sms_threads = []; dirty = true }
    if (!data.sms_messages) { data.sms_messages = []; dirty = true }
    if (!data.photos) { data.photos = []; dirty = true }
    if (!data.contacts) { data.contacts = []; dirty = true }
    if (!data.apps) { data.apps = []; dirty = true }
    if (!data.device_status) { data.device_status = { ...initialData.device_status }; dirty = true }
    if (dirty) {
      writeData(data)
    }
    console.log('[DB] File database opened.')
  }
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function saveNotification(notif: NotificationRecord): void {
  const data = readData()
  const idx = data.notifications.findIndex((n) => n.id === notif.id)
  const newRecord: NotificationRecord = {
    id: notif.id,
    app: notif.app,
    appPackage: notif.appPackage || '',
    title: notif.title,
    message: notif.message,
    timestamp: notif.timestamp,
    icon: notif.icon || undefined,
    dismissed: false,
    replyable: notif.replyable ?? false
  }

  if (idx !== -1) {
    data.notifications[idx] = newRecord
  } else {
    data.notifications.push(newRecord)
  }
  writeData(data)
}

export function getNotifications(limit = 50): NotificationRecord[] {
  const data = readData()
  return data.notifications
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
}

export function dismissNotification(id: string): void {
  const data = readData()
  const idx = data.notifications.findIndex((n) => n.id === id)
  if (idx !== -1) {
    data.notifications[idx].dismissed = true
    writeData(data)
  }
}

// ─── Calls ───────────────────────────────────────────────────────────────────

export function saveCalls(calls: CallRecord[]): void {
  const data = readData()
  for (const call of calls) {
    const idx = data.calls.findIndex((c) => c.id === call.id)
    if (idx !== -1) {
      data.calls[idx] = call
    } else {
      data.calls.push(call)
    }
  }
  writeData(data)
}

export function getCalls(limit = 100): CallRecord[] {
  const data = readData()
  return data.calls
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

export function saveSmses(payload: { threads: SmsThreadRecord[] }): void {
  const data = readData()
  for (const thread of payload.threads) {
    const tIdx = data.sms_threads.findIndex((t) => t.id === thread.id)
    const newThread: SmsThreadRecord = {
      id: thread.id,
      address: thread.address,
      name: thread.name,
      lastMessage: thread.lastMessage,
      timestamp: thread.timestamp,
      unread: thread.unread ?? false
    }
    if (tIdx !== -1) {
      data.sms_threads[tIdx] = newThread
    } else {
      data.sms_threads.push(newThread)
    }

    if (thread.messages) {
      for (const msg of thread.messages) {
        const mIdx = data.sms_messages.findIndex((m) => m.id === msg.id)
        const newMsg: SmsMessageRecord = {
          id: msg.id,
          threadId: thread.id,
          address: msg.address,
          name: msg.name,
          body: msg.body,
          timestamp: msg.timestamp,
          direction: msg.direction || 'in'
        }
        if (mIdx !== -1) {
          data.sms_messages[mIdx] = newMsg
        } else {
          data.sms_messages.push(newMsg)
        }
      }
    }
  }
  writeData(data)
}

export function getSmsThreads(): SmsThreadRecord[] {
  const data = readData()
  return data.sms_threads
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((t) => ({ ...t, messages: [] }))
}

export function getSmsMessages(threadId: string): SmsMessageRecord[] {
  const data = readData()
  return data.sms_messages
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export function markThreadRead(threadId: string): void {
  const data = readData()
  const idx = data.sms_threads.findIndex((t) => t.id === threadId)
  if (idx !== -1) {
    data.sms_threads[idx].unread = false
    writeData(data)
  }
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export function savePhotos(photos: PhotoRecord[]): void {
  const data = readData()
  for (const photo of photos) {
    const idx = data.photos.findIndex((p) => p.id === photo.id)
    const newPhoto: PhotoRecord = {
      id: photo.id,
      name: photo.name,
      size: photo.size,
      timestamp: photo.timestamp,
      thumbnail: photo.thumbnail || undefined
    }
    if (idx !== -1) {
      data.photos[idx] = newPhoto
    } else {
      data.photos.push(newPhoto)
    }
  }
  writeData(data)
}

export function getPhotos(): PhotoRecord[] {
  const data = readData()
  return data.photos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

// ─── Device Status ────────────────────────────────────────────────────────────

export function updateDeviceStatus(status: DeviceStatusRecord): void {
  const data = readData()
  data.device_status = {
    battery: status.battery,
    charging: status.charging,
    network: status.network,
    signal: status.signal,
    deviceName: status.deviceName
  }
  writeData(data)
}

export function getDeviceStatus(): DeviceStatusRecord | null {
  const data = readData()
  return data.device_status
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export function clearOldData(days = 30): void {
  const data = readData()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffTime = cutoff.getTime()

  data.notifications = data.notifications.filter((n) => new Date(n.timestamp).getTime() >= cutoffTime)
  data.calls = data.calls.filter((c) => new Date(c.timestamp).getTime() >= cutoffTime)
  data.sms_messages = data.sms_messages.filter((m) => new Date(m.timestamp).getTime() >= cutoffTime)
  
  const activeThreadIds = new Set(data.sms_messages.map((m) => m.threadId))
  data.sms_threads = data.sms_threads.filter((t) => activeThreadIds.has(t.id))
  data.photos = data.photos.filter((p) => new Date(p.timestamp).getTime() >= cutoffTime)
  
  writeData(data)
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export function saveContacts(contacts: ContactRecord[]): void {
  const data = readData()
  data.contacts = contacts
  writeData(data)
}

export function getContacts(): ContactRecord[] {
  const data = readData()
  return data.contacts || []
}

// ─── Apps ────────────────────────────────────────────────────────────────────

export function saveApps(apps: AppRecord[]): void {
  const data = readData()
  data.apps = apps
  writeData(data)
}

export function getApps(): AppRecord[] {
  const data = readData()
  return data.apps || []
}

export function clearAllData(): void {
  dbCache = JSON.parse(JSON.stringify(initialData))
  writeData(dbCache!)
}
