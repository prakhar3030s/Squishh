import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ImageWorkflow } from '../components/ImageWorkflow';
import { VideoWorkflow } from '../components/VideoWorkflow';
import { AudioWorkflow } from '../components/AudioWorkflow';
import { PdfWorkflow } from '../components/PdfWorkflow';
import { SquishhServicesProvider } from '../services/ServiceContext';
import type { WorkflowFile } from '../services/engineManager';

describe('Workflow Components (TEST-009)', () => {
  const mockEngine = {
    init: vi.fn().mockResolvedValue(undefined),
    compressImage: vi.fn(),
    batchCompressImages: vi.fn(),
    compressVideo: vi.fn(),
    compressAudio: vi.fn(),
    imagesToPdf: vi.fn(),
    compressPdf: vi.fn(),
    pdfToImages: vi.fn(),
    saveOutputToGallery: vi.fn().mockResolvedValue('blob:saved'),
    shareFiles: vi.fn().mockResolvedValue(true),
    cancelJob: vi.fn().mockResolvedValue(true),
    clearCache: vi.fn().mockResolvedValue({ success: true, freeBytes: 10 * 1024 * 1024 * 1024 }),
    getStorageInfo: vi.fn().mockResolvedValue({ formatted: '10 GB', freeBytes: 10 * 1024 * 1024 * 1024 }),
    getIncomingShare: vi.fn().mockResolvedValue({ count: 0, uris: [], mimeType: '' }),
    resolveContentUri: vi.fn(),
    onIncomingShareReady: vi.fn().mockResolvedValue(() => {}),
    onProgress: vi.fn().mockReturnValue(() => {}),
  } as any;

  const mockHaptics = {
    selection: vi.fn(),
    lightImpact: vi.fn(),
    mediumImpact: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithServices = (ui: React.ReactElement) => {
    return render(
      <SquishhServicesProvider services={{ engine: mockEngine, haptics: mockHaptics }}>
        {ui}
      </SquishhServicesProvider>
    );
  };

  describe('ImageWorkflow', () => {
    it('starts in idle stage with accessible drop zone', () => {
      renderWithServices(<ImageWorkflow />);
      expect(screen.getByText(/drop image\(s\) here or tap to pick/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /drop image\(s\) here or tap to pick/i })).toBeInTheDocument();
    });

    it('transitions to configuring stage when sharedFiles are received', () => {
      const shared: WorkflowFile[] = [
        { name: 'test.jpg', sizeBytes: 2048, uri: '/cache/test.jpg', previewUrl: 'blob:test' },
      ];
      renderWithServices(<ImageWorkflow sharedFiles={shared} />);
      expect(screen.getByText('test.jpg')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /squish photo now/i })).toBeInTheDocument();
    });

    it('switches format and triggers haptic feedback', () => {
      const shared: WorkflowFile[] = [
        { name: 'photo.png', sizeBytes: 5000, uri: '/cache/photo.png', previewUrl: 'blob:photo' },
      ];
      renderWithServices(<ImageWorkflow sharedFiles={shared} />);
      const jpgBtn = screen.getByRole('button', { name: /jpg/i });
      fireEvent.click(jpgBtn);
      expect(mockHaptics.selection).toHaveBeenCalled();
      expect(jpgBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('displays error banner when compression rejects', async () => {
      const shared: WorkflowFile[] = [
        { name: 'bad.jpg', sizeBytes: 1000, uri: '/cache/bad.jpg', previewUrl: 'blob:bad' },
      ];
      mockEngine.compressImage.mockRejectedValueOnce(new Error('ENOSPC: storage full'));
      renderWithServices(<ImageWorkflow sharedFiles={shared} />);

      const squishBtn = screen.getByRole('button', { name: /squish photo now/i });
      fireEvent.click(squishBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/device space is low/i);
      });
    });
  });

  describe('VideoWorkflow', () => {
    it('starts in idle stage with video drop zone', () => {
      renderWithServices(<VideoWorkflow />);
      expect(screen.getByText(/drop video here or tap to pick/i)).toBeInTheDocument();
    });

    it('intakes shared video and shows compression options', () => {
      const sharedVideo: WorkflowFile = {
        name: 'sample.mp4',
        sizeBytes: 10 * 1024 * 1024,
        uri: '/cache/sample.mp4',
        previewUrl: 'blob:sample',
      };
      renderWithServices(<VideoWorkflow sharedFile={sharedVideo} />);
      expect(screen.getByText('sample.mp4')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /squish video/i })).toBeInTheDocument();
    });
  });

  describe('AudioWorkflow', () => {
    it('starts in idle stage with audio drop zone', () => {
      renderWithServices(<AudioWorkflow />);
      expect(screen.getByText(/drop audio or video file here/i)).toBeInTheDocument();
    });

    it('intakes shared audio file and configures bitrate', () => {
      const sharedAudio: WorkflowFile = {
        name: 'podcast.mp3',
        sizeBytes: 5 * 1024 * 1024,
        uri: '/cache/podcast.mp3',
        previewUrl: 'blob:podcast',
      };
      renderWithServices(<AudioWorkflow sharedFile={sharedAudio} />);
      expect(screen.getByText('podcast.mp3')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /squish audio now/i })).toBeInTheDocument();
    });
  });

  describe('PdfWorkflow', () => {
    it('starts in idle stage with PDF drop zone and sub-mode tabs', () => {
      renderWithServices(<PdfWorkflow />);
      expect(screen.getByRole('tab', { name: /photos → pdf/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /compress pdf/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /pdf → images/i })).toBeInTheDocument();
    });

    it('switches sub-modes cleanly', () => {
      renderWithServices(<PdfWorkflow />);
      const compressTab = screen.getByRole('tab', { name: /compress pdf/i });
      fireEvent.click(compressTab);
      expect(compressTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText(/pick pdf to compress/i)).toBeInTheDocument();
    });
  });
});
