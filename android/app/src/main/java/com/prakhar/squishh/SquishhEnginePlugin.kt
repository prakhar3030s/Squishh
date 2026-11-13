package com.prakhar.squishh

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

@CapacitorPlugin(name = "SquishhEngine")
class SquishhEnginePlugin : Plugin(), KoinComponent {

    companion object {
        @Volatile
        private var activeInstance: SquishhEnginePlugin? = null

        /**
         * Emits `webFilesPicked` to JS after [MainActivity] intercepts a WebView file chooser
         * and copies selected `content://` URIs into app cache off the main thread.
         *
         * @param files Resolved local cache metadata emitted to JS listeners.
         */
        fun emitWebChooserFiles(files: List<ResolvedFileInfo>) {
            val instance = activeInstance ?: return
            val filesArray = JSArray()
            files.forEach { filesArray.put(it.toJSObject(includeUri = true)) }
            val payload = JSObject().apply {
                put("files", filesArray)
                put("count", filesArray.length())
            }
            instance.notifyListeners(BridgeEvents.WEB_FILES_PICKED, payload)
        }
    }

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val fileRepository: FileRepository by inject()
    private val cancellationManager: JobCancellationManager by inject()
    private val foregroundController: ForegroundProgressController by inject()
    private val shareHandler: ShareHandler by inject()
    private val imageProcessor: ImageProcessor by inject()
    private val videoProcessor: VideoProcessor by inject()
    private val audioProcessor: AudioProcessor by inject()
    private val pdfProcessor: PdfProcessor by inject()

    override fun load() {
        super.load()
        activeInstance = this
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        val action = intent.action
        if (Intent.ACTION_SEND == action || Intent.ACTION_SEND_MULTIPLE == action) {
            notifyListeners(BridgeEvents.INCOMING_SHARE_READY, JSObject())
        }
    }

    override fun handleOnDestroy() {
        if (activeInstance === this) {
            activeInstance = null
        }
        cancellationManager.cancelAll()
        foregroundController.stop()
        pluginScope.cancel()
        super.handleOnDestroy()
    }

    /**
     * Resolves an incoming Android `content://` or file URI into a readable cache file
     * without copying file blobs through the JS bridge.
     *
     * @param call Requires `uri` (String). Rejects if `uri` is missing or unreadable.
     * @return Resolves with [ResolvedFileInfo] (`localPath`, `displayName`, `sizeBytes`, `mimeType`).
     */
    @PluginMethod
    fun resolveFile(call: PluginCall) {
        val uriString = call.getString("uri")
        if (uriString.isNullOrEmpty()) {
            call.reject("URI cannot be empty")
            return
        }

        pluginScope.launch {
            try {
                val result = fileRepository.resolveUriToCache(uriString)
                call.resolve(result.toJSObject())
            } catch (e: Exception) {
                call.reject("Failed to resolve content URI: ${e.message}", e)
            }
        }
    }

    /**
     * Launches the system `ACTION_GET_CONTENT` file picker and resolves chosen URIs into cache.
     *
     * @param call Accepts optional `type` (MIME filter, default wildcard any-type) and `multiple` (Boolean, default `false`).
     * @return Handled via [pickFilesCallback] resolving `{ files: ResolvedFileInfo[], count: Int }`.
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

    /**
     * Activity result handler for [pickFiles]; copies selected URIs into local cache on [Dispatchers.IO].
     *
     * @param call Pending Capacitor call saved by `startActivityForResult`.
     * @param result Activity result containing selected single `data` or `clipData` URIs.
     */
    @ActivityCallback
    fun pickFilesCallback(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) {
            call.resolve(JSObject().apply {
                put("files", JSArray())
                put("count", 0)
            })
            return
        }

        val intent = result.data
        val uris = mutableListOf<String>()
        intent?.clipData?.let { clipData ->
            for (i in 0 until clipData.itemCount) {
                clipData.getItemAt(i).uri?.toString()?.let { uris.add(it) }
            }
        } ?: intent?.data?.toString()?.let { uri ->
            uris.add(uri)
        }

        if (uris.isEmpty()) {
            call.resolve(JSObject().apply {
                put("files", JSArray())
                put("count", 0)
            })
            return
        }

        pluginScope.launch {
            try {
                val resolved = fileRepository.resolveUrisToCache(uris)
                val filesArray = JSArray()
                resolved.forEach { filesArray.put(it.toJSObject(includeUri = true)) }
                call.resolve(JSObject().apply {
                    put("files", filesArray)
                    put("count", filesArray.length())
                })
            } catch (e: Exception) {
                call.reject("Failed to resolve picked files: ${e.message}", e)
            }
        }
    }

    /**
     * Compresses or converts a single image off the main thread with optional target byte limit.
     *
     * @param call Requires `inputPath` (String); optional `jobId`, `targetFormat` (`"jpg"` default),
     *   `quality` (`5..100`, default `80`), and `targetSizeBytes` (`0` disables binary search).
     * @return Resolves with [ImageCompressionResult] or rejects if missing input, cancelled, or I/O fails.
     */
    @PluginMethod
    fun processImage(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }
        val targetFormat = call.getString("targetFormat") ?: "jpg"
        val quality = call.getInt("quality") ?: 80
        val targetSizeBytes = call.getSafeLong("targetSizeBytes", 0L)

        launchSingleJob(
            call = call,
            jobId = jobId,
            errorPrefix = "Image processing failed"
        ) { token ->
            val result = imageProcessor.process(
                inputPath = inputPath,
                targetFormat = targetFormat,
                quality = quality,
                targetSizeBytes = targetSizeBytes,
                cancellationToken = token,
                onProgress = { p ->
                    emitJobProgress(
                        jobId = jobId,
                        progress = p,
                        bytesProcessed = (resultBytesEstimate(targetSizeBytes) * p).toLong(),
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
            result.toJSObject()
        }
    }

    /**
     * Compresses multiple images concurrently under a foreground notification service.
     *
     * @param call Requires non-empty `items` array of image option objects; optional `batchId`.
     * @return Resolves with `{ batchId, results: ImageCompressionResult[], count }` or rejects if
     *   `items` is missing/empty, all items fail, or the batch is cancelled.
     */
    @PluginMethod
    fun batchProcessImages(call: PluginCall) {
        val batchId = call.getString("batchId") ?: UUID.randomUUID().toString()
        val itemsArray = call.getArray("items")
        if (itemsArray == null || itemsArray.length() == 0) {
            call.reject("items array is required")
            return
        }

        val totalItems = itemsArray.length()
        val childIds = (0 until totalItems).map { i ->
            itemsArray.getJSONObject(i).optString("jobId", "$batchId-$i")
        }
        val batchToken = cancellationManager.registerBatch(batchId, childIds)

        pluginScope.launch {
            try {
                val results = JSArray()
                val completedCount = AtomicInteger(0)

                foregroundController.start("squishing $totalItems photos…")

                coroutineScope {
                    val deferredList = (0 until totalItems).map { i ->
                        val itemObj = itemsArray.getJSONObject(i)
                        val inputPath = itemObj.getString("inputPath")
                        val targetFormat = itemObj.optString("targetFormat", "jpg")
                        val quality = itemObj.optInt("quality", 80)
                        val targetSizeBytes = itemObj.optLong("targetSizeBytes", 0L)
                        val itemId = childIds[i]
                        val itemToken = cancellationManager.tokenFor(itemId) ?: AtomicBoolean(false)

                        async(Dispatchers.IO) {
                            try {
                                if (batchToken.get() || itemToken.get()) {
                                    throw InterruptedException("Batch job cancelled")
                                }
                                val res = imageProcessor.process(
                                    inputPath = inputPath,
                                    targetFormat = targetFormat,
                                    quality = quality,
                                    targetSizeBytes = targetSizeBytes,
                                    cancellationToken = itemToken,
                                    onProgress = { itemP ->
                                        val overallP = (completedCount.get() + itemP) / totalItems
                                        val pct = (overallP * 100).toInt().coerceIn(0, 100)
                                        foregroundController.update(
                                            "squishing photo ${completedCount.get() + 1} of $totalItems… $pct%",
                                            pct
                                        )
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
                                emitJobProgress(
                                    jobId = itemId,
                                    progress = 1.0f,
                                    bytesProcessed = res.compressedSizeBytes,
                                    totalBytes = res.compressedSizeBytes,
                                    status = "completed"
                                )
                                Pair(itemId, res)
                            } catch (e: InterruptedException) {
                                if (batchToken.get()) {
                                    throw e
                                }
                                completedCount.incrementAndGet()
                                emitJobProgress(itemId, 0f, 0L, 0L, "cancelled")
                                null
                            } finally {
                                cancellationManager.unregisterJob(itemId)
                            }
                        }
                    }

                    deferredList.forEach { deferred ->
                        val itemPair = deferred.await()
                        if (itemPair != null) {
                            val (itemId, result) = itemPair
                            results.put(result.toJSObject(jobId = itemId))
                        }
                    }
                }

                if (batchToken.get() || results.length() == 0) {
                    throw InterruptedException("Batch job cancelled")
                }

                foregroundController.stop()
                call.resolve(JSObject().apply {
                    put("batchId", batchId)
                    put("results", results)
                    put("count", results.length())
                })
            } catch (e: Exception) {
                foregroundController.stop()
                call.reject("Batch image processing failed: ${e.message}", e)
            } finally {
                cancellationManager.unregisterBatch(batchId, childIds)
            }
        }
    }

    /**
     * Hardware-accelerated video transcoding (Media3 H.264/AAC) or animated GIF export.
     *
     * @param call Requires `inputPath`; optional `jobId`, `compressionLevel` (`light`/`balanced`/`high`),
     *   `resolution`, `fpsLimit`, `muteAudio`, and `asGif`.
     * @return Resolves with [VideoCompressionResult] or rejects on invalid input, cancellation, or codec failure.
     */
    @PluginMethod
    fun processVideo(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }
        val compressionLevel = call.getString("compressionLevel") ?: ""
        val resolution = call.getString("resolution") ?: "original"
        val fpsLimit = call.getInt("fpsLimit") ?: 0
        val muteAudio = call.getBoolean("muteAudio") ?: false
        val asGif = call.getBoolean("asGif") ?: false

        launchSingleJob(
            call = call,
            jobId = jobId,
            foregroundTitle = if (asGif) "creating animated GIF…" else "squishing video…",
            errorPrefix = "Video processing failed"
        ) { token ->
            val origSize = File(inputPath).let { if (it.exists()) it.length() else 0L }
            val estTotalBytes = (origSize * VideoProcessor.estimatedSizeRatio(compressionLevel)).toLong()

            emitJobProgress(jobId, 0.02f, 0L, estTotalBytes, "processing")

            val result = videoProcessor.process(
                inputPath = inputPath,
                compressionLevel = compressionLevel,
                resolution = resolution,
                fpsLimit = fpsLimit,
                muteAudio = muteAudio,
                asGif = asGif,
                cancellationToken = token,
                onProgress = { p, etaMs ->
                    val pct = (p * 100).toInt()
                    foregroundController.update("squishing video… $pct%", pct)
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
            emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")
            result.toJSObject()
        }
    }

    /**
     * Transcodes audio (or extracts soundtrack from video) into an M4A (AAC) container.
     *
     * @param call Requires `inputPath`; optional `jobId`, `targetFormat` (`"m4a"`), `bitrateKbps` (`128` default),
     *   `monoDownmix`, and `extractFromVideo`.
     * @return Resolves with [AudioCompressionResult] or rejects if input is missing, cancelled, or export fails.
     */
    @PluginMethod
    fun processAudio(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }
        val targetFormat = call.getString("targetFormat") ?: "m4a"
        val bitrateKbps = call.getInt("bitrateKbps") ?: 128
        val monoDownmix = call.getBoolean("monoDownmix") ?: false
        val extractFromVideo = call.getBoolean("extractFromVideo") ?: false

        launchSingleJob(
            call = call,
            jobId = jobId,
            foregroundTitle = if (extractFromVideo) "extracting soundtrack…" else "squishing audio…",
            errorPrefix = "Audio processing failed"
        ) { token ->
            val result = audioProcessor.process(
                inputPath = inputPath,
                targetFormat = targetFormat,
                bitrateKbps = bitrateKbps,
                monoDownmix = monoDownmix,
                extractFromVideo = extractFromVideo,
                cancellationToken = token,
                onProgress = { p ->
                    val pct = (p * 100).toInt()
                    foregroundController.update("squishing audio… $pct%", pct)
                    emitJobProgress(jobId, p, 0L, 0L, "processing")
                }
            )
            emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")
            result.toJSObject()
        }
    }

    /**
     * Combines an ordered list of image file paths into a multi-page PDF document.
     *
     * @param call Requires non-empty `imagePaths` string array; optional `jobId`.
     * @return Resolves with [PdfCompressionResult] or rejects if `imagePaths` is empty, cancelled, or fails.
     */
    @PluginMethod
    fun imagesToPdf(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val imagesArray = call.getArray("imagePaths")
        if (imagesArray == null || imagesArray.length() == 0) {
            call.reject("imagePaths array is required")
            return
        }

        val paths = List(imagesArray.length()) { i -> imagesArray.getString(i) }

        launchSingleJob(
            call = call,
            jobId = jobId,
            foregroundTitle = "generating PDF document…",
            errorPrefix = "Images to PDF failed"
        ) { token ->
            val result = pdfProcessor.imagesToPdf(
                imagePaths = paths,
                cancellationToken = token,
                onProgress = { p ->
                    val pct = (p * 100).toInt()
                    foregroundController.update("generating PDF… $pct%", pct)
                    emitJobProgress(jobId, p, 0L, 0L, "processing")
                }
            )
            emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")
            result.toJSObject()
        }
    }

    /**
     * Compresses an existing PDF document according to the selected preset level.
     *
     * @param call Requires `inputPath`; optional `jobId` and `compressionLevel` (`light`/`balanced`/`highly`).
     * @return Resolves with [PdfCompressionResult] or rejects on unreadable PDF, cancellation, or error.
     */
    @PluginMethod
    fun compressPdf(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }
        val compressionLevel = call.getString("compressionLevel") ?: "balanced"

        launchSingleJob(
            call = call,
            jobId = jobId,
            foregroundTitle = "squishing PDF document…",
            errorPrefix = "PDF compression failed"
        ) { token ->
            val result = pdfProcessor.compressPdf(
                inputPath = inputPath,
                compressionLevel = compressionLevel,
                cancellationToken = token,
                onProgress = { p ->
                    val pct = (p * 100).toInt()
                    foregroundController.update("squishing PDF… $pct%", pct)
                    emitJobProgress(jobId, p, 0L, 0L, "processing")
                }
            )
            emitJobProgress(jobId, 1.0f, result.compressedSizeBytes, result.compressedSizeBytes, "completed")
            result.toJSObject()
        }
    }

    /**
     * Renders every page of a PDF document into individual image files.
     *
     * @param call Requires `inputPath`; optional `jobId` and `targetFormat` (`"jpg"` or `"png"`).
     * @return Resolves with [PdfToImagesResult] or rejects on invalid PDF, cancellation, or I/O failure.
     */
    @PluginMethod
    fun pdfToImages(call: PluginCall) {
        val jobId = call.getString("jobId") ?: UUID.randomUUID().toString()
        val inputPath = call.getString("inputPath")
        if (inputPath.isNullOrEmpty()) {
            call.reject("inputPath is required")
            return
        }
        val targetFormat = call.getString("targetFormat") ?: "jpg"

        launchSingleJob(
            call = call,
            jobId = jobId,
            foregroundTitle = "extracting PDF pages…",
            errorPrefix = "PDF to images failed"
        ) { token ->
            val result = pdfProcessor.pdfToImages(
                inputPath = inputPath,
                targetFormat = targetFormat,
                cancellationToken = token,
                onProgress = { p ->
                    val pct = (p * 100).toInt()
                    foregroundController.update("extracting PDF… $pct%", pct)
                    emitJobProgress(jobId, p, 0L, 0L, "processing")
                }
            )
            emitJobProgress(jobId, 1.0f, result.totalSizeBytes, result.totalSizeBytes, "completed")
            result.toJSObject()
        }
    }

    /**
     * Consumes and returns any files shared into Squishh via Android `ACTION_SEND` / `ACTION_SEND_MULTIPLE`.
     *
     * @param call Capacitor call with no required arguments.
     * @return Resolves with [IncomingSharePayload] (`uris`, `mimeType`, `count`).
     */
    @PluginMethod
    fun getIncomingShare(call: PluginCall) {
        val (sharedUris, sharedMime) = MainActivity.consumePendingShare()
        call.resolve(IncomingSharePayload(sharedUris, sharedMime).toJSObject())
    }

    /**
     * Exports a processed output file into public Android MediaStore folders (`Pictures`, `Movies`, `Music`, `Download`).
     *
     * @param call Requires `sourcePath`; accepts `mediaType` (`image`/`video`/`audio`/`pdf`) and `fileName`.
     * @return Resolves with [SaveResultPayload] (`success`, `uri`) or rejects if export fails.
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

        pluginScope.launch {
            try {
                val exportedUri = fileRepository.exportToSystem(sourcePath, mediaType, fileName)
                call.resolve(SaveResultPayload(success = true, uri = exportedUri).toJSObject())
            } catch (e: Exception) {
                call.reject("Failed to save to gallery: ${e.message}", e)
            }
        }
    }

    /**
     * Opens the Android system share sheet for one or more local files using `FileProvider`.
     * File existence checks and `FileProvider.getUriForFile` run off the main thread on [Dispatchers.IO] (PERF-007).
     *
     * @param call Accepts `filePaths` (`String[]`) and/or `filePath` (`String`), plus optional chooser `title`.
     * @return Resolves with `{ success: true }` or rejects if no readable file paths are supplied.
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

        pluginScope.launch {
            try {
                shareHandler.shareFiles(paths, title, activity)
                call.resolve(JSObject().apply { put("success", true) })
            } catch (e: Exception) {
                call.reject("Failed to share files: ${e.message}", e)
            }
        }
    }

    /**
     * Requests cancellation of an active single or batch job by `jobId` and clears foreground UI if idle.
     *
     * @param call Requires `jobId` (String). Rejects if `jobId` is empty.
     * @return Resolves with `{ success: true }`.
     */
    @PluginMethod
    fun cancelJob(call: PluginCall) {
        val jobId = call.getString("jobId")
        if (jobId.isNullOrEmpty()) {
            call.reject("jobId is required")
            return
        }

        val shouldStopForeground = cancellationManager.cancel(jobId)
        if (shouldStopForeground) {
            foregroundController.stop()
        }
        call.resolve(JSObject().apply { put("success", true) })
    }

    /**
     * Queries available free bytes on external storage off the main thread.
     *
     * @param call Capacitor call with no required arguments.
     * @return Resolves with [StorageInfoPayload] (`freeBytes`) or rejects if storage stats fail.
     */
    @PluginMethod
    fun getAvailableStorage(call: PluginCall) {
        pluginScope.launch {
            try {
                val freeBytes = fileRepository.queryAvailableStorageBytes()
                call.resolve(StorageInfoPayload(freeBytes).toJSObject())
            } catch (e: Exception) {
                call.reject("Failed to query storage: ${e.message}", e)
            }
        }
    }

    /**
     * Deletes temporary cache artifacts, clears WebView cache on the main thread, and returns updated free storage.
     *
     * @param call Capacitor call with no required arguments.
     * @return Resolves with `{ success: true, freeBytes }` or rejects on failure.
     */
    @PluginMethod
    fun clearCache(call: PluginCall) {
        pluginScope.launch {
            try {
                fileRepository.clearAllCacheSuspended()
                withContext(Dispatchers.Main) {
                    try {
                        bridge?.webView?.clearCache(true)
                    } catch (_: Exception) {}
                }
                val freeBytes = fileRepository.queryAvailableStorageBytes()
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("freeBytes", freeBytes)
                })
            } catch (e: Exception) {
                call.reject("Failed to clear cache: ${e.message}", e)
            }
        }
    }

    private fun launchSingleJob(
        call: PluginCall,
        jobId: String,
        foregroundTitle: String? = null,
        errorPrefix: String,
        block: suspend (AtomicBoolean) -> JSObject
    ) {
        val token = cancellationManager.registerJob(jobId)
        if (foregroundTitle != null) {
            foregroundController.start(foregroundTitle)
        }

        pluginScope.launch {
            try {
                emitJobProgress(jobId, 0.05f, 0L, 0L, "processing")
                val response = block(token)
                if (foregroundTitle != null) {
                    foregroundController.stop()
                }
                call.resolve(response)
            } catch (e: Exception) {
                if (foregroundTitle != null) {
                    foregroundController.stop()
                }
                emitJobProgress(jobId, 0f, 0L, 0L, "failed")
                call.reject("$errorPrefix: ${e.message}", e)
            } finally {
                cancellationManager.unregisterJob(jobId)
            }
        }
    }

    private fun resultBytesEstimate(targetSize: Long): Long =
        if (targetSize > 0) targetSize else 1_000_000L

    /**
     * Emits a `jobProgress` bridge event to registered JS listeners.
     *
     * @param jobId Identifier of the job reporting progress.
     * @param progress Normalized fraction (`0.0f..1.0f`).
     * @param bytesProcessed Estimated or final bytes processed.
     * @param totalBytes Estimated or final total bytes.
     * @param status Job status (`"processing"`, `"completed"`, `"failed"`, or `"cancelled"`).
     * @param etaRemainingMs Estimated milliseconds remaining (`0L` when unknown).
     */
    fun emitJobProgress(
        jobId: String,
        progress: Float,
        bytesProcessed: Long,
        totalBytes: Long,
        status: String,
        etaRemainingMs: Long = 0L
    ) {
        val event = JobProgressEvent(
            jobId = jobId,
            progress = progress,
            bytesProcessed = bytesProcessed,
            totalBytes = totalBytes,
            status = status,
            etaRemainingMs = etaRemainingMs
        ).toJSObject()
        notifyListeners(BridgeEvents.JOB_PROGRESS, event)
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
