package com.prakhar.squishh

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicBoolean

class VideoProcessor(
    private val context: Context,
    private val fileRepository: FileRepository
) {

    companion object {
        const val LIGHT_SIZE_RATIO = 0.75f
        const val BALANCED_SIZE_RATIO = 0.50f
        const val HIGH_SIZE_RATIO = 0.22f
        const val DEFAULT_ESTIMATE_SIZE_RATIO = 0.60f

        private const val MIN_SOURCE_BITRATE_BPS = 300_000
        private const val MAX_SOURCE_BITRATE_BPS = 50_000_000

        private const val LIGHT_OVERHEAD_FACTOR = 0.92f
        private const val BALANCED_OVERHEAD_FACTOR = 0.90f
        private const val HIGH_OVERHEAD_FACTOR = 0.88f

        private const val LIGHT_AUDIO_BITRATE_BPS = 128_000
        private const val BALANCED_AUDIO_BITRATE_BPS = 96_000
        private const val HIGH_AUDIO_BITRATE_BPS = 64_000

        private const val MIN_LIGHT_VIDEO_BITRATE_BPS = 350_000
        private const val MIN_BALANCED_VIDEO_BITRATE_BPS = 250_000
        private const val MIN_HIGH_VIDEO_BITRATE_BPS = 180_000
        private const val HIGH_LOW_BITRATE_THRESHOLD_BPS = 320_000

        private const val RESOLUTION_ORIG_BITRATE_CAP_RATIO = 0.75f
        private const val HIGH_CAP_BITRATE_RATIO = 0.25f
        private const val HIGH_FPS_THRESHOLD = 50
        private const val HIGH_COMPRESSION_FPS_CAP = 30

        // Ordered bitrate tiers matching UI resolutions: 360p, 480p, 720p, and >720p.
        private data class BitrateTier(val maxHeight: Int, val standardFpsBps: Int, val highFpsBps: Int)

        private val RESOLUTION_BITRATE_SCALES = arrayOf(
            BitrateTier(maxHeight = 360, standardFpsBps = 450_000, highFpsBps = 650_000),
            BitrateTier(maxHeight = 480, standardFpsBps = 700_000, highFpsBps = 950_000),
            BitrateTier(maxHeight = 720, standardFpsBps = 1_400_000, highFpsBps = 2_000_000),
            BitrateTier(maxHeight = Int.MAX_VALUE, standardFpsBps = 2_400_000, highFpsBps = 3_500_000)
        )

        private const val GIF_MAX_DURATION_MS = 10_000L
        private const val GIF_DEFAULT_DURATION_MS = 5_000L
        private const val GIF_FRAME_RATE = 10
        private const val GIF_MIN_FRAMES = 5
        private const val GIF_MAX_FRAMES = 60
        private const val GIF_TARGET_WIDTH_PX = 360

        fun estimatedSizeRatio(compressionLevel: String): Float = when (compressionLevel) {
            "light" -> LIGHT_SIZE_RATIO
            "balanced" -> BALANCED_SIZE_RATIO
            "high" -> HIGH_SIZE_RATIO
            else -> DEFAULT_ESTIMATE_SIZE_RATIO
        }

        fun calculateTargetVideoBitrate(
            originalSizeBytes: Long,
            durationMs: Long,
            origHeight: Int,
            compressionLevel: String,
            resolution: String = "original",
            fpsLimit: Int = 0,
            muteAudio: Boolean = false
        ): Int {
            val durationSec = (durationMs / 1000f).coerceAtLeast(1.0f)
            val origBitrate = ((originalSizeBytes * 8L) / durationSec).toInt()
                .coerceIn(MIN_SOURCE_BITRATE_BPS, MAX_SOURCE_BITRATE_BPS)

            val effectiveTargetBytes = when {
                compressionLevel == "light" -> (originalSizeBytes * LIGHT_SIZE_RATIO).toLong()
                compressionLevel == "balanced" -> (originalSizeBytes * BALANCED_SIZE_RATIO).toLong()
                compressionLevel == "high" -> (originalSizeBytes * HIGH_SIZE_RATIO).toLong()
                else -> 0L
            }

            return when {
                compressionLevel == "light" -> {
                    val audioBitrate = if (muteAudio) 0 else LIGHT_AUDIO_BITRATE_BPS
                    val targetTotalBitrate = ((effectiveTargetBytes * LIGHT_OVERHEAD_FACTOR * 8L) / durationSec).toInt()
                    (targetTotalBitrate - audioBitrate).coerceIn(
                        MIN_LIGHT_VIDEO_BITRATE_BPS,
                        (origBitrate * LIGHT_SIZE_RATIO).toInt().coerceAtLeast(MIN_LIGHT_VIDEO_BITRATE_BPS)
                    )
                }
                compressionLevel == "balanced" -> {
                    val audioBitrate = if (muteAudio) 0 else BALANCED_AUDIO_BITRATE_BPS
                    val targetTotalBitrate = ((effectiveTargetBytes * BALANCED_OVERHEAD_FACTOR * 8L) / durationSec).toInt()
                    (targetTotalBitrate - audioBitrate).coerceIn(
                        MIN_BALANCED_VIDEO_BITRATE_BPS,
                        (origBitrate * BALANCED_SIZE_RATIO).toInt().coerceAtLeast(MIN_BALANCED_VIDEO_BITRATE_BPS)
                    )
                }
                compressionLevel == "high" -> {
                    val audioBitrate = if (muteAudio) 0 else HIGH_AUDIO_BITRATE_BPS
                    val targetTotalBitrate = ((effectiveTargetBytes * HIGH_OVERHEAD_FACTOR * 8L) / durationSec).toInt()
                    (targetTotalBitrate - audioBitrate).coerceIn(
                        MIN_HIGH_VIDEO_BITRATE_BPS,
                        (origBitrate * HIGH_CAP_BITRATE_RATIO).toInt().coerceAtLeast(MIN_HIGH_VIDEO_BITRATE_BPS)
                    )
                }
                else -> {
                    val targetNominalHeight = when (resolution) {
                        "360p" -> 360
                        "480p" -> 480
                        "720p" -> 720
                        "1080p" -> 1080
                        else -> origHeight
                    }
                    val effectiveH = minOf(origHeight, targetNominalHeight)
                    val tier = RESOLUTION_BITRATE_SCALES.first { effectiveH <= it.maxHeight }
                    val nominalBitrate = if (fpsLimit >= HIGH_FPS_THRESHOLD) tier.highFpsBps else tier.standardFpsBps
                    minOf(
                        nominalBitrate,
                        (origBitrate * RESOLUTION_ORIG_BITRATE_CAP_RATIO).toInt().coerceAtLeast(MIN_BALANCED_VIDEO_BITRATE_BPS)
                    )
                }
            }
        }
    }

    suspend fun process(
        inputPath: String,
        compressionLevel: String = "", // "light", "balanced", "high"
        resolution: String = "original", // "original", "1080p", "720p", "480p"
        fpsLimit: Int = 0,
        muteAudio: Boolean = false,
        asGif: Boolean = false,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float, etaRemainingMs: Long) -> Unit)? = null
    ): VideoCompressionResult = withContext(Dispatchers.IO) {
        val inputFile = fileRepository.requireReadableInputFile(inputPath, "Input video file")
        val originalSizeBytes = inputFile.length()

        // Extract metadata using MediaMetadataRetriever
        val retriever = MediaMetadataRetriever()
        var durationMs = 0L
        var origWidth = 1280
        var origHeight = 720

        try {
            retriever.setDataSource(inputFile.absolutePath)
            durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            origWidth = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 1280
            origHeight = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 720
        } catch (_: Exception) {
        } finally {
            try { retriever.release() } catch (_: Exception) {}
        }

        // Branch 1: Video to Animated GIF
        if (asGif) {
            val gifFile = fileRepository.allocateOutputFile("squishh_anim", "gif")
            val (gifWidth, gifHeight) = extractAndEncodeGif(
                inputFile = inputFile,
                outputFile = gifFile,
                durationMs = durationMs,
                cancellationToken = cancellationToken,
                onProgress = onProgress
            )
            return@withContext VideoCompressionResult(
                outputPath = gifFile.absolutePath,
                originalSizeBytes = originalSizeBytes,
                compressedSizeBytes = gifFile.length(),
                durationMs = durationMs,
                width = gifWidth,
                height = gifHeight,
                isGif = true
            )
        }

        // Branch 2: Hardware Accelerated Video Transcoding via Media3 Transformer
        val outputFile = fileRepository.allocateOutputFile("squishh_video", "mp4")
        val deferred = CompletableDeferred<ExportResult>()

        val durationSec = (durationMs / 1000f).coerceAtLeast(1.0f)
        val origBitrate = ((originalSizeBytes * 8L) / durationSec).toInt()
            .coerceIn(MIN_SOURCE_BITRATE_BPS, MAX_SOURCE_BITRATE_BPS)

        // Effective Target Size Cap: In Squishh, compression must never make the file larger!
        val effectiveTargetBytes = when {
            compressionLevel == "light" -> (originalSizeBytes * LIGHT_SIZE_RATIO).toLong()
            compressionLevel == "balanced" -> (originalSizeBytes * BALANCED_SIZE_RATIO).toLong()
            compressionLevel == "high" -> (originalSizeBytes * HIGH_SIZE_RATIO).toLong()
            else -> 0L
        }

        // Calculate target video bitrate
        val videoBitrate = calculateTargetVideoBitrate(
            originalSizeBytes = originalSizeBytes,
            durationMs = durationMs,
            origHeight = origHeight,
            compressionLevel = compressionLevel,
            resolution = resolution,
            fpsLimit = fpsLimit,
            muteAudio = muteAudio
        )

        android.util.Log.i("VideoProcessor", "Starting transcode: level=$compressionLevel, duration=${durationSec}s, origBitrate=$origBitrate, effectiveTargetBytes=$effectiveTargetBytes, videoBitrate=$videoBitrate")

        // Target resolution dimension calculation and frame rate control
        val effectsList = mutableListOf<androidx.media3.common.Effect>()
        val isPortrait = origHeight > origWidth
        val targetHeight = when {
            compressionLevel == "light" -> {
                if (isPortrait) 1920 else 1080
            }
            compressionLevel == "balanced" -> {
                if (isPortrait) 1280 else 720
            }
            compressionLevel == "high" -> {
                if (videoBitrate < HIGH_LOW_BITRATE_THRESHOLD_BPS) (if (isPortrait) 640 else 360) else (if (isPortrait) 854 else 480)
            }
            resolution == "360p" -> if (isPortrait) 640 else 360
            resolution == "480p" -> if (isPortrait) 854 else 480
            resolution == "720p" -> if (isPortrait) 1280 else 720
            resolution == "1080p" -> if (isPortrait) 1920 else 1080
            else -> 0
        }

        val effectiveFpsLimit = when {
            fpsLimit > 0 -> fpsLimit
            compressionLevel == "high" -> HIGH_COMPRESSION_FPS_CAP
            else -> 0
        }

        if (targetHeight > 0 && origHeight > targetHeight) {
            effectsList.add(androidx.media3.effect.Presentation.createForHeight(targetHeight))
        }

        if (effectiveFpsLimit > 0) {
            effectsList.add(androidx.media3.effect.FrameDropEffect.createDefaultFrameDropEffect(effectiveFpsLimit.toFloat()))
        }

        // CRITICAL FIX: Media3 Transformer skips re-encoding (remuxes) if effectsList is empty and formats match.
        // Adding an identity transformation forces the pipeline through OpenGL and forces DefaultEncoderFactory
        // to re-encode the stream at the requested videoBitrate!
        if (effectsList.isEmpty()) {
            effectsList.add(ScaleAndRotateTransformation.Builder().build())
        }

        val editedMediaItem = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(inputFile)))
            .setRemoveAudio(muteAudio)
            .setEffects(Effects(emptyList(), effectsList))
            .build()

        var transformerInstance: Transformer? = null

        withContext(Dispatchers.Main) {
            val encoderSettings = VideoEncoderSettings.Builder()
                .setBitrate(videoBitrate)
                .build()

            val encoderFactory = DefaultEncoderFactory.Builder(context.applicationContext)
                .setEnableFallback(true)
                .setRequestedVideoEncoderSettings(encoderSettings)
                .build()

            val transformer = Transformer.Builder(context.applicationContext)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .setEncoderFactory(encoderFactory)
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                        deferred.complete(exportResult)
                    }

                    override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                        deferred.completeExceptionally(exportException)
                    }
                })
                .build()

            transformerInstance = transformer
            transformer.start(editedMediaItem, outputFile.absolutePath)
        }

        // Progress polling loop
        val progressHolder = ProgressHolder()
        val startTime = System.currentTimeMillis()

        while (!deferred.isCompleted) {
            if (cancellationToken?.get() == true) {
                withContext(Dispatchers.Main) {
                    transformerInstance?.cancel()
                }
                outputFile.delete()
                throw InterruptedException("Video transcoding cancelled by user")
            }

            withContext(Dispatchers.Main) {
                transformerInstance?.getProgress(progressHolder)
            }

            val progressRatio = progressHolder.progress / 100f
            if (progressRatio > 0.05f) {
                val elapsed = System.currentTimeMillis() - startTime
                val totalEstimated = (elapsed / progressRatio).toLong()
                val etaRemaining = (totalEstimated - elapsed).coerceAtLeast(0L)
                onProgress?.invoke(progressRatio, etaRemaining)
            }

            kotlinx.coroutines.delay(200)
        }

        deferred.await()

        // Anti-ballooning guard: ensure output is never larger than the original
        if (outputFile.exists() && outputFile.length() >= originalSizeBytes) {
            if (inputFile.extension.equals("mp4", ignoreCase = true)) {
                // Same container: copy the original over the larger output.
                inputFile.copyTo(outputFile, overwrite = true)
            } else {
                // Different container: the transcode did not reduce size, so keep the
                // original file (in its own format) instead of returning a larger MP4.
                val originalExt = inputFile.extension.ifEmpty { "mp4" }
                val fallbackFile = fileRepository.allocateOutputFile("squishh_video", originalExt)
                inputFile.copyTo(fallbackFile, overwrite = true)
                outputFile.delete()
                onProgress?.invoke(1.0f, 0L)
                return@withContext VideoCompressionResult(
                    outputPath = fallbackFile.absolutePath,
                    originalSizeBytes = originalSizeBytes,
                    compressedSizeBytes = fallbackFile.length(),
                    durationMs = durationMs,
                    width = origWidth,
                    height = origHeight,
                    isGif = false
                )
            }
        }

        onProgress?.invoke(1.0f, 0L)

        return@withContext VideoCompressionResult(
            outputPath = outputFile.absolutePath,
            originalSizeBytes = originalSizeBytes,
            compressedSizeBytes = outputFile.length(),
            durationMs = durationMs,
            width = origWidth,
            height = origHeight,
            isGif = false
        )
    }

    /**
     * Samples frames from video and writes an optimized animated GIF.
     */
    /**
     * Streams frames directly from MediaMetadataRetriever into the animated GIF output file
     * one bitmap at a time, eliminating multi-frame Bitmap heap buffering (PERF-006).
     */
    private fun extractAndEncodeGif(
        inputFile: File,
        outputFile: File,
        durationMs: Long,
        cancellationToken: AtomicBoolean?,
        onProgress: ((progress: Float, etaRemainingMs: Long) -> Unit)?
    ): Pair<Int, Int> {
        val retriever = MediaMetadataRetriever()
        var completed = false
        try {
            retriever.setDataSource(inputFile.absolutePath)
            val totalDuration = if (durationMs > 0) durationMs.coerceAtMost(GIF_MAX_DURATION_MS) else GIF_DEFAULT_DURATION_MS
            val frameRate = GIF_FRAME_RATE
            val frameCount = ((totalDuration / 1000f) * frameRate).toInt().coerceIn(GIF_MIN_FRAMES, GIF_MAX_FRAMES)
            val intervalUs = (totalDuration * 1000L) / frameCount
            val delayUnits = ((1000 / frameRate) / 10).coerceAtLeast(2)

            var gifWidth = 0
            var gifHeight = 0
            var headerWritten = false
            var pixels: IntArray? = null
            var indexedPixels: ByteArray? = null

            BufferedOutputStream(FileOutputStream(outputFile)).use { out ->
                for (i in 0 until frameCount) {
                    if (cancellationToken?.get() == true) {
                        throw InterruptedException("GIF export cancelled")
                    }
                    val timeUs = i * intervalUs
                    val rawFrame = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                    if (rawFrame != null) {
                        val targetW = if (gifWidth > 0) gifWidth else GIF_TARGET_WIDTH_PX
                        val srcW = rawFrame.width.coerceAtLeast(1)
                        val targetH = if (gifHeight > 0) gifHeight else (GIF_TARGET_WIDTH_PX.toFloat() * (rawFrame.height.toFloat() / srcW)).toInt().coerceAtLeast(1)
                        val scaled = Bitmap.createScaledBitmap(rawFrame, targetW, targetH, true)
                        if (scaled != rawFrame) rawFrame.recycle()

                        try {
                            if (!headerWritten) {
                                gifWidth = scaled.width
                                gifHeight = scaled.height
                                writeGifHeaderAndPalette(out, gifWidth, gifHeight)
                                pixels = IntArray(gifWidth * gifHeight)
                                indexedPixels = ByteArray(gifWidth * gifHeight)
                                headerWritten = true
                            }
                            writeGifFrame(
                                frame = scaled,
                                width = gifWidth,
                                height = gifHeight,
                                delayUnits = delayUnits,
                                pixels = pixels!!,
                                indexedPixels = indexedPixels!!,
                                out = out
                            )
                        } finally {
                            scaled.recycle()
                        }
                    }
                    onProgress?.invoke(0.1f + (0.85f * (i + 1) / frameCount), 0L)
                }

                if (!headerWritten) {
                    throw IllegalStateException("Failed to extract video frames for GIF")
                }

                out.write(0x3B) // Trailer
                out.flush()
            }

            completed = true
            onProgress?.invoke(1.0f, 0L)
            return Pair(gifWidth, gifHeight)
        } finally {
            try { retriever.release() } catch (_: Exception) {}
            if (!completed) {
                outputFile.delete()
            }
        }
    }

    internal fun writeGifHeaderAndPalette(out: OutputStream, width: Int, height: Int) {
        // Header
        out.write("GIF89a".toByteArray())

        // Logical Screen Descriptor
        out.write(byteArrayOf(
            (width and 0xFF).toByte(), ((width shr 8) and 0xFF).toByte(),
            (height and 0xFF).toByte(), ((height shr 8) and 0xFF).toByte(),
            0xF7.toByte(), // Global color table flag (256 colors)
            0x00, 0x00
        ))

        // Standard 256-color RGB palette (6x7x6 color cube + 4 grays)
        val palette = ByteArray(256 * 3)
        var pIdx = 0
        for (r in 0..5) {
            for (g in 0..6) {
                for (b in 0..5) {
                    if (pIdx < 256 * 3) {
                        palette[pIdx++] = ((r * 255) / 5).toByte()
                        palette[pIdx++] = ((g * 255) / 6).toByte()
                        palette[pIdx++] = ((b * 255) / 5).toByte()
                    }
                }
            }
        }
        while (pIdx < 256 * 3) palette[pIdx++] = 0
        out.write(palette)

        // Netscape Application Extension for infinite looping
        out.write(byteArrayOf(
            0x21, 0xFF.toByte(), 0x0B,
            'N'.code.toByte(), 'E'.code.toByte(), 'T'.code.toByte(), 'S'.code.toByte(),
            'C'.code.toByte(), 'A'.code.toByte(), 'P'.code.toByte(), 'E'.code.toByte(),
            '2'.code.toByte(), '.'.code.toByte(), '0'.code.toByte(),
            0x03, 0x01, 0x00, 0x00, 0x00
        ))
    }

    private fun writeGifFrame(
        frame: Bitmap,
        width: Int,
        height: Int,
        delayUnits: Int,
        pixels: IntArray,
        indexedPixels: ByteArray,
        out: OutputStream
    ) {
        // Graphic Control Extension (frame delay in 1/100s)
        out.write(byteArrayOf(
            0x21, 0xF9.toByte(), 0x04, 0x00,
            (delayUnits and 0xFF).toByte(), ((delayUnits shr 8) and 0xFF).toByte(),
            0x00, 0x00
        ))

        // Image Descriptor
        out.write(byteArrayOf(
            0x2C, 0x00, 0x00, 0x00, 0x00,
            (width and 0xFF).toByte(), ((width shr 8) and 0xFF).toByte(),
            (height and 0xFF).toByte(), ((height shr 8) and 0xFF).toByte(),
            0x00
        ))

        // Quantize pixels to palette indices
        frame.getPixels(pixels, 0, width, 0, 0, width, height)
        for (i in pixels.indices) {
            val color = pixels[i]
            val r = (color shr 16) and 0xFF
            val g = (color shr 8) and 0xFF
            val b = color and 0xFF
            val rI = (r * 5) / 255
            val gI = (g * 6) / 255
            val bI = (b * 5) / 255
            indexedPixels[i] = (rI * 42 + gI * 6 + bI).toByte()
        }

        // Write uncompressed LZW raster data
        writeUncompressedLzw(indexedPixels, out)
    }

    internal fun writeUncompressedLzw(pixels: ByteArray, out: OutputStream) {
        val minCodeSize = 8
        out.write(minCodeSize)
        val clearCode = 1 shl minCodeSize
        val endCode = clearCode + 1

        val buffer = ByteArrayOutputStream()
        var curByte = 0
        var curBits = 0

        fun putBits(code: Int, bits: Int) {
            curByte = curByte or (code shl curBits)
            curBits += bits
            while (curBits >= 8) {
                buffer.write(curByte and 0xFF)
                curByte = curByte shr 8
                curBits -= 8
            }
        }

        fun flushBlock() {
            if (buffer.size() > 0) {
                val block = buffer.toByteArray()
                var offset = 0
                while (offset < block.size) {
                    val chunkLen = minOf(255, block.size - offset)
                    out.write(chunkLen)
                    out.write(block, offset, chunkLen)
                    offset += chunkLen
                }
                buffer.reset()
            }
        }

        putBits(clearCode, minCodeSize + 1)
        var codesSinceClear = 0
        for (b in pixels) {
            putBits(b.toInt() and 0xFF, minCodeSize + 1)
            codesSinceClear++

            // The GIF LZW decoder grows its dictionary as it reads codes and increases the
            // code width once the dictionary reaches 2^codeSize entries. Because this writer
            // emits every pixel as a literal code (never adding dictionary entries), we must
            // periodically emit a Clear code to reset the decoder's dictionary and keep the
            // code width fixed at minCodeSize + 1 bits. Without this, the decoder would
            // desynchronize after ~254 codes and the frame would be decoded incorrectly.
            if (codesSinceClear >= 254) {
                putBits(clearCode, minCodeSize + 1)
                codesSinceClear = 0
            }

            if (buffer.size() >= 250) {
                flushBlock()
            }
        }
        putBits(endCode, minCodeSize + 1)
        if (curBits > 0) {
            buffer.write(curByte and 0xFF)
        }
        flushBlock()
        out.write(0x00) // Block terminator
    }
}
