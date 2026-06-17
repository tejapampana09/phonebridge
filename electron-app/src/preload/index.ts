import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getQRCode: () => ipcRenderer.invoke('get-qr-code'),
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  sendSMS: (to: string, message: string) => ipcRenderer.invoke('send-sms', { to, message }),
  dismissNotification: (id: string) => ipcRenderer.invoke('dismiss-notification', id),
  dialNumber: (number: string) => ipcRenderer.invoke('dial-number', number),
  replyNotification: (id: string, message: string) => ipcRenderer.invoke('reply-notification', { id, message }),
  getNotifications: () => ipcRenderer.invoke('get-notifications'),
  getCalls: () => ipcRenderer.invoke('get-calls'),
  getSmsThreads: () => ipcRenderer.invoke('get-sms-threads'),
  getSmsMessages: (threadId: string) => ipcRenderer.invoke('get-sms-messages', threadId),
  getPhotos: () => ipcRenderer.invoke('get-photos'),
  getDeviceStatus: () => ipcRenderer.invoke('get-device-status'),
  requestSync: () => ipcRenderer.invoke('request-sync'),
  
  // Real-time event listeners
  onPhoneEvent: (callback: (event: any, data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(_event, data)
    ipcRenderer.on('phone-event', subscription)
    return subscription
  },
  removePhoneEventListener: (subscription: any) => {
    ipcRenderer.removeListener('phone-event', subscription)
  },
  
  // Custom connection event listeners
  onConnectionChanged: (callback: (event: any, data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(_event, data)
    ipcRenderer.on('connection-changed', subscription)
    return subscription
  },
  removeConnectionChangedListener: (subscription: any) => {
    ipcRenderer.removeListener('connection-changed', subscription)
  },

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
}

// Expose the API to the renderer's global window object
contextBridge.exposeInMainWorld('api', api)
