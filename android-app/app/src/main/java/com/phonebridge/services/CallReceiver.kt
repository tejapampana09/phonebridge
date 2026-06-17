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
import org.json.JSONObject

private const val TAG = "CallReceiver"

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
                    val contactName = if (num.isNotEmpty()) getContactName(context, num) else "Unknown"
                    val callJson = JSONObject().apply {
                        put("type", "CALL_INCOMING")
                        put("number", num)
                        put("name", contactName)
                    }
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(callJson.toString())
                        Log.d(TAG, "Sent CALL_INCOMING for $contactName ($num)")
                    }
                }
                TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                    // Call answered
                    val updateJson = JSONObject().apply {
                        put("type", "CALL_UPDATE")
                        put("status", "answered")
                    }
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(updateJson.toString())
                        Log.d(TAG, "Sent CALL_UPDATE status: answered")
                    }
                }
                TelephonyManager.EXTRA_STATE_IDLE -> {
                    // Call ended / declined
                    val lastCall = getLastCallLogEntry(context)
                    val updateJson = JSONObject().apply {
                        put("type", "CALL_UPDATE")
                        put("status", "ended")
                        put("number", lastCall?.number ?: "")
                        put("name", lastCall?.name ?: "")
                        put("callType", lastCall?.type ?: "")
                    }
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(updateJson.toString())
                        Log.d(TAG, "Sent CALL_UPDATE status: ended with number: ${lastCall?.number ?: ""}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing phone state change", e)
        }
    }

    /**
     * Look up the contact name for a given phone number from the Contacts ContentProvider.
     */
    private fun getContactName(context: Context, phoneNumber: String): String {
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
                    contactName = cursor.getString(columnIndex)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error looking up contact name", e)
        } finally {
            cursor?.close()
        }
        return contactName
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
                
                val name = if (cachedName.isNotEmpty()) cachedName else getContactName(context, number)
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
