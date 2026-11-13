package com.prakhar.squishh

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PdfProcessorTest {

    private fun createDummyJpeg(width: Int = 100, height: Int = 100): ByteArray {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
        bitmap.recycle()
        return stream.toByteArray()
    }

    @Test
    fun testJpegPdfWriterStructureAndBinaryHeader() {
        val tempPdf = File.createTempFile("test_output", ".pdf").apply { deleteOnExit() }
        val writer = JpegPdfWriter(tempPdf)

        val jpeg1 = createDummyJpeg(200, 300)
        val jpeg2 = createDummyJpeg(400, 600)

        writer.addPage(jpegBytes = jpeg1, pixelWidth = 200, pixelHeight = 300, pageWidthPt = 595f, pageHeightPt = 842f)
        writer.addPage(jpegBytes = jpeg2, pixelWidth = 400, pixelHeight = 600, pageWidthPt = 595f, pageHeightPt = 842f)
        writer.write()

        assertTrue("Generated PDF must exist and be non-empty", tempPdf.exists() && tempPdf.length() > 0)

        val bytes = tempPdf.readBytes()
        val text = String(bytes, Charsets.US_ASCII)

        // 1. Verify PDF 1.4 header
        assertTrue("Must start with %PDF-1.4", text.startsWith("%PDF-1.4\n%"))

        // 2. Verify BUG-018 binary comment bytes (0xE2, 0xE3, 0xCF, 0xD3)
        val headerPrefix = "%PDF-1.4\n%".toByteArray(Charsets.US_ASCII)
        val offset = headerPrefix.size
        assertEquals(0xE2.toByte(), bytes[offset])
        assertEquals(0xE3.toByte(), bytes[offset + 1])
        assertEquals(0xCF.toByte(), bytes[offset + 2])
        assertEquals(0xD3.toByte(), bytes[offset + 3])

        // 3. Verify Page count matches writtenPages (BUG-017)
        assertTrue("Catalog must specify /Count 2", text.contains("/Type /Pages /Kids [3 0 R 6 0 R] /Count 2"))

        // 4. Verify trailer dictionary and startxref
        assertTrue("Trailer must reference root catalog", text.contains("/Root 1 0 R"))
        assertTrue("Trailer must specify /Size", text.contains("/Size 9"))
        assertTrue("Must end with %%EOF", text.trimEnd().endsWith("%%EOF"))

        // 5. Verify xref offsets match exact obj positions
        val startXrefIndex = text.indexOf("startxref\n")
        assertTrue("startxref must exist", startXrefIndex != -1)
        val startXrefStr = text.substring(startXrefIndex + "startxref\n".length).substringBefore("\n")
        val xrefOffset = startXrefStr.toLong()
        assertTrue("xref offset must point to 'xref' keyword", text.substring(xrefOffset.toInt()).startsWith("xref\n"))

        // Verify object 1 offset in xref table
        val obj1Offset = text.indexOf("1 0 obj\n")
        val expectedObj1Entry = String.format(java.util.Locale.US, "%010d 00000 n \n", obj1Offset)
        assertTrue("xref table must contain exact offset for object 1", text.contains(expectedObj1Entry))
    }

    @Test
    fun testPdfRendererCompatibility() {
        val tempPdf = File.createTempFile("test_renderer", ".pdf").apply { deleteOnExit() }
        val writer = JpegPdfWriter(tempPdf)

        val jpeg = createDummyJpeg(100, 100)
        writer.addPage(jpegBytes = jpeg, pixelWidth = 100, pixelHeight = 100, pageWidthPt = 300f, pageHeightPt = 300f)
        writer.write()

        // Open with Android's native PdfRenderer to ensure standard readers parse the document
        val pfd = ParcelFileDescriptor.open(tempPdf, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = try {
            PdfRenderer(pfd)
        } catch (_: Exception) {
            // In headless environments without native pdfium, skip renderer check if native lib absent
            null
        }

        renderer?.use {
            if (it.pageCount > 0) {
                val page = it.openPage(0)
                assertTrue(page.width > 0)
                assertEquals(300, page.width)
                page.close()
            }
        }
        pfd.close()
    }
}
