import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatBytes, formatEta, humanizeError, engineManager } from '../services/engineManager';
import { SquishhEngine } from '../plugins/squishhEngine';

vi.mock('../plugins/squishhEngine', () => {
  const listeners: Record<string, Function[]> = {};
  return {
    SquishhEngine: {
      addListener: vi.fn((event: string, callback: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
        return Promise.resolve({
          remove: vi.fn(() => {
            listeners[event] = listeners[event].filter((cb) => cb !== callback);
            return Promise.resolve();
          }),
        });
      }),
      pickFiles: vi.fn(),
      resolveContentUri: vi.fn(),
      processImage: vi.fn(),
      processBatchImages: vi.fn(),
      processVideo: vi.fn(),
      processAudio: vi.fn(),
      imagesToPdf: vi.fn(),
      compressPdf: vi.fn(),
      pdfToImages: vi.fn(),
      cancelJob: vi.fn(),
      saveToGallery: vi.fn(),
      clearCache: vi.fn(),
      getStorageInfo: vi.fn(),
      getIncomingShare: vi.fn(),
    },
  };
});

describe('engineManager format helpers', () => {
  it('formats byte quantities accurately with units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(2621440, 2)).toBe('2.5 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('formats ETA duration correctly', () => {
    expect(formatEta(0)).toBe('calculating…');
    expect(formatEta(-500)).toBe('calculating…');
    expect(formatEta(5000)).toBe('~5s left');
    expect(formatEta(59000)).toBe('~59s left');
    expect(formatEta(60000)).toBe('~1m 0s left');
    expect(formatEta(125000)).toBe('~2m 5s left');
  });
});

describe('humanizeError message mapping', () => {
  it('maps storage errors to friendly low-space guidance', () => {
    expect(humanizeError('ENOSPC: no space left on device')).toContain('device space is low');
    expect(humanizeError(new Error('Out of storage capacity'))).toContain('device space is low');
  });

  it('maps codec errors to encoder guidance', () => {
    expect(humanizeError('MediaCodec video encoder initialization failed')).toContain("hardware encoder");
    expect(humanizeError('Unsupported format requested')).toContain("hardware encoder");
  });

  it('maps corrupt file errors to damage guidance', () => {
    expect(humanizeError('Corrupt container demuxer error')).toContain("damaged");
    expect(humanizeError('Malformed header stream')).toContain("damaged");
  });

  it('maps cancellation cleanly', () => {
    expect(humanizeError('Operation cancelled by user')).toBe('operation cancelled.');
  });

  it('returns fallback for unknown errors', () => {
    expect(humanizeError(null, 'custom fallback')).toBe('custom fallback');
    expect(humanizeError('unrecognized system exception', 'custom fallback')).toBe('custom fallback');
  });
});

describe('EngineManager bridge integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers listener and receives jobProgress updates', async () => {
    await engineManager.init();
    expect(SquishhEngine.addListener).toHaveBeenCalledWith('jobProgress', expect.any(Function));
  });

  it('resolves clearCache via SquishhEngine', async () => {
    (SquishhEngine.clearCache as any).mockResolvedValueOnce({ success: true });
    await engineManager.clearCache();
    expect(SquishhEngine.clearCache).toHaveBeenCalled();
  });
});
