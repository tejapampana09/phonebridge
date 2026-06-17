package com.phonebridge.pairing

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.util.Log
import com.phonebridge.utils.MirroringManager

private const val TAG = "MirroringActivity"

class MirroringActivity : Activity() {

    private val REQUEST_CODE = 4224

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        Log.i(TAG, "Launching screen projection request dialog")
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        try {
            startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CODE)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start projection dialog", e)
            finish()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                Log.i(TAG, "Projection access allowed.")
                // Pass to MirroringManager
                MirroringManager.startMirroring(applicationContext, resultCode, data)
            } else {
                Log.w(TAG, "Projection access denied.")
                MirroringManager.stopMirroring()
            }
        }
        finish()
    }
}
