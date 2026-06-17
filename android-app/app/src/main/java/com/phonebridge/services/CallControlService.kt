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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED) {
                    val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
                    if (telecomManager != null) {
                        telecomManager.acceptRingingCall()
                        Log.i(TAG, "[CALL] Answer success")
                        return true
                    }
                } else {
                    Log.w(TAG, "Missing ANSWER_PHONE_CALLS permission")
                }
            }

            // Fallback: HEADSETHOOK simulation
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
            Log.i(TAG, "[CALL] Answer success")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to answer call", e)
            return false
        }
    }

    fun rejectCall(context: Context): Boolean {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED) {
                    val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
                    if (telecomManager != null) {
                        val success = telecomManager.endCall()
                        if (success) {
                            Log.i(TAG, "[CALL] Reject success")
                            return true
                        }
                    }
                } else {
                    Log.w(TAG, "Missing ANSWER_PHONE_CALLS permission")
                }
            }

            // Fallback for pre-API-28
            try {
                val telephonyService = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
                val getITelephony = telephonyService.javaClass.getDeclaredMethod("getITelephony")
                getITelephony.isAccessible = true
                val iTelephony = getITelephony.invoke(telephonyService)
                val endCall = iTelephony.javaClass.getDeclaredMethod("endCall")
                endCall.invoke(iTelephony)
                Log.i(TAG, "[CALL] Reject fallback success")
                return true
            } catch (e2: Exception) {
                Log.e(TAG, "ITelephony reflection fallback failed", e2)
            }
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to reject call", e)
            return false
        }
    }
}
