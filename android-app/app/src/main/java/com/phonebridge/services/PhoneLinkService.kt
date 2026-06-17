package com.phonebridge.services

import android.app.*
import android.content.Context
import android.content.Intent
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
 */
class PhoneLinkService : Service() {

    private var heartbeatJob: Job? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    companion object {
        @Volatile private var instance: PhoneLinkService? = null

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

        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        cm.addPrimaryClipChangedListener(clipboardListener)
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
        val text = com.phonebridge.sync.ClipboardSync.getCurrentClipboard(this)
        if (!text.isNullOrBlank()) {
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
