package com.phonebridge.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "ContactsSync"

object ContactsSync {

    fun getAllContacts(context: Context): String {
        val contactArray = JSONArray()

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing READ_CONTACTS permission.")
            return JSONObject().apply {
                put("type", "CONTACTS_HISTORY")
                put("contacts", contactArray)
            }.toString()
        }

        Log.i(TAG, "[SYNC] Sending contacts")

        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            null,
            null,
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
        )

        try {
            cursor?.use { c ->
                val idIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
                val nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)

                val uniqueMap = HashSet<String>() // Prevent duplicate numbers

                while (c.moveToNext()) {
                    val id = if (idIdx != -1) c.getString(idIdx) else ""
                    val name = if (nameIdx != -1) c.getString(nameIdx) ?: "" else ""
                    var number = if (numIdx != -1) c.getString(numIdx) ?: "" else ""

                     // Clean and validate number
                    number = number.replace("\\s|-|\\(|\\)".toRegex(), "")
                    if (number.isBlank() || uniqueMap.contains(number)) continue
                    uniqueMap.add(number)

                    val avatarBase64 = getContactPhotoBase64(context, id)
                    val contactObj = JSONObject().apply {
                        put("id", id)
                        put("name", name)
                        put("number", number)
                        if (avatarBase64 != null) {
                            put("avatar", "data:image/jpeg;base64,$avatarBase64")
                        }
                    }
                    contactArray.put(contactObj)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying contacts", e)
        }

        Log.i(TAG, "[SYNC] Contacts count: ${contactArray.length()}")

        return JSONObject().apply {
            put("type", "CONTACTS_HISTORY")
            put("contacts", contactArray)
        }.toString()
    }

    private fun getContactPhotoBase64(context: Context, contactId: String): String? {
        if (contactId.isBlank()) return null
        try {
            val contactUri = android.content.ContentUris.withAppendedId(
                android.provider.ContactsContract.Contacts.CONTENT_URI,
                contactId.toLong()
            )
            val photoStream = android.provider.ContactsContract.Contacts.openContactPhotoInputStream(
                context.contentResolver,
                contactUri,
                false
            )
            return photoStream?.use { stream ->
                val bitmap = android.graphics.BitmapFactory.decodeStream(stream) ?: return null
                val resized = android.graphics.Bitmap.createScaledBitmap(bitmap, 96, 96, true)
                val outStream = java.io.ByteArrayOutputStream()
                resized.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, outStream)
                android.util.Base64.encodeToString(outStream.toByteArray(), android.util.Base64.NO_WRAP)
            }
        } catch (e: Exception) {
            // ignore
        }
        return null
    }
}
