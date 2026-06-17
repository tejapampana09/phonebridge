import { emitToRenderer } from './ipc'
import { handleIncoming } from './server' // We can reuse message handling protocol

let btServer: any = null
let connectedSocket: any = null
let isBtAvailable = false

// Dynamically import/require bluetooth-serial-port to prevent crash on startup if build fails
let BluetoothSerialPortServer: any = null
try {
  const bt = require('bluetooth-serial-port')
  BluetoothSerialPortServer = bt.BluetoothSerialPortServer
  isBtAvailable = true
} catch (err) {
  console.warn('bluetooth-serial-port native module could not be loaded. Bluetooth connection fallback will be disabled.', err)
}

export function isBluetoothAvailable(): boolean {
  return isBtAvailable && BluetoothSerialPortServer !== null
}

export function startBluetoothServer(): void {
  if (!isBluetoothAvailable()) {
    console.log('Bluetooth server not started: bluetooth-serial-port not available.')
    return
  }

  try {
    btServer = new BluetoothSerialPortServer()
    const uuid = '00001101-0000-1000-8000-00805F9B34FB' // Standard SPP UUID

    console.log(`Starting Bluetooth RFCOMM server with UUID: ${uuid}`)
    
    btServer.listen((clientAddress: string) => {
      console.log(`Bluetooth client connected: ${clientAddress}`)
      connectedSocket = btServer
      
      emitToRenderer('phone-event', {
        type: 'CONNECTION_STATUS',
        payload: { btConnected: true, clientAddress }
      })

      btServer.on('data', (buffer: Buffer) => {
        try {
          const messageStr = buffer.toString('utf-8')
          console.log(`Bluetooth received: ${messageStr}`)
          // Reuse server.ts's parser
          const connectionContext = {
            send: (dataStr: string) => sendViaBluetooth(JSON.parse(dataStr)),
            type: 'bluetooth'
          }
          handleIncoming(messageStr, connectionContext)
        } catch (e) {
          console.error('Error processing Bluetooth message data:', e)
        }
      })
    }, (error: any) => {
      console.error('Bluetooth listener error:', error)
    }, {
      uuid: uuid,
      channel: 1
    })
  } catch (err) {
    console.error('Failed to start Bluetooth RFCOMM server:', err)
  }
}

export function stopBluetoothServer(): void {
  try {
    if (btServer) {
      // bluetooth-serial-port doesn't always expose a clean close/stop on server, but we do our best
      btServer = null
      connectedSocket = null
      console.log('Bluetooth RFCOMM server stopped.')
    }
  } catch (err) {
    console.error('Error stopping Bluetooth server:', err)
  }
}

export function sendViaBluetooth(msg: object): boolean {
  if (!connectedSocket) {
    return false
  }

  try {
    const payload = JSON.stringify(msg) + '\n' // Use newline separator for framing
    connectedSocket.write(Buffer.from(payload, 'utf-8'), (err: any) => {
      if (err) {
        console.error('Error writing to Bluetooth socket:', err)
      }
    })
    return true
  } catch (err) {
    console.error('Error sending Bluetooth message:', err)
    return false
  }
}
