package com.phonebridge.workers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.phonebridge.pairing.PairingManager
import com.phonebridge.services.PhoneLinkService

private const val TAG = "BootReceiver"

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED || action == "android.intent.action.QUICKBOOT_POWERON") {
            Log.i(TAG, "Boot event detected: $action")
            
            PairingManager.init(context)
            if (PairingManager.isPaired()) {
                Log.i(TAG, "Device is paired. Auto-starting PhoneLinkService…")
                PhoneLinkService.start(context)
            } else {
                Log.i(TAG, "Device not paired. Skipping auto-start.")
            }
        }
    }
}
