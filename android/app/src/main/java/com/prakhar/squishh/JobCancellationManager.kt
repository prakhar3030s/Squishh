package com.prakhar.squishh

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Coordinates active job and batch cancellation tokens across processing calls (ARCH-001).
 */
class JobCancellationManager {
    private val activeTokens = ConcurrentHashMap<String, AtomicBoolean>()
    private val batchChildren = ConcurrentHashMap<String, List<String>>()

    fun registerJob(jobId: String): AtomicBoolean {
        val token = AtomicBoolean(false)
        activeTokens[jobId] = token
        return token
    }

    fun registerBatch(batchId: String, childIds: List<String>): AtomicBoolean {
        val batchToken = AtomicBoolean(false)
        activeTokens[batchId] = batchToken
        childIds.forEach { childId ->
            activeTokens[childId] = AtomicBoolean(false)
        }
        batchChildren[batchId] = childIds.toList()
        return batchToken
    }

    fun tokenFor(jobId: String): AtomicBoolean? = activeTokens[jobId]

    /**
     * Signals cancellation for [jobId] (and any child jobs if [jobId] is a batch).
     * Returns true if the caller should also stop the foreground service notification.
     */
    fun cancel(jobId: String): Boolean {
        activeTokens[jobId]?.set(true)
        batchChildren[jobId]?.forEach { childId ->
            activeTokens[childId]?.set(true)
        }
        val isBatchChild = batchChildren.values.any { it.contains(jobId) }
        return !isBatchChild
    }

    fun unregisterJob(jobId: String) {
        activeTokens.remove(jobId)
    }

    fun unregisterBatch(batchId: String, childIds: List<String>) {
        batchChildren.remove(batchId)
        childIds.forEach { activeTokens.remove(it) }
        activeTokens.remove(batchId)
    }

    fun cancelAll() {
        activeTokens.values.forEach { it.set(true) }
        activeTokens.clear()
        batchChildren.clear()
    }
}
