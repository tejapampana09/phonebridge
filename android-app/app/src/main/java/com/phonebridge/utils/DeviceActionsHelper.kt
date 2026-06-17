package com.phonebridge.utils

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.camera2.CameraManager
import android.location.Location
import android.location.LocationManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.util.Log

private const val TAG = "DeviceActionsHelper"

object DeviceActionsHelper {

    private var activeRingtone: Ringtone? = null
    private var originalRingVolume: Int = -1
    private var originalAlarmVolume: Int = -1

    // ──────────────────────────────────────────────────────────────────────────
    // Flashlight Toggle
    // ──────────────────────────────────────────────────────────────────────────
    fun toggleFlashlight(context: Context, turnOn: Boolean): Boolean {
        return try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = cameraManager.cameraIdList.firstOrNull()
            if (cameraId != null) {
                cameraManager.setTorchMode(cameraId, turnOn)
                Log.i(TAG, "Flashlight toggled: $turnOn")
                true
            } else {
                Log.w(TAG, "No camera flash found")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to toggle flashlight", e)
            false
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Find Phone (Ring sound at max volume)
    // ──────────────────────────────────────────────────────────────────────────
    fun ringPhone(context: Context): Boolean {
        if (activeRingtone?.isPlaying == true) return true
        return try {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            
            // Backup current volumes
            originalRingVolume = audioManager.getStreamVolume(AudioManager.STREAM_RING)
            originalAlarmVolume = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)

            // Set to max volume
            audioManager.setStreamVolume(
                AudioManager.STREAM_RING,
                audioManager.getStreamMaxVolume(AudioManager.STREAM_RING),
                0
            )
            audioManager.setStreamVolume(
                AudioManager.STREAM_ALARM,
                audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM),
                0
            )

            // Use Alarm or Ringtone default sound
            var alertUri: Uri? = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            if (alertUri == null) {
                alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            }

            if (alertUri != null) {
                val ringtone = RingtoneManager.getRingtone(context, alertUri)
                ringtone.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                ringtone.play()
                activeRingtone = ringtone
                Log.i(TAG, "Ringtone playing...")
                true
            } else {
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to ring phone", e)
            false
        }
    }

    fun stopRinging(context: Context): Boolean {
        return try {
            activeRingtone?.let {
                if (it.isPlaying) {
                    it.stop()
                }
            }
            activeRingtone = null

            // Restore original volume if backup exists
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (originalRingVolume != -1) {
                audioManager.setStreamVolume(AudioManager.STREAM_RING, originalRingVolume, 0)
                originalRingVolume = -1
            }
            if (originalAlarmVolume != -1) {
                audioManager.setStreamVolume(AudioManager.STREAM_ALARM, originalAlarmVolume, 0)
                originalAlarmVolume = -1
            }
            Log.i(TAG, "Ringtone stopped and volumes restored.")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop ringer", e)
            false
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Locate Device (GPS coordinates query)
    // ──────────────────────────────────────────────────────────────────────────
    @SuppressLint("MissingPermission")
    fun locateDevice(context: Context): Pair<Double, Double>? {
        return try {
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            
            // Check permissions
            val hasFine = androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.ACCESS_FINE_LOCATION
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            val hasCoarse = androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.ACCESS_COARSE_LOCATION
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            if (!hasFine && !hasCoarse) {
                Log.w(TAG, "Location permission not granted")
                return null
            }

            // Fallback chain: GPS -> Network -> Passive
            val providers = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            )

            var bestLocation: Location? = null
            for (provider in providers) {
                if (locationManager.isProviderEnabled(provider)) {
                    val loc = locationManager.getLastKnownLocation(provider)
                    if (loc != null) {
                        if (bestLocation == null || loc.accuracy < bestLocation.accuracy) {
                            bestLocation = loc
                        }
                    }
                }
            }

            bestLocation?.let {
                Log.i(TAG, "Located device at lat=${it.latitude}, lng=${it.longitude} (accuracy=${it.accuracy})")
                Pair(it.latitude, it.longitude)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to locate device", e)
            null
        }
    }
}
