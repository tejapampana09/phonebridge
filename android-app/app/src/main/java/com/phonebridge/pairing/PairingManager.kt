package com.phonebridge.pairing

import android.content.Context
import android.content.SharedPreferences

/**
 * Singleton that stores/retrieves pairing data (WebSocket URL + BT device name)
 * in SharedPreferences. Initialised lazily with an application context.
 */
object PairingManager {

    private const val PREFS_NAME   = "phonebridge"
    private const val KEY_WS_URL   = "ws_url"
    private const val KEY_BT_NAME  = "bt_device_name"
    private const val KEY_PC_NAME  = "pc_name"

    @Volatile private var prefs: SharedPreferences? = null

    // ──────────────────────────────────────────────────────────────────────────
    // Init (call once from Application.onCreate or MainActivity)
    // ──────────────────────────────────────────────────────────────────────────
    fun init(context: Context) {
        if (prefs == null) {
            synchronized(this) {
                if (prefs == null) {
                    prefs = context.applicationContext
                        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                }
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────
    private fun requirePrefs(): SharedPreferences =
        prefs ?: error("PairingManager.init(context) was not called before use.")

    // ──────────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────────

    /** Persist pairing info after a successful QR scan. */
    fun save(wsUrl: String, btDeviceName: String) {
        requirePrefs().edit()
            .putString(KEY_WS_URL,  wsUrl.trim())
            .putString(KEY_BT_NAME, btDeviceName.trim())
            .apply()
    }

    /** Returns the WebSocket URL, e.g. "ws://192.168.1.5:8765", or null if not paired. */
    fun getWsUrl(): String? = requirePrefs().getString(KEY_WS_URL, null)?.takeIf { it.isNotBlank() }

    /** Returns the Bluetooth device name, or null if not set. */
    fun getBtDeviceName(): String? = requirePrefs().getString(KEY_BT_NAME, null)?.takeIf { it.isNotBlank() }

    /** Returns true only when both the WS URL and BT device name are stored. */
    fun isPaired(): Boolean = !getWsUrl().isNullOrBlank()

    /** Stores the PC name received in CONNECT_ACK. */
    fun savePcName(name: String) {
        requirePrefs().edit().putString(KEY_PC_NAME, name).apply()
    }

    /** Returns the PC name as reported by the PC, or "PC" as default. */
    fun getPcName(): String = requirePrefs().getString(KEY_PC_NAME, "PC") ?: "PC"

    /** Clears all pairing data (triggers re-pairing flow). */
    fun clear() {
        requirePrefs().edit().clear().apply()
    }
}
