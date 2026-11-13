import { Capacitor } from '@capacitor/core';
import {
  SquishhEngine,
  FileInfo,
  JobProgress,
  ImageProcessOptions,
  ImageProcessResult,
  BatchImageResult,
  VideoProcessOptions,
  VideoProcessResult,
  AudioProcessOptions,
  AudioProcessResult,
  PdfProcessResult,
  PdfToImagesResult,
} from '../plugins/squishhEngine';

export interface WorkflowFile {
  name: string;
  sizeBytes: number;
  uri: string;
  previewUrl: string;
  isVideo?: boolean;
}

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatEta(ms: number): string {
  if (ms <= 0) return 'calculating…';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `~${seconds}s left`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return `~${minutes}m ${remSec}s left`;
}

export function humanizeError(rawError: unknown, fallback: string = "that file's being stubborn, try another?"): string {
  if (!rawError) return fallback;
  const msg = typeof rawError === 'string' ? rawError : (rawError as any).message || String(rawError);
  const lower = msg.toLowerCase();

  if (lower.includes('enospc') || lower.includes('space') || lower.includes('storage')) {
    return 'device space is low — clear a little room and try again!';
  }
  if (lower.includes('codec') || lower.includes('encoder') || lower.includes('mediacodec') || lower.includes('unsupported format')) {
    return "your device doesn't have a hardware encoder for this exact format, try standard MP4 or WebP!";
  }
  if (lower.includes('header') || lower.includes('corrupt') || lower.includes('malformed') || lower.includes('demuxer') || lower.includes('end of stream')) {
    return "that file's header seems a bit damaged, try another file?";
  }
  if (lower.includes('cancel')) {
    return 'operation cancelled.';
  }
  return fallback;
}

class EngineManager {
  private progressListeners = new Map<string, (progress: JobProgress) => void>();
  private listenerHandle: { remove: () => Promise<void> } | null = null;
  private webChooserListenerHandle: { remove: () => Promise<void> } | null = null;
  private pendingWebChooserHandler: ((files: WorkflowFile[]) => void) | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.listenerHandle && this.webChooserListenerHandle) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        this.listenerHandle = await SquishhEngine.addListener('jobProgress', (data: JobProgress) => {
          const callback = this.progressListeners.get(data.jobId);
          if (callback) {
            callback(data);
          }
        });
        this.webChooserListenerHandle = await SquishhEngine.addListener(
          'webFilesPicked',
          (data: { files: FileInfo[]; count: number }) => {
            const handler = this.pendingWebChooserHandler;
            this.pendingWebChooserHandler = null;
            if (!handler || !data?.files || data.files.length === 0) return;
            const mapped: WorkflowFile[] = data.files.map((f) => ({
              name: f.displayName,
              sizeBytes: f.sizeBytes,
              uri: f.localPath,
              previewUrl: Capacitor.convertFileSrc(f.localPath),
            }));
            handler(mapped);
          }
        );
      } catch {
        // Graceful fallback on web
      }
    })();
    return this.initPromise;
  }

  setPendingWebChooserHandler(handler: ((files: WorkflowFile[]) => void) | null): void {
    this.init().catch(() => {});
    this.pendingWebChooserHandler = handler;
  }

  onProgress(jobId: string, callback: (progress: JobProgress) => void): () => void {
    // Lazily ensure listener is established
    this.init().catch(() => {});
    this.progressListeners.set(jobId, callback);
    return () => {
      this.progressListeners.delete(jobId);
    };
  }

  async resolveContentUri(uri: string): Promise<FileInfo> {
    return await SquishhEngine.resolveFile({ uri });
  }

  /**
   * Launches the native Android picker on native platforms.
   * Returns:
   * - non-empty array when files were picked
   * - empty array (`[]`) when the user cancelled the native picker
   * - `null` when running on web or native picker failed (caller should open web file input)
   */
  async pickFiles(type: string = '*/*', multiple: boolean = false): Promise<WorkflowFile[] | null> {
    if (!Capacitor.isNativePlatform()) {
      return null;
    }
    try {
      const res = await SquishhEngine.pickFiles({ type, multiple });
      if (res && res.files && res.files.length > 0) {
        return res.files.map((f) => ({
          name: f.displayName,
          sizeBytes: f.sizeBytes,
          uri: f.localPath,
          previewUrl: Capacitor.convertFileSrc(f.localPath),
        }));
      }
      return [];
    } catch (err) {
      console.warn('Native file picker failed, will fallback to web file picker:', err);
      return null;
    }
  }

  async cacheWebFile(file: File): Promise<WorkflowFile> {
    if (Capacitor.isNativePlatform()) {
      throw new Error('Native platform must resolve files through StorageResolver without JS base64 transfer');
    }
    const previewUrl = URL.createObjectURL(file);
    return {
      name: file.name,
      sizeBytes: file.size,
      uri: previewUrl,
      previewUrl,
    };
  }

  async getIncomingShare(): Promise<{ uris: string[]; mimeType: string; count: number }> {
    return await SquishhEngine.getIncomingShare();
  }

  async onIncomingShareReady(callback: () => void): Promise<() => void> {
    try {
      const handle = await SquishhEngine.addListener('incomingShareReady', callback);
      return () => {
        handle.remove().catch(() => {});
      };
    } catch {
      return () => {};
    }
  }

  async compressImage(
    options: ImageProcessOptions,
    onProgress?: (p: JobProgress) => void
  ): Promise<ImageProcessResult> {
    const jobId = options.jobId || `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let unsub: (() => void) | null = null;
    if (onProgress) {
      unsub = this.onProgress(jobId, onProgress);
    }
    try {
      return await SquishhEngine.processImage({ ...options, jobId });
    } finally {
      unsub?.();
    }
  }

  async batchCompressImages(
    items: ImageProcessOptions[],
    batchId?: string,
    onProgress?: (p: JobProgress) => void
  ): Promise<BatchImageResult> {
    const bId = batchId || `batch_${Date.now()}`;
    const unsubs: (() => void)[] = [];
    if (onProgress) {
      items.forEach((item, idx) => {
        const itemId = item.jobId || `${bId}-${idx}`;
        unsubs.push(this.onProgress(itemId, onProgress));
      });
    }
    try {
      return await SquishhEngine.batchProcessImages({
        batchId: bId,
        items: items.map((item, idx) => ({
          ...item,
          jobId: item.jobId || `${bId}-${idx}`,
        })),
      });
    } finally {
      unsubs.forEach((u) => u());
    }
  }

  async compressVideo(
    options: VideoProcessOptions,
    onProgress?: (p: JobProgress) => void
  ): Promise<VideoProcessResult> {
    const jobId = options.jobId || `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let unsub: (() => void) | null = null;
    if (onProgress) {
      unsub = this.onProgress(jobId, onProgress);
    }
    try {
      return await SquishhEngine.processVideo({ ...options, jobId });
    } finally {
      unsub?.();
    }
  }

  async compressAudio(
    options: AudioProcessOptions,
    onProgress?: (p: JobProgress) => void
  ): Promise<AudioProcessResult> {
    const jobId = options.jobId || `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let unsub: (() => void) | null = null;
    if (onProgress) {
      unsub = this.onProgress(jobId, onProgress);
    }
    try {
      return await SquishhEngine.processAudio({ ...options, jobId });
    } finally {
      unsub?.();
    }
  }

  async imagesToPdf(
    imagePaths: string[],
    onProgress?: (p: JobProgress) => void,
    jobId?: string
  ): Promise<PdfProcessResult> {
    const id = jobId || `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let unsub: (() => void) | null = null;
    if (onProgress) {
      unsub = this.onProgress(id, onProgress);
    }
    try {
      return await SquishhEngine.imagesToPdf({ jobId: id, imagePaths });
    } finally {
      unsub?.();
    }
  }

  async compressPdf(
    options: {
      inputPath: string;
      jobId?: string;
      compressionLevel?: 'light' | 'balanced' | 'highly';
    },
    onProgress?: (p: JobProgress) => void
  ): Promise<PdfProcessResult> {
    const id = options.jobId || `pdf_slim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let unsub: (() => void) | null = null;
    if (onProgress) {
      unsub = this.onProgress(id, onProgress);
    }
    try {
      return await SquishhEngine.compressPdf({ ...options, jobId: id });
    } finally {
      unsub?.();
    }
  }

  async pdfToImages(
    inputPath: string,
    targetFormat: 'jpg' | 'png' = 'jpg',
    onProgress?: (p: JobProgress) => void,
    jobId?: string
  ): Promise<PdfToImagesResult> {
    const id = jobId || `pdf_ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let unsub: (() => void) | null = null;
    if (onProgress) {
      unsub = this.onProgress(id, onProgress);
    }
    try {
      return await SquishhEngine.pdfToImages({ jobId: id, inputPath, targetFormat });
    } finally {
      unsub?.();
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const result = await SquishhEngine.cancelJob({ jobId });
    return result.success;
  }

  async saveOutputToGallery(
    sourcePath: string,
    mediaType: 'image' | 'video' | 'audio' | 'pdf',
    fileName: string
  ): Promise<string> {
    const result = await SquishhEngine.saveToGallery({
      sourcePath,
      mediaType,
      fileName,
    });
    return result.uri;
  }

  async shareFiles(filePaths: string[], title?: string): Promise<boolean> {
    if (filePaths.length === 0) return false;
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await SquishhEngine.shareFiles({ filePaths, title });
        return res.success;
      } catch (e) {
        console.error('Failed to share files via native plugin:', e);
        return false;
      }
    } else {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          // Attempt Web Share with actual files if available
          const filesToShare: File[] = [];
          for (const path of filePaths) {
            if (path.startsWith('blob:') || path.startsWith('data:')) {
              try {
                const res = await fetch(path);
                const blob = await res.blob();
                const filename = `squished_${Date.now()}.${blob.type.split('/')[1] || 'bin'}`;
                filesToShare.push(new File([blob], filename, { type: blob.type }));
              } catch {
                // Fall back to title/text sharing
              }
            }
          }

          if (filesToShare.length > 0 && (navigator as any).canShare?.({ files: filesToShare })) {
            await (navigator as any).share({
              files: filesToShare,
              title: title || 'Squished with Squishh',
              text: title || 'Squished with Squishh',
            });
            return true;
          }

          await (navigator as any).share({
            title: title || 'Squished with Squishh',
            text: title || 'Squished with Squishh',
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  async getStorageInfo(): Promise<{ freeBytes: number; formatted: string }> {
    const info = await SquishhEngine.getAvailableStorage();
    return {
      freeBytes: info.freeBytes,
      formatted: formatBytes(info.freeBytes),
    };
  }

  async clearCache(): Promise<{ success: boolean; freeBytes: number }> {
    try {
      return await SquishhEngine.clearCache();
    } catch (e) {
      console.error('Failed to clear cache:', e);
      return { success: false, freeBytes: 0 };
    }
  }
}

export const engineManager = new EngineManager();
