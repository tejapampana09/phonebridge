package com.phonebridge.utils

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.Log
import com.phonebridge.connection.ConnectionManager
import org.json.JSONObject
import java.io.ByteArrayOutputStream

private const val TAG = "MirroringManager"

object MirroringManager {

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    
    private var captureThread: HandlerThread? = null
    private var captureHandler: Handler? = null
    @Volatile private var isMirroring = false

    private const val WIDTH = 360
    private const val HEIGHT = 640
    private const val DPI = 160

    fun startMirroring(context: Context, resultCode: Int, data: Intent) {
        if (isMirroring) return
        isMirroring = true
        Log.i(TAG, "Starting screen mirroring engine...")

        try {
            val projectionManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = projectionManager.getMediaProjection(resultCode, data)

            // Setup background thread for capturing
            captureThread = HandlerThread("MirroringThread").apply { start() }
            captureHandler = Handler(captureThread!!.looper)

            // Setup ImageReader
            imageReader = ImageReader.newInstance(WIDTH, HEIGHT, PixelFormat.RGBA_8888, 2)

            virtualDisplay = mediaProjection!!.createVirtualDisplay(
                "PhoneBridgeScreen",
                WIDTH, HEIGHT, DPI,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader!!.surface,
                null, null
            )

            // Start capture loop
            captureHandler!!.post(captureRunnable)
            Log.i(TAG, "Mirroring engine started.")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start mirroring", e)
            stopMirroring()
        }
    }

    fun stopMirroring() {
        if (!isMirroring) return
        isMirroring = false
        Log.i(TAG, "Stopping screen mirroring engine...")

        captureThread?.quitSafely()
        captureThread = null
        captureHandler = null

        try {
            virtualDisplay?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release VirtualDisplay", e)
        }
        virtualDisplay = null

        try {
            imageReader?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close ImageReader", e)
        }
        imageReader = null

        try {
            mediaProjection?.stop()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop MediaProjection", e)
        }
        mediaProjection = null
        Log.i(TAG, "Mirroring engine stopped.")
    }

    private val captureRunnable = object : Runnable {
        override fun run() {
            if (!isMirroring) return

            val reader = imageReader ?: return
            var image = try {
                reader.acquireLatestImage()
            } catch (e: Exception) {
                null
            }

            if (image != null) {
                try {
                    val width = image.width
                    val height = image.height
                    val planes = image.planes
                    val buffer = planes[0].buffer
                    val pixelStride = planes[0].pixelStride
                    val rowStride = planes[0].rowStride
                    val rowPadding = rowStride - pixelStride * width

                    // Create bitmap from buffer
                    val bitmap = Bitmap.createBitmap(
                        width + rowPadding / pixelStride,
                        height,
                        Bitmap.Config.ARGB_8888
                    )
                    bitmap.copyPixelsFromBuffer(buffer)

                    // Crop padding if present
                    val croppedBitmap = if (rowPadding > 0) {
                        Bitmap.createBitmap(bitmap, 0, 0, width, height)
                    } else {
                        bitmap
                    }

                    // Compress to JPEG
                    val stream = ByteArrayOutputStream()
                    croppedBitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                    val jpegBytes = stream.toByteArray()
                    val base64Str = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)

                    // Send base64 frame
                    val frameJson = JSONObject().apply {
                        put("type", "MIRROR_FRAME")
                        put("data", base64Str)
                    }
                    ConnectionManager.send(frameJson.toString())

                    // Recycle bitmaps to prevent memory leaks
                    if (croppedBitmap != bitmap) {
                        croppedBitmap.recycle()
                    }
                    bitmap.recycle()
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing frame", e)
                } finally {
                    image.close()
                }
            }

            // Capture again after 150ms (approx 7 FPS)
            captureHandler?.postDelayed(this, 150)
        }
    }
}
