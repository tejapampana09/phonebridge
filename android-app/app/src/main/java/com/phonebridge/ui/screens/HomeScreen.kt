package com.phonebridge.ui.screens

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phonebridge.connection.ConnectionManager
import com.phonebridge.connection.ConnectionType
import com.phonebridge.services.PhoneLinkService
import com.phonebridge.services.PhoneNotificationService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onUnpair: () -> Unit,
    onPermissionRequired: () -> Unit
) {
    val context = LocalContext.current
    var isConnected by remember { mutableStateOf(ConnectionManager.isConnected()) }
    var activeTransport by remember { mutableStateOf(ConnectionManager.activeConnection) }
    var notifPermissionGranted by remember { mutableStateOf(isNotificationServiceEnabled(context)) }
    val scope = rememberCoroutineScope()

    // Periodically poll connection status for UI updates
    LaunchedEffect(Unit) {
        // Start foreground connection service if not already active
        PhoneLinkService.start(context)
        
        while (true) {
            isConnected = ConnectionManager.isConnected()
            activeTransport = ConnectionManager.activeConnection
            notifPermissionGranted = isNotificationServiceEnabled(context)
            delay(1500)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("PhoneBridge Dashboard", fontSize = 18.sp, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF252525),
                    titleContentColor = Color.White
                ),
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            // Re-start services manually as a soft refresh
                            PhoneLinkService.stop(context)
                            delay(500)
                            PhoneLinkService.start(context)
                        }
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Reconnect", tint = Color.White)
                    }
                }
            )
        },
        containerColor = Color(0xFF1C1C1C)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            
            // 1. Connection Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF252525)),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    val statusDotColor = if (isConnected) Color(0xFF4CAF50) else Color(0xFFF44336)
                    val statusText = if (isConnected) "Connected to PC" else "Disconnected"
                    
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .background(statusDotColor, RoundedCornerShape(8.dp))
                    )

                    Text(
                        text = statusText,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )

                    if (isConnected && activeTransport != null) {
                        Text(
                            text = "Linked via ${if (activeTransport == ConnectionType.WIFI) "Local WiFi" else "Bluetooth SPP"}",
                            fontSize = 13.sp,
                            color = Color(0xFF7B68EE)
                        )
                    } else {
                        Text(
                            text = "Trying to establish connection...",
                            fontSize = 12.sp,
                            color = Color.Gray,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // 2. Battery Status Info
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            val batteryLevel = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF252525)),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.BatteryChargingFull,
                            contentDescription = "Battery Status",
                            tint = Color(0xFF7B68EE)
                        )
                        Column {
                            Text("Phone Battery", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Text("Current Level", color = Color.Gray, fontSize = 11.sp)
                        }
                    }
                    Text(
                        text = "$batteryLevel%",
                        color = Color.White,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // 3. Permission Checker Card
            if (!notifPermissionGranted) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF332020)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = "Warning", tint = Color(0xFFF44336))
                            Text("Notification Access Required", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                        
                        Text(
                            text = "To sync notifications to your computer, please enable notification listener permission for PhoneBridge.",
                            color = Color.LightGray,
                            fontSize = 12.sp,
                            lineHeight = 16.sp
                        )

                        Button(
                            onClick = {
                                val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                                context.startActivity(intent)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF44336)),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                            modifier = Modifier.align(Alignment.End)
                        ) {
                            Text("Enable Access", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }
                }
            }

            // 4. Status Stats Cards
            Text(
                text = "Synced Databases",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Gray,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                textAlign = TextAlign.Start
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                StatCard(
                    title = "Calls",
                    icon = Icons.Default.Call,
                    value = "50 Max",
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    title = "SMS",
                    icon = Icons.Default.Email,
                    value = "30 Threads",
                    modifier = Modifier.weight(1f)
                )
            }

            // 5. System Config Buttons
            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = onPermissionRequired,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2D2D2D)),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("App Permissions Manager", color = Color.White)
            }

            Button(
                onClick = onUnpair,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD32F2F)),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("Unpair / Reset Link", color = Color.White)
            }
        }
    }
}

@Composable
fun StatCard(
    title: String,
    icon: ImageVector,
    value: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Color(0xFF252525)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(imageVector = icon, contentDescription = title, tint = Color(0xFF7B68EE))
            Text(title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(value, color = Color.Gray, fontSize = 11.sp)
        }
    }
}

/**
 * Checks if NotificationListenerService access is enabled for this application.
 */
private fun isNotificationServiceEnabled(context: Context): Boolean {
    val cn = ComponentName(context, PhoneNotificationService::class.java)
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
    return flat != null && flat.contains(cn.flattenToString())
}
