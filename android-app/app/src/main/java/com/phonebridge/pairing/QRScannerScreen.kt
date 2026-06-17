package com.phonebridge.pairing

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.phonebridge.ui.theme.*
import org.json.JSONException
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val TAG = "QRScannerScreen"

// ──────────────────────────────────────────────────────────────────────────────
// QR Scanner Screen
// ──────────────────────────────────────────────────────────────────────────────

@Composable
fun QRScannerScreen(onPaired: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var statusText  by remember { mutableStateOf("Point camera at the QR code on your PC") }
    var isError     by remember { mutableStateOf(false) }
    var isProcessing by remember { mutableStateOf(false) }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED
        )
    }

    val cameraExecutor: ExecutorService = remember { Executors.newSingleThreadExecutor() }
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }

    // Scanner frame animation
    val infiniteTransition = rememberInfiniteTransition(label = "scan_anim")
    val scanLineY by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue  = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scan_line"
    )

    DisposableEffect(Unit) {
        onDispose {
            cameraExecutor.shutdown()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        if (hasCameraPermission) {
            // Camera preview
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()

                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(previewView.surfaceProvider)
                        }

                        val barcodeScanner = BarcodeScanning.getClient()
                        val imageAnalysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()

                        imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                            if (!isProcessing) {
                                @androidx.camera.core.ExperimentalGetImage
                                val mediaImage = imageProxy.image
                                if (mediaImage != null) {
                                    val image = InputImage.fromMediaImage(
                                        mediaImage,
                                        imageProxy.imageInfo.rotationDegrees
                                    )
                                    barcodeScanner.process(image)
                                        .addOnSuccessListener { barcodes ->
                                            barcodes.firstOrNull {
                                                it.format == Barcode.FORMAT_QR_CODE
                                            }?.rawValue?.let { qrValue ->
                                                if (!isProcessing) {
                                                    isProcessing = true
                                                    processQrCode(
                                                        qrValue,
                                                        context,
                                                        onSuccess = {
                                                            isProcessing = false
                                                            onPaired()
                                                        },
                                                        onError = { msg ->
                                                            isProcessing = false
                                                            isError = true
                                                            statusText = msg
                                                        }
                                                    )
                                                }
                                            }
                                        }
                                        .addOnFailureListener { e ->
                                            Log.e(TAG, "Barcode scan failed", e)
                                        }
                                        .addOnCompleteListener {
                                            imageProxy.close()
                                        }
                                } else {
                                    imageProxy.close()
                                }
                            } else {
                                imageProxy.close()
                            }
                        }

                        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                        try {
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                cameraSelector,
                                preview,
                                imageAnalysis
                            )
                        } catch (exc: Exception) {
                            Log.e(TAG, "Camera binding failed", exc)
                        }
                    }, ContextCompat.getMainExecutor(ctx))
                    previewView
                },
                modifier = Modifier.fillMaxSize()
            )

            // Semi-transparent overlay with scanning frame
            ScannerOverlay(
                scanLineY = scanLineY,
                modifier  = Modifier.fillMaxSize()
            )
        } else {
            // No camera permission
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text  = "Camera permission is required to scan the QR code.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = OnSurface,
                    textAlign = TextAlign.Center,
                    modifier  = Modifier.padding(horizontal = 32.dp)
                )
            }
        }

        // Bottom status card
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 48.dp, start = 24.dp, end = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (isProcessing) {
                CircularProgressIndicator(
                    color    = PrimaryPurple,
                    modifier = Modifier
                        .size(32.dp)
                        .padding(bottom = 12.dp)
                )
            }

            Surface(
                shape = RoundedCornerShape(16.dp),
                color = SurfaceDark.copy(alpha = 0.90f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text      = statusText,
                    style     = MaterialTheme.typography.bodyMedium,
                    color     = if (isError) ErrorRed else OnSurface,
                    textAlign = TextAlign.Center,
                    modifier  = Modifier.padding(16.dp)
                )
            }

            if (isError) {
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = {
                    isError      = false
                    isProcessing = false
                    statusText   = "Point camera at the QR code on your PC"
                }) {
                    Text("Try Again", color = PrimaryPurple)
                }
            }
        }

        // Title bar
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text  = "PhoneBridge",
                style = MaterialTheme.typography.headlineMedium,
                color = PrimaryPurple
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text  = "Scan QR code from your PC",
                style = MaterialTheme.typography.bodyMedium,
                color = OnSurfaceVariant
            )
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Scanner overlay composable
// ──────────────────────────────────────────────────────────────────────────────

@Composable
private fun ScannerOverlay(scanLineY: Float, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val frameSize   = size.minDimension * 0.65f
        val frameLeft   = (size.width  - frameSize) / 2f
        val frameTop    = (size.height - frameSize) / 2f
        val cornerLen   = frameSize * 0.12f
        val cornerStroke= 6.dp.toPx()
        val lineY       = frameTop + frameSize * scanLineY

        // Dark backdrop (with hole effect via blending workaround)
        drawRect(color = Color(0x99000000))

        // Corner brackets — blue/purple
        val bracketColor = Color(0xFF7B68EE)
        // Top-left
        drawLine(bracketColor, Offset(frameLeft, frameTop + cornerLen), Offset(frameLeft, frameTop), strokeWidth = cornerStroke, cap = StrokeCap.Round)
        drawLine(bracketColor, Offset(frameLeft, frameTop), Offset(frameLeft + cornerLen, frameTop), strokeWidth = cornerStroke, cap = StrokeCap.Round)
        // Top-right
        drawLine(bracketColor, Offset(frameLeft + frameSize - cornerLen, frameTop), Offset(frameLeft + frameSize, frameTop), strokeWidth = cornerStroke, cap = StrokeCap.Round)
        drawLine(bracketColor, Offset(frameLeft + frameSize, frameTop), Offset(frameLeft + frameSize, frameTop + cornerLen), strokeWidth = cornerStroke, cap = StrokeCap.Round)
        // Bottom-left
        drawLine(bracketColor, Offset(frameLeft, frameTop + frameSize - cornerLen), Offset(frameLeft, frameTop + frameSize), strokeWidth = cornerStroke, cap = StrokeCap.Round)
        drawLine(bracketColor, Offset(frameLeft, frameTop + frameSize), Offset(frameLeft + cornerLen, frameTop + frameSize), strokeWidth = cornerStroke, cap = StrokeCap.Round)
        // Bottom-right
        drawLine(bracketColor, Offset(frameLeft + frameSize - cornerLen, frameTop + frameSize), Offset(frameLeft + frameSize, frameTop + frameSize), strokeWidth = cornerStroke, cap = StrokeCap.Round)
        drawLine(bracketColor, Offset(frameLeft + frameSize, frameTop + frameSize - cornerLen), Offset(frameLeft + frameSize, frameTop + frameSize), strokeWidth = cornerStroke, cap = StrokeCap.Round)

        // Animated scan line inside frame
        drawLine(
            color      = Color(0xCC7B68EE),
            start      = Offset(frameLeft + 8.dp.toPx(), lineY),
            end        = Offset(frameLeft + frameSize - 8.dp.toPx(), lineY),
            strokeWidth= 2.dp.toPx()
        )
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// QR parsing
// ──────────────────────────────────────────────────────────────────────────────

private fun processQrCode(
    raw: String,
    context: android.content.Context,
    onSuccess: () -> Unit,
    onError: (String) -> Unit
) {
    try {
        val json         = JSONObject(raw)
        val type         = json.optString("type")
        val wsUrl        = json.optString("ws")
        val btDeviceName = json.optString("bt")

        if (type != "phonebridge") {
            onError("Invalid QR code. Make sure you scan the PhoneBridge QR from your PC.")
            return
        }
        if (wsUrl.isBlank()) {
            onError("QR code missing WebSocket URL.")
            return
        }

        PairingManager.init(context)
        PairingManager.save(wsUrl, btDeviceName)
        Log.i(TAG, "Paired — ws=$wsUrl bt=$btDeviceName")
        onSuccess()
    } catch (e: JSONException) {
        Log.e(TAG, "QR JSON parse error: $raw", e)
        onError("Invalid QR code format. Please try again.")
    }
}
