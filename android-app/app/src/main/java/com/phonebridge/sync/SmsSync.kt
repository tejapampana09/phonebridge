package com.phonebridge.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

private const val TAG = "SmsSync"

object SmsSync {

    /**
     * Reads the last N threads and their messages, and compiles SMS_HISTORY JSON.
     */
    fun getLastNThreads(context: Context, limit: Int = 30): String {
        val threadsArray = JSONArray()

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing READ_SMS permission. Cannot sync SMS history.")
            return JSONObject().apply {
                put("type", "SMS_HISTORY")
                put("threads", threadsArray)
            }.toString()
        }

        val smsUri = Uri.parse("content://sms")
        val projection = arrayOf(
            "_id",
            "thread_id",
            "address",
            "body",
            "date",
            "type" // 1 = Inbox, 2 = Sent
        )

        // Query last 150 messages, then group them by thread
        val cursor = context.contentResolver.query(
            smsUri,
            projection,
            null,
            null,
            "date DESC"
        )

        val threadsMap = LinkedHashMap<String, MutableList<JSONObject>>()
        val threadMetaMap = HashMap<String, Pair<String, Long>>() // thread_id -> Pair(last_message_body, timestamp)

        try {
            cursor?.use { c ->
                val idIdx = c.getColumnIndex("_id")
                val threadIdIdx = c.getColumnIndex("thread_id")
                val addressIdx = c.getColumnIndex("address")
                val bodyIdx = c.getColumnIndex("body")
                val dateIdx = c.getColumnIndex("date")
                val typeIdx = c.getColumnIndex("type")

                var count = 0
                while (c.moveToNext() && count < 150) {
                    val id = if (idIdx != -1) c.getString(idIdx) else UUID.randomUUID().toString()
                    val threadId = if (threadIdIdx != -1) c.getString(threadIdIdx) ?: "" else ""
                    val address = if (addressIdx != -1) c.getString(addressIdx) ?: "" else ""
                    val body = if (bodyIdx != -1) c.getString(bodyIdx) ?: "" else ""
                    val dateMs = if (dateIdx != -1) c.getLong(dateIdx) else System.currentTimeMillis()
                    val type = if (typeIdx != -1) c.getInt(typeIdx) else 1

                    if (threadId.isEmpty() || address.isEmpty()) continue

                    val direction = if (type == 1) "in" else "out"
                    val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.format(Date(dateMs))

                    val contactName = getContactName(context, address)

                    val msgObj = JSONObject().apply {
                        put("id", id)
                        put("threadId", threadId)
                        put("address", address)
                        put("name", contactName)
                        put("body", body)
                        put("timestamp", isoDate)
                        put("direction", direction)
                    }

                    if (!threadsMap.containsKey(threadId)) {
                        threadsMap[threadId] = ArrayList()
                        threadMetaMap[threadId] = Pair(body, dateMs)
                    }
                    threadsMap[threadId]?.add(msgObj)
                    count++
                }
            }

            // Convert grouped threads into JSON
            var count = 0
            for ((threadId, msgs) in threadsMap) {
                if (count >= limit) break
                val meta = threadMetaMap[threadId] ?: continue
                val lastMsg = meta.first
                val timestampMs = meta.second

                val firstMsg = msgs.firstOrNull() ?: continue
                val address = firstMsg.getString("address")
                val name = firstMsg.getString("name")

                val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date(timestampMs))

                // Sort messages within thread chronologically (oldest first)
                msgs.sortBy { Date(SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.parse(it.getString("timestamp"))!!.time) }

                val threadObj = JSONObject().apply {
                    put("id", threadId)
                    put("address", address)
                    put("name", name)
                    put("lastMessage", lastMsg)
                    put("timestamp", isoDate)
                    put("messages", JSONArray(msgs))
                }
                threadsArray.put(threadObj)
                count++
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error compiling SMS history", e)
        }

        return JSONObject().apply {
            put("type", "SMS_HISTORY")
            put("threads", threadsArray)
        }.toString()
    }

    /**
     * Look up the contact name for a given phone number from the Contacts ContentProvider.
     */
    private fun getContactName(context: Context, phoneNumber: String): String {
        var contactName = phoneNumber
        if (phoneNumber.isEmpty()) return "Unknown"
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
            // Silently fall back to phone number
        } finally {
            cursor?.close()
        }
        return contactName
    }
}
