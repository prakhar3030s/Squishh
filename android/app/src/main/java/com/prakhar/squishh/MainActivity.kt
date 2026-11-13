package com.prakhar.squishh

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebChromeClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.koin.android.ext.android.inject

class MainActivity : BridgeActivity() {

    private val fileRepository: FileRepository by inject()

    companion object {
        private val shareLock = Any()
        val pendingSharedUris = mutableListOf<String>()
        var pendingSharedMime: String? = null

        fun consumePendingShare(): Pair<List<String>, String?> {
            synchronized(shareLock) {
                val uris = pendingSharedUris.toList()
                val mime = pendingSharedMime
                pendingSharedUris.clear()
                pendingSharedMime = null
                return Pair(uris, mime)
            }
        }
    }

    private val mainIoScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* Permission result handled silently; foreground service remains functional either way */ }

    private val webFileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = pendingFilePathCallback
        pendingFilePathCallback = null
        // Clear WebView file input immediately so Chromium never exposes large DOM File blobs to JS
        callback?.onReceiveValue(null)

        if (result.resultCode != Activity.RESULT_OK) {
            SquishhEnginePlugin.emitWebChooserFiles(emptyList())
            return@registerForActivityResult
        }

        val dataIntent = result.data
        val uris = mutableListOf<Uri>()
        dataIntent?.clipData?.let { clipData ->
            for (i in 0 until clipData.itemCount) {
                clipData.getItemAt(i).uri?.let { uris.add(it) }
            }
        } ?: dataIntent?.data?.let { uri ->
            uris.add(uri)
        }

        if (uris.isEmpty()) {
            SquishhEnginePlugin.emitWebChooserFiles(emptyList())
            return@registerForActivityResult
        }

        mainIoScope.launch {
            try {
                val resolvedFiles = fileRepository.resolveUrisToCache(uris.map { it.toString() })
                SquishhEnginePlugin.emitWebChooserFiles(resolvedFiles)
            } catch (_: Exception) {
                SquishhEnginePlugin.emitWebChooserFiles(emptyList())
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Clear any leftover cache off the main thread on app launch
        fileRepository.clearAllCacheAsync(isStartup = true)

        registerPlugin(SquishhEnginePlugin::class.java)
        super.onCreate(savedInstanceState)
        installNativeWebFileChooser()
        handleShareIntent(intent)
        requestNotificationPermissionIfNeeded()

        // Start background lifecycle monitor service to detect when task is swiped away
        try {
            startService(Intent(this, SquishhCleanupService::class.java))
        } catch (_: Exception) {}
    }

    override fun onNewIntent(intent: Intent) {
        handleShareIntent(intent)
        super.onNewIntent(intent)
    }

    override fun onDestroy() {
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = null
        mainIoScope.cancel()
        try {
            bridge?.webView?.clearCache(true)
        } catch (_: Exception) {}
        fileRepository.clearAllCacheAsync()
        super.onDestroy()
    }

    private fun installNativeWebFileChooser() {
        val capBridge: Bridge = bridge ?: return
        capBridge.webView?.webChromeClient = object : BridgeWebChromeClient(capBridge) {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                pendingFilePathCallback?.onReceiveValue(null)
                pendingFilePathCallback = filePathCallback

                val allowMultiple = fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                val validMimeTypes = extractValidMimeTypes(fileChooserParams.acceptTypes)
                val pickerIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
                    type = if (validMimeTypes.size == 1) validMimeTypes[0] else "*/*"
                    if (validMimeTypes.size > 1) {
                        putExtra(Intent.EXTRA_MIME_TYPES, validMimeTypes.toTypedArray())
                    }
                }

                return try {
                    webFileChooserLauncher.launch(pickerIntent)
                    true
                } catch (_: ActivityNotFoundException) {
                    pendingFilePathCallback = null
                    filePathCallback.onReceiveValue(null)
                    SquishhEnginePlugin.emitWebChooserFiles(emptyList())
                    false
                }
            }
        }
    }

    private fun extractValidMimeTypes(rawAcceptTypes: Array<String>?): List<String> {
        if (rawAcceptTypes == null || rawAcceptTypes.isEmpty()) return emptyList()
        val mimeTypeMap = MimeTypeMap.getSingleton()
        val result = mutableListOf<String>()
        rawAcceptTypes
            .flatMap { it.split(',') }
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .forEach { entry ->
                val resolved = if (entry.startsWith(".")) {
                    mimeTypeMap.getMimeTypeFromExtension(entry.substring(1).lowercase())
                } else {
                    entry
                }
                if (!resolved.isNullOrEmpty() && !result.contains(resolved)) {
                    result.add(resolved)
                }
            }
        return result
    }

    @Suppress("DEPRECATION")
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_COMPLETE || level >= TRIM_MEMORY_UI_HIDDEN) {
            val appContext = applicationContext
            CacheCleaner.runBackgroundCleanup {
                StorageResolver.cleanInputCache(appContext)
            }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun handleShareIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null) {
            val streamUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                ?: intent.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
            if (streamUri != null) {
                synchronized(shareLock) {
                    pendingSharedUris.clear()
                    pendingSharedUris.add(streamUri.toString())
                    pendingSharedMime = type
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action && type != null) {
            val streamUris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            val resolvedUris = mutableListOf<String>()
            if (streamUris != null) {
                streamUris.forEach { resolvedUris.add(it.toString()) }
            } else {
                intent.clipData?.let { clip ->
                    for (i in 0 until clip.itemCount) {
                        clip.getItemAt(i).uri?.let { resolvedUris.add(it.toString()) }
                    }
                }
            }
            if (resolvedUris.isNotEmpty()) {
                synchronized(shareLock) {
                    pendingSharedUris.clear()
                    pendingSharedUris.addAll(resolvedUris)
                    pendingSharedMime = type
                }
            }
        }
    }
}
