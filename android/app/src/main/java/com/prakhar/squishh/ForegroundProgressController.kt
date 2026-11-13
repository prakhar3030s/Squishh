package com.prakhar.squishh

import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Encapsulates foreground notification lifecycle intents for [SquishhProcessingService]
 * (ARCH-001, ARCH-008).
 */
class ForegroundProgressController(
    private val context: Context
) {
    fun start(title: String) {
        try {
            val intent = Intent(context, SquishhProcessingService::class.java).apply {
                action = SquishhProcessingService.ACTION_START
                putExtra(SquishhProcessingService.EXTRA_TITLE, title)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (_: Exception) {}
    }

    fun update(title: String, progress: Int) {
        try {
            val intent = Intent(context, SquishhProcessingService::class.java).apply {
                action = SquishhProcessingService.ACTION_UPDATE
                putExtra(SquishhProcessingService.EXTRA_TITLE, title)
                putExtra(SquishhProcessingService.EXTRA_PROGRESS, progress)
            }
            context.startService(intent)
        } catch (_: Exception) {}
    }

    fun stop() {
        try {
            val intent = Intent(context, SquishhProcessingService::class.java).apply {
                action = SquishhProcessingService.ACTION_STOP
            }
            context.startService(intent)
        } catch (_: Exception) {}
    }
}
