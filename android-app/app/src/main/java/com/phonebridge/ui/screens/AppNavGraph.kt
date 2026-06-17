package com.phonebridge.ui.screens

import androidx.compose.runtime.*
import com.phonebridge.pairing.PairingManager
import com.phonebridge.pairing.QRScannerScreen
import com.phonebridge.services.PhoneLinkService

@Composable
fun AppNavGraph(
    onPermissionRequired: () -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var isPaired by remember { mutableStateOf(PairingManager.isPaired()) }

    LaunchedEffect(Unit) {
        while (true) {
            isPaired = PairingManager.isPaired()
            kotlinx.coroutines.delay(1500)
        }
    }

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
                com.phonebridge.connection.ConnectionManager.disconnect()
                PhoneLinkService.stop(context)
                isPaired = false
            },
            onPermissionRequired = onPermissionRequired
        )
    }
}
