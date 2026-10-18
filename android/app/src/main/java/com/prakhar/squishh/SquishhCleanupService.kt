package com.prakhar.squishh

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Background lifecycle service to detect when the app task is closed/swiped away
 * by the user from Recent Apps.
 */
class SquishhCleanupService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i("SquishhCleanupService", "App task removed from Recents. Clearing cache instantly.")
        CacheCleaner.clearAllCache(applicationContext)
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        CacheCleaner.clearAllCache(applicationContext)
    }
}
