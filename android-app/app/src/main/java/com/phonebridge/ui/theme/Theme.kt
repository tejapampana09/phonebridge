package com.phonebridge.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ──────────────────────────────────────────────
// Color palette
// ──────────────────────────────────────────────
val PrimaryPurple   = Color(0xFF7B68EE)
val PrimaryVariant  = Color(0xFF5A4FD4)
val BackgroundDark  = Color(0xFF1C1C1C)
val SurfaceDark     = Color(0xFF252525)
val SurfaceVariant  = Color(0xFF2D2D2D)
val OnPrimary       = Color(0xFFFFFFFF)
val OnBackground    = Color(0xFFE8E8E8)
val OnSurface       = Color(0xFFD0D0D0)
val OnSurfaceVariant= Color(0xFF9E9E9E)
val ErrorRed        = Color(0xFFF44336)
val SuccessGreen    = Color(0xFF4CAF50)
val WarningAmber    = Color(0xFFFF9800)
val SecondaryColor  = Color(0xFF3D3D8C)

// ──────────────────────────────────────────────
// Dark color scheme
// ──────────────────────────────────────────────
private val PhoneBridgeDarkColorScheme = darkColorScheme(
    primary             = PrimaryPurple,
    onPrimary           = OnPrimary,
    primaryContainer    = PrimaryVariant,
    onPrimaryContainer  = Color(0xFFD8D0FF),
    secondary           = SecondaryColor,
    onSecondary         = OnPrimary,
    secondaryContainer  = Color(0xFF2A2A6E),
    onSecondaryContainer= Color(0xFFCCCCFF),
    background          = BackgroundDark,
    onBackground        = OnBackground,
    surface             = SurfaceDark,
    onSurface           = OnSurface,
    surfaceVariant      = SurfaceVariant,
    onSurfaceVariant    = OnSurfaceVariant,
    error               = ErrorRed,
    onError             = OnPrimary,
    errorContainer      = Color(0xFF93000A),
    onErrorContainer    = Color(0xFFFFDAD6),
    outline             = Color(0xFF444444),
    outlineVariant      = Color(0xFF333333),
    scrim               = Color(0x99000000),
    inverseSurface      = Color(0xFFE6E1E5),
    inverseOnSurface    = Color(0xFF313033),
    inversePrimary      = PrimaryVariant,
)

// ──────────────────────────────────────────────
// Theme composable
// ──────────────────────────────────────────────
@Composable
fun PhoneBridgeTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = PhoneBridgeDarkColorScheme,
        typography  = PhoneBridgeTypography,
        content     = content
    )
}
