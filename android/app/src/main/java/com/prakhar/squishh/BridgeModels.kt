package com.prakhar.squishh

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/**
 * Marks native data models that correspond 1:1 with canonical TypeScript interfaces
 * defined in src/plugins/bridgeSchema.ts (ARCH-007).
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class BridgeContract(val tsInterface: String)

object BridgeEvents {
    const val JOB_PROGRESS = "jobProgress"
    const val INCOMING_SHARE_READY = "incomingShareReady"
    const val WEB_FILES_PICKED = "webFilesPicked"
}

@BridgeContract("FileInfo")
data class ResolvedFileInfo(
    val localPath: String,
    val displayName: String,
    val sizeBytes: Long,
    val mimeType: String
) {
    fun toJSObject(includeUri: Boolean = false): JSObject = JSObject().apply {
        put("localPath", localPath)
        put("displayName", displayName)
        put("sizeBytes", sizeBytes)
        put("mimeType", mimeType)
        if (includeUri) {
            put("uri", localPath)
        }
    }
}

@BridgeContract("ImageProcessResult")
data class ImageCompressionResult(
    val outputPath: String,
    val originalSizeBytes: Long,
    val compressedSizeBytes: Long,
    val width: Int,
    val height: Int,
    val format: String
) {
    fun toJSObject(jobId: String? = null): JSObject = JSObject().apply {
        if (jobId != null) put("jobId", jobId)
        put("outputPath", outputPath)
        put("originalSizeBytes", originalSizeBytes)
        put("compressedSizeBytes", compressedSizeBytes)
        put("width", width)
        put("height", height)
        put("format", format)
    }
}

@BridgeContract("VideoProcessResult")
data class VideoCompressionResult(
    val outputPath: String,
    val originalSizeBytes: Long,
    val compressedSizeBytes: Long,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val isGif: Boolean
) {
    fun toJSObject(): JSObject = JSObject().apply {
        put("outputPath", outputPath)
        put("originalSizeBytes", originalSizeBytes)
        put("compressedSizeBytes", compressedSizeBytes)
        put("durationMs", durationMs)
        put("width", width)
        put("height", height)
        put("isGif", isGif)
    }
}

@BridgeContract("AudioProcessResult")
data class AudioCompressionResult(
    val outputPath: String,
    val originalSizeBytes: Long,
    val compressedSizeBytes: Long,
    val durationMs: Long,
    val bitrateKbps: Int,
    val format: String
) {
    fun toJSObject(): JSObject = JSObject().apply {
        put("outputPath", outputPath)
        put("originalSizeBytes", originalSizeBytes)
        put("compressedSizeBytes", compressedSizeBytes)
        put("durationMs", durationMs)
        put("bitrateKbps", bitrateKbps)
        put("format", format)
    }
}

@BridgeContract("PdfProcessResult")
data class PdfCompressionResult(
    val outputPath: String,
    val pageCount: Int,
    val originalSizeBytes: Long,
    val compressedSizeBytes: Long
) {
    fun toJSObject(): JSObject = JSObject().apply {
        put("outputPath", outputPath)
        put("pageCount", pageCount)
        put("originalSizeBytes", originalSizeBytes)
        put("compressedSizeBytes", compressedSizeBytes)
    }
}

@BridgeContract("PdfToImagesResult")
data class PdfToImagesResult(
    val imagePaths: List<String>,
    val pageCount: Int,
    val totalSizeBytes: Long
) {
    fun toJSObject(): JSObject = JSObject().apply {
        val pagesArray = JSArray()
        imagePaths.forEach { pagesArray.put(it) }
        put("imagePaths", pagesArray)
        put("pageCount", pageCount)
        put("totalSizeBytes", totalSizeBytes)
    }
}

@BridgeContract("JobProgress")
data class JobProgressEvent(
    val jobId: String,
    val progress: Float,
    val bytesProcessed: Long,
    val totalBytes: Long,
    val status: String,
    val etaRemainingMs: Long = 0L
) {
    fun toJSObject(): JSObject = JSObject().apply {
        put("jobId", jobId)
        put("progress", progress)
        put("bytesProcessed", bytesProcessed)
        put("totalBytes", totalBytes)
        put("status", status)
        put("etaRemainingMs", etaRemainingMs)
    }
}

@BridgeContract("IncomingShare")
data class IncomingSharePayload(
    val uris: List<String>,
    val mimeType: String?
) {
    fun toJSObject(): JSObject = JSObject().apply {
        val uriArray = JSArray()
        uris.forEach { uriArray.put(it) }
        put("uris", uriArray)
        put("mimeType", mimeType ?: "")
        put("count", uriArray.length())
    }
}

@BridgeContract("SaveResult")
data class SaveResultPayload(
    val success: Boolean,
    val uri: String
) {
    fun toJSObject(): JSObject = JSObject().apply {
        put("success", success)
        put("uri", uri)
    }
}

@BridgeContract("StorageInfo")
data class StorageInfoPayload(
    val freeBytes: Long
) {
    fun toJSObject(): JSObject = JSObject().apply {
        put("freeBytes", freeBytes)
    }
}
