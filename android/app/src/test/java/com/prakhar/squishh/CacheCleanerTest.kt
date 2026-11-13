package com.prakhar.squishh

import android.content.Context
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CacheCleanerTest {

    @Test
    fun testGetFolderSizeCalculation() {
        val tempDir = File.createTempFile("test_size", "dir").apply {
            delete()
            mkdirs()
            deleteOnExit()
        }

        val file1 = File(tempDir, "file1.bin").apply { writeBytes(ByteArray(500)) }
        val subDir = File(tempDir, "subdir").apply { mkdirs() }
        val file2 = File(subDir, "file2.bin").apply { writeBytes(ByteArray(1500)) }

        val totalSize = CacheCleaner.getFolderSize(tempDir)
        assertEquals(2000L, totalSize)

        tempDir.deleteRecursively()
    }

    @Test
    fun testClearAllCacheDeletesFilesRecursively() {
        val mockContext = mockk<Context>()
        val internalCache = File.createTempFile("test_internal_cache", "dir").apply {
            delete()
            mkdirs()
            deleteOnExit()
        }
        val externalCache = File.createTempFile("test_external_cache", "dir").apply {
            delete()
            mkdirs()
            deleteOnExit()
        }

        // Populate with files and subdirectories
        val inSub = File(internalCache, "squishh_in").apply { mkdirs() }
        val inFile = File(inSub, "input1.jpg").apply { writeBytes(ByteArray(1024)) }
        val outSub = File(internalCache, "squishh_out").apply { mkdirs() }
        val outFile = File(outSub, "output1.mp4").apply { writeBytes(ByteArray(2048)) }
        val extFile = File(externalCache, "cache.tmp").apply { writeBytes(ByteArray(512)) }

        every { mockContext.applicationContext } returns mockContext
        every { mockContext.cacheDir } returns internalCache
        every { mockContext.externalCacheDir } returns externalCache
        every { mockContext.codeCacheDir } returns null

        assertTrue(inFile.exists())
        assertTrue(outFile.exists())
        assertTrue(extFile.exists())

        CacheCleaner.clearAllCache(mockContext)

        // Internal and external files must be deleted
        assertFalse("Input file must be deleted", inFile.exists())
        assertFalse("Output file must be deleted", outFile.exists())
        assertFalse("External cache file must be deleted", extFile.exists())
        assertEquals("Internal cache folder should now be empty", 0, internalCache.listFiles()?.size ?: 0)
        assertEquals("External cache folder should now be empty", 0, externalCache.listFiles()?.size ?: 0)

        internalCache.deleteRecursively()
        externalCache.deleteRecursively()
    }

    @Test
    fun testClearAllCacheAsyncAndAwaitPendingCleanup() {
        runBlocking {
            val mockContext = mockk<Context>()
            val tempCache = File.createTempFile("test_async_cache", "dir").apply {
                delete()
                mkdirs()
                deleteOnExit()
            }
            File(tempCache, "dummy.txt").writeBytes(ByteArray(100))

            every { mockContext.applicationContext } returns mockContext
            every { mockContext.cacheDir } returns tempCache
            every { mockContext.externalCacheDir } returns null
            every { mockContext.codeCacheDir } returns null

            val job = CacheCleaner.clearAllCacheAsync(mockContext, isStartup = true)
            // awaitPendingCleanup should complete without throwing
            CacheCleaner.awaitPendingCleanup()
            job.join()

            assertEquals("Cache directory must be empty after async cleanup", 0, tempCache.listFiles()?.size ?: 0)
            tempCache.deleteRecursively()
        }
    }
}
