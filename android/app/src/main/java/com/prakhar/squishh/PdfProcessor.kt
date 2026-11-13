package com.prakhar.squishh

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

class PdfProcessor(
    private val fileRepository: FileRepository
) {

    companion object {
        private const val MAX_PDF_IMAGE_DIMENSION = 2048
    }

    private fun capDimensions(width: Int, height: Int, maxDimension: Int): Pair<Int, Int> {
        val safeW = width.coerceAtLeast(1)
        val safeH = height.coerceAtLeast(1)
        if (safeW <= maxDimension && safeH <= maxDimension) {
            return Pair(safeW, safeH)
        }
        val scale = maxDimension.toFloat() / maxOf(safeW, safeH).toFloat()
        return Pair(
            (safeW * scale).toInt().coerceAtLeast(1),
            (safeH * scale).toInt().coerceAtLeast(1)
        )
    }

    private fun decodeSampledBitmap(file: File, maxDimension: Int): Bitmap? {
        val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, boundsOpts)
        if (boundsOpts.outWidth <= 0 || boundsOpts.outHeight <= 0) {
            return BitmapFactory.decodeFile(file.absolutePath)
        }
        var sampleSize = 1
        while ((boundsOpts.outWidth / sampleSize) > maxDimension ||
            (boundsOpts.outHeight / sampleSize) > maxDimension
        ) {
            sampleSize *= 2
        }
        val decodeOpts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return BitmapFactory.decodeFile(file.absolutePath, decodeOpts)
    }

    /**
     * Converts a collection of images into a unified, lean, high-fidelity PDF document.
     * Uses native JPEG DCTDecode streams for extreme compression without Deflate bloat.
     */
    suspend fun imagesToPdf(
        imagePaths: List<String>,
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): PdfCompressionResult = withContext(Dispatchers.IO) {
        if (imagePaths.isEmpty()) {
            throw IllegalArgumentException("At least one image is required to build a PDF")
        }

        val totalOriginalBytes = imagePaths.sumOf { File(it).length() }
        val outputFile = fileRepository.allocateOutputFile("squishh_doc", "pdf")

        val pdfWriter = JpegPdfWriter(outputFile)
        val totalCount = imagePaths.size
        var writtenPages = 0

        for ((index, path) in imagePaths.withIndex()) {
            if (cancellationToken?.get() == true) throw InterruptedException("PDF generation cancelled")

            val imgFile = File(path)
            if (!imgFile.exists()) continue

            val decoded = decodeSampledBitmap(imgFile, MAX_PDF_IMAGE_DIMENSION) ?: continue

            // Flatten alpha onto white background so PNG/WebP transparency doesn't render black in JPEG
            val jpegBitmap = if (decoded.hasAlpha()) {
                val flattened = Bitmap.createBitmap(decoded.width, decoded.height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(flattened)
                canvas.drawColor(Color.WHITE)
                canvas.drawBitmap(decoded, 0f, 0f, null)
                decoded.recycle()
                flattened
            } else {
                decoded
            }

            val imgW = jpegBitmap.width
            val imgH = jpegBitmap.height
            val jpegBytes = try {
                val stream = ByteArrayOutputStream()
                jpegBitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
                stream.toByteArray()
            } finally {
                jpegBitmap.recycle()
            }

            // Standard A4 (595 x 842 pt portrait, or 842 x 595 pt landscape)
            val (ptW, ptH) = if (imgW > imgH) 842f to 595f else 595f to 842f

            pdfWriter.addPage(jpegBytes, imgW, imgH, ptW, ptH)
            writtenPages++

            onProgress?.invoke((index + 1).toFloat() / totalCount)
        }

        if (writtenPages == 0) {
            throw IllegalStateException("Failed to decode any of the selected images")
        }

        pdfWriter.write()
        onProgress?.invoke(1.0f)

        return@withContext PdfCompressionResult(
            outputPath = outputFile.absolutePath,
            pageCount = writtenPages,
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
        inputPath: String,
        compressionLevel: String = "balanced", // "light", "balanced", "highly"
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): PdfCompressionResult = withContext(Dispatchers.IO) {
        val inputFile = fileRepository.requireReadableInputFile(inputPath, "Input PDF file")
        val originalSizeBytes = inputFile.length()

        val outputFile = fileRepository.allocateOutputFile("squishh_slim", "pdf")

        val level = compressionLevel.lowercase()
        val (renderScale, jpegQuality) = when (level) {
            "light" -> Pair(1.3f, 82)
            "highly" -> Pair(0.8f, 38)
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

                val rawW = (ptW * renderScale).toInt().coerceAtLeast(1)
                val rawH = (ptH * renderScale).toInt().coerceAtLeast(1)
                val (renderW, renderH) = capDimensions(rawW, rawH, MAX_PDF_IMAGE_DIMENSION)

                val bitmap = Bitmap.createBitmap(renderW, renderH, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bitmap)
                canvas.drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                page.close()

                val jpegBytes = try {
                    val stream = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)
                    stream.toByteArray()
                } finally {
                    bitmap.recycle()
                }
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
        inputPath: String,
        targetFormat: String = "jpg",
        cancellationToken: AtomicBoolean? = null,
        onProgress: ((progress: Float) -> Unit)? = null
    ): PdfToImagesResult = withContext(Dispatchers.IO) {
        val inputFile = fileRepository.requireReadableInputFile(inputPath, "Input PDF file")

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
                val rawW = (page.width * 2f).toInt().coerceAtLeast(1)
                val rawH = (page.height * 2f).toInt().coerceAtLeast(1)
                val (width, height) = capDimensions(rawW, rawH, MAX_PDF_IMAGE_DIMENSION)

                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val pageFile = fileRepository.allocateOutputFile("squishh_page_${i + 1}", ext)
                try {
                    FileOutputStream(pageFile).use { out ->
                        bitmap.compress(compressFormat, 90, out)
                    }
                } finally {
                    bitmap.recycle()
                }

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
internal class JpegPdfWriter(val outputFile: File) {
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

            // PDF 1.4 Header with binary comment (non-ASCII bytes >= 128)
            writeString("%PDF-1.4\n%")
            writeBytes(byteArrayOf(0xE2.toByte(), 0xE3.toByte(), 0xCF.toByte(), 0xD3.toByte(), '\n'.code.toByte()))

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

                // Content stream (scales image proportionally centered inside page MediaBox)
                val imgAspect = if (page.pixelWidth > 0 && page.pixelHeight > 0) {
                    page.pixelWidth.toFloat() / page.pixelHeight.toFloat()
                } else {
                    page.pageWidthPt / page.pageHeightPt
                }
                val pageAspect = page.pageWidthPt / page.pageHeightPt
                val (drawW, drawH) = if (imgAspect > pageAspect) {
                    page.pageWidthPt to (page.pageWidthPt / imgAspect)
                } else {
                    (page.pageHeightPt * imgAspect) to page.pageHeightPt
                }
                val offsetX = (page.pageWidthPt - drawW) / 2f
                val offsetY = (page.pageHeightPt - drawH) / 2f
                val contentStream = String.format(
                    java.util.Locale.US,
                    "q\n%.2f 0 0 %.2f %.2f %.2f cm\n/Im1 Do\nQ\n",
                    drawW, drawH, offsetX, offsetY
                )
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
