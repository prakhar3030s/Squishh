package com.prakhar.squishh

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.FileOutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

@CapacitorPlugin(name = "SquishhEngine")
class SquishhEnginePlugin : Plugin() {

    private val pluginScope = CoroutineScope(Dispatchers.IO)
    private val activeCancellationTokens = ConcurrentHashMap<String, AtomicBoolean>()

    /**
     * Resolves an incoming Android content URI into an on-disk sandbox cache file
     * without loading entire blobs into JS memory.
     */
    @PluginMethod
    fun resolveFile(call: PluginCall) {
        val uriString = call.getString("uri")
        if (uriString.isNullOrEmpty()) {
            call.reject("URI cannot be empty")
            return
        }

        try {
            val result = StorageResolver.resolveUriToCache(context, uriString)
            val res = JSObject().apply {
                put("localPath", result.localPath)
                put("displayName", result.displayName)
                put("sizeBytes", result.sizeBytes)
                put("mimeType", result.mimeType)
            }
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("Failed to resolve content URI: ${e.message}", e)
        }
    }

    /**
     * Native file picker using system Intent.ACTION_GET_CONTENT.
     * Resolves selected files into cache and returns local disk paths directly.
     */
    @PluginMethod
    fun pickFiles(call: PluginCall) {
        val type = call.getString("type") ?: "*/*"
        val multiple = call.getBoolean("multiple") ?: false

        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            this.type = if (type.contains(",")) "*/*" else type
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
            addCategory(Intent.CATEGORY_OPENABLE)
            if (type.contains(",")) {
                val mimeTypes = type.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toTypedArray()
                putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
            }
        }
        startActivityForResult(call, intent, "pickFilesCallback")
    }

    @ActivityCallback
    fun pickFilesCallback(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode == Activity.RESULT_OK) {
            val intent = result.data
            if (intent == null) {
                val res = JSObject().apply {
                    put("files", JSArray())
                    put("count", 0)
                }
                call.resolve(res)
                return
            }

            val uris = mutableListOf<Uri>()
            intent.clipData?.let { clipData ->
                for (i in 0 until clipData.itemCount) {
                    uris.add(clipData.getItemAt(i).uri)
                }
            } ?: intent.data?.let { uri ->
                uris.add(uri)
            }

            pluginScope.launch {
                try {
                    val filesArray = JSArray()
                    for (uri in uris) {
                        val fileInfo = StorageResolver.resolveUriToCache(context, uri.toString())
                        val fileObj = JSObject().apply {
                            put("localPath", fileInfo.localPath)
                            put("displayName", fileInfo.displayName)
                            put("sizeBytes", fileInfo.sizeBytes)
                            put("mimeType", fileInfo.mimeType)
                            put("uri", fileInfo.localPath)
                        }
                        filesArray.put(fileObj)
                    }
                    val res = JSObject().apply {
                        put("files", filesArray)
                        put("count", filesArray.length())
                    }
                    call.resolve(res)
                } catch (e: Exception) {
                    call.reject("Failed to resolve picked files: ${e.message}", e)
                }
            }
        } else {
            val res = JSObject().apply {
                put("files", JSArray())
                put("count", 0)
            }
            call.resolve(res)
        }
    }

    /**
     * Saves base64 data from a web File/Blob into an on-disk cache file.
     */
    @PluginMethod
    fun writeBase64ToCache(call: PluginCall) {
        val fileName = call.getString("fileName") ?: "input_${System.currentTimeMillis()}"
        val base64Data = call.getString("base64Data")
        val mimeType = call.getString("mimeType") ?: "application/octet-stream"

        if (base64Data.isNullOrEmpty()) {
            call.reject("base64Data is required")
            return
        }

        pluginScope.launch {
            try {
                val inputDir = File(context.cacheDir, "squishh_in").apply { mkdirs() }
                val ext = fileName.substringAfterLast('.', "")
                val safeSuffix = if (ext.isNotEmpty()) ".$ext" else ""
                val tempFile = File(inputDir, "input_${System.currentTimeMillis()}_${UUID.randomUUID()}$safeSuffix")

                val cleanBase64 = if (base64Data.contains(",")) {
                    base64Data.substringAfter(",")
                } else {
                    base64Data
                }

                val bytes = android.util.Base64.decode(cleanBase64, android.util.Base64.DEFAULT)
                FileOutputStream(tempFile).use { it.write(bytes) }

                val res = JSObject().apply {
                    put("localPath", tempFile.absolutePath)
                    put("displayName", fileName)
                    put("sizeBytes", tempFile.length())
                    put("mimeType", mimeType)
                    put("uri", tempFile.absolutePath)
                }
                call.resolve(res)
            } catch (e: Exception) {
                call.reject("Failed to write to cache: ${e.message}", e)
            }
        }
    }

    /**
     * Process & Compress an Image file natively off the main thread.
     */
    @PluginMethod
    fun processImage(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        val targetFormat = call.getString("targetFormat") ?: "jpg"
        val quality = call.getInt("quality") ?: 80
        val targetSizeBytes = call.getSafeLong("targetSizeBytes", 0L)
        val maxDimension = call.getInt("maxDimension") ?: 0

        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }

        val token = AtomicBoolean(false)
        activeCancellationTokens[jobId] = token

        pluginScope.launch {
            try {
                emitJobProgress(jobId, 0.05f, 0L, 0L, "processing")

                val result = ImageProcessor.process(
                    context = context,
                    inputPath = inputPath,
                    targetFormat = targetFormat,
                    quality = quality,
                    targetSizeBytes = targetSizeBytes,
                    maxDimension = maxDimension,
                    cancellationToken = token,
                    onProgress = { p ->
                        emitJobProgress(
                            jobId = jobId,
                            progress = p,
                            bytesProcessed = (resultBytesEstimate(targetSizeBytes, resultSize = 0L) * p).toLong(),
                            totalBytes = targetSizeBytes,
                            status = "processing"
                        )
                    }
                )

                emitJobProgress(
                    jobId = jobId,
                    progress = 1.0f,
                    bytesProcessed = result.compressedSizeBytes,
                    totalBytes = result.compressedSizeBytes,
                    status = "completed"
                )

                val response = JSObject().apply {
                    put("outputPath", result.outputPath)
                    put("originalSizeBytes", result.originalSizeBytes)
                    put("compressedSizeBytes", result.compressedSizeBytes)
                    put("width", result.width)
                    put("height", result.height)
                    put("format", result.format)
                }
                call.resolve(response)
            } catch (e: Exception) {
                emitJobProgress(jobId, 0f, 0L, 0L, "failed")
                call.reject("Image processing failed: ${e.message}", e)
            } finally {
                activeCancellationTokens.remove(jobId)
            }
        }
    }

    /**
     * Batch process & compress multiple images concurrently with individual progress callbacks.
     */
    @PluginMethod
    fun batchProcessImages(call: PluginCall) {
        val batchId = call.getString("batchId") ?: UUID.randomUUID().toString()
        val itemsArray = call.getArray("items")
        if (itemsArray == null || itemsArray.length() == 0) {
            call.reject("items array is required")
            return
        }

        val token = AtomicBoolean(false)
        activeCancellationTokens[batchId] = token

        pluginScope.launch {
            try {
                val totalItems = itemsArray.length()
                val results = JSArray()
                val completedCount = java.util.concurrent.atomic.AtomicInteger(0)

                startForegroundInternal("squishing $totalItems photos…")

                coroutineScope {
                    val deferredList = (0 until totalItems).map { i ->
                        val itemObj = itemsArray.getJSONObject(i)
                        val inputPath = itemObj.getString("inputPath")
                        val targetFormat = itemObj.optString("targetFormat", "jpg")
                        val quality = itemObj.optInt("quality", 80)
                        val targetSizeBytes = itemObj.optLong("targetSizeBytes", 0L)
                        val maxDimension = itemObj.optInt("maxDimension", 0)
                        val itemId = itemObj.optString("jobId", "$batchId-$i")

                        async(Dispatchers.IO) {
                            if (token.get()) throw InterruptedException("Batch job cancelled")
                            val res = ImageProcessor.process(
                                context = context,
                                inputPath = inputPath,
                                targetFormat = targetFormat,
                                quality = quality,
                                targetSizeBytes = targetSizeBytes,
                                maxDimension = maxDimension,
                                cancellationToken = token,
                                onProgress = { itemP ->
                                    val overallP = (completedCount.get() + itemP) / totalItems
                                    val pct = (overallP * 100).toInt()
                                    updateForegroundInternal("squishing photo ${completedCount.get() + 1} of $totalItems… $pct%", pct)
                                    emitJobProgress(
                                        jobId = itemId,
                                        progress = itemP,
                                        bytesProcessed = 0L,
                                        totalBytes = targetSizeBytes,
                                        status = "processing"
                                    )
                                }
                            )
                            completedCount.incrementAndGet()
                            res
                        }
                    }

                    deferredList.forEach { deferred ->
                        val result = deferred.await()
                        val resObj = JSObject().apply {
                            put("outputPath", result.outputPath)
                            put("originalSizeBytes", result.originalSizeBytes)
                            put("compressedSizeBytes", result.compressedSizeBytes)
                            put("width", result.width)
                            put("height", result.height)
                            put("format", result.format)
                        }
                        results.put(resObj)
                    }
                }

                stopForegroundInternal()
                val response = JSObject().apply {
                    put("batchId", batchId)
                    put("results", results)
                    put("count", results.length())
                }
                call.resolve(response)
            } catch (e: Exception) {
                stopForegroundInternal()
                call.reject("Batch image processing failed: ${e.message}", e)
            } finally {
                activeCancellationTokens.remove(batchId)
            }
        }
    }

    /**
     * Hardware-accelerated Video compression and transcoding using Jetpack Media3 Transformer.
     */
    @PluginMethod
    fun processVideo(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        val compressionLevel = call.getString("compressionLevel") ?: ""
        val targetSizeBytes = call.getSafeLong("targetSizeBytes", 0L)
        val resolution = call.getString("resolution") ?: "original"
        val fpsLimit = call.getInt("fpsLimit") ?: 0
        val muteAudio = call.getBoolean("muteAudio") ?: false
        val asGif = call.getBoolean("asGif") ?: false

        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }

        val token = AtomicBoolean(false)
        activeCancellationTokens[jobId] = token

        // Start ongoing foreground notification
        startForegroundInternal(if (asGif) "creating animated GIF…" else "squishing video…")

        pluginScope.launch {
            try {
                val origSize = File(inputPath).let { if (it.exists()) it.length() else 0L }
                val estTotalBytes = when (compressionLevel) {
                    "light" -> (origSize * 0.75f).toLong()
                    "balanced" -> (origSize * 0.50f).toLong()
                    "high" -> (origSize * 0.22f).toLong()
                    else -> if (targetSizeBytes > 0L) targetSizeBytes else (origSize * 0.60f).toLong()
                }

                emitJobProgress(jobId, 0.02f, 0L, estTotalBytes, "processing")

                val result = VideoProcessor.process(
                    context = context,
                    inputPath = inputPath,
                    compressionLevel = compressionLevel,
                    targetSizeBytes = targetSizeBytes,
                    resolution = resolution,
                    fpsLimit = fpsLimit,
                    muteAudio = muteAudio,
                    asGif = asGif,
                    cancellationToken = token,
                    onProgress = { p, etaMs ->
                        val pct = (p * 100).toInt()
                        updateForegroundInternal("squishing video… $pct%", pct)
                        emitJobProgress(
                            jobId = jobId,
                            progress = p,
                            bytesProcessed = (estTotalBytes * p).toLong(),
                            totalBytes = estTotalBytes,
                            status = "processing",
                            etaRemainingMs = etaMs
                        )
                    }
                )

                stopForegroundInternal()
                emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")

                val response = JSObject().apply {
                    put("outputPath", result.outputPath)
                    put("originalSizeBytes", result.originalSizeBytes)
                    put("compressedSizeBytes", result.compressedSizeBytes)
                    put("durationMs", result.durationMs)
                    put("width", result.width)
                    put("height", result.height)
                    put("isGif", result.isGif)
                }
                call.resolve(response)
            } catch (e: Exception) {
                stopForegroundInternal()
                emitJobProgress(jobId, 0f, 0L, 0L, "failed")
                call.reject("Video processing failed: ${e.message}", e)
            } finally {
                activeCancellationTokens.remove(jobId)
            }
        }
    }

    /**
     * Transcode audio or extract soundtracks from video files.
     */
    @PluginMethod
    fun processAudio(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        val targetFormat = call.getString("targetFormat") ?: "m4a"
        val bitrateKbps = call.getInt("bitrateKbps") ?: 128
        val monoDownmix = call.getBoolean("monoDownmix") ?: false
        val extractFromVideo = call.getBoolean("extractFromVideo") ?: false

        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }

        val token = AtomicBoolean(false)
        activeCancellationTokens[jobId] = token

        startForegroundInternal(if (extractFromVideo) "extracting soundtrack…" else "squishing audio…")

        pluginScope.launch {
            try {
                emitJobProgress(jobId, 0.05f, 0L, 0L, "processing")

                val result = AudioProcessor.process(
                    context = context,
                    inputPath = inputPath,
                    targetFormat = targetFormat,
                    bitrateKbps = bitrateKbps,
                    monoDownmix = monoDownmix,
                    extractFromVideo = extractFromVideo,
                    cancellationToken = token,
                    onProgress = { p ->
                        val pct = (p * 100).toInt()
                        updateForegroundInternal("squishing audio… $pct%", pct)
                        emitJobProgress(
                            jobId = jobId,
                            progress = p,
                            bytesProcessed = 0L,
                            totalBytes = 0L,
                            status = "processing"
                        )
                    }
                )

                stopForegroundInternal()
                emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")

                val response = JSObject().apply {
                    put("outputPath", result.outputPath)
                    put("originalSizeBytes", result.originalSizeBytes)
                    put("compressedSizeBytes", result.compressedSizeBytes)
                    put("durationMs", result.durationMs)
                    put("bitrateKbps", result.bitrateKbps)
                    put("format", result.format)
                }
                call.resolve(response)
            } catch (e: Exception) {
                stopForegroundInternal()
                emitJobProgress(jobId, 0f, 0L, 0L, "failed")
                call.reject("Audio processing failed: ${e.message}", e)
            } finally {
                activeCancellationTokens.remove(jobId)
            }
        }
    }

    /**
     * Converts a list of image paths into a clean PDF document.
     */
    @PluginMethod
    fun imagesToPdf(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val imagesArray = call.getArray("imagePaths")
        if (imagesArray == null || imagesArray.length() == 0) {
            call.reject("imagePaths array is required")
            return
        }

        val paths = mutableListOf<String>()
        for (i in 0 until imagesArray.length()) {
            paths.add(imagesArray.getString(i))
        }

        val token = AtomicBoolean(false)
        activeCancellationTokens[jobId] = token

        startForegroundInternal("generating PDF document…")

        pluginScope.launch {
            try {
                emitJobProgress(jobId, 0.05f, 0L, 0L, "processing")

                val result = PdfProcessor.imagesToPdf(
                    context = context,
                    imagePaths = paths,
                    cancellationToken = token,
                    onProgress = { p ->
                        val pct = (p * 100).toInt()
                        updateForegroundInternal("generating PDF… $pct%", pct)
                        emitJobProgress(
                            jobId = jobId,
                            progress = p,
                            bytesProcessed = 0L,
                            totalBytes = 0L,
                            status = "processing"
                        )
                    }
                )

                stopForegroundInternal()
                emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")

                val response = JSObject().apply {
                    put("outputPath", result.outputPath)
                    put("pageCount", result.pageCount)
                    put("originalSizeBytes", result.originalSizeBytes)
                    put("compressedSizeBytes", result.compressedSizeBytes)
                }
                call.resolve(response)
            } catch (e: Exception) {
                stopForegroundInternal()
                emitJobProgress(jobId, 0f, 0L, 0L, "failed")
                call.reject("Images to PDF failed: ${e.message}", e)
            } finally {
                activeCancellationTokens.remove(jobId)
            }
        }
    }

    /**
     * Compresses an existing PDF document to meet portal / email limits.
     */
    @PluginMethod
    fun compressPdf(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        val targetSizeBytes = call.getSafeLong("targetSizeBytes", 0L)
        val compressionLevel = call.getString("compressionLevel") ?: "balanced"
        val quality = call.getInt("quality") ?: 0

        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }

        val token = AtomicBoolean(false)
        activeCancellationTokens[jobId] = token

        startForegroundInternal("squishing PDF document…")

        pluginScope.launch {
            try {
                emitJobProgress(jobId, 0.05f, 0L, targetSizeBytes, "processing")

                val result = PdfProcessor.compressPdf(
                    context = context,
                    inputPath = inputPath,
                    targetSizeBytes = targetSizeBytes,
                    compressionLevel = compressionLevel,
                    quality = quality,
                    cancellationToken = token,
                    onProgress = { p ->
                        val pct = (p * 100).toInt()
                        updateForegroundInternal("squishing PDF… $pct%", pct)
                        emitJobProgress(
                            jobId = jobId,
                            progress = p,
                            bytesProcessed = 0L,
                            totalBytes = targetSizeBytes,
                            status = "processing"
                        )
                    }
                )

                stopForegroundInternal()
                emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")

                val response = JSObject().apply {
                    put("outputPath", result.outputPath)
                    put("pageCount", result.pageCount)
                    put("originalSizeBytes", result.originalSizeBytes)
                    put("compressedSizeBytes", result.compressedSizeBytes)
                }
                call.resolve(response)
            } catch (e: Exception) {
                stopForegroundInternal()
                emitJobProgress(jobId, 0f, 0L, 0L, "failed")
                call.reject("PDF compression failed: ${e.message}", e)
            } finally {
                activeCancellationTokens.remove(jobId)
            }
        }
    }

    /**
     * Extracts pages of a PDF document to individual image files.
     */
    @PluginMethod
    fun pdfToImages(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        val targetFormat = call.getString("targetFormat") ?: "jpg"

        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }

        val token = AtomicBoolean(false)
        activeCancellationTokens[jobId] = token

        startForegroundInternal("extracting PDF pages…")

        pluginScope.launch {
            try {
                emitJobProgress(jobId, 0.05f, 0L, 0L, "processing")

                val result = PdfProcessor.pdfToImages(
                    context = context,
                    inputPath = inputPath,
                    targetFormat = targetFormat,
                    cancellationToken = token,
                    onProgress = { p ->
                        val pct = (p * 100).toInt()
                        updateForegroundInternal("extracting PDF… $pct%", pct)
                        emitJobProgress(
                            jobId = jobId,
                            progress = p,
                            bytesProcessed = 0L,
                            totalBytes = 0L,
                            status = "processing"
                        )
                    }
                )

                stopForegroundInternal()
                emitJobProgress(jobId, 1.0f, result.totalSizeBytes, result.totalSizeBytes, "completed")

                val pagesArray = JSArray()
                result.imagePaths.forEach { pagesArray.put(it) }

                val response = JSObject().apply {
                    put("imagePaths", pagesArray)
                    put("pageCount", result.pageCount)
                    put("totalSizeBytes", result.totalSizeBytes)
                }
                call.resolve(response)
            } catch (e: Exception) {
                stopForegroundInternal()
                emitJobProgress(jobId, 0f, 0L, 0L, "failed")
                call.reject("PDF to images failed: ${e.message}", e)
            } finally {
                activeCancellationTokens.remove(jobId)
            }
        }
    }

    /**
     * Retrieves any files shared into the app via Android system share sheet.
     */
    @PluginMethod
    fun getIncomingShare(call: PluginCall) {
        val uris = JSArray()
        MainActivity.pendingSharedUris.forEach { uris.put(it) }
        val res = JSObject().apply {
            put("uris", uris)
            put("mimeType", MainActivity.pendingSharedMime ?: "")
            put("count", uris.length())
        }
        MainActivity.pendingSharedUris.clear()
        MainActivity.pendingSharedMime = null
        call.resolve(res)
    }

    /**
     * Saves a completed file to the public Android MediaStore (Pictures, Movies, Music, Download).
     */
    @PluginMethod
    fun saveToGallery(call: PluginCall) {
        val sourcePath = call.getString("sourcePath")
        val mediaType = call.getString("mediaType") ?: "image"
        val fileName = call.getString("fileName") ?: "squishh_${System.currentTimeMillis()}"

        if (sourcePath.isNullOrEmpty()) {
            call.reject("sourcePath is required")
            return
        }

        try {
            val exportedUri = MediaExporter.exportToSystem(context, sourcePath, mediaType, fileName)
            val res = JSObject().apply {
                put("success", true)
                put("uri", exportedUri)
            }
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("Failed to save to gallery: ${e.message}", e)
        }
    }

    /**
     * Native file sharing sheet via Android FileProvider.
     * Supports single or multiple file paths from internal disk cache.
     */
    @PluginMethod
    fun shareFiles(call: PluginCall) {
        val filePathsArray = call.getArray("filePaths")
        val title = call.getString("title") ?: "Squished with Squishh"

        val paths = mutableListOf<String>()
        if (filePathsArray != null) {
            for (i in 0 until filePathsArray.length()) {
                val p = filePathsArray.getString(i)
                if (!p.isNullOrEmpty()) paths.add(p)
            }
        }
        val single = call.getString("filePath")
        if (!single.isNullOrEmpty() && !paths.contains(single)) {
            paths.add(single)
        }

        if (paths.isEmpty()) {
            call.reject("No files provided to share")
            return
        }

        try {
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
                    val ext = file.extension.lowercase()
                    primaryMimeType = when (ext) {
                        "jpg", "jpeg" -> "image/jpeg"
                        "png" -> "image/png"
                        "webp" -> "image/webp"
                        "mp4" -> "video/mp4"
                        "mp3" -> "audio/mpeg"
                        "m4a" -> "audio/mp4"
                        "wav" -> "audio/wav"
                        "pdf" -> "application/pdf"
                        else -> if (ext.isNotEmpty()) "image/*" else "*/*"
                    }
                }
            }

            if (uris.isEmpty()) {
                call.reject("Specified file(s) do not exist on disk")
                return
            }

            val shareIntent = if (uris.size == 1) {
                Intent(Intent.ACTION_SEND).apply {
                    this.type = primaryMimeType
                    putExtra(Intent.EXTRA_STREAM, uris[0])
                    putExtra(Intent.EXTRA_TEXT, title)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            } else {
                Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                    this.type = if (primaryMimeType.startsWith("image/")) "image/*" else "*/*"
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                    putExtra(Intent.EXTRA_TEXT, title)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }

            val chooser = Intent.createChooser(shareIntent, title).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            (activity ?: context).startActivity(chooser)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            call.reject("Failed to share files: ${e.message}", e)
        }
    }

    /**
     * Cancel an active processing job from JS.
     */
    @PluginMethod
    fun cancelJob(call: PluginCall) {
        val jobId = call.getString("jobId")
        if (jobId.isNullOrEmpty()) {
            call.reject("jobId is required")
            return
        }

        activeCancellationTokens[jobId]?.set(true)
        stopForegroundInternal()

        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun startForegroundService(call: PluginCall) {
        val title = call.getString("title") ?: "squishing your files…"
        startForegroundInternal(title)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun updateForegroundProgress(call: PluginCall) {
        val title = call.getString("title") ?: "squishing your files…"
        val progress = call.getInt("progress") ?: 0
        updateForegroundInternal(title, progress)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun stopForegroundService(call: PluginCall) {
        stopForegroundInternal()
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun getAvailableStorage(call: PluginCall) {
        try {
            val freeBytes = context.cacheDir.freeSpace
            val res = JSObject().apply {
                put("freeBytes", freeBytes)
            }
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("Failed to query storage: ${e.message}", e)
        }
    }

    @PluginMethod
    fun clearCache(call: PluginCall) {
        pluginScope.launch(Dispatchers.IO) {
            try {
                CacheCleaner.clearAllCache(context)
                withContext(Dispatchers.Main) {
                    try {
                        bridge?.webView?.clearCache(true)
                    } catch (_: Exception) {}
                }
                val res = JSObject().apply {
                    put("success", true)
                    put("freeBytes", context.cacheDir.freeSpace)
                }
                call.resolve(res)
            } catch (e: Exception) {
                call.reject("Failed to clear cache: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun getCacheSizeBytes(call: PluginCall) {
        pluginScope.launch(Dispatchers.IO) {
            try {
                val internalSize = CacheCleaner.getFolderSize(context.cacheDir)
                val externalSize = context.externalCacheDir?.let { CacheCleaner.getFolderSize(it) } ?: 0L
                val totalCache = internalSize + externalSize
                val res = JSObject().apply {
                    put("cacheSizeBytes", totalCache)
                }
                call.resolve(res)
            } catch (e: Exception) {
                call.reject("Failed to get cache size: ${e.message}", e)
            }
        }
    }

    private fun startForegroundInternal(title: String) {
        try {
            val intent = Intent(context, SquishhProcessingService::class.java).apply {
                action = SquishhProcessingService.ACTION_START
                putExtra(SquishhProcessingService.EXTRA_TITLE, title)
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (_: Exception) {}
    }

    private fun updateForegroundInternal(title: String, progress: Int) {
        try {
            val intent = Intent(context, SquishhProcessingService::class.java).apply {
                action = SquishhProcessingService.ACTION_UPDATE
                putExtra(SquishhProcessingService.EXTRA_TITLE, title)
                putExtra(SquishhProcessingService.EXTRA_PROGRESS, progress)
            }
            context.startService(intent)
        } catch (_: Exception) {}
    }

    private fun stopForegroundInternal() {
        try {
            val intent = Intent(context, SquishhProcessingService::class.java).apply {
                action = SquishhProcessingService.ACTION_STOP
            }
            context.startService(intent)
        } catch (_: Exception) {}
    }

    private fun resultBytesEstimate(targetSize: Long, resultSize: Long): Long {
        return if (targetSize > 0) targetSize else if (resultSize > 0) resultSize else 1_000_000L
    }

    fun emitJobProgress(
        jobId: String,
        progress: Float,
        bytesProcessed: Long,
        totalBytes: Long,
        status: String,
        etaRemainingMs: Long = 0L
    ) {
        val event = JSObject().apply {
            put("jobId", jobId)
            put("progress", progress)
            put("bytesProcessed", bytesProcessed)
            put("totalBytes", totalBytes)
            put("status", status)
            put("etaRemainingMs", etaRemainingMs)
        }
        notifyListeners("jobProgress", event)
    }

    private fun PluginCall.getSafeLong(key: String, defaultValue: Long = 0L): Long {
        val value = this.data.opt(key) ?: return defaultValue
        return when (value) {
            is Number -> value.toLong()
            is String -> value.toLongOrNull() ?: defaultValue
            else -> defaultValue
        }
    }
}
