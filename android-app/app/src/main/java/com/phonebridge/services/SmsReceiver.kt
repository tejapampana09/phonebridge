package com.phonebridge.services

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import android.telephony.SmsMessage
import android.util.Log
import com.phonebridge.connection.ConnectionManager
import org.json.JSONObject

private const val TAG = "SmsReceiver"

class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.provider.Telephony.SMS_RECEIVED") return

        try {
            val bundle = intent.extras ?: return
            val pdus = bundle.get("pdus") as Array<*>? ?: return
            val format = bundle.getString("format")

            val messages = arrayOfNulls<SmsMessage>(pdus.size)
            val smsBodyBuilder = StringBuilder()
            var sender = ""
            var timestamp = System.currentTimeMillis()

            for (i in pdus.indices) {
                val pdu = pdus[i] as ByteArray
                val msg = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    SmsMessage.createFromPdu(pdu, format)
                } else {
                    @Suppress("DEPRECATION")
                    SmsMessage.createFromPdu(pdu)
                }
                
                messages[i] = msg
                if (i == 0) {
                    sender = msg.originatingAddress ?: ""
                    timestamp = msg.timestampMillis
                }
                smsBodyBuilder.append(msg.messageBody)
            }

            val body = smsBodyBuilder.toString()
            val contactName = getContactName(context, sender)
            val id = "sms_${System.currentTimeMillis()}"

            Log.i(TAG, "SMS received from $contactName ($sender): $body")

            val isoTimestamp = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(java.util.Date(timestamp))

            val smsJson = JSONObject().apply {
                put("type", "SMS_RECEIVED")
                put("id", id)
                put("address", sender)
                put("name", contactName)
                put("body", body)
                put("timestamp", isoTimestamp)
                put("threadId", getThreadId(context, sender))
            }

            if (ConnectionManager.isConnected()) {
                ConnectionManager.send(smsJson.toString())
                Log.d(TAG, "Sent SMS_RECEIVED JSON to PC")
            } else {
                Log.d(TAG, "Offline. Could not sync SMS_RECEIVED event")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing incoming SMS broadcast", e)
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

    private fun getThreadId(context: Context, address: String): String {
        val uri = Uri.parse("content://sms/inbox")
        val cursor = try {
            context.contentResolver.query(uri, arrayOf("thread_id"), "address=?", arrayOf(address), "date DESC")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query thread id", e)
            null
        }
        return cursor?.use { if (it.moveToFirst()) it.getString(0) else address } ?: address
    }
}
