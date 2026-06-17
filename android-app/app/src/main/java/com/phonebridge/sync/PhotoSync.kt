package com.phonebridge.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

private const val TAG = "PhotoSync"

object PhotoSync {

    /**
     * Reads recent photo metadata from MediaStore and packages it into a PHOTO_METADATA JSON payload.
     */
    fun getRecentPhotos(context: Context, limit: Int = 30): String {
        val photoArray = JSONArray()

        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

        if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing storage permission. Cannot query photos.")
            return JSONObject().apply {
                put("type", "PHOTO_METADATA")
                put("photos", photoArray)
            }.toString()
        }

        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_MODIFIED
        )

        val cursor = context.contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Images.Media.DATE_MODIFIED} DESC"
        )

        try {
            cursor?.use { c ->
                val idIdx = c.getColumnIndex(MediaStore.Images.Media._ID)
                val nameIdx = c.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME)
                val sizeIdx = c.getColumnIndex(MediaStore.Images.Media.SIZE)
                val dateIdx = c.getColumnIndex(MediaStore.Images.Media.DATE_MODIFIED)

                var count = 0
                while (c.moveToNext() && count < limit) {
                    val id = if (idIdx != -1) c.getString(idIdx) else UUID.randomUUID().toString()
                    val name = if (nameIdx != -1) c.getString(nameIdx) ?: "image.jpg" else "image.jpg"
                    val size = if (sizeIdx != -1) c.getLong(sizeIdx) else 0L
                    val dateModifiedSeconds = if (dateIdx != -1) c.getLong(dateIdx) else System.currentTimeMillis() / 1000

                    val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.format(Date(dateModifiedSeconds * 1000))

                    val photoObj = JSONObject().apply {
                        put("id", id)
                        put("name", name)
                        put("size", size)
                        put("timestamp", isoDate)
                    }
                    photoArray.put(photoObj)
                    count++
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying photo metadata", e)
        }

        return JSONObject().apply {
            put("type", "PHOTO_METADATA")
            put("photos", photoArray)
        }.toString()
    }
}
