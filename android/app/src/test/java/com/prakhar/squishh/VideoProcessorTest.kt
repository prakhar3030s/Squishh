package com.prakhar.squishh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VideoProcessorTest {

    @Test
    fun testEstimatedSizeRatio() {
        assertEquals(0.75f, VideoProcessor.estimatedSizeRatio("light"), 0.001f)
        assertEquals(0.50f, VideoProcessor.estimatedSizeRatio("balanced"), 0.001f)
        assertEquals(0.22f, VideoProcessor.estimatedSizeRatio("high"), 0.001f)
        assertEquals(0.60f, VideoProcessor.estimatedSizeRatio("unknown"), 0.001f)
    }

    @Test
    fun testMonotonicityAcrossCompressionLevels() {
        // For a typical 50 MB, 60s 1080p video:
        val origBytes = 50L * 1024 * 1024
        val durationMs = 60_000L
        val origHeight = 1080

        val lightBps = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = origHeight,
            compressionLevel = "light"
        )

        val balancedBps = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = origHeight,
            compressionLevel = "balanced"
        )

        val highBps = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = origHeight,
            compressionLevel = "high"
        )

        assertTrue(
            "Monotonicity: high ($highBps) <= balanced ($balancedBps)",
            highBps <= balancedBps
        )
        assertTrue(
            "Monotonicity: balanced ($balancedBps) <= light ($lightBps)",
            balancedBps <= lightBps
        )
    }

    @Test
    fun testMinimumBitrateFloorsEnforced() {
        // Extremely low bitrate / small file
        val tinyBytes = 10L * 1024
        val durationMs = 120_000L // 2 minutes

        val lightBps = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = tinyBytes,
            durationMs = durationMs,
            origHeight = 720,
            compressionLevel = "light"
        )
        assertTrue("Light bitrate $lightBps must be >= 350,000 bps", lightBps >= 350_000)

        val balancedBps = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = tinyBytes,
            durationMs = durationMs,
            origHeight = 720,
            compressionLevel = "balanced"
        )
        assertTrue("Balanced bitrate $balancedBps must be >= 250,000 bps", balancedBps >= 250_000)

        val highBps = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = tinyBytes,
            durationMs = durationMs,
            origHeight = 720,
            compressionLevel = "high"
        )
        assertTrue("High bitrate $highBps must be >= 180,000 bps", highBps >= 180_000)
    }

    @Test
    fun testResolutionBasedBitratesWhenLevelUnspecified() {
        val origBytes = 100L * 1024 * 1024
        val durationMs = 60_000L

        // 360p standard vs 60fps
        val bps360Std = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = 1080,
            compressionLevel = "",
            resolution = "360p",
            fpsLimit = 30
        )
        val bps360HighFps = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = 1080,
            compressionLevel = "",
            resolution = "360p",
            fpsLimit = 60
        )
        assertTrue("60fps bitrate ($bps360HighFps) >= 30fps ($bps360Std)", bps360HighFps >= bps360Std)

        // 720p vs 480p vs 360p
        val bps480 = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = 1080,
            compressionLevel = "",
            resolution = "480p"
        )
        val bps720 = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = 1080,
            compressionLevel = "",
            resolution = "720p"
        )
        assertTrue("720p ($bps720) >= 480p ($bps480)", bps720 >= bps480)
        assertTrue("480p ($bps480) >= 360p ($bps360Std)", bps480 >= bps360Std)
    }

    @Test
    fun testMuteAudioAllowsHigherVideoBitrate() {
        val origBytes = 20L * 1024 * 1024
        val durationMs = 30_000L

        val withAudio = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = 720,
            compressionLevel = "balanced",
            muteAudio = false
        )
        val muted = VideoProcessor.calculateTargetVideoBitrate(
            originalSizeBytes = origBytes,
            durationMs = durationMs,
            origHeight = 720,
            compressionLevel = "balanced",
            muteAudio = true
        )
        assertTrue("Muting audio should give equal or greater bitrate to video: muted=$muted vs audio=$withAudio", muted >= withAudio)
    }
}
