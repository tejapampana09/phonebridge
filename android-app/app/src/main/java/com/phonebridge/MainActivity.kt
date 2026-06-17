package com.phonebridge

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.phonebridge.ui.screens.AppNavGraph
import com.phonebridge.ui.theme.PhoneBridgeTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val TAG = "MainActivity"

class MainActivity : ComponentActivity() {

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        var anyGranted = false
        permissions.forEach { (permission, isGranted) ->
            Log.d(TAG, "Permission response: $permission = $isGranted")
            if (isGranted) {
                anyGranted = true
            }
        }
        
        if (anyGranted && com.phonebridge.connection.ConnectionManager.isConnected()) {
            Log.i(TAG, "Permissions updated while connected. Triggering sync.")
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    com.phonebridge.connection.ConnectionManager.send(
                        com.phonebridge.connection.MessageHandler.buildDeviceStatus(applicationContext)
                    )
                    delay(250)
                    com.phonebridge.connection.ConnectionManager.send(
                        com.phonebridge.sync.CallLogSync.getLastNCalls(applicationContext)
                    )
                    delay(250)
                    com.phonebridge.connection.ConnectionManager.send(
                        com.phonebridge.sync.SmsSync.getLastNThreads(applicationContext)
                    )
                    delay(250)
                    com.phonebridge.connection.ConnectionManager.send(
                        com.phonebridge.sync.PhotoSync.getRecentPhotos(applicationContext)
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Post-permission sync failed", e)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i(TAG, "MainActivity created")

        // Initialize pairing preferences manager before Compose draws screens
        com.phonebridge.pairing.PairingManager.init(applicationContext)

        // Request all runtime permissions on startup
        requestAppPermissions()

        setContent {
            PhoneBridgeTheme {
                AppNavGraph(
                    onPermissionRequired = {
                        requestAppPermissions()
                    }
                )
            }
        }
    }

    private fun requestAppPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.CAMERA
        )

        // API 33+ Permissions
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
        } else {
            // API 32 and below
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

        // API 31+ Bluetooth Permissions
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            permissions.add(Manifest.permission.BLUETOOTH_SCAN)
        }

        val toRequest = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (toRequest.isNotEmpty()) {
            Log.i(TAG, "Requesting permissions: ${toRequest.joinToString()}")
            permissionLauncher.launch(toRequest.toTypedArray())
        } else {
            Log.i(TAG, "All permissions are already granted.")
        }
    }
}
