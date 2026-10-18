package com.prakhar.squishh

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.UUID

data class ResolvedFileInfo(
    val localPath: String,
    val displayName: String,
    val sizeBytes: Long,
    val mimeType: String
)

object StorageResolver {

    fun resolveUriToCache(context: Context, uriString: String): ResolvedFileInfo {
        // Direct local file path
        if (uriString.startsWith("/")) {
            val f = File(uriString)
            if (f.exists()) {
                return ResolvedFileInfo(
                    localPath = f.absolutePath,
                    displayName = f.name,
                    sizeBytes = f.length(),
                    mimeType = "application/octet-stream"
                )
            }
        }
        if (uriString.startsWith("file://")) {
            val path = Uri.parse(uriString).path
            if (path != null) {
                val f = File(path)
                if (f.exists()) {
                    return ResolvedFileInfo(
                        localPath = f.absolutePath,
                        displayName = f.name,
                        sizeBytes = f.length(),
                        mimeType = "application/octet-stream"
                    )
                }
            }
        }

        val uri = Uri.parse(uriString)
        val contentResolver = context.contentResolver

        var displayName = "file_${UUID.randomUUID()}"
        var sizeBytes = 0L

        // Query metadata from ContentResolver
        try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (cursor.moveToFirst()) {
                    if (nameIndex != -1 && !cursor.isNull(nameIndex)) {
                        displayName = cursor.getString(nameIndex)
                    }
                    if (sizeIndex != -1 && !cursor.isNull(sizeIndex)) {
                        sizeBytes = cursor.getLong(sizeIndex)
                    }
                }
            }
        } catch (_: Exception) {
            // Fallback to path segment
            uri.lastPathSegment?.let { displayName = it }
        }

        val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"

        // Stream into internal sandbox cache directory without loading entire file to memory
        val inputDir = File(context.cacheDir, "squishh_in").apply { mkdirs() }
        val ext = displayName.substringAfterLast('.', "")
        val safeSuffix = if (ext.isNotEmpty()) ".$ext" else ""
        val tempFile = File(inputDir, "input_${System.currentTimeMillis()}_${UUID.randomUUID()}$safeSuffix")

        contentResolver.openInputStream(uri)?.use { inputStream ->
            FileOutputStream(tempFile).use { outputStream ->
                val buffer = ByteArray(64 * 1024) // 64 KB streaming buffer
                var bytesRead: Int
                var totalStreamed = 0L
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    totalStreamed += bytesRead
                }
                if (sizeBytes == 0L) {
                    sizeBytes = totalStreamed
                }
            }
        } ?: throw IllegalStateException("Unable to open input stream for URI: $uriString")

        return ResolvedFileInfo(
            localPath = tempFile.absolutePath,
            displayName = displayName,
            sizeBytes = sizeBytes,
            mimeType = mimeType
        )
    }

    fun cleanInputCache(context: Context) {
        try {
            val inputDir = File(context.cacheDir, "squishh_in")
            inputDir.deleteRecursively()
        } catch (_: Exception) {}
    }
}
