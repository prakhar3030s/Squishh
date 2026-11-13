package com.prakhar.squishh

import android.content.Context
import android.os.Environment
import android.os.StatFs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Abstraction over local cache storage, content URI resolution,
 * temporary output allocation, and MediaStore export (ARCH-004).
 */
interface FileRepository {
    suspend fun awaitPendingCleanup()
    suspend fun resolveUriToCache(uriString: String): ResolvedFileInfo
    suspend fun resolveUrisToCache(uriStrings: List<String>): List<ResolvedFileInfo>
    fun allocateOutputFile(prefix: String, extension: String, subDir: String = DEFAULT_OUTPUT_SUBDIR): File
    fun requireReadableInputFile(path: String, label: String = "Input file"): File
    suspend fun exportToSystem(sourcePath: String, mediaType: String, fileName: String): String
    suspend fun queryAvailableStorageBytes(): Long
    fun clearAllCacheAsync(isStartup: Boolean = false): Job
    suspend fun clearAllCacheSuspended()

    companion object {
        const val DEFAULT_OUTPUT_SUBDIR = "squishh_out"
    }
}

class DefaultFileRepository(
    private val context: Context
) : FileRepository {

    override suspend fun awaitPendingCleanup() {
        CacheCleaner.awaitPendingCleanup()
    }

    override suspend fun resolveUriToCache(uriString: String): ResolvedFileInfo =
        withContext(Dispatchers.IO) {
            CacheCleaner.awaitPendingCleanup()
            StorageResolver.resolveUriToCache(context, uriString)
        }

    override suspend fun resolveUrisToCache(uriStrings: List<String>): List<ResolvedFileInfo> =
        withContext(Dispatchers.IO) {
            CacheCleaner.awaitPendingCleanup()
            uriStrings.map { uri -> StorageResolver.resolveUriToCache(context, uri) }
        }

    override fun allocateOutputFile(prefix: String, extension: String, subDir: String): File {
        val outputDir = File(context.cacheDir, subDir).apply { mkdirs() }
        val cleanExt = extension.trimStart('.')
        return File(outputDir, "${prefix}_${System.currentTimeMillis()}_${UUID.randomUUID()}.$cleanExt")
    }

    override fun requireReadableInputFile(path: String, label: String): File {
        val file = File(path)
        if (!file.exists()) {
            throw IllegalArgumentException("$label does not exist: $path")
        }
        return file
    }

    override suspend fun exportToSystem(sourcePath: String, mediaType: String, fileName: String): String =
        MediaExporter.exportToSystem(context, sourcePath, mediaType, fileName)

    override suspend fun queryAvailableStorageBytes(): Long = withContext(Dispatchers.IO) {
        try {
            val storageDir = Environment.getExternalStorageDirectory()
            if (storageDir != null && storageDir.exists()) {
                StatFs(storageDir.absolutePath).availableBytes
            } else {
                StatFs(context.filesDir.absolutePath).availableBytes
            }
        } catch (_: Exception) {
            try {
                context.getExternalFilesDir(null)?.usableSpace ?: context.filesDir.usableSpace
            } catch (_: Exception) {
                context.cacheDir.usableSpace
            }
        }
    }

    override fun clearAllCacheAsync(isStartup: Boolean): Job =
        CacheCleaner.clearAllCacheAsync(context, isStartup = isStartup)

    override suspend fun clearAllCacheSuspended() {
        CacheCleaner.clearAllCacheSuspended(context)
    }
}
