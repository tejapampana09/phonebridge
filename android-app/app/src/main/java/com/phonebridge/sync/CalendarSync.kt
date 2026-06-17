package com.phonebridge.sync

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

private const val TAG = "CalendarSync"

object CalendarSync {

    /**
     * Reads calendar events and packages them into a CALENDAR_HISTORY JSON payload.
     */
    fun getCalendarEvents(context: Context, limit: Int = 100): String {
        val eventArray = JSONArray()

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing READ_CALENDAR permission. Cannot sync calendar.")
            return JSONObject().apply {
                put("type", "CALENDAR_HISTORY")
                put("events", eventArray)
            }.toString()
        }

        // Query events from 30 days ago to 90 days from now
        val now = System.currentTimeMillis()
        val beginTime = now - 30L * 24 * 60 * 60 * 1000
        val endTime = now + 90L * 24 * 60 * 60 * 1000

        val projection = arrayOf(
            CalendarContract.Events._ID,
            CalendarContract.Events.TITLE,
            CalendarContract.Events.DESCRIPTION,
            CalendarContract.Events.DTSTART,
            CalendarContract.Events.DTEND,
            CalendarContract.Events.EVENT_LOCATION,
            CalendarContract.Events.ALL_DAY
        )

        val selection = "${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DTSTART} <= ?"
        val selectionArgs = arrayOf(beginTime.toString(), endTime.toString())

        val cursor = try {
            context.contentResolver.query(
                CalendarContract.Events.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                "${CalendarContract.Events.DTSTART} ASC"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query CalendarContract", e)
            null
        }

        try {
            cursor?.use { c ->
                val idIdx = c.getColumnIndex(CalendarContract.Events._ID)
                val titleIdx = c.getColumnIndex(CalendarContract.Events.TITLE)
                val descIdx = c.getColumnIndex(CalendarContract.Events.DESCRIPTION)
                val startIdx = c.getColumnIndex(CalendarContract.Events.DTSTART)
                val endIdx = c.getColumnIndex(CalendarContract.Events.DTEND)
                val locIdx = c.getColumnIndex(CalendarContract.Events.EVENT_LOCATION)
                val allDayIdx = c.getColumnIndex(CalendarContract.Events.ALL_DAY)

                var count = 0
                while (c.moveToNext() && count < limit) {
                    val id = if (idIdx != -1) c.getString(idIdx) else ""
                    val title = if (titleIdx != -1) c.getString(titleIdx) ?: "" else ""
                    val description = if (descIdx != -1) c.getString(descIdx) ?: "" else ""
                    val dtStart = if (startIdx != -1) c.getLong(startIdx) else 0L
                    val dtEnd = if (endIdx != -1) c.getLong(endIdx) else 0L
                    val location = if (locIdx != -1) c.getString(locIdx) ?: "" else ""
                    val allDay = if (allDayIdx != -1) c.getInt(allDayIdx) == 1 else false

                    if (id.isEmpty() || title.isEmpty()) continue

                    val isoStart = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.format(Date(dtStart))

                    val isoEnd = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.format(Date(dtEnd))

                    val eventObj = JSONObject().apply {
                        put("id", id)
                        put("title", title)
                        put("description", description)
                        put("start", isoStart)
                        put("end", isoEnd)
                        put("location", location)
                        put("allDay", allDay)
                    }
                    eventArray.put(eventObj)
                    count++
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error compiling calendar history", e)
        }

        return JSONObject().apply {
            put("type", "CALENDAR_HISTORY")
            put("events", eventArray)
        }.toString()
    }

    /**
     * Creates an event in the calendar.
     */
    fun createEvent(context: Context, title: String, description: String, startMs: Long, endMs: Long, location: String): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing WRITE_CALENDAR permission.")
            return false
        }
        return try {
            val values = ContentValues().apply {
                put(CalendarContract.Events.DTSTART, startMs)
                put(CalendarContract.Events.DTEND, endMs)
                put(CalendarContract.Events.TITLE, title)
                put(CalendarContract.Events.DESCRIPTION, description)
                put(CalendarContract.Events.EVENT_LOCATION, location)
                put(CalendarContract.Events.CALENDAR_ID, 1) // default primary calendar
                put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
            }
            val uri = context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
            Log.i(TAG, "Event created: $uri")
            uri != null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create event", e)
            false
        }
    }

    /**
     * Deletes an event from the calendar.
     */
    fun deleteEvent(context: Context, eventId: String): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing WRITE_CALENDAR permission.")
            return false
        }
        return try {
            val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId.toLong())
            val rows = context.contentResolver.delete(uri, null, null)
            Log.i(TAG, "Event deleted rows count: $rows")
            rows > 0
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete event $eventId", e)
            false
        }
    }
}
