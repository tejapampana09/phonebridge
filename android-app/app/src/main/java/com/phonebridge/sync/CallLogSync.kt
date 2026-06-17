package com.phonebridge.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

private const val TAG = "CallLogSync"

object CallLogSync {

    /**
     * Reads the last N call log entries and converts them into a CALL_HISTORY JSON message.
     */
    fun getLastNCalls(context: Context, limit: Int = 50): String {
        val callArray = JSONArray()

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing READ_CALL_LOG permission. Cannot query call log.")
            return JSONObject().apply {
                put("type", "CALL_HISTORY")
                put("calls", callArray)
            }.toString()
        }

        val cursor = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(
                CallLog.Calls._ID,
                CallLog.Calls.NUMBER,
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.TYPE,
                CallLog.Calls.DURATION,
                CallLog.Calls.DATE
            ),
            null,
            null,
            "${CallLog.Calls.DATE} DESC"
        )

        try {
            cursor?.use { c ->
                val idIdx = c.getColumnIndex(CallLog.Calls._ID)
                val numIdx = c.getColumnIndex(CallLog.Calls.NUMBER)
                val nameIdx = c.getColumnIndex(CallLog.Calls.CACHED_NAME)
                val typeIdx = c.getColumnIndex(CallLog.Calls.TYPE)
                val durIdx = c.getColumnIndex(CallLog.Calls.DURATION)
                val dateIdx = c.getColumnIndex(CallLog.Calls.DATE)

                var count = 0
                while (c.moveToNext() && count < limit) {
                    val id = if (idIdx != -1) c.getString(idIdx) else UUID.randomUUID().toString()
                    val number = if (numIdx != -1) c.getString(numIdx) ?: "" else ""
                    val name = if (nameIdx != -1) c.getString(nameIdx) ?: "Unknown" else "Unknown"
                    val typeConstant = if (typeIdx != -1) c.getInt(typeIdx) else CallLog.Calls.INCOMING_TYPE
                    val duration = if (durIdx != -1) c.getLong(durIdx) else 0L
                    val dateMs = if (dateIdx != -1) c.getLong(dateIdx) else System.currentTimeMillis()

                    val typeStr = when (typeConstant) {
                        CallLog.Calls.INCOMING_TYPE -> "incoming"
                        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                        CallLog.Calls.MISSED_TYPE -> "missed"
                        CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "declined"
                        else -> "incoming"
                    }

                    val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.format(Date(dateMs))

                    val callObj = JSONObject().apply {
                        put("id", id)
                        put("number", number)
                        put("name", if (name == "Unknown" || name.isEmpty()) number else name)
                        put("callType", typeStr)
                        put("duration", duration)
                        put("timestamp", isoDate)
                    }
                    callArray.put(callObj)
                    count++
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying calls history", e)
        }

        return JSONObject().apply {
            put("type", "CALL_HISTORY")
            put("calls", callArray)
        }.toString()
    }
}
