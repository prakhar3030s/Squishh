package com.prakhar.squishh

import android.content.Context
import android.util.Log
import java.io.File

object CacheCleaner {
    private const val TAG = "SquishhCacheCleaner"

    /**
     * Wipes all application cache files instantly:
     * - internal cacheDir (squishh_in, squishh_out, squishh_tmp, webview/media caches)
     * - externalCacheDir
     * - codeCacheDir
     */
    fun clearAllCache(context: Context) {
        try {
            var deletedCount = 0
            var reclaimedBytes = 0L

            // 1. Clear internal cache directory
            val internalCache = context.cacheDir
            if (internalCache != null && internalCache.exists()) {
                val files = internalCache.listFiles()
                files?.forEach { file ->
                    reclaimedBytes += getFolderSize(file)
                    if (file.deleteRecursively()) {
                        deletedCount++
                    }
                }
            }

            // 2. Clear external cache directory if available
            val externalCache = context.externalCacheDir
            if (externalCache != null && externalCache.exists()) {
                val files = externalCache.listFiles()
                files?.forEach { file ->
                    reclaimedBytes += getFolderSize(file)
                    if (file.deleteRecursively()) {
                        deletedCount++
                    }
                }
            }

            // 3. Clear code cache if accessible
            try {
                val codeCache = context.codeCacheDir
                if (codeCache != null && codeCache.exists()) {
                    codeCache.listFiles()?.forEach { file ->
                        file.deleteRecursively()
                    }
                }
            } catch (_: Exception) {}

            Log.i(TAG, "Cache wipe complete: removed $deletedCount items, reclaimed $reclaimedBytes bytes")
        } catch (e: Exception) {
            Log.e(TAG, "Error wiping cache: ${e.message}", e)
        }
    }

    /**
     * Recursively calculate folder size in bytes.
     */
    fun getFolderSize(dir: File?): Long {
        if (dir == null || !dir.exists()) return 0L
        if (dir.isFile) return dir.length()
        var size = 0L
        dir.listFiles()?.forEach { file ->
            size += if (file.isDirectory) getFolderSize(file) else file.length()
        }
        return size
    }
}
