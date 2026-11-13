package com.prakhar.squishh

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

/**
 * Background lifecycle service to detect when the app task is closed/swiped away
 * by the user from Recent Apps.
 */
class SquishhCleanupService : Service(), KoinComponent {

    private val fileRepository: FileRepository by inject()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i("SquishhCleanupService", "App task removed from Recents. Clearing cache asynchronously.")
        fileRepository.clearAllCacheAsync().invokeOnCompletion {
            stopSelf()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        fileRepository.clearAllCacheAsync()
    }
}
