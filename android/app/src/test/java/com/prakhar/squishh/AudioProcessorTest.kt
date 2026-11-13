package com.prakhar.squishh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioProcessorTest {

    @Test
    fun testBitrateClampingBounds() {
        // Under 32 kbps -> clamped to 32
        assertEquals(32, AudioProcessor.clampBitrate(0))
        assertEquals(32, AudioProcessor.clampBitrate(-50))
        assertEquals(32, AudioProcessor.clampBitrate(16))
        assertEquals(32, AudioProcessor.clampBitrate(31))

        // Normal range
        assertEquals(32, AudioProcessor.clampBitrate(32))
        assertEquals(64, AudioProcessor.clampBitrate(64))
        assertEquals(128, AudioProcessor.clampBitrate(128))
        assertEquals(192, AudioProcessor.clampBitrate(192))
        assertEquals(320, AudioProcessor.clampBitrate(320))

        // Over 320 kbps -> clamped to 320
        assertEquals(320, AudioProcessor.clampBitrate(321))
        assertEquals(320, AudioProcessor.clampBitrate(500))
        assertEquals(320, AudioProcessor.clampBitrate(1000))
    }

    @Test
    fun testMonoDownmixMatrixCoefficients() {
        // Stereo -> 2 channels, each 0.5f
        val stereo = AudioProcessor.computeChannelMixingCoefficients(2)
        assertEquals(2, stereo.size)
        assertEquals(0.5f, stereo[0], 0.0001f)
        assertEquals(0.5f, stereo[1], 0.0001f)
        assertEquals(1.0f, stereo.sum(), 0.0001f)

        // 5.1 surround -> 6 channels, each 1/6f
        val surround = AudioProcessor.computeChannelMixingCoefficients(6)
        assertEquals(6, surround.size)
        surround.forEach { assertEquals(1f / 6f, it, 0.0001f) }
        assertEquals(1.0f, surround.sum(), 0.0001f)

        // 7.1 surround -> 8 channels, each 1/8f
        val eightChannels = AudioProcessor.computeChannelMixingCoefficients(8)
        assertEquals(8, eightChannels.size)
        eightChannels.forEach { assertEquals(1f / 8f, it, 0.0001f) }
        assertEquals(1.0f, eightChannels.sum(), 0.0001f)

        // Mono -> 1 channel, 1.0f
        val mono = AudioProcessor.computeChannelMixingCoefficients(1)
        assertEquals(1, mono.size)
        assertEquals(1.0f, mono[0], 0.0001f)

        // Zero / negative edge cases -> coerced to 1
        val zero = AudioProcessor.computeChannelMixingCoefficients(0)
        assertEquals(1, zero.size)
        assertEquals(1.0f, zero[0], 0.0001f)
    }

    @Test
    fun testDefaultOutputFormatIsM4a() {
        assertEquals("m4a", AudioProcessor.DEFAULT_OUTPUT_FORMAT)
    }
}
