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

    data class MediaItem(
        val id: String,
        val name: String,
        val size: Long,
        val dateModified: Long,
        val isVideo: Boolean,
        val duration: Long = 0L
    )

    /**
     * Reads recent photo and video metadata from MediaStore and packages it into a PHOTO_METADATA JSON payload.
     */
    fun getRecentPhotos(context: Context, limit: Int = 30): String {
        val photoArray = JSONArray()

        val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val imagePerm = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED
            val videoPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED
            imagePerm && videoPerm
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }

        if (!hasPermission) {
            Log.w(TAG, "Missing storage permissions for media query.")
            return JSONObject().apply {
                put("type", "PHOTO_METADATA")
                put("photos", photoArray)
            }.toString()
        }

        val items = ArrayList<MediaItem>()

        // 1. Query Images
        val imgProjection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_MODIFIED
        )
        val imgCursor = try {
            context.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                imgProjection,
                null,
                null,
                "${MediaStore.Images.Media.DATE_MODIFIED} DESC LIMIT $limit"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query images", e)
            null
        }

        imgCursor?.use { c ->
            val idIdx = c.getColumnIndex(MediaStore.Images.Media._ID)
            val nameIdx = c.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME)
            val sizeIdx = c.getColumnIndex(MediaStore.Images.Media.SIZE)
            val dateIdx = c.getColumnIndex(MediaStore.Images.Media.DATE_MODIFIED)

            while (c.moveToNext()) {
                val id = if (idIdx != -1) c.getString(idIdx) else ""
                val name = if (nameIdx != -1) c.getString(nameIdx) ?: "image.jpg" else "image.jpg"
                val size = if (sizeIdx != -1) c.getLong(sizeIdx) else 0L
                val dateModified = if (dateIdx != -1) c.getLong(dateIdx) else 0L
                if (id.isNotEmpty()) {
                    items.add(MediaItem(id, name, size, dateModified, false))
                }
            }
        }

        // 2. Query Videos
        val vidProjection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_MODIFIED,
            MediaStore.Video.Media.DURATION
        )
        val vidCursor = try {
            context.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                vidProjection,
                null,
                null,
                "${MediaStore.Video.Media.DATE_MODIFIED} DESC LIMIT $limit"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query videos", e)
            null
        }

        vidCursor?.use { c ->
            val idIdx = c.getColumnIndex(MediaStore.Video.Media._ID)
            val nameIdx = c.getColumnIndex(MediaStore.Video.Media.DISPLAY_NAME)
            val sizeIdx = c.getColumnIndex(MediaStore.Video.Media.SIZE)
            val dateIdx = c.getColumnIndex(MediaStore.Video.Media.DATE_MODIFIED)
            val durIdx = c.getColumnIndex(MediaStore.Video.Media.DURATION)

            while (c.moveToNext()) {
                val id = if (idIdx != -1) c.getString(idIdx) else ""
                val name = if (nameIdx != -1) c.getString(nameIdx) ?: "video.mp4" else "video.mp4"
                val size = if (sizeIdx != -1) c.getLong(sizeIdx) else 0L
                val dateModified = if (dateIdx != -1) c.getLong(dateIdx) else 0L
                val duration = if (durIdx != -1) c.getLong(durIdx) else 0L
                if (id.isNotEmpty()) {
                    items.add(MediaItem(id, name, size, dateModified, true, duration))
                }
            }
        }

        // Sort combined list by dateModified DESC, take top limit
        items.sortByDescending { it.dateModified }
        val sublist = items.take(limit)

        for (item in sublist) {
            val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date(item.dateModified * 1000))

            val mediaObj = JSONObject().apply {
                put("id", item.id)
                put("name", item.name)
                put("size", item.size)
                put("timestamp", isoDate)
                put("isVideo", item.isVideo)
                if (item.isVideo) {
                    put("duration", item.duration)
                }

                val thumb = getThumbnailBase64(context, item.id.toLong(), item.isVideo)
                if (thumb != null) {
                    put("thumbnail", thumb)
                }
            }
            photoArray.put(mediaObj)
        }

        return JSONObject().apply {
            put("type", "PHOTO_METADATA")
            put("photos", photoArray)
        }.toString()
    }

    private fun getThumbnailBase64(context: Context, id: Long, isVideo: Boolean): String? {
        return try {
            val thumbnail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val uri = if (isVideo) {
                    android.content.ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                } else {
                    android.content.ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                }
                context.contentResolver.loadThumbnail(uri, android.util.Size(120, 120), null)
            } else {
                @Suppress("DEPRECATION")
                if (isVideo) {
                    MediaStore.Video.Thumbnails.getThumbnail(
                        context.contentResolver, id,
                        MediaStore.Video.Thumbnails.MINI_KIND, null
                    )
                } else {
                    MediaStore.Images.Thumbnails.getThumbnail(
                        context.contentResolver, id,
                        MediaStore.Images.Thumbnails.MINI_KIND, null
                    )
                }
            }
            if (thumbnail != null) {
                val stream = java.io.ByteArrayOutputStream()
                thumbnail.compress(android.graphics.Bitmap.CompressFormat.JPEG, 50, stream)
                val thumbBase64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                "data:image/jpeg;base64,$thumbBase64"
            } else {
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load thumbnail for id=$id, isVideo=$isVideo", e)
            null
        }
    }
}
