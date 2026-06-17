package com.phonebridge.connection

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import com.phonebridge.services.PhoneLinkService

private const val TAG = "WebSocketClient"

/**
 * OkHttp-based WebSocket client with:
 * - Persistent connection (read timeout = 0)
 * - Exponential backoff reconnection (1 → 2 → 4 → 8 → max 30 s)
 * - Coroutine-based, thread-safe
 */
object WebSocketClient {

    private val client = OkHttpClient.Builder()
        .readTimeout(0,  TimeUnit.MILLISECONDS)   // persistent
        .writeTimeout(15, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .pingInterval(25, TimeUnit.SECONDS)       // keep-alive pings
        .build()

    @Volatile private var webSocket: WebSocket? = null
    private val connected    = AtomicBoolean(false)
    private val reconnecting = AtomicBoolean(false)
    private val retryCount   = AtomicInteger(0)

    private var currentUrl: String = ""
    private var scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // ──────────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────────

    fun connect(url: String, context: Context) {
        currentUrl = url
        retryCount.set(0)
        doConnect(context)
    }

    fun disconnect() {
        reconnecting.set(false)
        scope.cancel()
        webSocket?.close(1000, "User disconnect")
        webSocket  = null
        connected.set(false)
    }

    fun send(json: String): Boolean {
        val ws = webSocket
        return if (connected.get() && ws != null) {
            ws.send(json).also { ok ->
                if (!ok) Log.w(TAG, "send() returned false for: ${json.take(80)}")
            }
        } else {
            Log.w(TAG, "send() skipped — not connected")
            false
        }
    }

    fun isConnected(): Boolean = connected.get()

    // ──────────────────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────────────────

    private fun doConnect(context: Context) {
        if (!scope.isActive) scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

        val request = Request.Builder().url(currentUrl).build()
        webSocket   = client.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(ws: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected to $currentUrl")
                connected.set(true)
                retryCount.set(0)
                reconnecting.set(false)
                PhoneLinkService.notifyConnected("WiFi")
            }

            override fun onMessage(ws: WebSocket, text: String) {
                Log.d(TAG, "RX: ${text.take(120)}")
                MessageHandler.handleIncoming(text, context)
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WebSocket closing: $code $reason")
                ws.close(1000, null)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WebSocket closed: $code $reason")
                connected.set(false)
                PhoneLinkService.notifyDisconnected()
                scheduleReconnect(context)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                connected.set(false)
                PhoneLinkService.notifyDisconnected()
                scheduleReconnect(context)
            }
        })
    }

    private fun scheduleReconnect(context: Context) {
        if (!reconnecting.compareAndSet(false, true)) return
        scope.launch {
            val count    = retryCount.incrementAndGet()
            val delay    = minOf(1_000L * (1 shl (count - 1).coerceAtMost(4)), 30_000L)
            Log.i(TAG, "Reconnect in ${delay}ms (attempt $count)")
            delay(delay)
            reconnecting.set(false)
            if (currentUrl.isNotBlank()) doConnect(context)
        }
    }
}
