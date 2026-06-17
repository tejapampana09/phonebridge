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
            "type", // 1 = Inbox, 2 = Sent
            "read"  // 0 = unread, 1 = read
        )

        // Query last 150 messages, then group them by thread
        val cursor = try {
            context.contentResolver.query(
                smsUri,
                projection,
                null,
                null,
                "date DESC"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query SMS", e)
            null
        }

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
                val readIdx = c.getColumnIndex("read")

                var count = 0
                while (c.moveToNext() && count < 150) {
                    val id = if (idIdx != -1) c.getString(idIdx) else UUID.randomUUID().toString()
                    val threadId = if (threadIdIdx != -1) c.getString(threadIdIdx) ?: "" else ""
                    val address = if (addressIdx != -1) c.getString(addressIdx) ?: "" else ""
                    val body = if (bodyIdx != -1) c.getString(bodyIdx) ?: "" else ""
                    val dateMs = if (dateIdx != -1) c.getLong(dateIdx) else System.currentTimeMillis()
                    val type = if (typeIdx != -1) c.getInt(typeIdx) else 1
                    val read = if (readIdx != -1) c.getInt(readIdx) else 1

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
                        put("read", read)
                    }

                    if (!threadsMap.containsKey(threadId)) {
                        threadsMap[threadId] = ArrayList()
                        threadMetaMap[threadId] = Pair(body, dateMs)
                    }
                    threadsMap[threadId]?.add(msgObj)
                    count++
                }
            }

            // After reading SMS, also query MMS
            val mmsUri = Uri.parse("content://mms")
            val mmsProjection = arrayOf("_id", "thread_id", "date", "msg_box", "read") // msg_box: 1 = Inbox, 2 = Sent
            val mmsCursor = try {
                context.contentResolver.query(
                    mmsUri,
                    mmsProjection,
                    null,
                    null,
                    "date DESC"
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to query MMS", e)
                null
            }

            mmsCursor?.use { c ->
                val idIdx = c.getColumnIndex("_id")
                val threadIdIdx = c.getColumnIndex("thread_id")
                val dateIdx = c.getColumnIndex("date")
                val msgBoxIdx = c.getColumnIndex("msg_box")
                val readIdx = c.getColumnIndex("read")

                var count = 0
                while (c.moveToNext() && count < 50) {
                    val id = if (idIdx != -1) c.getString(idIdx) else UUID.randomUUID().toString()
                    val threadId = if (threadIdIdx != -1) c.getString(threadIdIdx) ?: "" else ""
                    val dateSec = if (dateIdx != -1) c.getLong(dateIdx) else (System.currentTimeMillis() / 1000)
                    val dateMs = dateSec * 1000
                    val msgBox = if (msgBoxIdx != -1) c.getInt(msgBoxIdx) else 1
                    val read = if (readIdx != -1) c.getInt(readIdx) else 1

                    if (threadId.isEmpty()) continue

                    val body = getMmsBody(context, id)
                    val address = getMmsAddress(context, id)

                    if (address.isEmpty() && body.isEmpty()) continue

                    val direction = if (msgBox == 1) "in" else "out"
                    val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.format(Date(dateMs))

                    val contactName = getContactName(context, address)

                    val msgObj = JSONObject().apply {
                        put("id", "mms_$id")
                        put("threadId", threadId)
                        put("address", address)
                        put("name", contactName)
                        put("body", body)
                        put("timestamp", isoDate)
                        put("direction", direction)
                        put("read", read)
                    }

                    if (!threadsMap.containsKey(threadId)) {
                        threadsMap[threadId] = ArrayList()
                        threadMetaMap[threadId] = Pair(body, dateMs)
                    } else {
                        val currentMeta = threadMetaMap[threadId]
                        if (currentMeta == null || dateMs > currentMeta.second) {
                            threadMetaMap[threadId] = Pair(body, dateMs)
                        }
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
                val msgWithAddress = msgs.firstOrNull { it.getString("address").isNotEmpty() } ?: firstMsg
                val address = msgWithAddress.getString("address")
                val name = msgWithAddress.getString("name")

                val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date(timestampMs))

                // Sort messages within thread chronologically (oldest first)
                msgs.sortBy { Date(SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.parse(it.getString("timestamp"))!!.time) }

                val isUnread = msgs.any { it.optString("direction") == "in" && it.optInt("read", 1) == 0 }

                val threadObj = JSONObject().apply {
                    put("id", threadId)
                    put("address", address)
                    put("name", name)
                    put("lastMessage", lastMsg)
                    put("unread", isUnread)
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

    private fun getMmsBody(context: Context, mmsId: String): String {
        val partUri = Uri.parse("content://mms/$mmsId/part")
        val projection = arrayOf("_id", "ct", "text")
        var body = ""
        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(partUri, projection, null, null, null)
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    val ctIdx = cursor.getColumnIndex("ct")
                    if (ctIdx != -1) {
                        val ct = cursor.getString(ctIdx)
                        if (ct == "text/plain") {
                            val textIdx = cursor.getColumnIndex("text")
                            if (textIdx != -1) {
                                val text = cursor.getString(textIdx)
                                if (text != null) {
                                    body = text
                                    break
                                }
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying MMS part", e)
        } finally {
            cursor?.close()
        }
        return body
    }

    private fun getMmsAddress(context: Context, mmsId: String): String {
        val addrUri = Uri.parse("content://mms/$mmsId/addr")
        val projection = arrayOf("address", "type")
        var address = ""
        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(addrUri, projection, null, null, null)
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    val typeIdx = cursor.getColumnIndex("type")
                    if (typeIdx != -1) {
                        val type = cursor.getInt(typeIdx)
                        val addrIdx = cursor.getColumnIndex("address")
                        if (addrIdx != -1) {
                            val addr = cursor.getString(addrIdx)
                            if (addr != null && addr != "insert-address-token") {
                                address = addr
                                if (type == 137) {
                                    break // FROM address
                                }
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying MMS address", e)
        } finally {
            cursor?.close()
        }
        return address
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
