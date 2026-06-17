import * as os from 'os'
import * as QRCode from 'qrcode'

/**
 * Returns the best local IPv4 address (prefers Wi-Fi adapters, falls back to
 * first non-loopback IPv4, ultimately falls back to '127.0.0.1').
 */
export function getLocalIP(): string {
  const interfaces = os.networkInterfaces()

  // Prefer Wi-Fi or Ethernet adapters (commonly named)
  const preferredNames = ['Wi-Fi', 'Wireless', 'eth0', 'en0', 'wlan0', 'Ethernet']

  for (const name of preferredNames) {
    const iface = interfaces[name]
    if (!iface) continue
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address
      }
    }
  }

  // Fallback: first non-loopback IPv4
  for (const [, iface] of Object.entries(interfaces)) {
    if (!iface) continue
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address
      }
    }
  }

  return '127.0.0.1'
}

/**
 * Generates a QR code as a base64 PNG data URL.
 * The QR content is a JSON payload for the Android app to discover the PC.
 */
export async function generateQR(): Promise<string> {
  const ip = getLocalIP()
  const deviceName = os.hostname()

  const payload = JSON.stringify({
    type: 'phonebridge',
    ws: `ws://${ip}:8765`,
    bt: deviceName
  })

  try {
    const dataURL = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      width: 280,
      color: {
        dark: '#FFFFFF',
        light: '#1C1C1C'
      }
    })
    return dataURL
  } catch (err) {
    console.error('[QR] Failed to generate QR code:', err)
    throw err
  }
}
