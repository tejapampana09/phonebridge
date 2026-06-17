package com.phonebridge.connection

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import java.io.InputStream
import java.io.OutputStream
import java.util.*
import java.util.concurrent.atomic.AtomicBoolean
import com.phonebridge.services.PhoneLinkService

private const val TAG      = "BluetoothClient"
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

/**
 * Bluetooth RFCOMM (SPP) client.
 * Connects to the paired PC device by name, sends/receives JSON messages.
 *
 * NOTE: Bluetooth call audio is not implemented.
 * This is a data transport only channel.
 * To support Microsoft Phone Link style calling over Bluetooth:
 * - Android side requires AudioManager.startBluetoothSco() for audio routing to Bluetooth SCO channel.
 * - Windows side requires Bluetooth HFP (Hands-Free Profile) implementation, speaker/microphone routing,
 *   and proper call state synchronization.
 */
object BluetoothClient {

    private val adapter     = BluetoothAdapter.getDefaultAdapter()
    @Volatile private var socket: BluetoothSocket? = null
    @Volatile private var outputStream: OutputStream? = null
    @Volatile private var inputStream:  InputStream?  = null
    private val connected   = AtomicBoolean(false)
    private val reconnecting= AtomicBoolean(false)
    private var deviceName  = ""
    private var scope       = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // ──────────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────────

    fun connect(deviceName: String, context: Context) {
        this.deviceName = deviceName
        if (!hasPermission(context)) {
            Log.w(TAG, "Missing Bluetooth permission — skip BT connect")
            return
        }
        if (adapter == null || !adapter.isEnabled) {
            Log.w(TAG, "Bluetooth adapter unavailable or disabled")
            return
        }
        doConnect(context)
    }

    fun disconnect() {
        reconnecting.set(false)
        scope.cancel()
        safeClose()
        connected.set(false)
    }

    fun send(json: String): Boolean {
        val os = outputStream
        return if (connected.get() && os != null) {
            try {
                val data = (json + "\n").toByteArray(Charsets.UTF_8)
                os.write(data)
                os.flush()
                true
            } catch (e: Exception) {
                Log.e(TAG, "BT send failed", e)
                connected.set(false)
                false
            }
        } else false
    }

    fun isConnected(): Boolean = connected.get()

    // ──────────────────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────────────────

    private fun doConnect(context: Context) {
        if (!scope.isActive) scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

        scope.launch {
            try {
                val device = findDevice(context) ?: run {
                    Log.w(TAG, "BT device '$deviceName' not found in paired devices")
                    scheduleReconnect(context)
                    return@launch
                }
                Log.i(TAG, "Connecting to BT device: ${device.name} ${device.address}")

                @Suppress("DEPRECATION")
                val btSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                adapter?.cancelDiscovery()
                btSocket.connect()

                socket       = btSocket
                outputStream = btSocket.outputStream
                inputStream  = btSocket.inputStream
                connected.set(true)
                reconnecting.set(false)
                Log.i(TAG, "BT connected to ${device.name}")
                PhoneLinkService.notifyConnected("Bluetooth")

                // Read loop
                val buffer = ByteArray(8192)
                val sb     = StringBuilder()
                while (connected.get()) {
                    val bytes = inputStream?.read(buffer) ?: -1
                    if (bytes == -1) break
                    sb.append(String(buffer, 0, bytes, Charsets.UTF_8))
                    // Process complete newline-delimited JSON messages
                    var newlineIdx = sb.indexOf('\n')
                    while (newlineIdx != -1) {
                        val msg = sb.substring(0, newlineIdx).trim()
                        sb.delete(0, newlineIdx + 1)
                        if (msg.isNotEmpty()) {
                            Log.d(TAG, "BT RX: ${msg.take(100)}")
                            MessageHandler.handleIncoming(msg, context)
                        }
                        newlineIdx = sb.indexOf('\n')
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "BT connection error", e)
            } finally {
                safeClose()
                connected.set(false)
                PhoneLinkService.notifyDisconnected()
                scheduleReconnect(context)
            }
        }
    }

    private fun findDevice(context: Context): BluetoothDevice? {
        if (!hasPermission(context)) return null
        return try {
            adapter?.bondedDevices?.firstOrNull { it.name.equals(deviceName, ignoreCase = true) }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException finding BT device", e)
            null
        }
    }

    private fun scheduleReconnect(context: Context) {
        if (!reconnecting.compareAndSet(false, true)) return
        scope.launch {
            delay(10_000L)
            reconnecting.set(false)
            if (deviceName.isNotBlank()) doConnect(context)
        }
    }

    private fun safeClose() {
        try { outputStream?.close() } catch (_: Exception) {}
        try { inputStream?.close()  } catch (_: Exception) {}
        try { socket?.close()       } catch (_: Exception) {}
        socket       = null
        outputStream = null
        inputStream  = null
    }

    private fun hasPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
                    PackageManager.PERMISSION_GRANTED
        } else true
    }
}
