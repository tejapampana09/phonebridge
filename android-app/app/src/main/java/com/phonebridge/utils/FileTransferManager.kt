package com.phonebridge.utils

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import com.phonebridge.connection.ConnectionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream

private const val TAG = "FileTransferManager"
private const val CHUNK_SIZE = 64 * 1024 // 64 KB chunks

object FileTransferManager {

    private val activeTransfers = mutableMapOf<String, FileOutputStream>()
    private val scope = CoroutineScope(Dispatchers.IO)

    /** Sends a file from Android to PC in chunked base64 packets */
    fun sendFileToPc(context: Context, fileId: String, fileType: String) {
        scope.launch {
            try {
                var inputStream: InputStream? = null
                var fileName = "file"
                var fileSize = 0L

                if (fileType == "photo") {
                    try {
                        val imageUri = ContentUris.withAppendedId(
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                            fileId.toLong()
                        )
                        inputStream = context.contentResolver.openInputStream(imageUri)
                        
                        val cursor = context.contentResolver.query(
                            imageUri,
                            arrayOf(MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.SIZE),
                            null,
                            null,
                            null
                        )
                        cursor?.use { c ->
                            if (c.moveToFirst()) {
                                fileName = c.getString(0) ?: "$fileId.jpg"
                                fileSize = c.getLong(1)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to load MediaStore photo $fileId", e)
                    }
                } else {
                    val file = File(fileId) // fileId serves as path in this case
                    if (file.exists()) {
                        inputStream = FileInputStream(file)
                        fileName = file.name
                        fileSize = file.length()
                    }
                }

                if (inputStream == null) {
                    Log.e(TAG, "File input stream not found for ID: $fileId")
                    return@launch
                }

                inputStream.use { stream ->
                    val totalChunks = ((fileSize + CHUNK_SIZE - 1) / CHUNK_SIZE).toInt()
                    
                    // Send START payload
                    val startMsg = JSONObject().apply {
                        put("type", "FILE_TRANSFER_START")
                        put("fileId", fileId)
                        put("fileName", fileName)
                        put("fileSize", fileSize)
                        put("fileType", fileType)
                        put("totalChunks", totalChunks)
                    }
                    ConnectionManager.send(startMsg.toString())
                    
                    val buffer = ByteArray(CHUNK_SIZE)
                    var bytesRead: Int
                    var chunkIndex = 0
                    
                    while (stream.read(buffer).also { bytesRead = it } != -1) {
                        val chunkData = if (bytesRead == CHUNK_SIZE) buffer else buffer.copyOf(bytesRead)
                        val base64Data = Base64.encodeToString(chunkData, Base64.NO_WRAP)
                        
                        val chunkMsg = JSONObject().apply {
                            put("type", "FILE_TRANSFER_CHUNK")
                            put("fileId", fileId)
                            put("chunkIndex", chunkIndex)
                            put("data", base64Data)
                        }
                        ConnectionManager.send(chunkMsg.toString())
                        chunkIndex++
                        // Tiny delay to prevent socket buffering overload
                        kotlinx.coroutines.delay(15)
                    }

                    // Send END payload
                    val endMsg = JSONObject().apply {
                        put("type", "FILE_TRANSFER_END")
                        put("fileId", fileId)
                    }
                    ConnectionManager.send(endMsg.toString())
                    Log.i(TAG, "File sent successfully: $fileName ($chunkIndex chunks)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error transferring file $fileId to PC", e)
            }
        }
    }

    /** Receives a chunk from PC and writes it to disk */
    fun handleIncomingChunk(json: JSONObject) {
        val fileId = json.optString("fileId")
        val chunkIndex = json.optInt("chunkIndex")
        val dataBase64 = json.optString("data")

        try {
            val stream = activeTransfers[fileId] ?: return
            val bytes = Base64.decode(dataBase64, Base64.NO_WRAP)
            stream.write(bytes)
            stream.flush()
            Log.d(TAG, "Received chunk $chunkIndex for $fileId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write incoming chunk for $fileId", e)
        }
    }

    /** Prepares receiving file from PC */
    fun handleIncomingStart(json: JSONObject) {
        val fileId = json.optString("fileId")
        val fileName = json.optString("fileName")

        try {
            val downloadsDir = File(
                android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                "PhoneBridge"
            )
            if (!downloadsDir.exists()) downloadsDir.mkdirs()
            
            val outputFile = File(downloadsDir, fileName)
            val outputStream = FileOutputStream(outputFile)
            activeTransfers[fileId] = outputStream
            Log.i(TAG, "Prepared to receive file: ${outputFile.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start incoming transfer for $fileId", e)
        }
    }

    /** Finalizes receiving file from PC */
    fun handleIncomingEnd(json: JSONObject) {
        val fileId = json.optString("fileId")
        try {
            val stream = activeTransfers.remove(fileId)
            stream?.close()
            Log.i(TAG, "Finished receiving file: $fileId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close incoming stream for $fileId", e)
        }
    }
}
