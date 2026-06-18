package com.phonebridge.services

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import android.telephony.TelephonyManager
import android.util.Log
import com.phonebridge.connection.ConnectionManager
import com.phonebridge.connection.MessageHandler
import org.json.JSONObject

private const val TAG = "CallReceiver"

internal fun getContactNameHelper(context: Context, phoneNumber: String): String {
    var contactName = "Unknown"
    var cursor: Cursor? = null
    try {
        val uri = Uri.withAppendedPath(
            ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
            Uri.encode(phoneNumber)
        )
        val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)
        cursor = context.contentResolver.query(uri, projection, null, null, null)
        if (cursor != null && cursor.moveToFirst()) {
            val columnIndex = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME)
            if (columnIndex != -1) {
                contactName = cursor.getString(columnIndex) ?: "Unknown"
            }
        }
    } catch (e: Exception) {
        Log.e("CallReceiver", "Error looking up contact name", e)
    } finally {
        cursor?.close()
    }
    return if (contactName == "Unknown") phoneNumber else contactName
}

object OutgoingCallState {
    @Volatile var lastOutgoingNumber: String = ""
}

class OutgoingCallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_NEW_OUTGOING_CALL) {
            val number = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER) ?: ""
            OutgoingCallState.lastOutgoingNumber = number
            
            if (number.isNotEmpty()) {
                val name = getContactNameHelper(context, number)
                val dialingJson = JSONObject().apply {
                    put("type", "CALL_UPDATE")
                    put("status", "dialing")
                    put("number", number as Any)
                    put("name", name as Any)
                }
                if (ConnectionManager.isConnected()) {
                    ConnectionManager.send(dialingJson.toString())
                    Log.d(TAG, "Sent CALL_UPDATE status: dialing for $name ($number)")
                }
                try {
                    PhoneLinkService.startCallAudioRouting()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start call audio routing in OutgoingCallReceiver", e)
                }
            }
        }
    }
}

class CallReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        try {
            val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
            val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

            Log.i(TAG, "Phone state changed: $state, number: $incomingNumber")

            if (state == null) return

            when (state) {
                TelephonyManager.EXTRA_STATE_RINGING -> {
                    val num = incomingNumber ?: ""
                    val contactName = if (num.isNotEmpty()) getContactNameHelper(context, num) else "Unknown"
                    val callJson = JSONObject().apply {
                        put("type", "CALL_INCOMING")
                        put("number", num as Any)
                        put("name", contactName as Any)
                    }
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(callJson.toString())
                        Log.d(TAG, "Sent CALL_INCOMING for $contactName ($num)")
                    }
                }
                TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                    // Call answered — include outgoing number if available
                    val outgoingNumber = OutgoingCallState.lastOutgoingNumber
                    val updateJson = JSONObject().apply {
                        put("type", "CALL_UPDATE")
                        put("status", "answered")
                        if (outgoingNumber.isNotBlank()) put("number", outgoingNumber as Any)
                    }
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(updateJson.toString())
                        Log.d(TAG, "Sent CALL_UPDATE status: answered")
                    }
                    try {
                        PhoneLinkService.startCallAudioRouting()
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to start call audio routing", e)
                    }
                }
                TelephonyManager.EXTRA_STATE_IDLE -> {
                    // Call ended / declined
                    val lastCall = getLastCallLogEntry(context)
                    val updateJson = JSONObject().apply {
                        put("type", "CALL_UPDATE")
                        put("status", "ended")
                        put("number", (lastCall?.number ?: "") as Any)
                        put("name", (lastCall?.name ?: "") as Any)
                        put("callType", (lastCall?.type ?: "") as Any)
                    }
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(updateJson.toString())
                        Log.d(TAG, "Sent CALL_UPDATE status: ended with number: ${lastCall?.number ?: ""}")
                    }
                    try {
                        PhoneLinkService.stopCallAudioRouting()
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to stop call audio routing", e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing phone state change", e)
        }
    }

    data class CallLogEntry(val number: String, val name: String, val type: String)

    private fun getLastCallLogEntry(context: Context): CallLogEntry? {
        if (androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALL_LOG) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return null
        }
        var entry: CallLogEntry? = null
        var cursor: Cursor? = null
        try {
            val projection = arrayOf(
                android.provider.CallLog.Calls.NUMBER,
                android.provider.CallLog.Calls.CACHED_NAME,
                android.provider.CallLog.Calls.TYPE
            )
            cursor = context.contentResolver.query(
                android.provider.CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                "date DESC"
            )
            if (cursor != null && cursor.moveToFirst()) {
                val numIdx = cursor.getColumnIndex(android.provider.CallLog.Calls.NUMBER)
                val nameIdx = cursor.getColumnIndex(android.provider.CallLog.Calls.CACHED_NAME)
                val typeIdx = cursor.getColumnIndex(android.provider.CallLog.Calls.TYPE)
                
                val number = if (numIdx != -1) cursor.getString(numIdx) ?: "" else ""
                val cachedName = if (nameIdx != -1) cursor.getString(nameIdx) ?: "" else ""
                val typeVal = if (typeIdx != -1) cursor.getInt(typeIdx) else -1
                
                val typeStr = when (typeVal) {
                    android.provider.CallLog.Calls.INCOMING_TYPE -> "incoming"
                    android.provider.CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                    android.provider.CallLog.Calls.MISSED_TYPE -> "missed"
                    android.provider.CallLog.Calls.REJECTED_TYPE -> "rejected"
                    else -> "unknown"
                }
                
                val name = if (cachedName.isNotEmpty()) cachedName else getContactNameHelper(context, number)
                entry = CallLogEntry(number, name, typeStr)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying last call log entry", e)
        } finally {
            cursor?.close()
        }
        return entry
    }
}
