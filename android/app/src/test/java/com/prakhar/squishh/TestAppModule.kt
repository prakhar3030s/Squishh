package com.prakhar.squishh

import io.mockk.mockk
import org.koin.core.module.Module
import org.koin.dsl.module

fun createTestAppModule(
    fileRepository: FileRepository = mockk(relaxed = true),
    cancellationManager: JobCancellationManager = JobCancellationManager(),
    foregroundController: ForegroundProgressController = mockk(relaxed = true),
    shareHandler: ShareHandler = mockk(relaxed = true),
    imageProcessor: ImageProcessor = mockk(relaxed = true),
    videoProcessor: VideoProcessor = mockk(relaxed = true),
    audioProcessor: AudioProcessor = mockk(relaxed = true),
    pdfProcessor: PdfProcessor = mockk(relaxed = true)
): Module = module {
    single { fileRepository }
    single { cancellationManager }
    single { foregroundController }
    single { shareHandler }
    single { imageProcessor }
    single { videoProcessor }
    single { audioProcessor }
    single { pdfProcessor }
}
