package com.prakhar.squishh

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    companion object {
        val pendingSharedUris = mutableListOf<String>()
        var pendingSharedMime: String? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Clear any leftover cache on app launch immediately
        CacheCleaner.clearAllCache(applicationContext)

        registerPlugin(SquishhEnginePlugin::class.java)
        super.onCreate(savedInstanceState)
        handleShareIntent(intent)

        // Start background lifecycle monitor service to detect when task is swiped away
        try {
            startService(Intent(this, SquishhCleanupService::class.java))
        } catch (_: Exception) {}
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShareIntent(intent)
    }

    override fun onDestroy() {
        try {
            bridge?.webView?.clearCache(true)
        } catch (_: Exception) {}
        CacheCleaner.clearAllCache(applicationContext)
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_COMPLETE || level >= TRIM_MEMORY_UI_HIDDEN) {
            StorageResolver.cleanInputCache(applicationContext)
        }
    }

    @Suppress("DEPRECATION")
    private fun handleShareIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null) {
            val streamUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (streamUri != null) {
                pendingSharedUris.clear()
                pendingSharedUris.add(streamUri.toString())
                pendingSharedMime = type
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action && type != null) {
            val streamUris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            if (streamUris != null) {
                pendingSharedUris.clear()
                streamUris.forEach { pendingSharedUris.add(it.toString()) }
                pendingSharedMime = type
            }
        }
    }
}
