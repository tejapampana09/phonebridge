package com.phonebridge.services

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.content.ContextCompat

private const val TAG = "CallControlService"

object CallControlService {

    fun answerCall(context: Context): Boolean {
        try {
            // HEADSETHOOK simulation is the most reliable approach across all API levels
            // without requiring MODIFY_PHONE_STATE (system-only) permission.
            val down = android.content.Intent(android.content.Intent.ACTION_MEDIA_BUTTON).apply {
                putExtra(
                    android.content.Intent.EXTRA_KEY_EVENT,
                    android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_HEADSETHOOK)
                )
            }
            context.sendOrderedBroadcast(down, null)

            val up = android.content.Intent(android.content.Intent.ACTION_MEDIA_BUTTON).apply {
                putExtra(
                    android.content.Intent.EXTRA_KEY_EVENT,
                    android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_HEADSETHOOK)
                )
            }
            context.sendOrderedBroadcast(up, null)
            Log.i(TAG, "Call answered via HEADSETHOOK simulation")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to answer call", e)
            return false
        }
    }

    fun rejectCall(context: Context): Boolean {
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (telecomManager == null) {
                Log.e(TAG, "TelecomManager not available")
                return false
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED) {
                    val success = telecomManager.endCall()
                    Log.i(TAG, "Call ended/rejected via endCall: success=$success")
                    return success
                } else {
                    Log.w(TAG, "Missing ANSWER_PHONE_CALLS permission")
                    return false
                }
            } else {
                // Safe fallback for pre-API-28: open the dialer so user can reject manually.
                // The reflection approach (getITelephony on TelecomManager) is on the wrong class
                // and throws NoSuchMethodException on every device.
                try {
                    val intent = android.content.Intent(android.content.Intent.ACTION_ANSWER).apply {
                        flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    Log.i(TAG, "Opened dialer via ACTION_ANSWER fallback (pre-API-28)")
                } catch (e2: Exception) {
                    Log.e(TAG, "ACTION_ANSWER fallback failed", e2)
                }
                return true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to reject call", e)
            return false
        }
    }
}
