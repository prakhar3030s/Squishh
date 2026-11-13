import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Canonical TypeScript schema defining the Capacitor bridge contract between
 * `src/plugins/squishhEngine.ts` and Android `BridgeModels.kt` / `SquishhEnginePlugin.kt`.
 *
 * Manual parity note (ARCH-007): Every payload interface and event name defined
 * here maps 1:1 to a `@BridgeContract` model in `android/.../BridgeModels.kt`.
 */
export const SQUISHH_PLUGIN_NAME = 'SquishhEngine' as const;

/** Native Capacitor event names emitted by `SquishhEnginePlugin`. */
export const BRIDGE_EVENTS = {
  JOB_PROGRESS: 'jobProgress',
  INCOMING_SHARE_READY: 'incomingShareReady',
  WEB_FILES_PICKED: 'webFilesPicked',
} as const;

export type ImageTargetFormat = 'jpg' | 'png' | 'webp' | 'avif';
export type VideoCompressionLevel = 'light' | 'balanced' | 'high';
export type VideoResolution = 'original' | '1080p' | '720p' | '480p' | '360p';
/** Native audio encoder outputs M4A (AAC) containers exclusively via Jetpack Media3. */
export type AudioTargetFormat = 'm4a';
export type PdfCompressionLevel = 'light' | 'balanced' | 'highly';
export type PdfPageFormat = 'jpg' | 'png';
export type MediaSaveType = 'image' | 'video' | 'audio' | 'pdf';
export type JobStatus = 'processing' | 'completed' | 'failed' | 'cancelled';

/** Metadata for a file copied into local native sandbox cache. */
export interface FileInfo {
  localPath: string;
  displayName: string;
  sizeBytes: number;
  mimeType: string;
}

/** Result returned after exporting a processed file into Android MediaStore. */
export interface SaveResult {
  success: boolean;
  uri: string;
}

/** Incremental or terminal job progress payload emitted on `jobProgress`. */
export interface JobProgress {
  jobId: string;
  /** Normalized completion ratio in `[0.0, 1.0]`. */
  progress: number;
  bytesProcessed: number;
  totalBytes: number;
  status: JobStatus;
  /** Estimated remaining milliseconds (`0` when indeterminate or completed). */
  etaRemainingMs: number;
}

/** Device free storage response from `StatFs`. */
export interface StorageInfo {
  freeBytes: number;
}

/** Options for single-image or batch-item compression. */
export interface ImageProcessOptions {
  jobId?: string;
  inputPath: string;
  targetFormat?: ImageTargetFormat;
  /** Quality level (`5..100`, defaults to `80`). */
  quality?: number;
  /** Target ceiling in bytes; `0` uses fixed quality mode. */
  targetSizeBytes?: number;
}

/** Compressed image metadata returned by `processImage` and `batchProcessImages`. */
export interface ImageProcessResult {
  jobId?: string;
  outputPath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width: number;
  height: number;
  format: string;
}

/** Result returned by `batchProcessImages`. */
export interface BatchImageResult {
  batchId: string;
  count: number;
  results: ImageProcessResult[];
}

/** Options for hardware video transcoding or GIF export. */
export interface VideoProcessOptions {
  jobId?: string;
  inputPath: string;
  compressionLevel?: VideoCompressionLevel;
  resolution?: VideoResolution;
  fpsLimit?: number;
  muteAudio?: boolean;
  asGif?: boolean;
}

/** Output metadata for transcoded video or animated GIF. */
export interface VideoProcessResult {
  outputPath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  isGif: boolean;
}

/** Options for audio transcoding or video soundtrack extraction (`m4a` AAC). */
export interface AudioProcessOptions {
  jobId?: string;
  inputPath: string;
  targetFormat?: AudioTargetFormat;
  bitrateKbps?: number;
  monoDownmix?: boolean;
  extractFromVideo?: boolean;
}

/** Output metadata for compressed or extracted audio tracks. */
export interface AudioProcessResult {
  outputPath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  durationMs: number;
  bitrateKbps: number;
  format: string;
}

/** Output metadata for image-to-PDF compilation and PDF compression. */
export interface PdfProcessResult {
  outputPath: string;
  pageCount: number;
  originalSizeBytes: number;
  compressedSizeBytes: number;
}

/** Output metadata for extracting PDF pages into individual images. */
export interface PdfToImagesResult {
  imagePaths: string[];
  pageCount: number;
  totalSizeBytes: number;
}

/** Pending system `ACTION_SEND` / `ACTION_SEND_MULTIPLE` payload. */
export interface IncomingShare {
  uris: string[];
  mimeType: string;
  count: number;
}

/** Payload emitted on `webFilesPicked` after native `onShowFileChooser` URI resolution. */
export interface WebFilesPickedPayload {
  files: FileInfo[];
  count: number;
}

/** Capacitor plugin bridge contract implemented by native `SquishhEnginePlugin`. */
export interface SquishhEnginePluginInterface {
  /**
   * Resolves a content URI into a cached local file.
   * Rejects if `options.uri` is missing or unreadable.
   */
  resolveFile(options: { uri: string }): Promise<FileInfo>;

  /** Opens the native Android picker and resolves picked URIs into cache. */
  pickFiles(options: { type?: string; multiple?: boolean }): Promise<{ files: FileInfo[]; count: number }>;

  /** Returns and clears any pending incoming share URIs from `MainActivity`. */
  getIncomingShare(): Promise<IncomingShare>;

  /**
   * Compresses or converts a single image off the main thread.
   * Rejects on missing `inputPath`, cancellation, or I/O error.
   */
  processImage(options: ImageProcessOptions): Promise<ImageProcessResult>;

  /**
   * Compresses multiple images concurrently under a foreground notification service.
   * Rejects if `options.items` is empty, cancelled, or all items fail.
   */
  batchProcessImages(options: { batchId?: string; items: ImageProcessOptions[] }): Promise<BatchImageResult>;

  /**
   * Transcodes video via Media3 H.264/AAC or exports a 360px animated GIF.
   * Rejects on missing `inputPath`, cancellation, or codec failure.
   */
  processVideo(options: VideoProcessOptions): Promise<VideoProcessResult>;

  /**
   * Transcodes audio or extracts video soundtrack into an M4A (AAC) file.
   * Rejects on missing `inputPath`, cancellation, or encoder failure.
   */
  processAudio(options: AudioProcessOptions): Promise<AudioProcessResult>;

  /** Combines ordered image paths into a single PDF document. Rejects if `imagePaths` is empty or fails. */
  imagesToPdf(options: { jobId?: string; imagePaths: string[] }): Promise<PdfProcessResult>;

  /** Compresses an existing PDF document. Rejects on missing `inputPath`, cancellation, or invalid PDF. */
  compressPdf(options: { jobId?: string; inputPath: string; compressionLevel?: PdfCompressionLevel }): Promise<PdfProcessResult>;

  /** Renders PDF pages to individual JPG/PNG files. Rejects on missing `inputPath`, cancellation, or read failure. */
  pdfToImages(options: { jobId?: string; inputPath: string; targetFormat?: PdfPageFormat }): Promise<PdfToImagesResult>;

  /** Exports an output file to Android MediaStore (`Pictures`, `Movies`, `Music`, `Download`). */
  saveToGallery(options: {
    sourcePath: string;
    mediaType: MediaSaveType;
    fileName: string;
  }): Promise<SaveResult>;

  /** Opens the Android Share Sheet for `filePaths` via `FileProvider`. Rejects if no readable files exist. */
  shareFiles(options: { filePaths: string[]; title?: string }): Promise<{ success: boolean }>;

  /** Requests cooperative cancellation for an active `jobId`. Rejects if `jobId` is empty. */
  cancelJob(options: { jobId: string }): Promise<{ success: boolean }>;

  /** Returns available external storage bytes via `StatFs`. */
  getAvailableStorage(): Promise<StorageInfo>;

  /** Deletes cached input/output files, clears WebView cache, and returns updated free storage bytes. */
  clearCache(): Promise<{ success: boolean; freeBytes: number }>;

  addListener(
    eventName: typeof BRIDGE_EVENTS.JOB_PROGRESS,
    listenerFunc: (data: JobProgress) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: typeof BRIDGE_EVENTS.INCOMING_SHARE_READY,
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: typeof BRIDGE_EVENTS.WEB_FILES_PICKED,
    listenerFunc: (data: WebFilesPickedPayload) => void
  ): Promise<PluginListenerHandle>;
}
