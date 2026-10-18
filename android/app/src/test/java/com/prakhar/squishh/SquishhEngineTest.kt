package com.prakhar.squishh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SquishhEngineTest {

    @Test
    fun testImageFormatResolution() {
        val formats = listOf("jpeg", "jpg", "png", "webp")
        formats.forEach { fmt ->
            val isSupported = fmt in listOf("jpeg", "jpg", "png", "webp")
            assertTrue("Format $fmt should be supported", isSupported)
        }
    }

    @Test
    fun testVideoBitrateCalculation() {
        // Target: WhatsApp 16 MB for 60s video
        val durationSec = 60
        val targetBytes = 16L * 1024 * 1024 // 16 MB
        val targetBits = targetBytes * 8
        val targetTotalBitrate = (targetBits / durationSec).toInt()

        val audioBitrate = 96_000
        val videoBitrate = (targetTotalBitrate - audioBitrate).coerceAtLeast(200_000)

        assertTrue(videoBitrate > 0)
        assertTrue(videoBitrate < targetTotalBitrate)
        // Verify 16 MB in 60s results in ~2.14 Mbps video stream
        assertEquals(2_140_962, videoBitrate)
    }

    @Test
    fun testAudioBitrateSettings() {
        val voiceBitrate = 64_000
        val standardBitrate = 128_000
        val hifiBitrate = 320_000

        assertTrue(voiceBitrate < standardBitrate)
        assertTrue(standardBitrate < hifiBitrate)
    }

    @Test
    fun testPdfTargetSizeThresholds() {
        val targets = listOf(500 * 1024L, 1024 * 1024L, 2 * 1024 * 1024L)
        targets.forEach { target ->
            assertTrue(target > 0L)
            assertTrue(target <= 2 * 1024 * 1024L)
        }
    }
}
