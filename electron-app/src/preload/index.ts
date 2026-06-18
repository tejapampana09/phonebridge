import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  getQRCode: () => ipcRenderer.invoke('get-qr-code'),
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  unlinkDevice: () => ipcRenderer.invoke('unlink-device'),
  sendSMS: (to: string, message: string) => ipcRenderer.invoke('send-sms', { to, message }),
  dismissNotification: (id: string) => ipcRenderer.invoke('dismiss-notification', id),
  dialNumber: (number: string) => ipcRenderer.invoke('dial-number', number),
  replyNotification: (id: string, message: string) => ipcRenderer.invoke('reply-notification', { id, message }),
  triggerNotificationAction: (id: string, index: number, message?: string) => ipcRenderer.invoke('trigger-notification-action', { id, index, message }),
  getNotifications: () => ipcRenderer.invoke('get-notifications'),
  getCalls: () => ipcRenderer.invoke('get-calls'),
  getSmsThreads: () => ipcRenderer.invoke('get-sms-threads'),
  getSmsMessages: (threadId: string) => ipcRenderer.invoke('get-sms-messages', threadId),
  getPhotos: () => ipcRenderer.invoke('get-photos'),
  getDeviceStatus: () => ipcRenderer.invoke('get-device-status'),
  getContacts: () => ipcRenderer.invoke('get-contacts'),
  getApps: () => ipcRenderer.invoke('get-apps'),
  getPhotoData: (id: string) => ipcRenderer.invoke('get-photo-data', id),
  downloadPhoto: (id: string) => ipcRenderer.invoke('download-photo', id),
  sendFileToPhone: (filePath: string) => ipcRenderer.invoke('send-file-to-phone', { filePath }),
  answerCall: () => ipcRenderer.invoke('answer-call'),
  rejectCall: () => ipcRenderer.invoke('reject-call'),
  requestSync: () => ipcRenderer.invoke('request-sync'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  setClipboard: (text: string) => ipcRenderer.invoke('set-clipboard', text),
  sendClipboardToPhone: (text: string) => ipcRenderer.invoke('send-clipboard-to-phone', text),
  launchApp: (packageName: string) => ipcRenderer.invoke('launch-app', packageName),
  markThreadRead: (threadId: string) => ipcRenderer.invoke('mark-thread-read', threadId),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('set-setting', key, value),
  searchSms: (query: string) => ipcRenderer.invoke('search-sms', query),
  deleteSmsMessage: (id: string) => ipcRenderer.invoke('delete-sms-message', id),
  createContact: (name: string, number: string) => ipcRenderer.invoke('create-contact', { name, number }),
  updateContact: (contactId: string, name: string, number: string) => ipcRenderer.invoke('update-contact', { contactId, name, number }),
  deleteContact: (id: string) => ipcRenderer.invoke('delete-contact', id),
  listPhoneFiles: (path: string) => ipcRenderer.invoke('list-phone-files', path),
  downloadPhoneFile: (filePath: string) => ipcRenderer.invoke('download-phone-file', filePath),
  deletePhoneFile: (filePath: string) => ipcRenderer.invoke('delete-phone-file', filePath),
  renamePhoneFile: (filePath: string, newName: string) => ipcRenderer.invoke('rename-phone-file', { filePath, newName }),
  deletePhoto: (id: string) => ipcRenderer.invoke('delete-photo', id),
  getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),
  createCalendarEvent: (event: { title: string; description: string; start: number; end: number; location: string }) =>
    ipcRenderer.invoke('create-calendar-event', event),
  deleteCalendarEvent: (id: string) => ipcRenderer.invoke('delete-calendar-event', id),
  toggleFlashlight: (enabled: boolean) => ipcRenderer.invoke('toggle-flashlight', enabled),
  ringPhone: () => ipcRenderer.invoke('ring-phone'),
  stopRinging: () => ipcRenderer.invoke('stop-ringing'),
  locateDevice: () => ipcRenderer.invoke('locate-device'),
  startMirroring: () => ipcRenderer.invoke('start-mirroring'),
  stopMirroring: () => ipcRenderer.invoke('stop-mirroring'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // HFP Call Audio APIs
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  startCallAudio: (args: { phoneInput: string | number; phoneOutput: string | number; pcInput: string | number; pcOutput: string | number }) =>
    ipcRenderer.invoke('start-call-audio', args),
  stopCallAudio: () => ipcRenderer.invoke('stop-call-audio'),
  setCallMute: (muted: boolean) => ipcRenderer.invoke('set-call-mute', muted),
  
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
