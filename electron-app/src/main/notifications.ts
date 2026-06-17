import notifier from 'node-notifier'
import { join } from 'path'
import { app } from 'electron'

const appName = 'PhoneBridge'
const iconPath = join(__dirname, '../../build/icon.ico')

/**
 * Shows a Windows toast notification.
 */
export function showNotification(
  appLabel: string,
  title: string,
  message: string
): void {
  try {
    notifier.notify(
      {
        appName,
        title: `${appLabel}: ${title}`,
        message,
        icon: iconPath,
        sound: false,
        wait: false,
        // Windows-specific toast options
        // @ts-ignore – node-notifier types are incomplete
        toastType: 'toast'
      },
      (err: Error | null) => {
        if (err) console.error('[Notifier] Error:', err)
      }
    )
  } catch (err) {
    console.error('[Notifier] showNotification failed:', err)
  }
}

/**
 * Shows a special incoming-call notification.
 */
export function showCallNotification(name: string, number: string): void {
  try {
    notifier.notify(
      {
        appName,
        title: '📞 Incoming Call',
        message: `${name} (${number})`,
        icon: iconPath,
        sound: true,
        wait: false,
        // @ts-ignore
        toastType: 'toast'
      },
      (err: Error | null) => {
        if (err) console.error('[Notifier] Call notification error:', err)
      }
    )
  } catch (err) {
    console.error('[Notifier] showCallNotification failed:', err)
  }
}

/**
 * Shows a generic app notification. Alias for showNotification.
 */
export function showAppNotification(title: string, message: string): void {
  showNotification(appName, title, message)
}

// Listen for notification click events
notifier.on('click', (_notifierObject: unknown, _options: unknown) => {
  // Bring app to front when notification is clicked
  try {
    const { BrowserWindow } = require('electron')
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      win.show()
      win.focus()
    }
  } catch (_e) {
    // Ignore errors if app is not fully initialised
  }
})
