export interface PhoneNotification {
  id: string
  app: string
  appPackage: string
  title: string
  message: string
  timestamp: string
  icon?: string // Base64 jpeg representation
  dismissed?: boolean
}

export interface CallRecord {
  id: string
  number: string
  name: string
  callType: 'incoming' | 'outgoing' | 'missed' | 'declined'
  duration: number // in seconds
  timestamp: string
}

export interface SmsMessage {
  id: string
  threadId: string
  address: string
  name: string
  body: string
  timestamp: string
  direction: 'in' | 'out'
}

export interface SmsThread {
  id: string
  address: string
  name: string
  lastMessage: string
  timestamp: string
  messages?: SmsMessage[]
}

export interface PhotoMeta {
  id: string
  name: string
  size: number
  timestamp: string
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

export interface DeviceStatus {
  battery: number
  charging: boolean
  network: 'wifi' | 'mobile' | 'offline' | string
  signal: number
  deviceName: string
  connected: boolean
  btConnected?: boolean
}

export type TabId = 'calls' | 'messages' | 'photos' | 'apps' | 'contacts' | 'files'
