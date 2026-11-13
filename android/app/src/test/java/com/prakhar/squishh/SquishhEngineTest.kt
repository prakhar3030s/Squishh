package com.prakhar.squishh

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import org.koin.test.KoinTest
import org.koin.test.get

class SquishhEngineTest : KoinTest {

    @Before
    fun setUp() {
        startKoin {
            modules(createTestAppModule())
        }
    }

    @After
    fun tearDown() {
        stopKoin()
    }

    // --- Original 4 assertions (preserved per TEST-012 instructions) ---

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

    // --- Meaningful Extended Engine & Architecture Tests (TEST-012) ---

    @Test
    fun testJobCancellationManagerSingleJobLifecycle() {
        val manager = get<JobCancellationManager>()
        val jobId = "job_single_123"

        val token = manager.registerJob(jobId)
        assertNotNull(token)
        assertFalse("Token must start uncancelled", token.get())

        manager.cancel(jobId)
        assertTrue("Token must be cancelled after cancel", token.get())

        manager.unregisterJob(jobId)
        // Cancelling unmapped job does not crash
        manager.cancel(jobId)
    }

    @Test
    fun testJobCancellationManagerBatchLifecycle() {
        val manager = get<JobCancellationManager>()
        val batchId = "batch_456"
        val childIds = listOf("child_1", "child_2", "child_3")

        val batchToken = manager.registerBatch(batchId, childIds)
        assertFalse("Batch token starts uncancelled", batchToken.get())

        // Cancelling a child job cancels that child
        manager.cancel("child_2")
        assertTrue(manager.tokenFor("child_2")?.get() == true)

        // Cancelling the batch cancels the batch and all children
        manager.cancel(batchId)
        assertTrue("Batch token must be cancelled", batchToken.get())
        assertTrue("Child 1 must be cancelled by batch cancel", manager.tokenFor("child_1")?.get() == true)
        assertTrue("Child 3 must be cancelled by batch cancel", manager.tokenFor("child_3")?.get() == true)

        manager.unregisterBatch(batchId, childIds)
    }

    @Test
    fun testKoinDependencyInjectionGraphResolvesAllCollaborators() {
        assertNotNull(get<FileRepository>())
        assertNotNull(get<JobCancellationManager>())
        assertNotNull(get<ForegroundProgressController>())
        assertNotNull(get<ShareHandler>())
        assertNotNull(get<ImageProcessor>())
        assertNotNull(get<VideoProcessor>())
        assertNotNull(get<AudioProcessor>())
        assertNotNull(get<PdfProcessor>())
    }
}
