package com.phonebridge.sync

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

private const val TAG = "InstalledAppsSync"

object InstalledAppsSync {

    fun getInstalledApps(context: Context): String {
        Log.i(TAG, "[SYNC] Sending installed apps")
        val appsArray = JSONArray()
        val pm = context.packageManager
        
        val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        try {
            val resolveInfos = pm.queryIntentActivities(mainIntent, 0)
            for (ri in resolveInfos) {
                val label = ri.loadLabel(pm).toString()
                val pkgName = ri.activityInfo.packageName
                
                // Get app icon as a small base64 JPEG to optimize transfer
                var iconBase64: String? = null
                try {
                    val iconDrawable = ri.loadIcon(pm)
                    iconBase64 = drawableToBase64(iconDrawable)
                } catch (e: Exception) {
                    // Fail silently
                }

                val appObj = JSONObject().apply {
                    put("name", label)
                    put("package", pkgName)
                    if (iconBase64 != null) {
                        put("icon", "data:image/jpeg;base64,$iconBase64")
                    }
                }
                appsArray.put(appObj)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying installed apps", e)
        }

        return JSONObject().apply {
            put("type", "APPS_HISTORY")
            put("apps", appsArray)
        }.toString()
    }

    private fun drawableToBase64(drawable: Drawable): String {
        val bitmap = when (drawable) {
            is BitmapDrawable -> drawable.bitmap
            else -> {
                val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 48
                val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 48
                val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bmp)
                drawable.setBounds(0, 0, canvas.width, canvas.height)
                drawable.draw(canvas)
                bmp
            }
        }
        val resized = Bitmap.createScaledBitmap(bitmap, 36, 36, true)
        val stream = ByteArrayOutputStream()
        resized.compress(Bitmap.CompressFormat.JPEG, 60, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }
}
