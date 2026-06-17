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

    // PC → Phone
    const val PING                 = "PING"
    const val SEND_SMS             = "SEND_SMS"
    const val DISMISS_NOTIFICATION = "DISMISS_NOTIFICATION"
    const val REQUEST_SYNC         = "REQUEST_SYNC"
    const val CONNECT_ACK          = "CONNECT_ACK"
    const val DIAL_NUMBER          = "DIAL_NUMBER"
    const val REPLY_NOTIFICATION   = "REPLY_NOTIFICATION"
    const val ANSWER_CALL          = "ANSWER_CALL"
    const val REJECT_CALL          = "REJECT_CALL"
    const val REQUEST_FILE         = "REQUEST_FILE"
    const val FILE_TRANSFER_START  = "FILE_TRANSFER_START"
    const val FILE_TRANSFER_CHUNK  = "FILE_TRANSFER_CHUNK"
    const val FILE_TRANSFER_END    = "FILE_TRANSFER_END"
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
                    if (to.isNotBlank() && body.isNotBlank()) sendSms(to, body)
                }
                MsgType.DISMISS_NOTIFICATION -> {
                    val notifId  = json.optInt("notif_id", -1)
                    val pkg      = json.optString("package")
                    dismissNotification(context, notifId, pkg)
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
                    val pcName = json.optString("pc_name", "PC")
                    PairingManager.savePcName(pcName)
                    Log.i(TAG, "CONNECT_ACK from $pcName")
                    // Trigger sync on connect acknowledgement
                    triggerSync(context)
                    // Broadcast to update UI
                    val intent = Intent(ACTION_CONNECTED).putExtra(EXTRA_PC_NAME, pcName)
                    context.sendBroadcast(intent)
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

    private fun sendSms(to: String, body: String) {
        try {
            val smsManager = SmsManager.getDefault()
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
            val intent = Intent(Intent.ACTION_DIAL).apply {
                data = android.net.Uri.parse("tel:$number")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            Log.i(TAG, "Dial intent started for $number")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to dial number $number", e)
        }
    }

    private fun dismissNotification(context: Context, notifId: Int, pkg: String) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE)
                    as android.app.NotificationManager
            nm.cancel(pkg, notifId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to dismiss notification $notifId from $pkg", e)
        }
    }

    fun triggerSync(context: Context) {
        try {
            ConnectionManager.send(com.phonebridge.sync.CallLogSync.getLastNCalls(context))
            kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.SmsSync.getLastNThreads(context))
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.PhotoSync.getRecentPhotos(context))
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.ContactsSync.getAllContacts(context))
                delay(200)
                ConnectionManager.send(com.phonebridge.sync.InstalledAppsSync.getInstalledApps(context))
                delay(200)
                ConnectionManager.send(buildDeviceStatus(context))
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

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE)
                as android.net.ConnectivityManager
        val networkType = cm.activeNetworkInfo?.typeName ?: "none"

        val deviceName = android.os.Build.MODEL

        return JSONObject()
            .put("type",        MsgType.DEVICE_STATUS)
            .put("battery",     batteryPct)
            .put("charging",    charging)
            .put("network",     networkType)
            .put("device_name", deviceName)
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

    /** Builds an SMS_RECEIVED JSON. */
    fun buildSmsReceived(sender: String, name: String?, body: String): String =
        JSONObject()
            .put("type",   MsgType.SMS_RECEIVED)
            .put("sender", sender)
            .put("name",   name ?: sender)
            .put("body",   body)
            .put("ts",     System.currentTimeMillis())
            .toString()
}
