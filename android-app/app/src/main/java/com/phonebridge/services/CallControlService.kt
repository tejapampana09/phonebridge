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
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (telecomManager == null) {
                Log.e(TAG, "TelecomManager not available")
                return false
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED) {
                    @Suppress("DEPRECATION")
                    telecomManager.acceptRingingCall()
                    Log.i(TAG, "Call answered via TelecomManager.acceptRingingCall()")
                    return true
                } else {
                    Log.w(TAG, "Missing ANSWER_PHONE_CALLS permission")
                    return false
                }
            } else {
                // Key event hook emulation for older versions
                val intent = android.content.Intent(android.content.Intent.ACTION_MEDIA_BUTTON).apply {
                    putExtra(android.content.Intent.EXTRA_KEY_EVENT, android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_HEADSETHOOK))
                }
                context.sendOrderedBroadcast(intent, null)
                
                val intentUp = android.content.Intent(android.content.Intent.ACTION_MEDIA_BUTTON).apply {
                    putExtra(android.content.Intent.EXTRA_KEY_EVENT, android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_HEADSETHOOK))
                }
                context.sendOrderedBroadcast(intentUp, null)
                Log.i(TAG, "Call answered via headset event simulation")
                return true
            }
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
                // Try ITelephony reflection fallback
                val telephonyClass = Class.forName(telecomManager.javaClass.name)
                val getITelephonyMethod = telephonyClass.getDeclaredMethod("getITelephony")
                getITelephonyMethod.isAccessible = true
                val iTelephony = getITelephonyMethod.invoke(telecomManager)
                val iTelephonyClass = Class.forName(iTelephony.javaClass.name)
                val endCallMethod = iTelephonyClass.getDeclaredMethod("endCall")
                endCallMethod.invoke(iTelephony)
                Log.i(TAG, "Call ended/rejected via reflection")
                return true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to reject call", e)
            return false
        }
    }
}
