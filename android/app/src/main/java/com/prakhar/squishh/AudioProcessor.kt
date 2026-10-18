package com.prakhar.squishh

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

data class AudioCompressionResult(
    val outputPath: String,
    val originalSizeBytes: Long,
    val compressedSizeBytes: Long,
    val durationMs: Long,
    val bitrateKbps: Int,
    val format: String
)

object AudioProcessor {

    suspend fun process(
        context: Context,
        inputPath: String,
        targetFormat: String = "m4a", // "m4a", "aac", "wav", "mp3"
        bitrateKbps: Int = 128, // 64, 128, 192, 320
        monoDownmix: Boolean = false,
        extractFromVideo: Boolean = false,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): AudioCompressionResult = withContext(Dispatchers.IO) {
        val inputFile = File(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input audio file does not exist: $inputPath")
        }
        val originalSizeBytes = inputFile.length()

        // 1. Extract metadata via MediaMetadataRetriever
        val retriever = MediaMetadataRetriever()
        var durationMs = 0L
        try {
            retriever.setDataSource(inputFile.absolutePath)
            durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        } catch (_: Exception) {
        } finally {
            try { retriever.release() } catch (_: Exception) {}
        }

        val outputDir = File(context.cacheDir, "squishh_out").apply { mkdirs() }
        val ext = when (targetFormat.lowercase()) {
            "wav" -> "wav"
            "aac" -> "aac"
            "mp3" -> "mp3"
            else -> "m4a"
        }
        val outputFile = File(outputDir, "squishh_audio_${System.currentTimeMillis()}_${UUID.randomUUID()}.$ext")

        // 2. Hardware Transcoding / Extraction via Media3 Transformer
        val deferred = CompletableDeferred<ExportResult>()
        val editedMediaItem = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(inputFile)))
            .setRemoveVideo(true) // Strip video tracks to extract or produce clean audio
            .build()

        var transformerInstance: Transformer? = null

        withContext(Dispatchers.Main) {
            val encoderFactory = DefaultEncoderFactory.Builder(context.applicationContext)
                .setEnableFallback(true)
                .build()

            val transformer = Transformer.Builder(context.applicationContext)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .setEncoderFactory(encoderFactory)
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                        deferred.complete(exportResult)
                    }

                    override fun onError(
                        composition: Composition,
                        exportResult: ExportResult,
                        exportException: ExportException
                    ) {
                        deferred.completeExceptionally(exportException)
                    }
                })
                .build()

            transformerInstance = transformer
            transformer.start(editedMediaItem, outputFile.absolutePath)
        }

        // 3. Progress monitoring loop
        val progressHolder = ProgressHolder()
        while (!deferred.isCompleted) {
            if (cancellationToken?.get() == true) {
                withContext(Dispatchers.Main) {
                    transformerInstance?.cancel()
                }
                outputFile.delete()
                throw InterruptedException("Audio processing cancelled by user")
            }

            withContext(Dispatchers.Main) {
                transformerInstance?.getProgress(progressHolder)
            }

            val p = (progressHolder.progress / 100f).coerceIn(0f, 0.99f)
            onProgress?.invoke(p)
            kotlinx.coroutines.delay(150)
        }

        deferred.await()
        onProgress?.invoke(1.0f)

        return@withContext AudioCompressionResult(
            outputPath = outputFile.absolutePath,
            originalSizeBytes = originalSizeBytes,
            compressedSizeBytes = outputFile.length(),
            durationMs = durationMs,
            bitrateKbps = bitrateKbps,
            format = ext
        )
    }
}
