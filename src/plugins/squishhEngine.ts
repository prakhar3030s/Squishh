import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { GIF_PREVIEW_DIMENSIONS } from '../constants/compression';
import {
  SQUISHH_PLUGIN_NAME,
  type AudioProcessOptions,
  type AudioProcessResult,
  type BatchImageResult,
  type FileInfo,
  type ImageProcessOptions,
  type ImageProcessResult,
  type IncomingShare,
  type PdfProcessResult,
  type PdfToImagesResult,
  type SaveResult,
  type SquishhEnginePluginInterface,
  type StorageInfo,
  type VideoProcessOptions,
  type VideoProcessResult,
} from './bridgeSchema';

export * from './bridgeSchema';

// Register native plugin with web fallbacks for local dev preview
export const SquishhEngine = registerPlugin<SquishhEnginePluginInterface>(SQUISHH_PLUGIN_NAME, {
  web: {
    async resolveFile(options: { uri: string }): Promise<FileInfo> {
      return {
        localPath: options.uri,
        displayName: 'demo_image.jpg',
        sizeBytes: 2_450_000,
        mimeType: 'image/jpeg',
      };
    },
    async pickFiles(): Promise<{ files: FileInfo[]; count: number }> {
      return { files: [], count: 0 };
    },
    async getIncomingShare(): Promise<IncomingShare> {
      return { uris: [], mimeType: '', count: 0 };
    },
    async processImage(options: ImageProcessOptions): Promise<ImageProcessResult> {
      // Simulate web preview
      const targetSize = options.targetSizeBytes && options.targetSizeBytes > 0
        ? options.targetSizeBytes
        : Math.round(2_450_000 * ((options.quality || 80) / 100) * 0.45);
      return {
        outputPath: options.inputPath,
        originalSizeBytes: 2_450_000,
        compressedSizeBytes: targetSize,
        width: 1920,
        height: 1080,
        format: options.targetFormat || 'jpg',
      };
    },
    async batchProcessImages(options: { batchId?: string; items: ImageProcessOptions[] }): Promise<BatchImageResult> {
      const results: ImageProcessResult[] = [];
      for (const item of options.items) {
        const targetSize = item.targetSizeBytes && item.targetSizeBytes > 0
          ? item.targetSizeBytes
          : Math.round(2_450_000 * ((item.quality || 80) / 100) * 0.45);
        results.push({
          jobId: item.jobId,
          outputPath: item.inputPath,
          originalSizeBytes: 2_450_000,
          compressedSizeBytes: targetSize,
          width: 1920,
          height: 1080,
          format: item.targetFormat || 'jpg',
        });
      }
      return {
        batchId: options.batchId || `batch_${Date.now()}`,
        count: results.length,
        results,
      };
    },
    async processVideo(options: VideoProcessOptions): Promise<VideoProcessResult> {
      return {
        outputPath: options.inputPath,
        originalSizeBytes: 42_000_000,
        compressedSizeBytes: 14_500_000,
        durationMs: 32_000,
        width: options.asGif ? GIF_PREVIEW_DIMENSIONS.width : 1280,
        height: options.asGif ? GIF_PREVIEW_DIMENSIONS.height : 720,
        isGif: options.asGif || false,
      };
    },
    async processAudio(options: AudioProcessOptions): Promise<AudioProcessResult> {
      return {
        outputPath: options.inputPath,
        originalSizeBytes: 8_500_000,
        compressedSizeBytes: Math.round(8_500_000 * ((options.bitrateKbps || 128) / 320)),
        durationMs: 180_000,
        bitrateKbps: options.bitrateKbps || 128,
        format: options.targetFormat || 'm4a',
      };
    },
    async imagesToPdf(options: { jobId?: string; imagePaths: string[] }): Promise<PdfProcessResult> {
      return {
        outputPath: 'squishh_doc.pdf',
        pageCount: options.imagePaths.length,
        originalSizeBytes: options.imagePaths.length * 2_000_000,
        compressedSizeBytes: Math.round(options.imagePaths.length * 600_000),
      };
    },
    async compressPdf(options: { jobId?: string; inputPath: string; compressionLevel?: 'light' | 'balanced' | 'highly' }): Promise<PdfProcessResult> {
      const orig = 9_000_000;
      const target = options.compressionLevel === 'light'
        ? Math.round(orig * 0.8)
        : options.compressionLevel === 'highly'
        ? Math.round(orig * 0.15)
        : Math.round(orig * 0.52);
      return {
        outputPath: options.inputPath,
        pageCount: 5,
        originalSizeBytes: orig,
        compressedSizeBytes: target,
      };
    },
    async pdfToImages(options: { jobId?: string; inputPath: string; targetFormat?: 'jpg' | 'png' }): Promise<PdfToImagesResult> {
      return {
        imagePaths: [options.inputPath],
        pageCount: 1,
        totalSizeBytes: 1_200_000,
      };
    },
    async saveToGallery(): Promise<SaveResult> {
      return { success: true, uri: 'blob:mock-saved-file' };
    },
    async shareFiles(): Promise<{ success: boolean }> {
      return { success: true };
    },
    async cancelJob(): Promise<{ success: boolean }> {
      return { success: true };
    },
    async getAvailableStorage(): Promise<StorageInfo> {
      return { freeBytes: 16 * 1024 * 1024 * 1024 }; // 16 GB
    },
    async clearCache(): Promise<{ success: boolean; freeBytes: number }> {
      return { success: true, freeBytes: 16 * 1024 * 1024 * 1024 };
    },
    async addListener(): Promise<PluginListenerHandle> {
      return { remove: async () => {} };
    },
  },
});
