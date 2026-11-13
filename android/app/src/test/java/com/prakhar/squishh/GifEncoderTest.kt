package com.prakhar.squishh

import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream

class GifEncoderTest {

    @Test
    fun testGifHeaderAndPaletteStructure() {
        val processor = VideoProcessor(mockk(relaxed = true), mockk(relaxed = true))
        val stream = ByteArrayOutputStream()

        processor.writeGifHeaderAndPalette(stream, width = 360, height = 240)
        val bytes = stream.toByteArray()

        // 1. Signature
        val signature = String(bytes.copyOfRange(0, 6), Charsets.US_ASCII)
        assertEquals("GIF89a", signature)

        // 2. Logical Screen Descriptor (width=360, height=240)
        val w = (bytes[6].toInt() and 0xFF) or ((bytes[7].toInt() and 0xFF) shl 8)
        val h = (bytes[8].toInt() and 0xFF) or ((bytes[9].toInt() and 0xFF) shl 8)
        assertEquals(360, w)
        assertEquals(240, h)

        // 3. GCT flag 0xF7 = 256 colors
        assertEquals(0xF7.toByte(), bytes[10])

        // 4. Global Color Table length: 256 * 3 = 768 bytes
        // Followed by Netscape Application Extension (starts with 0x21 0xFF 0x0B "NETSCAPE2.0")
        val netscapeOffset = 13 + 768
        assertEquals(0x21.toByte(), bytes[netscapeOffset])
        assertEquals(0xFF.toByte(), bytes[netscapeOffset + 1])
        assertEquals(0x0B.toByte(), bytes[netscapeOffset + 2])
        val appName = String(bytes.copyOfRange(netscapeOffset + 3, netscapeOffset + 14), Charsets.US_ASCII)
        assertEquals("NETSCAPE2.0", appName)
    }

    @Test
    fun testLzwSubBlockChunkingAndClearCodeEmission() {
        val processor = VideoProcessor(mockk(relaxed = true), mockk(relaxed = true))
        val stream = ByteArrayOutputStream()

        // Test with 600 synthetic pixels (> 254 to force multiple Clear codes)
        val testPixels = ByteArray(600) { (it % 256).toByte() }
        processor.writeUncompressedLzw(testPixels, stream)

        val bytes = stream.toByteArray()
        assertTrue("Output must not be empty", bytes.isNotEmpty())

        // 1. First byte must be minCodeSize (8)
        assertEquals(8.toByte(), bytes[0])

        // 2. Verify sub-block chunking structure:
        // Each chunk: length byte (1..255) followed by that many payload bytes, ending with 0x00 block terminator
        var idx = 1
        val payloadBytes = ByteArrayOutputStream()
        while (idx < bytes.size && bytes[idx] != 0.toByte()) {
            val chunkLen = bytes[idx].toInt() and 0xFF
            assertTrue("Chunk length ($chunkLen) must be <= 255", chunkLen <= 255)
            assertTrue("Chunk length must be > 0 before terminator", chunkLen > 0)
            idx++
            assertTrue("Buffer must contain full chunk", idx + chunkLen <= bytes.size)
            payloadBytes.write(bytes, idx, chunkLen)
            idx += chunkLen
        }

        assertEquals("Stream must end with block terminator 0x00", 0.toByte(), bytes[idx])
        assertEquals("Terminator must be the last byte", bytes.size - 1, idx)

        // 3. Unpack 9-bit LZW codes from payload stream to verify Clear code periodic emission (BUG-019)
        val raw = payloadBytes.toByteArray()
        val codes = mutableListOf<Int>()
        var bitBuf = 0
        var bitCount = 0
        var byteIdx = 0

        while (byteIdx < raw.size || bitCount >= 9) {
            while (bitCount < 9 && byteIdx < raw.size) {
                bitBuf = bitBuf or ((raw[byteIdx].toInt() and 0xFF) shl bitCount)
                bitCount += 8
                byteIdx++
            }
            if (bitCount >= 9) {
                val code = bitBuf and 0x1FF // 9 bits
                codes.add(code)
                bitBuf = bitBuf shr 9
                bitCount -= 9
            }
        }

        val clearCode = 256
        val endCode = 257

        // Code 0 must be initial Clear code
        assertEquals("First code must be Clear code (256)", clearCode, codes[0])

        // Every 254 pixels, a Clear code must be emitted
        // Code 0 = Clear
        // Codes 1..254 = 254 pixels
        // Code 255 must be Clear code!
        assertEquals("Code 255 must be periodic Clear code (256)", clearCode, codes[255])

        // Codes 256..509 = 254 pixels
        // Code 510 must be periodic Clear code!
        assertEquals("Code 510 must be second periodic Clear code (256)", clearCode, codes[510])

        // Last code must be EndCode (257)
        assertEquals("Final code must be EndCode (257)", endCode, codes.last())
    }
}
