package com.prakhar.squishh

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

class ImageProcessor(
    private val fileRepository: FileRepository
) {

    companion object {
        private const val DEFAULT_MAX_DECODE_DIMENSION = 4096
        private const val ANTI_BALLOON_CAP_RATIO = 0.95
        private const val DEFAULT_MIN_QUALITY = 5
        private const val DEFAULT_MAX_QUALITY = 100
        private const val DEFAULT_TARGET_QUALITY = 80
    }

    fun process(
        inputPath: String,
        targetFormat: String, // "jpg", "png", "webp", "avif"
        quality: Int = DEFAULT_TARGET_QUALITY,
        targetSizeBytes: Long = 0L,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): ImageCompressionResult {
        val inputFile = fileRepository.requireReadableInputFile(inputPath, "Input file")
        val originalSizeBytes = inputFile.length()
        onProgress?.invoke(0.1f)

        if (cancellationToken?.get() == true) {
            throw InterruptedException("Job cancelled")
        }

        // Read original dimensions without allocating pixel memory
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(inputFile.absolutePath, boundsOptions)
        val rawWidth = boundsOptions.outWidth
        val rawHeight = boundsOptions.outHeight

        // 1. Decode bitmap safely with sampling/resolution cap into software memory
        val bitmap = decodeBitmap(inputFile, DEFAULT_MAX_DECODE_DIMENSION)
        val origWidth = if (rawWidth > 0) rawWidth else bitmap.width
        val origHeight = if (rawHeight > 0) rawHeight else bitmap.height
        onProgress?.invoke(0.3f)

        if (cancellationToken?.get() == true) {
            bitmap.recycle()
            throw InterruptedException("Job cancelled")
        }
        onProgress?.invoke(0.5f)

        // 3. Resolve target compress format
        val compressFormat = resolveCompressFormat(targetFormat)
        val ext = when (targetFormat.lowercase()) {
            "png" -> "png"
            "webp" -> "webp"
            "avif" -> if (isAvifSupported()) "avif" else "webp"
            else -> "jpg"
        }
        val outputFile = fileRepository.allocateOutputFile("squishh", ext)

        var finalWidth = bitmap.width
        var finalHeight = bitmap.height

        // 4. Compression (Target Size Binary Search OR Fixed Quality with Anti-Ballooning Guard)
        // Rule: A file compressor must NEVER expand a file beyond its original size.
        val maxAllowedCap = if (originalSizeBytes > 1L) {
            (originalSizeBytes * ANTI_BALLOON_CAP_RATIO).toLong().coerceAtLeast(1L).coerceAtMost(originalSizeBytes - 1L)
        } else {
            1L
        }

        if (targetSizeBytes > 0L) {
            // Compress to target size, capped so it never expands smaller files
            val effectiveTargetBytes = if (originalSizeBytes > 0L) {
                minOf(targetSizeBytes, maxAllowedCap)
            } else {
                targetSizeBytes
            }

            val dims = compressToTargetSize(
                bitmap,
                compressFormat,
                effectiveTargetBytes,
                outputFile,
                cancellationToken,
                onProgress
            )
            finalWidth = dims.first
            finalHeight = dims.second
        } else {
            // Fixed quality compression
            val clampedQuality = quality.coerceIn(DEFAULT_MIN_QUALITY, DEFAULT_MAX_QUALITY)
            val stream = ByteArrayOutputStream()
            bitmap.compress(compressFormat, clampedQuality, stream)
            val initialBytes = stream.toByteArray()

            if (initialBytes.size > originalSizeBytes && originalSizeBytes > 0L) {
                // Ballooning detected! (e.g. 115 KB image decoded and re-encoded at 92% becomes 1 MB,
                // or a small file <= 1024 B expands on re-encode).
                // Squishh must NEVER expand the file. Adaptively compress down below original size.
                val dims = compressToTargetSize(
                    bitmap,
                    compressFormat,
                    maxAllowedCap,
                    outputFile,
                    cancellationToken,
                    onProgress
                )
                finalWidth = dims.first
                finalHeight = dims.second

                // Safety fallback if format is identical and even aggressive squishing couldn't beat original
                val inExt = inputFile.extension.lowercase()
                val sameFormat = inExt == ext || (inExt == "jpeg" && ext == "jpg")
                if (outputFile.exists() && outputFile.length() >= originalSizeBytes && sameFormat) {
                    inputFile.copyTo(outputFile, overwrite = true)
                    finalWidth = origWidth
                    finalHeight = origHeight
                }
            } else {
                FileOutputStream(outputFile).use { it.write(initialBytes) }
                onProgress?.invoke(0.9f)
            }
        }

        bitmap.recycle()

        if (cancellationToken?.get() == true) {
            outputFile.delete()
            throw InterruptedException("Job cancelled")
        }

        onProgress?.invoke(1.0f)

        return ImageCompressionResult(
            outputPath = outputFile.absolutePath,
            originalSizeBytes = originalSizeBytes,
            compressedSizeBytes = outputFile.length(),
            width = finalWidth,
            height = finalHeight,
            format = ext
        )
    }

    private fun decodeBitmap(file: File, maxDecodeDimension: Int): Bitmap {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val source = ImageDecoder.createSource(file)
            ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                // Ensure software allocation so Bitmap.compress never fails on hardware buffers
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = true
                val srcW = info.size.width
                val srcH = info.size.height
                if (maxDecodeDimension > 0 && (srcW > maxDecodeDimension || srcH > maxDecodeDimension)) {
                    val scale = maxDecodeDimension.toFloat() / maxOf(srcW, srcH).toFloat()
                    val targetW = (srcW * scale).toInt().coerceAtLeast(1)
                    val targetH = (srcH * scale).toInt().coerceAtLeast(1)
                    decoder.setTargetSize(targetW, targetH)
                }
            }
        } else {
            val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, boundsOptions)
            var sampleSize = 1
            if (maxDecodeDimension > 0 && boundsOptions.outWidth > 0 && boundsOptions.outHeight > 0) {
                while ((boundsOptions.outWidth / sampleSize) > maxDecodeDimension ||
                    (boundsOptions.outHeight / sampleSize) > maxDecodeDimension
                ) {
                    sampleSize *= 2
                }
            }
            val options = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.ARGB_8888
                inSampleSize = sampleSize
            }
            BitmapFactory.decodeFile(file.absolutePath, options)
                ?: throw IllegalStateException("Failed to decode image bitmap from ${file.name}")
        }
    }

    /**
     * Binary search algorithm to find the optimal quality and resolution scale
     * that guarantees output size <= targetSizeBytes without ballooning.
     * Returns Pair(width, height) of the resulting image.
     */
    private fun compressToTargetSize(
        sourceBitmap: Bitmap,
        format: Bitmap.CompressFormat,
        targetSizeBytes: Long,
        outputFile: File,
        cancellationToken: AtomicBoolean?,
        onProgress: ((progress: Float) -> Unit)?
    ): Pair<Int, Int> {
        val scales = floatArrayOf(1.0f, 0.90f, 0.80f, 0.70f, 0.55f, 0.40f, 0.30f, 0.20f)
        var bestBytes: ByteArray? = null
        var bestW = sourceBitmap.width
        var bestH = sourceBitmap.height

        for ((scaleIndex, scale) in scales.withIndex()) {
            if (cancellationToken?.get() == true) throw InterruptedException("Job cancelled")

            val curW = (sourceBitmap.width * scale).toInt().coerceAtLeast(40)
            val curH = (sourceBitmap.height * scale).toInt().coerceAtLeast(40)
            val workingBitmap = if (scale < 1.0f) {
                Bitmap.createScaledBitmap(sourceBitmap, curW, curH, true)
            } else {
                sourceBitmap
            }

            var lowQ = 5
            var highQ = 95
            var foundAtThisScale = false

            // Binary search 6 iterations for high accuracy
            for (step in 0..5) {
                if (cancellationToken?.get() == true) {
                    if (workingBitmap != sourceBitmap) workingBitmap.recycle()
                    throw InterruptedException("Job cancelled")
                }
                val midQ = (lowQ + highQ) / 2
                val stream = ByteArrayOutputStream()
                workingBitmap.compress(format, midQ, stream)
                val size = stream.size().toLong()

                if (size <= targetSizeBytes) {
                    bestBytes = stream.toByteArray()
                    bestW = curW
                    bestH = curH
                    foundAtThisScale = true
                    lowQ = midQ + 1 // Search for higher quality under target
                } else {
                    highQ = midQ - 1 // Too large, lower quality
                }

                val progressIncrement = 0.5f + (0.4f * (scaleIndex * 6 + step) / (scales.size * 6f))
                onProgress?.invoke(progressIncrement)
            }

            if (workingBitmap != sourceBitmap) {
                workingBitmap.recycle()
            }

            // If we found a valid quality at this scale, write it and return immediately
            // to preserve the highest possible resolution!
            if (foundAtThisScale && bestBytes != null) {
                FileOutputStream(outputFile).use { it.write(bestBytes) }
                return Pair(bestW, bestH)
            }
        }

        // If even scale 0.20 at quality 5 was slightly over, use fallback
        if (bestBytes != null) {
            FileOutputStream(outputFile).use { it.write(bestBytes) }
            return Pair(bestW, bestH)
        } else {
            val minW = (sourceBitmap.width * 0.15f).toInt().coerceAtLeast(40)
            val minH = (sourceBitmap.height * 0.15f).toInt().coerceAtLeast(40)
            val fallbackBitmap = Bitmap.createScaledBitmap(sourceBitmap, minW, minH, true)
            FileOutputStream(outputFile).use { out ->
                fallbackBitmap.compress(format, 15, out)
            }
            if (fallbackBitmap != sourceBitmap) {
                fallbackBitmap.recycle()
            }
            return Pair(minW, minH)
        }
    }

    private fun resolveCompressFormat(format: String): Bitmap.CompressFormat {
        return when (format.lowercase()) {
            "png" -> Bitmap.CompressFormat.PNG
            "webp" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Bitmap.CompressFormat.WEBP_LOSSY
                } else {
                    @Suppress("DEPRECATION")
                    Bitmap.CompressFormat.WEBP
                }
            }
            "avif" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    try {
                        Bitmap.CompressFormat.valueOf("AVIF")
                    } catch (_: Exception) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.JPEG
                    }
                } else {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.JPEG
                }
            }
            else -> Bitmap.CompressFormat.JPEG
        }
    }

    private fun isAvifSupported(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    }
}
