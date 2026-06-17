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
                    if (incomingNumber != null) {
                        val contactName = getContactName(context, incomingNumber)
                        val callJson = JSONObject().apply {
                            put("type", "CALL_INCOMING")
                            put("number", incomingNumber)
                            put("name", contactName)
                        }
                        if (ConnectionManager.isConnected()) {
                            ConnectionManager.send(callJson.toString())
                            Log.d(TAG, "Sent CALL_INCOMING for $contactName ($incomingNumber)")
                        }
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
                    val updateJson = JSONObject().apply {
                        put("type", "CALL_UPDATE")
                        put("status", "ended")
                    }
                    if (ConnectionManager.isConnected()) {
                        ConnectionManager.send(updateJson.toString())
                        Log.d(TAG, "Sent CALL_UPDATE status: ended")
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
}
