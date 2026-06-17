package com.phonebridge.ui.screens

import androidx.compose.runtime.*
import com.phonebridge.pairing.PairingManager
import com.phonebridge.pairing.QRScannerScreen
import com.phonebridge.services.PhoneLinkService

@Composable
fun AppNavGraph(
    onPermissionRequired: () -> Unit
) {
    var isPaired by remember { mutableStateOf(PairingManager.isPaired()) }

    if (!isPaired) {
        // Show QR scanner pairing screen
        QRScannerScreen(
            onPaired = {
                isPaired = true
            }
        )
    } else {
        // Show main connection status home screen
        HomeScreen(
            onUnpair = {
                PairingManager.clear()
                isPaired = false
            },
            onPermissionRequired = onPermissionRequired
        )
    }
}
