package com.prakhar.squishh

import android.graphics.Bitmap
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ImageProcessorTest {

    @Test
    fun testAntiBallooningCapFormula_normalSize() {
        // 100 KB original
        val origBytes = 100L * 1024
        val cap = ImageProcessor.computeMaxAllowedCap(origBytes)
        // Must be capped strictly less than original size (at 95%)
        assertTrue("Cap $cap must be less than original $origBytes", cap < origBytes)
        assertEquals((origBytes * 0.95).toLong(), cap)
    }

    @Test
    fun testAntiBallooningCapFormula_sub1024BytesEdgeCase() {
        // BUG-020 edge case: tiny file <= 1024 bytes
        val smallSizes = listOf(2L, 5L, 10L, 50L, 100L, 512L, 1023L)
        for (size in smallSizes) {
            val cap = ImageProcessor.computeMaxAllowedCap(size)
            assertTrue("Cap for $size bytes must be >= 1", cap >= 1L)
            assertTrue("Cap for $size bytes ($cap) must be strictly < $size", cap < size)
        }

        // Edge case: size = 1 byte
        val cap1 = ImageProcessor.computeMaxAllowedCap(1L)
        assertEquals(1L, cap1)

        // Edge case: size = 0 bytes
        val cap0 = ImageProcessor.computeMaxAllowedCap(0L)
        assertEquals(1L, cap0)
    }

    @Test
    fun testFormatResolution() {
        val fileRepository = mockk<FileRepository>()
        val processor = ImageProcessor(fileRepository)

        assertEquals(Bitmap.CompressFormat.PNG, processor.resolveCompressFormat("png"))
        assertEquals(Bitmap.CompressFormat.PNG, processor.resolveCompressFormat("PNG"))
        assertEquals(Bitmap.CompressFormat.JPEG, processor.resolveCompressFormat("jpg"))
        assertEquals(Bitmap.CompressFormat.JPEG, processor.resolveCompressFormat("jpeg"))
        assertEquals(Bitmap.CompressFormat.JPEG, processor.resolveCompressFormat("random"))

        val webpFormat = processor.resolveCompressFormat("webp")
        assertNotNull(webpFormat)

        val avifFormat = processor.resolveCompressFormat("avif")
        assertNotNull(avifFormat)
    }

    @Test
    fun testCancellationTokenPropagates() {
        val fileRepo = mockk<FileRepository>()
        val dummyFile = File.createTempFile("test_cancel", ".jpg").apply {
            writeBytes(ByteArray(200) { 0xFF.toByte() })
            deleteOnExit()
        }
        every { fileRepo.requireReadableInputFile(any(), any()) } returns dummyFile
        val processor = ImageProcessor(fileRepo)

        val cancelledToken = AtomicBoolean(true)
        try {
            processor.process(
                inputPath = dummyFile.absolutePath,
                targetFormat = "jpg",
                cancellationToken = cancelledToken
            )
            fail("Expected InterruptedException due to cancelled token")
        } catch (e: InterruptedException) {
            assertTrue(e.message?.contains("cancelled", ignoreCase = true) == true)
        }
    }
}
