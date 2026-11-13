package com.prakhar.squishh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StorageResolverAndMediaExporterTest {

    @Test
    fun testMimeTypeDetectionTable() {
        val cases = mapOf(
            "photo.jpg" to "image/jpeg",
            "photo.jpeg" to "image/jpeg",
            "image.png" to "image/png",
            "sticker.webp" to "image/webp",
            "capture.heic" to "image/heic",
            "capture.heif" to "image/heif",
            "banner.avif" to "image/avif",
            "animation.gif" to "image/gif",
            "clip.mp4" to "video/mp4",
            "movie.mov" to "video/quicktime",
            "video.mkv" to "video/x-matroska",
            "stream.webm" to "video/webm",
            "track.mp3" to "audio/mpeg",
            "voice.m4a" to "audio/mp4",
            "sample.aac" to "audio/aac",
            "sound.wav" to "audio/wav",
            "audio.ogg" to "audio/ogg",
            "song.flac" to "audio/flac",
            "speech.opus" to "audio/opus",
            "document.pdf" to "application/pdf"
        )

        for ((fileName, expectedMime) in cases) {
            val detected = StorageResolver.detectMimeTypeFromName(fileName)
            assertEquals("MIME mismatch for $fileName", expectedMime, detected)
        }

        // Case insensitivity
        assertEquals("image/png", StorageResolver.detectMimeTypeFromName("PHOTO.PNG"))
        assertEquals("video/mp4", StorageResolver.detectMimeTypeFromName("RECORDING.MP4"))
        assertEquals("application/pdf", StorageResolver.detectMimeTypeFromName("DOC.PDF"))

        // Extensionless or unknown
        assertEquals("application/octet-stream", StorageResolver.detectMimeTypeFromName("unknown_file"))
        assertEquals("application/octet-stream", StorageResolver.detectMimeTypeFromName("data.xyz_nonexistent_ext"))
    }

    @Test
    fun testMediaExporterMimeTypeMapping() {
        assertEquals("image/jpeg", MediaExporter.getMimeType("photo.jpg", "image/jpeg"))
        assertEquals("image/png", MediaExporter.getMimeType("photo.png", "image/jpeg"))
        assertEquals("video/mp4", MediaExporter.getMimeType("video.mp4", "video/mp4"))
        assertEquals("application/pdf", MediaExporter.getMimeType("invoice.pdf", "application/pdf"))
        assertEquals("audio/mp4", MediaExporter.getMimeType("tune.m4a", "audio/mp4"))
    }

    @Test
    fun testMediaExporterThrowsWhenSourceDoesNotExist() {
        val context = RuntimeEnvironment.getApplication()
        kotlinx.coroutines.runBlocking {
            try {
                MediaExporter.exportToSystem(
                    context = context,
                    sourceFilePath = "/non/existent/path/to/file.jpg",
                    mediaType = "image",
                    targetFileName = "file.jpg"
                )
                fail("Expected IllegalArgumentException for non-existent source file")
            } catch (e: IllegalArgumentException) {
                assertTrue(e.message?.contains("does not exist") == true)
            }
        }
    }
}
