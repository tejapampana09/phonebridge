package com.phonebridge.services

import android.app.Notification
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import android.util.Log
import com.phonebridge.connection.ConnectionManager
import org.json.JSONObject
import java.io.ByteArrayOutputStream

private const val TAG = "PhoneNotifService"

class PhoneNotificationService : NotificationListenerService() {

    companion object {
        private var instance: PhoneNotificationService? = null

        fun replyToNotification(context: android.content.Context, key: String, message: String): Boolean {
            val service = instance ?: return false
            try {
                val activeNotifs = service.activeNotifications
                for (sbn in activeNotifs) {
                    if (sbn.key == key) {
                        val actions = sbn.notification.actions ?: continue
                        for (action in actions) {
                            val remoteInputs = action.remoteInputs ?: continue
                            for (ri in remoteInputs) {
                                val intent = android.content.Intent()
                                val bundle = android.os.Bundle()
                                bundle.putCharSequence(ri.resultKey, message)
                                android.app.RemoteInput.addResultsToIntent(
                                    arrayOf(ri),
                                    intent,
                                    bundle
                                )
                                action.actionIntent.send(context, 0, intent)
                                return true
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to reply to notification: $key", e)
            }
            return false
        }

        fun cancelByKey(key: String): Boolean {
            val service = instance ?: return false
            try {
                service.cancelNotification(key)
                return true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to cancel notification: $key", e)
            }
            return false
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "Notification listener service created")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        super.onNotificationPosted(sbn)

        val packageName = sbn.packageName
        
        // Ignore own notifications
        if (packageName == this.packageName) {
            return
        }

        try {
            val extras = sbn.notification.extras
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
            
            // Skip empty notifications or group summaries
            if (title.isEmpty() && text.isEmpty()) return
            if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

            val pm = packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            val appLabel = pm.getApplicationLabel(appInfo).toString()

            // Get compressed icon as base64
            var iconBase64: String? = null
            try {
                val appIcon = pm.getApplicationIcon(appInfo)
                iconBase64 = drawableToBase64Jpeg(appIcon)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to extract app icon", e)
            }

            val timestamp = sbn.postTime
            val isoTimestamp = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(java.util.Date(timestamp))

            val isReplyable = sbn.notification.actions?.any { action ->
                action.remoteInputs?.isNotEmpty() == true
            } ?: false

            val notifJson = JSONObject().apply {
                put("type", "NOTIFICATION")
                put("id", sbn.key)
                put("app", appLabel)
                put("appPackage", packageName)
                put("title", title)
                put("message", text)
                put("timestamp", isoTimestamp)
                put("replyable", isReplyable)
                if (iconBase64 != null) {
                    put("icon", "data:image/jpeg;base64,$iconBase64")
                }
            }

            if (ConnectionManager.isConnected()) {
                ConnectionManager.send(notifJson.toString())
                Log.d(TAG, "Synced notification from $appLabel: $title")
            } else {
                Log.d(TAG, "Could not sync notification: connection offline")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling notification post", e)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        super.onNotificationRemoved(sbn)
        // Optionally send a dismiss event to PC if needed, but PC generally controls dismissals
    }

    /**
     * Converts a drawable to a resized 48x48 Bitmap and outputs it as a Base64-encoded JPEG string.
     */
    private fun drawableToBase64Jpeg(drawable: Drawable): String {
        val bitmap = when (drawable) {
            is BitmapDrawable -> drawable.bitmap
            else -> {
                val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 48
                val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 48
                val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bmp)
                drawable.setBounds(0, 0, canvas.width, canvas.height)
                drawable.draw(canvas)
                bmp
            }
        }

        // Resize down to 48x48 to optimize JSON size
        val resized = Bitmap.createScaledBitmap(bitmap, 48, 48, true)
        val outputStream = ByteArrayOutputStream()
        resized.compress(Bitmap.CompressFormat.JPEG, 70, outputStream)
        val bytes = outputStream.toByteArray()
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }
}
