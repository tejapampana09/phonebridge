package com.phonebridge.sync

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context

object ClipboardSync {
    fun getCurrentClipboard(context: Context): String? {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        return cm.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()
    }

    fun setClipboard(context: Context, text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("PhoneBridge", text))
    }
}
