package com.prakhar.squishh

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Prepares FileProvider URIs off the main thread and launches the Android share sheet
 * on the main thread (ARCH-001, PERF-007).
 */
class ShareHandler(
    private val context: Context
) {
    suspend fun shareFiles(paths: List<String>, title: String, activity: Activity?) {
        val chooser = withContext(Dispatchers.IO) {
            val uris = ArrayList<Uri>()
            var primaryMimeType = "*/*"

            for (path in paths) {
                val file = File(path)
                if (file.exists()) {
                    val uri = FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file
                    )
                    uris.add(uri)
                    primaryMimeType = mimeTypeForExtension(file.extension.lowercase())
                }
            }

            if (uris.isEmpty()) {
                throw IllegalArgumentException("Specified file(s) do not exist on disk")
            }

            val shareIntent = if (uris.size == 1) {
                Intent(Intent.ACTION_SEND).apply {
                    type = primaryMimeType
                    putExtra(Intent.EXTRA_STREAM, uris[0])
                    putExtra(Intent.EXTRA_TEXT, title)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            } else {
                Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                    type = if (primaryMimeType.startsWith("image/")) "image/*" else "*/*"
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                    putExtra(Intent.EXTRA_TEXT, title)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }

            Intent.createChooser(shareIntent, title).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }

        withContext(Dispatchers.Main) {
            (activity ?: context).startActivity(chooser)
        }
    }

    private fun mimeTypeForExtension(ext: String): String = when (ext) {
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        "mp4" -> "video/mp4"
        "mp3" -> "audio/mpeg"
        "m4a" -> "audio/mp4"
        "wav" -> "audio/wav"
        "pdf" -> "application/pdf"
        else -> if (ext.isNotEmpty()) "image/*" else "*/*"
    }
}
