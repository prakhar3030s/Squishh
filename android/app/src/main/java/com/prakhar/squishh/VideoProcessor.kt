package com.prakhar.squishh

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.DefaultMuxer
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
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

data class VideoCompressionResult(
    val outputPath: String,
    val originalSizeBytes: Long,
    val compressedSizeBytes: Long,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val isGif: Boolean
)

object VideoProcessor {

    suspend fun process(
        context: Context,
        inputPath: String,
        compressionLevel: String = "", // "light", "balanced", "high"
        targetSizeBytes: Long = 0L,
        resolution: String = "original", // "original", "1080p", "720p", "480p"
        fpsLimit: Int = 0,
        muteAudio: Boolean = false,
        asGif: Boolean = false,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float, etaRemainingMs: Long) -> Unit)? = null
    ): VideoCompressionResult = withContext(Dispatchers.IO) {
        val inputFile = File(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input video file does not exist: $inputPath")
        }
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

        val outputDir = File(context.cacheDir, "squishh_out").apply { mkdirs() }

        // Branch 1: Video to Animated GIF
        if (asGif) {
            val gifFile = File(outputDir, "squishh_anim_${System.currentTimeMillis()}_${UUID.randomUUID()}.gif")
            extractAndEncodeGif(
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
                width = 480,
                height = (480f * (origHeight.toFloat() / origWidth)).toInt(),
                isGif = true
            )
        }

        // Branch 2: Hardware Accelerated Video Transcoding via Media3 Transformer
        val outputFile = File(outputDir, "squishh_video_${System.currentTimeMillis()}_${UUID.randomUUID()}.mp4")
        val deferred = CompletableDeferred<ExportResult>()

        val durationSec = (durationMs / 1000f).coerceAtLeast(1.0f)
        val origBitrate = ((originalSizeBytes * 8L) / durationSec).toInt().coerceIn(300_000, 50_000_000)

        // Effective Target Size Cap: In Squishh, compression must never make the file larger!
        val effectiveTargetBytes = when {
            compressionLevel == "light" -> (originalSizeBytes * 0.75f).toLong()
            compressionLevel == "balanced" -> (originalSizeBytes * 0.50f).toLong()
            compressionLevel == "high" -> (originalSizeBytes * 0.22f).toLong()
            targetSizeBytes > 0L -> minOf(targetSizeBytes, (originalSizeBytes * 0.90).toLong())
            else -> 0L
        }

        // Calculate target video bitrate
        val videoBitrate = when {
            compressionLevel == "light" -> {
                val audioBitrate = if (muteAudio) 0 else 128_000
                val targetTotalBitrate = ((effectiveTargetBytes * 0.92f * 8L) / durationSec).toInt()
                (targetTotalBitrate - audioBitrate).coerceIn(350_000, (origBitrate * 0.75f).toInt().coerceAtLeast(350_000))
            }
            compressionLevel == "balanced" -> {
                val audioBitrate = if (muteAudio) 0 else 96_000
                val targetTotalBitrate = ((effectiveTargetBytes * 0.90f * 8L) / durationSec).toInt()
                (targetTotalBitrate - audioBitrate).coerceIn(250_000, (origBitrate * 0.50f).toInt().coerceAtLeast(250_000))
            }
            compressionLevel == "high" -> {
                val audioBitrate = if (muteAudio) 0 else 64_000
                val targetTotalBitrate = ((effectiveTargetBytes * 0.88f * 8L) / durationSec).toInt()
                (targetTotalBitrate - audioBitrate).coerceIn(180_000, (origBitrate * 0.25f).toInt().coerceAtLeast(180_000))
            }
            effectiveTargetBytes > 0L -> {
                val audioBitrate = if (muteAudio) 0 else 96_000
                val safeTargetBytes = (effectiveTargetBytes * 0.90f).toLong()
                val targetTotalBitrate = ((safeTargetBytes * 8L) / durationSec).toInt()
                (targetTotalBitrate - audioBitrate).coerceIn(150_000, (origBitrate * 0.85f).toInt().coerceAtLeast(300_000))
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
                val nominalBitrate = when {
                    effectiveH <= 360 -> if (fpsLimit >= 50) 650_000 else 450_000
                    effectiveH <= 480 -> if (fpsLimit >= 50) 950_000 else 700_000
                    effectiveH <= 720 -> if (fpsLimit >= 50) 2_000_000 else 1_400_000
                    else -> if (fpsLimit >= 50) 3_500_000 else 2_400_000
                }
                minOf(nominalBitrate, (origBitrate * 0.75f).toInt().coerceAtLeast(250_000))
            }
        }

        android.util.Log.i("VideoProcessor", "Starting transcode: level=$compressionLevel, duration=${durationSec}s, origBitrate=$origBitrate, targetBytes=$targetSizeBytes, effectiveTargetBytes=$effectiveTargetBytes, videoBitrate=$videoBitrate")

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
                if (videoBitrate < 320_000) (if (isPortrait) 640 else 360) else (if (isPortrait) 854 else 480)
            }
            effectiveTargetBytes > 0L -> {
                when {
                    videoBitrate < 380_000 -> if (isPortrait) 640 else 360
                    videoBitrate < 900_000 -> if (isPortrait) 854 else 480
                    videoBitrate < 2_000_000 -> if (isPortrait) 1280 else 720
                    else -> if (isPortrait) 1920 else 1080
                }
            }
            resolution == "360p" -> if (isPortrait) 640 else 360
            resolution == "480p" -> if (isPortrait) 854 else 480
            resolution == "720p" -> if (isPortrait) 1280 else 720
            resolution == "1080p" -> if (isPortrait) 1920 else 1080
            else -> 0
        }

        val effectiveFpsLimit = when {
            fpsLimit > 0 -> fpsLimit
            compressionLevel == "high" -> 30
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
        if (outputFile.exists() && outputFile.length() >= originalSizeBytes && inputFile.extension.equals("mp4", ignoreCase = true)) {
            inputFile.copyTo(outputFile, overwrite = true)
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
    private fun extractAndEncodeGif(
        inputFile: File,
        outputFile: File,
        durationMs: Long,
        cancellationToken: AtomicBoolean?,
        onProgress: ((progress: Float, etaRemainingMs: Long) -> Unit)?
    ) {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(inputFile.absolutePath)
            val totalDuration = if (durationMs > 0) durationMs.coerceAtMost(10_000L) else 5_000L
            val frameRate = 10 // 10 fps
            val frameCount = ((totalDuration / 1000f) * frameRate).toInt().coerceIn(5, 60)
            val intervalUs = (totalDuration * 1000L) / frameCount

            val frames = mutableListOf<Bitmap>()
            for (i in 0 until frameCount) {
                if (cancellationToken?.get() == true) throw InterruptedException("GIF export cancelled")
                val timeUs = i * intervalUs
                val rawFrame = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                if (rawFrame != null) {
                    val targetW = 360
                    val targetH = (360f * (rawFrame.height.toFloat() / rawFrame.width)).toInt()
                    val scaled = Bitmap.createScaledBitmap(rawFrame, targetW, targetH, true)
                    frames.add(scaled)
                    if (scaled != rawFrame) rawFrame.recycle()
                }
                onProgress?.invoke(0.1f + (0.4f * (i + 1) / frameCount), 0L)
            }

            if (frames.isEmpty()) {
                throw IllegalStateException("Failed to extract video frames for GIF")
            }

            // Write animated GIF using basic GIF stream encoder
            FileOutputStream(outputFile).use { out ->
                encodeGifStream(frames, out, delayMs = (1000 / frameRate), cancellationToken, onProgress)
            }
            frames.forEach { it.recycle() }
        } finally {
            try { retriever.release() } catch (_: Exception) {}
        }
    }

    /**
     * Pure Kotlin lightweight Animated GIF writer with 256-color palette.
     */
    private fun encodeGifStream(
        frames: List<Bitmap>,
        out: OutputStream,
        delayMs: Int,
        cancellationToken: AtomicBoolean?,
        onProgress: ((progress: Float, etaRemainingMs: Long) -> Unit)?
    ) {
        val width = frames[0].width
        val height = frames[0].height

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

        // Write each frame
        for ((idx, frame) in frames.withIndex()) {
            if (cancellationToken?.get() == true) throw InterruptedException("GIF export cancelled")

            // Graphic Control Extension (frame delay in 1/100s)
            val delayUnits = (delayMs / 10).coerceAtLeast(2)
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
            val pixels = IntArray(width * height)
            frame.getPixels(pixels, 0, width, 0, 0, width, height)
            val indexedPixels = ByteArray(pixels.size)
            for (i in pixels.indices) {
                val color = pixels[i]
                val r = (color shr 16) and 0xFF
                val g = (color shr 8) and 0xFF
                val b = color and 0xFF
                // Map to 6x7x6 cube
                val rI = (r * 5) / 255
                val gI = (g * 6) / 255
                val bI = (b * 5) / 255
                indexedPixels[i] = (rI * 42 + gI * 6 + bI).toByte()
            }

            // Write simple uncompressed LZW raster data
            writeUncompressedLzw(indexedPixels, out)

            onProgress?.invoke(0.5f + (0.5f * (idx + 1) / frames.size), 0L)
        }

        // Trailer
        out.write(0x3B)
    }

    private fun writeUncompressedLzw(pixels: ByteArray, out: OutputStream) {
        val minCodeSize = 8
        out.write(minCodeSize)
        val clearCode = 1 shl minCodeSize
        val endCode = clearCode + 1

        val buffer = ByteArrayOutputStream()
        // Write Clear code
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

        putBits(clearCode, minCodeSize + 1)
        for (b in pixels) {
            putBits(b.toInt() and 0xFF, minCodeSize + 1)
            if (buffer.size() >= 254) {
                val block = buffer.toByteArray()
                out.write(block.size)
                out.write(block)
                buffer.reset()
            }
        }
        putBits(endCode, minCodeSize + 1)
        if (curBits > 0) {
            buffer.write(curByte and 0xFF)
        }
        if (buffer.size() > 0) {
            val block = buffer.toByteArray()
            out.write(block.size)
            out.write(block)
        }
        out.write(0x00) // Block terminator
    }
}
