package com.phonebridge.connection

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.os.BatteryManager
import android.provider.CallLog
import android.service.notification.StatusBarNotification
import android.telephony.SmsManager
import android.util.Base64
import android.util.Log
import com.phonebridge.pairing.PairingManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren

private const val TAG = "MessageHandler"

// ──────────────────────────────────────────────────────────────────────────────
// Message type constants
// ──────────────────────────────────────────────────────────────────────────────
object MsgType {
    // Phone → PC
    const val NOTIFICATION   = "NOTIFICATION"
    const val CALL_INCOMING  = "CALL_INCOMING"
    const val CALL_UPDATE    = "CALL_UPDATE"
    const val CALL_HISTORY   = "CALL_HISTORY"
    const val SMS_RECEIVED   = "SMS_RECEIVED"
    const val SMS_HISTORY    = "SMS_HISTORY"
    const val PHOTO_METADATA = "PHOTO_METADATA"
    const val DEVICE_STATUS  = "DEVICE_STATUS"
    const val PONG           = "PONG"
    const val CLIPBOARD_CHANGED = "CLIPBOARD_CHANGED"

    // PC → Phone
    const val PING                 = "PING"
    const val SEND_SMS             = "SEND_SMS"
    const val DISMISS_NOTIFICATION = "DISMISS_NOTIFICATION"
    const val REQUEST_SYNC         = "REQUEST_SYNC"
    const val CONNECT_ACK          = "CONNECT_ACK"
    const val CLIENT_ACK           = "CLIENT_ACK"
    const val DIAL_NUMBER          = "DIAL_NUMBER"
    const val REPLY_NOTIFICATION   = "REPLY_NOTIFICATION"
    const val ANSWER_CALL          = "ANSWER_CALL"
    const val REJECT_CALL          = "REJECT_CALL"
    const val REQUEST_FILE         = "REQUEST_FILE"
    const val FILE_TRANSFER_START  = "FILE_TRANSFER_START"
    const val FILE_TRANSFER_CHUNK  = "FILE_TRANSFER_CHUNK"
    const val FILE_TRANSFER_END    = "FILE_TRANSFER_END"
    const val LAUNCH_APP           = "LAUNCH_APP"
    const val SET_CLIPBOARD        = "SET_CLIPBOARD"
    const val UNLINK               = "UNLINK"
    const val DELETE_SMS           = "DELETE_SMS"
    const val DELETE_SMS_ACK       = "DELETE_SMS_ACK"
    const val CREATE_CONTACT       = "CREATE_CONTACT"
    const val UPDATE_CONTACT       = "UPDATE_CONTACT"
    const val DELETE_CONTACT       = "DELETE_CONTACT"
    const val CONTACT_ACK          = "CONTACT_ACK"
    const val LIST_FILES           = "LIST_FILES"
    const val FILES_LIST           = "FILES_LIST"
    const val REQUEST_FILE_PATH    = "REQUEST_FILE_PATH"
    const val DELETE_FILE          = "DELETE_FILE"
    const val RENAME_FILE          = "RENAME_FILE"
    const val DELETE_PHOTO         = "DELETE_PHOTO"
    const val NOTIFICATION_ACTION  = "NOTIFICATION_ACTION"
    const val CALENDAR_HISTORY     = "CALENDAR_HISTORY"
    const val DELETE_EVENT         = "DELETE_EVENT"
    const val CREATE_EVENT         = "CREATE_EVENT"
    const val TOGGLE_FLASHLIGHT    = "TOGGLE_FLASHLIGHT"
    const val RING_PHONE           = "RING_PHONE"
    const val STOP_RINGING         = "STOP_RINGING"
    const val LOCATE_DEVICE        = "LOCATE_DEVICE"
    const val LOCATE_DEVICE_RESP   = "LOCATE_DEVICE_RESP"
    const val START_MIRRORING      = "START_MIRRORING"
    const val STOP_MIRRORING       = "STOP_MIRRORING"
    const val MIRROR_FRAME         = "MIRROR_FRAME"
}

/**
 * Processes all incoming JSON messages from the PC.
 * Also provides builder helpers for outgoing messages.
 */
object MessageHandler {

    // ──────────────────────────────────────────────────────────────────────────
    // Incoming dispatch
    // ──────────────────────────────────────────────────────────────────────────

    fun handleIncoming(jsonString: String, context: Context) {
        try {
            val json = JSONObject(jsonString)
            when (val type = json.optString("type")) {
                MsgType.PING -> {
                    ConnectionManager.send(buildPong())
                }
                MsgType.SEND_SMS -> {
                    val to   = json.optString("to")
                    var body = json.optString("body")
                    if (body.isEmpty()) {
                        body = json.optString("message")
                    }
                    if (to.isNotBlank() && body.isNotBlank()) sendSms(context, to, body)
                }
                MsgType.DELETE_SMS -> {
                    val msgId = json.optString("msgId")
                    val uri = android.net.Uri.parse("content://sms/$msgId")
                    val deleted = context.contentResolver.delete(uri, null, null)
                    val ack = JSONObject().apply {
                        put("type", MsgType.DELETE_SMS_ACK)
                        put("msgId", msgId)
                        put("success", deleted > 0)
                    }
                    ConnectionManager.send(ack.toString())
                }
                MsgType.CREATE_CONTACT -> {
                    val name = json.optString("name")
                    val number = json.optString("number")
                    syncScope.launch {
                        try {
                            val ops = ArrayList<android.content.ContentProviderOperation>()
                            val rawContactIdx = ops.size
                            ops.add(android.content.ContentProviderOperation.newInsert(android.provider.ContactsContract.RawContacts.CONTENT_URI)
                                .withValue(android.provider.ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                                .withValue(android.provider.ContactsContract.RawContacts.ACCOUNT_NAME, null).build())
                            ops.add(android.content.ContentProviderOperation.newInsert(android.provider.ContactsContract.Data.CONTENT_URI)
                                .withValueBackReference(android.provider.ContactsContract.Data.RAW_CONTACT_ID, rawContactIdx)
                                .withValue(android.provider.ContactsContract.Data.MIMETYPE, android.provider.ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                                .withValue(android.provider.ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name).build())
                            ops.add(android.content.ContentProviderOperation.newInsert(android.provider.ContactsContract.Data.CONTENT_URI)
                                .withValueBackReference(android.provider.ContactsContract.Data.RAW_CONTACT_ID, rawContactIdx)
                                .withValue(android.provider.ContactsContract.Data.MIMETYPE, android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                                .withValue(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER, number)
                                .withValue(android.provider.ContactsContract.CommonDataKinds.Phone.TYPE, android.provider.ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE).build())
                            context.contentResolver.applyBatch(android.provider.ContactsContract.AUTHORITY, ops)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to create contact", e)
                        }
                        delay(300)
                        ConnectionManager.send(com.phonebridge.sync.ContactsSync.getAllContacts(context))
                    }
                }
                MsgType.DELETE_CONTACT -> {
                    val contactId = json.optString("contactId")
                    syncScope.launch {
                        try {
                            val uri = android.net.Uri.withAppendedPath(android.provider.ContactsContract.Contacts.CONTENT_URI, contactId)
                            context.contentResolver.delete(uri, null, null)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to delete contact", e)
                        }
                        delay(300)
                        ConnectionManager.send(com.phonebridge.sync.ContactsSync.getAllContacts(context))
                    }
                }
                MsgType.UPDATE_CONTACT -> {
                    val contactId = json.optString("contactId")
                    val name = json.optString("name")
                    val number = json.optString("number")
                    syncScope.launch {
                        try {
                            val ops = ArrayList<android.content.ContentProviderOperation>()
                            ops.add(android.content.ContentProviderOperation.newUpdate(android.provider.ContactsContract.Data.CONTENT_URI)
                                .withSelection(
                                    "${android.provider.ContactsContract.Data.CONTACT_ID} = ? AND ${android.provider.ContactsContract.Data.MIMETYPE} = ?",
                                    arrayOf(contactId, android.provider.ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                                )
                                .withValue(android.provider.ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name)
                                .build())
                            ops.add(android.content.ContentProviderOperation.newUpdate(android.provider.ContactsContract.Data.CONTENT_URI)
                                .withSelection(
                                    "${android.provider.ContactsContract.Data.CONTACT_ID} = ? AND ${android.provider.ContactsContract.Data.MIMETYPE} = ? AND ${android.provider.ContactsContract.CommonDataKinds.Phone.TYPE} = ?",
                                    arrayOf(contactId, android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE, android.provider.ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE.toString())
                                )
                                .withValue(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER, number)
                                .build())
                            context.contentResolver.applyBatch(android.provider.ContactsContract.AUTHORITY, ops)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to update contact", e)
                        }
                        delay(300)
                        ConnectionManager.send(com.phonebridge.sync.ContactsSync.getAllContacts(context))
                    }
                }
                MsgType.LIST_FILES -> {
                    val pathOpt = json.optString("path")
                    val path = if (pathOpt.isNullOrBlank()) android.os.Environment.getExternalStorageDirectory().absolutePath else pathOpt
                    syncScope.launch {
                        try {
                            val dir = java.io.File(path)
                            val entries = org.json.JSONArray()
                            if (dir.exists() && dir.isDirectory) {
                                dir.listFiles()?.sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() }))?.forEach { f ->
                                    entries.put(JSONObject().apply {
                                        put("name", f.name)
                                        put("path", f.absolutePath)
                                        put("isDir", f.isDirectory)
                                        put("size", if (f.isFile) f.length() else 0L)
                                        put("modified", f.lastModified())
                                    })
                                }
                            }
                            val response = JSONObject().apply {
                                        put("type", MsgType.FILES_LIST)
                                        put("path", path)
                                        put("entries", entries)
                                    }
                            ConnectionManager.send(response.toString())
                        } catch (e: Exception) {
                            Log.e(TAG, "List files failed for $path", e)
                        }
                    }
                }
                MsgType.REQUEST_FILE_PATH -> {
                    val filePath = json.optString("filePath")
                    if (filePath.isNotBlank()) {
                        com.phonebridge.utils.FileTransferManager.sendFileToPc(context, filePath, "file")
                    }
                }
                MsgType.DELETE_FILE -> {
                    val filePath = json.optString("filePath")
                    if (filePath.isNotBlank()) {
                        try {
                            val file = java.io.File(filePath)
                            if (file.exists() && file.isFile) {
                                file.delete()
                                val parent = file.parent ?: android.os.Environment.getExternalStorageDirectory().absolutePath
                                MessageHandler.handleIncoming(JSONObject().apply {
                                    put("type", MsgType.LIST_FILES)
                                    put("path", parent)
                                }.toString(), context)
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Delete file failed for $filePath", e)
                        }
                    }
                }
                MsgType.RENAME_FILE -> {
                    val filePath = json.optString("filePath")
                    val newName = json.optString("newName")
                    if (filePath.isNotBlank() && newName.isNotBlank()) {
                        try {
                            val file = java.io.File(filePath)
                            if (file.exists()) {
                                val dest = java.io.File(file.parentFile, newName)
                                file.renameTo(dest)
                                val parent = file.parent ?: android.os.Environment.getExternalStorageDirectory().absolutePath
                                MessageHandler.handleIncoming(JSONObject().apply {
                                    put("type", MsgType.LIST_FILES)
                                    put("path", parent)
                                }.toString(), context)
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Rename file failed for $filePath", e)
                        }
                    }
                }
                MsgType.DISMISS_NOTIFICATION -> {
                    val id = json.optString("id")
                    if (id.isNotBlank()) {
                        val success = com.phonebridge.services.PhoneNotificationService.cancelByKey(id)
                        Log.i(TAG, "Dismiss notification $id: success=$success")
                    }
                }
                MsgType.REQUEST_SYNC -> {
                    triggerSync(context)
                }
                MsgType.DIAL_NUMBER -> {
                    val number = json.optString("number")
                    if (number.isNotBlank()) dialNumber(context, number)
                }
                MsgType.REPLY_NOTIFICATION -> {
                    val id = json.optString("id")
                    val message = json.optString("message")
                    if (id.isNotBlank() && message.isNotBlank()) {
                        val success = com.phonebridge.services.PhoneNotificationService.replyToNotification(context, id, message)
                        Log.i(TAG, "Reply to notification $id: success=$success")
                    }
                }
                MsgType.CREATE_EVENT -> {
                    val title = json.optString("title")
                    val description = json.optString("description")
                    val start = json.optLong("start")
                    val end = json.optLong("end")
                    val location = json.optString("location")
                    syncScope.launch {
                        val success = com.phonebridge.sync.CalendarSync.createEvent(context, title, description, start, end, location)
                        Log.i(TAG, "Event created: success=$success")
                        if (success) {
                            delay(200)
                            ConnectionManager.send(com.phonebridge.sync.CalendarSync.getCalendarEvents(context))
                        }
                    }
                }
                MsgType.DELETE_EVENT -> {
                    val eventId = json.optString("eventId")
                    syncScope.launch {
                        val success = com.phonebridge.sync.CalendarSync.deleteEvent(context, eventId)
                        Log.i(TAG, "Event deleted eventId=$eventId: success=$success")
                        if (success) {
                            delay(200)
                            ConnectionManager.send(com.phonebridge.sync.CalendarSync.getCalendarEvents(context))
                        }
                    }
                }
                MsgType.TOGGLE_FLASHLIGHT -> {
                    val enabled = json.optBoolean("enabled", false)
                    com.phonebridge.utils.DeviceActionsHelper.toggleFlashlight(context, enabled)
                }
                MsgType.RING_PHONE -> {
                    com.phonebridge.utils.DeviceActionsHelper.ringPhone(context)
                }
                MsgType.STOP_RINGING -> {
                    com.phonebridge.utils.DeviceActionsHelper.stopRinging(context)
                }
                MsgType.LOCATE_DEVICE -> {
                    syncScope.launch {
                        val coords = com.phonebridge.utils.DeviceActionsHelper.locateDevice(context)
                        val resp = JSONObject().apply {
                            put("type", MsgType.LOCATE_DEVICE_RESP)
                            if (coords != null) {
                                put("lat", coords.first)
                                put("lng", coords.second)
                                put("success", true)
                            } else {
                                put("success", false)
                            }
                        }
                        ConnectionManager.send(resp.toString())
                    }
                }
                MsgType.START_MIRRORING -> {
                    Log.i(TAG, "START_MIRRORING ignored - feature frozen")
                }
                MsgType.STOP_MIRRORING -> {
                    Log.i(TAG, "STOP_MIRRORING ignored - feature frozen")
                }
                MsgType.NOTIFICATION_ACTION -> {
                    val id = json.optString("id")
                    val index = json.optInt("index", 0)
                    val message = json.optString("message", "")
                    val success = com.phonebridge.services.PhoneNotificationService.triggerNotificationAction(
                        context, id, index, message.ifBlank { null }
                    )
                    Log.i(TAG, "Notification action key=$id, index=$index: success=$success")
                }
                MsgType.ANSWER_CALL -> {
                    val success = com.phonebridge.services.CallControlService.answerCall(context)
                    Log.i(TAG, "Answer call trigger: success=$success")
                }
                MsgType.REJECT_CALL -> {
                    val success = com.phonebridge.services.CallControlService.rejectCall(context)
                    Log.i(TAG, "Reject call trigger: success=$success")
                }
                MsgType.REQUEST_FILE -> {
                    val fileId = json.optString("fileId")
                    val fileType = json.optString("fileType")
                    if (fileId.isNotBlank()) {
                        com.phonebridge.utils.FileTransferManager.sendFileToPc(context, fileId, fileType)
                    }
                }
                MsgType.DELETE_PHOTO -> {
                    val fileId = json.optString("fileId")
                    if (fileId.isNotBlank()) {
                        syncScope.launch {
                            try {
                                val uri = android.content.ContentUris.withAppendedId(
                                    android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                                    fileId.toLong()
                                )
                                context.contentResolver.delete(uri, null, null)
                            } catch (e: Exception) {
                                try {
                                    val uri = android.content.ContentUris.withAppendedId(
                                        android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                                        fileId.toLong()
                                    )
                                    context.contentResolver.delete(uri, null, null)
                                } catch (e2: Exception) {
                                    Log.e(TAG, "Failed to delete media $fileId", e2)
                                }
                            }
                            delay(200)
                            ConnectionManager.send(com.phonebridge.sync.PhotoSync.getRecentPhotos(context))
                        }
                    }
                }
                MsgType.FILE_TRANSFER_START -> {
                    com.phonebridge.utils.FileTransferManager.handleIncomingStart(json)
                }
                MsgType.FILE_TRANSFER_CHUNK -> {
                    com.phonebridge.utils.FileTransferManager.handleIncomingChunk(json)
                }
                MsgType.FILE_TRANSFER_END -> {
                    com.phonebridge.utils.FileTransferManager.handleIncomingEnd(json)
                }
                MsgType.CONNECT_ACK -> {
                    val pcName = json.optString("pcName", "PC")
                    PairingManager.savePcName(pcName)
                    Log.i(TAG, "CONNECT_ACK from $pcName")

                    val pcPublicKey = json.optString("publicKey", "")
                    if (pcPublicKey.isNotBlank()) {
                        Log.i(TAG, "Performing ECDH handshake with PC...")
                        val keyPair = SecurityUtils.generateKeyPair()
                        if (keyPair != null) {
                            val clientPubKey = SecurityUtils.getPublicKeyBase64(keyPair)
                            val sharedSecret = SecurityUtils.deriveSharedSecret(keyPair.private, pcPublicKey)
                            if (sharedSecret != null) {
                                // Send CLIENT_ACK in plaintext
                                val ackJson = JSONObject().apply {
                                    put("type", MsgType.CLIENT_ACK)
                                    put("publicKey", clientPubKey)
                                }
                                ConnectionManager.send(ackJson.toString())

                                // Activate secure channel
                                WebSocketClient.setEncryptionKey(sharedSecret)
                                Log.i(TAG, "ECDH handshake successful. Secure channel active.")
                            } else {
                                Log.e(TAG, "Failed to derive shared secret during ECDH")
                            }
                        } else {
                            Log.e(TAG, "Failed to generate client EC keypair")
                        }
                    }
                    
                    // Trigger contacts and apps sync on connection acknowledgment
                    syncScope.launch {
                        delay(200)
                        ConnectionManager.send(com.phonebridge.sync.ContactsSync.getAllContacts(context))
                        delay(200)
                        ConnectionManager.send(com.phonebridge.sync.InstalledAppsSync.getInstalledApps(context))
                    }

                    // Broadcast to update UI
                    val intent = Intent(ACTION_CONNECTED).putExtra(EXTRA_PC_NAME, pcName)
                    context.sendBroadcast(intent)
                }
                MsgType.LAUNCH_APP -> {
                    val packageName = json.optString("package")
                    if (packageName.isNotBlank()) {
                        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
                        if (launchIntent != null) {
                            launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            context.startActivity(launchIntent)
                        }
                    }
                }
                MsgType.SET_CLIPBOARD -> {
                    val text = json.optString("text")
                    if (text.isNotBlank()) {
                        // Suppress the echo loop: tell PhoneLinkService to skip the next
                        // clipboard change event and record the text
                        com.phonebridge.services.PhoneLinkService.lastClipboardText = text
                        com.phonebridge.services.PhoneLinkService.suppressNextClipboard()
                        val handler = android.os.Handler(android.os.Looper.getMainLooper())
                        handler.post {
                            com.phonebridge.sync.ClipboardSync.setClipboard(context, text)
                        }
                    }
                }
                MsgType.UNLINK -> {
                    Log.i(TAG, "Unlink command received from PC")
                    com.phonebridge.pairing.PairingManager.clear()
                    com.phonebridge.connection.ConnectionManager.disconnect()
                    com.phonebridge.services.PhoneLinkService.stop(context)
                }
                else -> Log.w(TAG, "Unknown message type: $type")
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleIncoming failed for: $jsonString", e)
        }
    }

    const val ACTION_CONNECTED = "com.phonebridge.CONNECTED"
    const val EXTRA_PC_NAME    = "pc_name"

    // ──────────────────────────────────────────────────────────────────────────
    // Actions on incoming commands
    // ──────────────────────────────────────────────────────────────────────────

    private fun sendSms(context: Context, to: String, body: String) {
        try {
            val smsManager = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                context.getSystemService(android.telephony.SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                android.telephony.SmsManager.getDefault()
            }
            val parts      = smsManager.divideMessage(body)
            if (parts.size == 1) {
                smsManager.sendTextMessage(to, null, body, null, null)
            } else {
                smsManager.sendMultipartTextMessage(to, null, parts, null, null)
            }
            Log.i(TAG, "SMS sent to $to")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send SMS to $to", e)
        }
    }

    private fun dialNumber(context: Context, number: String) {
        try {
            Log.i(TAG, "[CALL] Initiating call")
            if (androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.CALL_PHONE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "[CALL] Permission missing")
                // Fallback to dialer if CALL_PHONE permission is missing
                val intent = Intent(Intent.ACTION_DIAL).apply {
                    data = android.net.Uri.parse("tel:$number")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
                return
            }
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = android.net.Uri.parse("tel:$number")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            Log.i(TAG, "[CALL] Call started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start call for $number", e)
        }
    }

    private val syncScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    fun cancelSync() {
        try {
            syncScope.coroutineContext.cancelChildren()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel syncScope children", e)
        }
    }

    fun triggerSync(context: Context) {
        try {
            // Sequence:
            // 1. DEVICE_STATUS
            ConnectionManager.send(buildDeviceStatus(context))
            syncScope.launch {
                // 2. CONTACTS_HISTORY
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.ContactsSync.getAllContacts(context))
                
                // 3. APPS_HISTORY
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.InstalledAppsSync.getInstalledApps(context))
                
                // 4. SMS_HISTORY
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.SmsSync.getLastNThreads(context))
                
                // 5. CALL_HISTORY
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.CallLogSync.getLastNCalls(context))
                
                // 6. CLIPBOARD_CHANGED (current clipboard)
                delay(200)
                val currentClip = com.phonebridge.sync.ClipboardSync.getCurrentClipboard(context)
                if (!currentClip.isNullOrBlank()) {
                    com.phonebridge.services.PhoneLinkService.lastClipboardText = currentClip
                    val clipJson = JSONObject().apply {
                        put("type", MsgType.CLIPBOARD_CHANGED)
                        put("text", currentClip)
                    }
                    ConnectionManager.send(clipJson.toString())
                }

                // Also send recent photos as before (keeps existing photos feature working)
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.PhotoSync.getRecentPhotos(context))

                // Send calendar events
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.CalendarSync.getCalendarEvents(context))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
        }
    }


    // ──────────────────────────────────────────────────────────────────────────
    // Message builders — outgoing
    // ──────────────────────────────────────────────────────────────────────────

    private fun buildPong(): String =
        JSONObject().put("type", MsgType.PONG).put("ts", System.currentTimeMillis()).toString()



    /** Builds a DEVICE_STATUS JSON. */
    fun buildDeviceStatus(context: Context): String {
        val batteryIntent = context.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else -1

        val charging = (batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1) ==
                BatteryManager.BATTERY_STATUS_CHARGING

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val networkType = when {
            caps == null -> "offline"
            caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
            caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile"
            else -> "offline"
        }

        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
        val signal = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            telephonyManager.signalStrength?.level ?: 0
        } else {
            0
        }

        val deviceName = android.os.Build.MODEL

        return JSONObject()
            .put("type",        MsgType.DEVICE_STATUS)
            .put("battery",     batteryPct)
            .put("charging",    charging)
            .put("network",     networkType)
            .put("signal",      signal)
            .put("deviceName",  deviceName)
            .put("ts",          System.currentTimeMillis())
            .toString()
    }

    /** Builds a CALL_INCOMING JSON. */
    fun buildCallIncoming(number: String, name: String?): String =
        JSONObject()
            .put("type",   MsgType.CALL_INCOMING)
            .put("number", number)
            .put("name",   name ?: number)
            .put("ts",     System.currentTimeMillis())
            .toString()

    /** Builds a CALL_UPDATE JSON. */
    fun buildCallUpdate(status: String): String =
        JSONObject()
            .put("type",   MsgType.CALL_UPDATE)
            .put("status", status)
            .put("ts",     System.currentTimeMillis())
            .toString()

    // buildSmsReceived() was removed — it used the wrong field name "sender" instead of "address"
    // and was dead code (never called). SmsReceiver.kt builds the correct JSON inline.
}
