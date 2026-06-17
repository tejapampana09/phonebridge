package com.phonebridge.utils

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.util.Log

class CallAudioRoutingManager(private val context: Context) {
    private val TAG = "CallAudioRouting"
    private var audioManager: AudioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var bluetoothHeadset: BluetoothHeadset? = null
    private var isScoRegistered = false

    private val bluetoothProfileListener = object : BluetoothProfile.ServiceListener {
        override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
            if (profile == BluetoothProfile.HEADSET) {
                Log.d(TAG, "Bluetooth Headset proxy connected")
                bluetoothHeadset = proxy as BluetoothHeadset
            }
        }

        override fun onServiceDisconnected(profile: Int) {
            if (profile == BluetoothProfile.HEADSET) {
                Log.d(TAG, "Bluetooth Headset proxy disconnected")
                bluetoothHeadset = null
            }
        }
    }

    private val scoReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
            Log.d(TAG, "SCO audio state changed: $state")
            when (state) {
                AudioManager.SCO_AUDIO_STATE_CONNECTED -> {
                    Log.i(TAG, "SCO channel connected successfully")
                }
                AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> {
                    Log.i(TAG, "SCO channel disconnected")
                }
                AudioManager.SCO_AUDIO_STATE_CONNECTING -> {
                    Log.d(TAG, "SCO channel connecting...")
                }
            }
        }
    }

    init {
        try {
            val adapter = BluetoothAdapter.getDefaultAdapter()
            adapter?.getProfileProxy(context, bluetoothProfileListener, BluetoothProfile.HEADSET)

            val filter = IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
            context.registerReceiver(scoReceiver, filter)
            isScoRegistered = true
        } catch (e: Exception) {
            Log.e(TAG, "Initialization failed", e)
        }
    }

    fun startScoRouting() {
        try {
            Log.i(TAG, "Requesting SCO audio routing")
            audioManager.mode = AudioManager.MODE_IN_CALL
            audioManager.startBluetoothSco()
            audioManager.isBluetoothScoOn = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start SCO routing", e)
        }
    }

    fun stopScoRouting() {
        try {
            Log.i(TAG, "Stopping SCO audio routing")
            audioManager.isBluetoothScoOn = false
            audioManager.stopBluetoothSco()
            audioManager.mode = AudioManager.MODE_NORMAL
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop SCO routing", e)
        }
    }

    fun release() {
        try {
            if (isScoRegistered) {
                context.unregisterReceiver(scoReceiver)
                isScoRegistered = false
            }
            val adapter = BluetoothAdapter.getDefaultAdapter()
            bluetoothHeadset?.let {
                adapter?.closeProfileProxy(BluetoothProfile.HEADSET, it)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Release failed", e)
        }
    }
}
