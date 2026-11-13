package com.prakhar.squishh

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class AudioProcessor(
    private val context: Context,
    private val fileRepository: FileRepository
) {

    companion object {
        const val MIN_AUDIO_BITRATE_KBPS = 32
        const val MAX_AUDIO_BITRATE_KBPS = 320
        const val DEFAULT_OUTPUT_FORMAT = "m4a"

        fun clampBitrate(bitrateKbps: Int): Int =
            bitrateKbps.coerceIn(MIN_AUDIO_BITRATE_KBPS, MAX_AUDIO_BITRATE_KBPS)

        fun computeChannelMixingCoefficients(channelCount: Int): FloatArray {
            val count = channelCount.coerceAtLeast(1)
            return FloatArray(count) { 1f / count }
        }
    }

    suspend fun process(
        inputPath: String,
        targetFormat: String = "m4a", // "m4a", "aac" (MP3/WAV are not encodable by Media3)
        bitrateKbps: Int = 128, // 64, 128, 192, 320
        monoDownmix: Boolean = false,
        extractFromVideo: Boolean = false,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): AudioCompressionResult = withContext(Dispatchers.IO) {
        val inputFile = fileRepository.requireReadableInputFile(inputPath, "Input audio file")
        val originalSizeBytes = inputFile.length()

        // 1. Extract metadata via MediaMetadataRetriever & MediaExtractor
        val retriever = MediaMetadataRetriever()
        var durationMs = 0L
        try {
            retriever.setDataSource(inputFile.absolutePath)
            durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        } catch (_: Exception) {
        } finally {
            try { retriever.release() } catch (_: Exception) {}
        }

        var channelCount = 2
        if (monoDownmix) {
            val extractor = MediaExtractor()
            try {
                extractor.setDataSource(inputFile.absolutePath)
                for (i in 0 until extractor.trackCount) {
                    val format = extractor.getTrackFormat(i)
                    val mime = format.getString(MediaFormat.KEY_MIME)
                    if (mime?.startsWith("audio/") == true && format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        channelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        break
                    }
                }
            } catch (_: Exception) {
            } finally {
                try { extractor.release() } catch (_: Exception) {}
            }
        }

        // Media3 only encodes AAC into an MP4/M4A container.
        val ext = DEFAULT_OUTPUT_FORMAT
        val safeBitrateKbps = clampBitrate(bitrateKbps)
        val outputFile = fileRepository.allocateOutputFile("squishh_audio", ext)

        // 2. Hardware Transcoding / Extraction via Media3 Transformer
        val deferred = CompletableDeferred<ExportResult>()

        // Build the audio processor chain (mono downmix when requested).
        val audioProcessors = mutableListOf<AudioProcessor>()
        if (monoDownmix) {
            val mixing = ChannelMixingAudioProcessor()
            // Register common channel layouts plus detected track channelCount so any audio stream can downmix to mono.
            val supportedCounts = mutableSetOf(1, 2, 4, 6, 8)
            if (channelCount > 0) {
                supportedCounts.add(channelCount)
            }
            for (inChannels in supportedCounts) {
                val coefficients = computeChannelMixingCoefficients(inChannels)
                mixing.putChannelMixingMatrix(ChannelMixingMatrix(inChannels, 1, coefficients))
            }
            audioProcessors.add(mixing)
        }

        val editedMediaItem = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(inputFile)))
            .setRemoveVideo(true) // Strip video tracks to extract or produce clean audio
            .setEffects(Effects(audioProcessors, emptyList()))
            .build()

        var transformerInstance: Transformer? = null

        withContext(Dispatchers.Main) {
            val audioEncoderSettings = AudioEncoderSettings.Builder()
                .setBitrate(safeBitrateKbps * 1000)
                .build()

            val encoderFactory = DefaultEncoderFactory.Builder(context.applicationContext)
                .setEnableFallback(true)
                .setRequestedAudioEncoderSettings(audioEncoderSettings)
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
            bitrateKbps = safeBitrateKbps,
            format = ext
        )
    }
}
