package com.prakhar.squishh

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

data class PdfCompressionResult(
    val outputPath: String,
    val pageCount: Int,
    val originalSizeBytes: Long,
    val compressedSizeBytes: Long
)

data class PdfToImagesResult(
    val imagePaths: List<String>,
    val pageCount: Int,
    val totalSizeBytes: Long
)

object PdfProcessor {

    /**
     * Converts a collection of images into a unified, lean, high-fidelity PDF document.
     * Uses native JPEG DCTDecode streams for extreme compression without Deflate bloat.
     */
    suspend fun imagesToPdf(
        context: Context,
        imagePaths: List<String>,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): PdfCompressionResult = withContext(Dispatchers.IO) {
        if (imagePaths.isEmpty()) {
            throw IllegalArgumentException("At least one image is required to build a PDF")
        }

        val totalOriginalBytes = imagePaths.sumOf { File(it).length() }
        val outputDir = File(context.cacheDir, "squishh_out").apply { mkdirs() }
        val outputFile = File(outputDir, "squishh_doc_${System.currentTimeMillis()}_${UUID.randomUUID()}.pdf")

        val pdfWriter = JpegPdfWriter(outputFile)
        val totalCount = imagePaths.size

        for ((index, path) in imagePaths.withIndex()) {
            if (cancellationToken?.get() == true) throw InterruptedException("PDF generation cancelled")

            val imgFile = File(path)
            if (!imgFile.exists()) continue

            val bitmap = BitmapFactory.decodeFile(imgFile.absolutePath) ?: continue

            // Standard A4 aspect: 595 x 842 points (72 points/inch)
            val ptW = 595f
            val ptH = 842f
            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
            val jpegBytes = stream.toByteArray()

            pdfWriter.addPage(jpegBytes, bitmap.width, bitmap.height, ptW, ptH)
            bitmap.recycle()

            onProgress?.invoke((index + 1).toFloat() / totalCount)
        }

        pdfWriter.write()
        onProgress?.invoke(1.0f)

        return@withContext PdfCompressionResult(
            outputPath = outputFile.absolutePath,
            pageCount = totalCount,
            originalSizeBytes = totalOriginalBytes,
            compressedSizeBytes = outputFile.length()
        )
    }

    /**
     * Reduces the file size of a heavy PDF document (e.g. university or government portal limits).
     * Re-renders document pages with JPEG stream encoding into a clean, lean PDF.
     * Supports 3 compression tiers:
     * - light: ~20% size reduction
     * - balanced: ~45-50% size reduction
     * - highly: ~80-90% size reduction
     */
    suspend fun compressPdf(
        context: Context,
        inputPath: String,
        targetSizeBytes: Long = 0L,
        compressionLevel: String = "balanced", // "light", "balanced", "highly"
        quality: Int = 0,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): PdfCompressionResult = withContext(Dispatchers.IO) {
        val inputFile = File(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input PDF file does not exist: $inputPath")
        }
        val originalSizeBytes = inputFile.length()

        val outputDir = File(context.cacheDir, "squishh_out").apply { mkdirs() }
        val outputFile = File(outputDir, "squishh_slim_${System.currentTimeMillis()}_${UUID.randomUUID()}.pdf")

        val level = compressionLevel.lowercase()
        val (renderScale, jpegQuality) = when {
            level == "light" -> Pair(1.3f, 82)
            level == "highly" -> Pair(0.8f, 38)
            level == "balanced" -> Pair(1.0f, 62)
            targetSizeBytes > 0L -> {
                val ratio = targetSizeBytes.toFloat() / originalSizeBytes.toFloat()
                when {
                    ratio >= 0.7f -> Pair(1.3f, 82)
                    ratio <= 0.25f -> Pair(0.8f, 38)
                    else -> Pair(1.0f, 62)
                }
            }
            quality in 10..95 -> {
                when {
                    quality >= 80 -> Pair(1.3f, quality)
                    quality <= 40 -> Pair(0.8f, quality)
                    else -> Pair(1.0f, quality)
                }
            }
            else -> Pair(1.0f, 62)
        }

        val pfd = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val pageCount = renderer.pageCount
        val pdfWriter = JpegPdfWriter(outputFile)

        try {
            for (i in 0 until pageCount) {
                if (cancellationToken?.get() == true) throw InterruptedException("PDF compression cancelled")

                val page = renderer.openPage(i)
                val ptW = page.width.toFloat()
                val ptH = page.height.toFloat()

                val renderW = (ptW * renderScale).toInt().coerceAtLeast(300)
                val renderH = (ptH * renderScale).toInt().coerceAtLeast(400)

                val bitmap = Bitmap.createBitmap(renderW, renderH, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bitmap)
                canvas.drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                page.close()

                val stream = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)
                bitmap.recycle()

                val jpegBytes = stream.toByteArray()
                pdfWriter.addPage(jpegBytes, renderW, renderH, ptW, ptH)

                onProgress?.invoke((i + 1).toFloat() / pageCount)
            }

            pdfWriter.write()
        } finally {
            renderer.close()
            pfd.close()
        }

        // Anti-ballooning guard: In Squishh, compression must NEVER make the file larger than the original!
        if (outputFile.exists() && outputFile.length() >= originalSizeBytes) {
            inputFile.copyTo(outputFile, overwrite = true)
        }

        onProgress?.invoke(1.0f)

        return@withContext PdfCompressionResult(
            outputPath = outputFile.absolutePath,
            pageCount = pageCount,
            originalSizeBytes = originalSizeBytes,
            compressedSizeBytes = outputFile.length()
        )
    }

    /**
     * Extracts all pages of a PDF document into high-resolution standalone images.
     */
    suspend fun pdfToImages(
        context: Context,
        inputPath: String,
        targetFormat: String = "jpg",
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): PdfToImagesResult = withContext(Dispatchers.IO) {
        val inputFile = File(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input PDF file does not exist: $inputPath")
        }

        val outputDir = File(context.cacheDir, "squishh_out").apply { mkdirs() }
        val pfd = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val pageCount = renderer.pageCount
        val outputPaths = mutableListOf<String>()
        var totalBytes = 0L

        val ext = if (targetFormat.lowercase() == "png") "png" else "jpg"
        val compressFormat = if (ext == "png") Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG

        try {
            for (i in 0 until pageCount) {
                if (cancellationToken?.get() == true) throw InterruptedException("PDF extraction cancelled")

                val page = renderer.openPage(i)
                val width = (page.width * 2f).toInt()
                val height = (page.height * 2f).toInt()

                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val pageFile = File(outputDir, "squishh_page_${i + 1}_${System.currentTimeMillis()}.$ext")
                FileOutputStream(pageFile).use { out ->
                    bitmap.compress(compressFormat, 90, out)
                }
                bitmap.recycle()

                outputPaths.add(pageFile.absolutePath)
                totalBytes += pageFile.length()
                onProgress?.invoke((i + 1).toFloat() / pageCount)
            }
        } finally {
            renderer.close()
            pfd.close()
        }

        onProgress?.invoke(1.0f)

        return@withContext PdfToImagesResult(
            imagePaths = outputPaths,
            pageCount = pageCount,
            totalSizeBytes = totalBytes
        )
    }
}

/**
 * Pure byte-level PDF 1.4 generator that embeds JPEG images directly via /Filter /DCTDecode.
 * This completely avoids Skia's uncompressed ARGB Deflate bloat and makes compressed PDFs 80-95% lighter.
 */
private class JpegPdfWriter(private val outputFile: File) {
    data class PageInfo(
        val jpegBytes: ByteArray,
        val pixelWidth: Int,
        val pixelHeight: Int,
        val pageWidthPt: Float,
        val pageHeightPt: Float
    )

    private val pages = mutableListOf<PageInfo>()

    fun addPage(jpegBytes: ByteArray, pixelWidth: Int, pixelHeight: Int, pageWidthPt: Float, pageHeightPt: Float) {
        pages.add(PageInfo(jpegBytes, pixelWidth, pixelHeight, pageWidthPt, pageHeightPt))
    }

    fun write() {
        FileOutputStream(outputFile).use { out ->
            val offsets = mutableListOf<Long>()
            var bytesWritten = 0L

            fun writeBytes(bytes: ByteArray) {
                out.write(bytes)
                bytesWritten += bytes.size
            }

            fun writeString(str: String) {
                writeBytes(str.toByteArray(Charsets.US_ASCII))
            }

            // PDF 1.4 Header with binary comment
            writeString("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n")

            val count = pages.size
            val pageObjIds = (0 until count).map { 3 + it * 3 }

            // 1 0 obj: Catalog
            offsets.add(bytesWritten)
            writeString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

            // 2 0 obj: Pages
            offsets.add(bytesWritten)
            val kidsStr = pageObjIds.joinToString(" ") { "$it 0 R" }
            writeString("2 0 obj\n<< /Type /Pages /Kids [$kidsStr] /Count $count >>\nendobj\n")

            for (i in 0 until count) {
                val page = pages[i]
                val pageObjId = 3 + i * 3
                val contentObjId = pageObjId + 1
                val imageObjId = pageObjId + 2

                // Page object
                offsets.add(bytesWritten)
                writeString(
                    "$pageObjId 0 obj\n" +
                    "<< /Type /Page /Parent 2 0 R\n" +
                    "/MediaBox [0 0 ${page.pageWidthPt} ${page.pageHeightPt}]\n" +
                    "/Resources << /XObject << /Im1 $imageObjId 0 R >> >>\n" +
                    "/Contents $contentObjId 0 R >>\nendobj\n"
                )

                // Content stream (scales image to cover page points)
                val contentStream = "q\n${page.pageWidthPt} 0 0 ${page.pageHeightPt} 0 0 cm\n/Im1 Do\nQ\n"
                val contentStreamBytes = contentStream.toByteArray(Charsets.US_ASCII)
                offsets.add(bytesWritten)
                writeString(
                    "$contentObjId 0 obj\n<< /Length ${contentStreamBytes.size} >>\nstream\n"
                )
                writeBytes(contentStreamBytes)
                writeString("\nendstream\nendobj\n")

                // Image XObject with direct /Filter /DCTDecode
                offsets.add(bytesWritten)
                writeString(
                    "$imageObjId 0 obj\n" +
                    "<< /Type /XObject /Subtype /Image\n" +
                    "/Width ${page.pixelWidth} /Height ${page.pixelHeight}\n" +
                    "/ColorSpace /DeviceRGB /BitsPerComponent 8\n" +
                    "/Filter /DCTDecode /Length ${page.jpegBytes.size} >>\nstream\n"
                )
                writeBytes(page.jpegBytes)
                writeString("\nendstream\nendobj\n")
            }

            // Xref table
            val xrefOffset = bytesWritten
            val totalObjs = 2 + count * 3
            writeString("xref\n0 ${totalObjs + 1}\n")
            writeString("0000000000 65535 f \n")
            for (offset in offsets) {
                writeString(String.format(java.util.Locale.US, "%010d 00000 n \n", offset))
            }

            // Trailer
            writeString(
                "trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\n" +
                "startxref\n$xrefOffset\n%%EOF\n"
            )
        }
    }
}
