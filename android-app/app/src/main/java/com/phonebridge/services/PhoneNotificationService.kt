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
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

private const val TAG = "PhoneNotifService"

class PhoneNotificationService : NotificationListenerService() {

    // Dedup cache: key = sbn.key, value = "$title|$text"
    // Prevents notification spam when reconnecting to a session with many active notifications.
    private val notifCache = mutableMapOf<String, String>()

    companion object {
        private var instance: PhoneNotificationService? = null

        fun triggerNotificationAction(context: android.content.Context, key: String, actionIndex: Int, replyText: String? = null): Boolean {
            val service = instance ?: run {
                Log.e(TAG, "[NOTIFICATION] Action failed: Service not running")
                return false
            }
            try {
                val activeNotifs = service.activeNotifications
                for (sbn in activeNotifs) {
                    if (sbn.key == key) {
                        val actions = sbn.notification.actions ?: continue
                        if (actionIndex in actions.indices) {
                            val action = actions[actionIndex]
                            val intent = android.content.Intent()
                            val remoteInputs = action.remoteInputs
                            if (remoteInputs != null && !replyText.isNullOrBlank()) {
                                val bundle = android.os.Bundle()
                                for (ri in remoteInputs) {
                                    bundle.putCharSequence(ri.resultKey, replyText)
                                }
                                android.app.RemoteInput.addResultsToIntent(
                                    remoteInputs,
                                    intent,
                                    bundle
                                )
                            }
                            action.actionIntent.send(context, 0, intent)
                            Log.i(TAG, "[NOTIFICATION] Action triggered successfully (index=$actionIndex)")
                            return true
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "[NOTIFICATION] Action failed: Exception", e)
            }
            return false
        }

        fun replyToNotification(context: android.content.Context, key: String, message: String): Boolean {
            // Find first replyable action
            val service = instance ?: return false
            try {
                val activeNotifs = service.activeNotifications
                for (sbn in activeNotifs) {
                    if (sbn.key == key) {
                        val actions = sbn.notification.actions ?: continue
                        actions.forEachIndexed { index, action ->
                            if (action.remoteInputs?.isNotEmpty() == true) {
                                return triggerNotificationAction(context, key, index, message)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed in reply delegate", e)
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
            var title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            
            // Extract text with fallback options
            var text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

            // Fallback 1: Try EXTRA_MESSAGES for MessagingStyle (WhatsApp, Google Messages, Telegram, etc.)
            if (text.isBlank()) {
                val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
                if (messages != null && messages.isNotEmpty()) {
                    // Extract text from the last message
                    val lastMessage = messages[messages.size - 1] as? android.os.Bundle
                    if (lastMessage != null) {
                        text = lastMessage.getCharSequence("text")?.toString() ?: ""
                        if (title.isBlank()) {
                            val senderBundle = lastMessage.getBundle("sender_person")
                            if (senderBundle != null) {
                                title = senderBundle.getString("name") ?: ""
                            }
                        }
                    }
                }
            }

            // Fallback 2: Try EXTRA_TEXT_LINES (InboxStyle notifications like Gmail)
            if (text.isBlank()) {
                val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
                if (lines != null && lines.isNotEmpty()) {
                    text = lines.joinToString("\n") { it.toString() }
                }
            }

            // Fallback 3: Try EXTRA_SUB_TEXT
            if (text.isBlank()) {
                text = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
            }

            // Skip empty notifications or group summaries
            if (title.isBlank() && text.isBlank()) return
            if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

            // Dedup check: skip if we already sent this exact title+text for this key
            val cacheValue = "$title|$text"
            if (notifCache[sbn.key] == cacheValue) return
            notifCache[sbn.key] = cacheValue

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

            val actionsArray = JSONArray()
            sbn.notification.actions?.forEachIndexed { index, action ->
                val actionObj = JSONObject().apply {
                    put("index", index)
                    put("title", action.title?.toString() ?: "")
                    put("isReply", action.remoteInputs?.isNotEmpty() == true)
                }
                actionsArray.put(actionObj)
            }

            val notifJson = JSONObject().apply {
                put("type", "NOTIFICATION")
                put("id", sbn.key)
                put("app", appLabel)
                put("appPackage", packageName)
                put("title", title)
                put("message", text)
                put("timestamp", isoTimestamp)
                put("replyable", isReplyable)
                put("actions", actionsArray as Any)
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
        // Clean up dedup cache entry
        notifCache.remove(sbn.key)
        // Notify PC so it can remove the notification from its list
        if (ConnectionManager.isConnected()) {
            try {
                val json = JSONObject().apply {
                    put("type", "NOTIFICATION_REMOVED")
                    put("id", sbn.key)
                }
                ConnectionManager.send(json.toString())
                Log.d(TAG, "Sent NOTIFICATION_REMOVED for ${sbn.packageName}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send NOTIFICATION_REMOVED", e)
            }
        }
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
