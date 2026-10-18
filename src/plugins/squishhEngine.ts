import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface FileInfo {
  localPath: string;
  displayName: string;
  sizeBytes: number;
  mimeType: string;
}

export interface SaveResult {
  success: boolean;
  uri: string;
}

export interface JobProgress {
  jobId: string;
  progress: number; // 0.0 to 1.0
  bytesProcessed: number;
  totalBytes: number;
  status: 'processing' | 'completed' | 'failed' | 'cancelled';
  etaRemainingMs: number;
}

export interface StorageInfo {
  freeBytes: number;
}

export interface ImageProcessOptions {
  jobId?: string;
  inputPath: string;
  targetFormat?: 'jpg' | 'png' | 'webp' | 'avif';
  quality?: number; // 5-100
  targetSizeBytes?: number;
  maxDimension?: number;
}

export interface ImageProcessResult {
  outputPath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width: number;
  height: number;
  format: string;
}

export interface BatchImageResult {
  batchId: string;
  count: number;
  results: ImageProcessResult[];
}

export interface VideoProcessOptions {
  jobId?: string;
  inputPath: string;
  compressionLevel?: 'light' | 'balanced' | 'high';
  targetSizeBytes?: number;
  resolution?: 'original' | '1080p' | '720p' | '480p' | '360p';
  fpsLimit?: number;
  muteAudio?: boolean;
  asGif?: boolean;
}

export interface VideoProcessResult {
  outputPath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  isGif: boolean;
}

export interface AudioProcessOptions {
  jobId?: string;
  inputPath: string;
  targetFormat?: 'm4a' | 'aac' | 'wav' | 'mp3';
  bitrateKbps?: number;
  monoDownmix?: boolean;
  extractFromVideo?: boolean;
}

export interface AudioProcessResult {
  outputPath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  durationMs: number;
  bitrateKbps: number;
  format: string;
}

export interface PdfProcessResult {
  outputPath: string;
  pageCount: number;
  originalSizeBytes: number;
  compressedSizeBytes: number;
}

export interface PdfToImagesResult {
  imagePaths: string[];
  pageCount: number;
  totalSizeBytes: number;
}

export interface IncomingShare {
  uris: string[];
  mimeType: string;
  count: number;
}

export interface SquishhEnginePluginInterface {
  resolveFile(options: { uri: string }): Promise<FileInfo>;
  pickFiles(options: { type?: string; multiple?: boolean }): Promise<{ files: FileInfo[]; count: number }>;
  writeBase64ToCache(options: { fileName: string; base64Data: string; mimeType?: string }): Promise<FileInfo>;
  getIncomingShare(): Promise<IncomingShare>;
  processImage(options: ImageProcessOptions): Promise<ImageProcessResult>;
  batchProcessImages(options: { batchId?: string; items: ImageProcessOptions[] }): Promise<BatchImageResult>;
  processVideo(options: VideoProcessOptions): Promise<VideoProcessResult>;
  processAudio(options: AudioProcessOptions): Promise<AudioProcessResult>;
  imagesToPdf(options: { jobId?: string; imagePaths: string[] }): Promise<PdfProcessResult>;
  compressPdf(options: { jobId?: string; inputPath: string; targetSizeBytes?: number; compressionLevel?: 'light' | 'balanced' | 'highly'; quality?: number }): Promise<PdfProcessResult>;
  pdfToImages(options: { jobId?: string; inputPath: string; targetFormat?: 'jpg' | 'png' }): Promise<PdfToImagesResult>;
  saveToGallery(options: {
    sourcePath: string;
    mediaType: 'image' | 'video' | 'audio' | 'pdf';
    fileName: string;
  }): Promise<SaveResult>;
  shareFiles(options: { filePaths: string[]; title?: string }): Promise<{ success: boolean }>;
  cancelJob(options: { jobId: string }): Promise<{ success: boolean }>;
  startForegroundService(options: { title?: string }): Promise<{ success: boolean }>;
  updateForegroundProgress(options: { title?: string; progress: number }): Promise<{ success: boolean }>;
  stopForegroundService(): Promise<{ success: boolean }>;
  getAvailableStorage(): Promise<StorageInfo>;
  clearCache(): Promise<{ success: boolean; freeBytes: number }>;
  getCacheSizeBytes(): Promise<{ cacheSizeBytes: number }>;
  addListener(
    eventName: 'jobProgress',
    listenerFunc: (data: JobProgress) => void
  ): Promise<PluginListenerHandle>;
}

// Register native plugin with web fallbacks for local dev preview
export const SquishhEngine = registerPlugin<SquishhEnginePluginInterface>('SquishhEngine', {
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
    async writeBase64ToCache(options: { fileName: string; base64Data: string; mimeType?: string }): Promise<FileInfo> {
      return {
        localPath: options.fileName,
        displayName: options.fileName,
        sizeBytes: Math.round(options.base64Data.length * 0.75),
        mimeType: options.mimeType || 'application/octet-stream',
      };
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
      const targetSize = options.targetSizeBytes && options.targetSizeBytes > 0
        ? options.targetSizeBytes
        : 14_500_000;
      return {
        outputPath: options.inputPath,
        originalSizeBytes: 42_000_000,
        compressedSizeBytes: targetSize,
        durationMs: 32_000,
        width: 1280,
        height: 720,
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
    async compressPdf(options: { jobId?: string; inputPath: string; targetSizeBytes?: number; compressionLevel?: 'light' | 'balanced' | 'highly'; quality?: number }): Promise<PdfProcessResult> {
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
        compressedSizeBytes: options.targetSizeBytes && options.targetSizeBytes > 0 ? options.targetSizeBytes : target,
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
    async startForegroundService(): Promise<{ success: boolean }> {
      return { success: true };
    },
    async updateForegroundProgress(): Promise<{ success: boolean }> {
      return { success: true };
    },
    async stopForegroundService(): Promise<{ success: boolean }> {
      return { success: true };
    },
    async getAvailableStorage(): Promise<StorageInfo> {
      return { freeBytes: 16 * 1024 * 1024 * 1024 }; // 16 GB
    },
    async clearCache(): Promise<{ success: boolean; freeBytes: number }> {
      return { success: true, freeBytes: 16 * 1024 * 1024 * 1024 };
    },
    async getCacheSizeBytes(): Promise<{ cacheSizeBytes: number }> {
      return { cacheSizeBytes: 0 };
    },
    async addListener(): Promise<PluginListenerHandle> {
      return { remove: async () => {} };
    },
  },
});
