package com.prakhar.squishh

import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module

/**
 * Koin dependency graph for native storage, processing, and bridge controllers (ARCH-003).
 */
val appModule = module {
    single<FileRepository> { DefaultFileRepository(androidContext()) }
    single { ForegroundProgressController(androidContext()) }
    single { JobCancellationManager() }
    single { ShareHandler(androidContext()) }
    single { ImageProcessor(get()) }
    single { VideoProcessor(androidContext(), get()) }
    single { AudioProcessor(androidContext(), get()) }
    single { PdfProcessor(get()) }
}
