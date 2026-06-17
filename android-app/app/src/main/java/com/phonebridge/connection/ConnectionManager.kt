package com.phonebridge.connection

import android.content.Context
import android.util.Log
import com.phonebridge.pairing.PairingManager
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "ConnectionManager"

enum class ConnectionType { NONE, WIFI, BLUETOOTH }

/**
 * Orchestrates WiFi (WebSocket) primary and Bluetooth fallback.
 * - Tries WiFi first; if 3 attempts fail, switches to Bluetooth.
 * - Transparently routes `send()` to whichever transport is active.
 */
object ConnectionManager {

    @Volatile var activeConnection: ConnectionType = ConnectionType.NONE
        private set

    private val wifiFailures = AtomicInteger(0)
    private var appContext: Context? = null

    // ──────────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────────

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun connect() {
        val ctx = appContext ?: run { Log.e(TAG, "init() not called"); return }
        val wsUrl    = PairingManager.getWsUrl()  ?: return
        val btDevice = PairingManager.getBtDeviceName() ?: ""

        wifiFailures.set(0)
        Log.i(TAG, "connect() — ws=$wsUrl bt=$btDevice")
        WebSocketClient.connect(wsUrl, ctx)
    }

    /** Called by WebSocketClient when WiFi connected. */
    fun onWifiConnected() {
        activeConnection = ConnectionType.WIFI
        wifiFailures.set(0)
        Log.i(TAG, "Active: WiFi")
    }

    /** Called by WebSocketClient/BluetoothClient when disconnected. */
    fun onDisconnected(type: ConnectionType) {
        if (type == ConnectionType.WIFI) {
            val failures = wifiFailures.incrementAndGet()
            Log.w(TAG, "WiFi disconnected — failures=$failures")
            if (failures >= 3) {
                Log.i(TAG, "WiFi failed 3 times — falling back to Bluetooth")
                activeConnection = ConnectionType.NONE
                tryBluetooth()
            } else {
                activeConnection = ConnectionType.NONE
            }
        } else if (type == ConnectionType.BLUETOOTH) {
            activeConnection = ConnectionType.NONE
        }
    }

    fun disconnect() {
        WebSocketClient.disconnect()
        BluetoothClient.disconnect()
        activeConnection = ConnectionType.NONE
    }

    fun send(json: String): Boolean {
        return when {
            WebSocketClient.isConnected() -> WebSocketClient.send(json).also {
                if (it) activeConnection = ConnectionType.WIFI
            }
            BluetoothClient.isConnected() -> BluetoothClient.send(json).also {
                if (it) activeConnection = ConnectionType.BLUETOOTH
            }
            else -> {
                Log.w(TAG, "send() dropped — no active connection")
                false
            }
        }
    }

    fun isConnected(): Boolean = WebSocketClient.isConnected() || BluetoothClient.isConnected()

    // ──────────────────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────────────────

    private fun tryBluetooth() {
        val ctx      = appContext ?: return
        val btDevice = PairingManager.getBtDeviceName() ?: return
        if (btDevice.isBlank()) {
            Log.w(TAG, "No BT device name stored — cannot fall back")
            return
        }
        BluetoothClient.connect(btDevice, ctx)
    }
}
