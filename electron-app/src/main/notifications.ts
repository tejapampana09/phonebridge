import { Notification } from 'electron'

const appName = 'PhoneBridge'

export function showNotification(
  appLabel: string,
  title: string,
  message: string
): void {
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: `${appLabel}: ${title}`,
        body: message,
        silent: true
      })
      notification.on('click', () => {
        try {
          const { BrowserWindow } = require('electron')
          const windows = BrowserWindow.getAllWindows()
          if (windows.length > 0) {
            const win = windows[0]
            win.show()
            win.focus()
          }
        } catch (e) {
          console.error('[Notifier] Click handler failed:', e)
        }
      })
      notification.show()
    }
  } catch (err) {
    console.error('[Notifier] showNotification failed:', err)
  }
}

export function showCallNotification(name: string, number: string): void {
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: '📞 Incoming Call',
        body: `${name} (${number})`,
        silent: false
      })
      notification.on('click', () => {
        try {
          const { BrowserWindow } = require('electron')
          const windows = BrowserWindow.getAllWindows()
          if (windows.length > 0) {
            const win = windows[0]
            win.show()
            win.focus()
          }
        } catch (e) {
          console.error('[Notifier] Call click handler failed:', e)
        }
      })
      notification.show()
    }
  } catch (err) {
    console.error('[Notifier] showCallNotification failed:', err)
  }
}

export function showAppNotification(title: string, message: string): void {
  showNotification(appName, title, message)
}
