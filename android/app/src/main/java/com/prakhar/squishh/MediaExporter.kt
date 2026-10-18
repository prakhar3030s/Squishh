package com.prakhar.squishh

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream

object MediaExporter {

    fun exportToSystem(
        context: Context,
        sourceFilePath: String,
        mediaType: String, // "image", "video", "audio", "pdf"
        targetFileName: String
    ): String {
        val sourceFile = File(sourceFilePath)
        if (!sourceFile.exists()) {
            throw IllegalArgumentException("Source file does not exist at path: $sourceFilePath")
        }

        val contentResolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, targetFileName)
            put(MediaStore.MediaColumns.SIZE, sourceFile.length())
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }

        val collectionUri: Uri = when (mediaType.lowercase()) {
            "image" -> {
                values.put(MediaStore.Images.Media.MIME_TYPE, getMimeType(targetFileName, "image/jpeg"))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/Squishh")
                }
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }
            "video" -> {
                values.put(MediaStore.Video.Media.MIME_TYPE, getMimeType(targetFileName, "video/mp4"))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/Squishh")
                }
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            }
            "audio" -> {
                values.put(MediaStore.Audio.Media.MIME_TYPE, getMimeType(targetFileName, "audio/mpeg"))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.Audio.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MUSIC}/Squishh")
                }
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            }
            else -> { // PDF and other docs
                values.put(MediaStore.MediaColumns.MIME_TYPE, getMimeType(targetFileName, "application/pdf"))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Squishh")
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI
                } else {
                    MediaStore.Files.getContentUri("external")
                }
            }
        }

        val itemUri = contentResolver.insert(collectionUri, values)
            ?: throw IllegalStateException("Failed to insert new item into MediaStore for type: $mediaType")

        // Stream source bytes into public MediaStore destination
        contentResolver.openOutputStream(itemUri)?.use { outStream ->
            FileInputStream(sourceFile).use { inStream ->
                inStream.copyTo(outStream)
            }
        } ?: throw IllegalStateException("Failed to open output stream for inserted item: $itemUri")

        // Release IS_PENDING flag so the media scanner indexes it immediately
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val updateValues = ContentValues().apply {
                put(MediaStore.MediaColumns.IS_PENDING, 0)
            }
            contentResolver.update(itemUri, updateValues, null, null)
        }

        return itemUri.toString()
    }

    private fun getMimeType(fileName: String, fallback: String): String {
        return when (fileName.substringAfterLast('.', "").lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "heic" -> "image/heic"
            "avif" -> "image/avif"
            "mp4" -> "video/mp4"
            "mov" -> "video/quicktime"
            "mkv" -> "video/x-matroska"
            "webm" -> "video/webm"
            "gif" -> "image/gif"
            "mp3" -> "audio/mpeg"
            "aac", "m4a" -> "audio/aac"
            "wav" -> "audio/wav"
            "ogg" -> "audio/ogg"
            "flac" -> "audio/flac"
            "opus" -> "audio/opus"
            "pdf" -> "application/pdf"
            else -> fallback
        }
    }
}
