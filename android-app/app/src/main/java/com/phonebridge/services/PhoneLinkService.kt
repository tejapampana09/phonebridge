package com.phonebridge.services

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.phonebridge.MainActivity
import com.phonebridge.R
import com.phonebridge.connection.ConnectionManager
import com.phonebridge.connection.MessageHandler
import com.phonebridge.pairing.PairingManager
import kotlinx.coroutines.*

private const val TAG              = "PhoneLinkService"
private const val NOTIF_ID         = 1001
private const val CHANNEL_ID       = "phonebridge_sync"
private const val ACTION_STOP      = "com.phonebridge.ACTION_STOP"

/**
 * Foreground service that maintains the persistent connection to the PC.
 * Runs a 30-second heartbeat to send DEVICE_STATUS.
 * Restarts itself on kill via START_STICKY.
 *
 * NOTE: Bluetooth call audio is not implemented.
 * This is a data transport only channel.
 * To support Microsoft Phone Link style calling over Bluetooth:
 * - Android side requires AudioManager.startBluetoothSco() for audio routing to Bluetooth SCO channel.
 * - Windows side requires Bluetooth HFP (Hands-Free Profile) implementation, speaker/microphone routing,
 *   and proper call state synchronization.
 */
class PhoneLinkService : Service() {

    private var heartbeatJob: Job? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /** Set to true by MessageHandler when it writes the PC clipboard to the phone.
     *  The clipboardListener will skip the next change to break the echo loop. */
    @Volatile var suppressNextClipboard = false

    companion object {
        @Volatile private var instance: PhoneLinkService? = null
        @Volatile var lastClipboardText: String? = null

        fun isRunning(): Boolean = instance != null



        fun suppressNextClipboard() {
            instance?.suppressNextClipboard = true
        }

        fun start(context: Context) {
            val intent = Intent(context, PhoneLinkService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, PhoneLinkService::class.java).also {
                it.action = ACTION_STOP
            }
            context.startService(intent)
        }

        fun notifyConnected(transport: String) {
            instance?.updateNotification("Connected via $transport")
            ConnectionManager.onWifiConnected()
        }

        fun notifyDisconnected() {
            instance?.updateNotification("Reconnecting…")
            ConnectionManager.onDisconnected(
                if (ConnectionManager.activeConnection == com.phonebridge.connection.ConnectionType.BLUETOOTH)
                    com.phonebridge.connection.ConnectionType.BLUETOOTH
                else
                    com.phonebridge.connection.ConnectionType.WIFI
            )
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    private val batteryReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (ConnectionManager.isConnected()) {
                val status = MessageHandler.buildDeviceStatus(context)
                ConnectionManager.send(status)
            }
        }
    }

    private var phoneStateListener: android.telephony.PhoneStateListener? = null

    private fun registerSignalStrengthListener() {
        try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            phoneStateListener = object : android.telephony.PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onSignalStrengthsChanged(signalStrength: android.telephony.SignalStrength) {
                    super.onSignalStrengthsChanged(signalStrength)
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(MessageHandler.buildDeviceStatus(this@PhoneLinkService))
                    }
                }
            }
            @Suppress("DEPRECATION")
            tm.listen(phoneStateListener, android.telephony.PhoneStateListener.LISTEN_SIGNAL_STRENGTHS)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register signal listener", e)
        }
    }

    private fun unregisterSignalStrengthListener() {
        try {
            if (phoneStateListener != null) {
                val tm = getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
                @Suppress("DEPRECATION")
                tm.listen(phoneStateListener, android.telephony.PhoneStateListener.LISTEN_NONE)
                phoneStateListener = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister signal listener", e)
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        
        val notification = buildNotification("Connecting…")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notification)
        }

        PairingManager.init(this)
        ConnectionManager.init(this)
        ConnectionManager.connect()
        startHeartbeat()
        com.phonebridge.workers.HeartbeatWorker.schedule(this)

        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        cm.addPrimaryClipChangedListener(clipboardListener)

        // Register dynamic battery and signal listeners
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        registerReceiver(batteryReceiver, filter)
        registerSignalStrengthListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.i(TAG, "Stop action received")
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()

        instance = null
        heartbeatJob?.cancel()
        serviceScope.cancel()
        
        try {
            com.phonebridge.utils.MirroringManager.stopMirroring()
            com.phonebridge.utils.DeviceActionsHelper.stopRinging(this)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clean up device actions on service destroy", e)
        }
        
        // Unregister listeners
        try {
            unregisterReceiver(batteryReceiver)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister battery receiver", e)
        }
        unregisterSignalStrengthListener()

        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.removePrimaryClipChangedListener(clipboardListener)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove clipboard listener", e)
        }
        MessageHandler.cancelSync()
        ConnectionManager.disconnect()
        Log.i(TAG, "Service destroyed")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ──────────────────────────────────────────────────────────────────────────
    // Clipboard sync
    // ──────────────────────────────────────────────────────────────────────────

    private val clipboardListener = android.content.ClipboardManager.OnPrimaryClipChangedListener {
        // Break echo loop: if the PC just set our clipboard via SET_CLIPBOARD, skip this event
        if (suppressNextClipboard) {
            suppressNextClipboard = false
            return@OnPrimaryClipChangedListener
        }
        val text = com.phonebridge.sync.ClipboardSync.getCurrentClipboard(this)
        if (!text.isNullOrBlank()) {
            if (text == lastClipboardText) {
                return@OnPrimaryClipChangedListener
            }
            lastClipboardText = text
            val clipJson = org.json.JSONObject().apply {
                put("type", "CLIPBOARD_CHANGED")
                put("text", text)
            }
            if (ConnectionManager.isConnected()) {
                ConnectionManager.send(clipJson.toString())
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Heartbeat
    // ──────────────────────────────────────────────────────────────────────────

    private fun startHeartbeat() {
        heartbeatJob = serviceScope.launch {
            while (isActive) {
                delay(30_000L)
                try {
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(MessageHandler.buildDeviceStatus(this@PhoneLinkService))
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Heartbeat error", e)
                }
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Notification
    // ──────────────────────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description    = getString(R.string.channel_description)
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(status: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, PhoneLinkService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PhoneBridge")
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop",
                stopIntent
            )
            .build()
    }

    fun updateNotification(status: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(status))
    }
}
