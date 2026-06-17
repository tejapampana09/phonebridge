package com.phonebridge.workers

import android.content.Context
import android.util.Log
import androidx.work.*
import com.phonebridge.connection.ConnectionManager
import com.phonebridge.connection.MessageHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

private const val TAG = "HeartbeatWorker"
private const val WORK_NAME = "phonebridge_heartbeat"

class HeartbeatWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.i(TAG, "Heartbeat worker running check...")
        
        try {
            ConnectionManager.init(applicationContext)
            if (ConnectionManager.isConnected()) {
                val statusJson = MessageHandler.buildDeviceStatus(applicationContext)
                ConnectionManager.send(statusJson)
                Log.d(TAG, "Heartbeat worker successfully sent status update to PC")
            } else {
                Log.d(TAG, "Heartbeat worker skipped: connection offline")
            }
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat worker failed execution", e)
            Result.retry()
        }
    }

    companion object {
        /**
         * Schedule a periodic heartbeat check-in every 15 minutes.
         */
        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
            Log.i(TAG, "Periodic heartbeat worker scheduled")
        }

        /**
         * Cancel the periodic heartbeat worker.
         */
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Log.i(TAG, "Periodic heartbeat worker cancelled")
        }
    }
}
