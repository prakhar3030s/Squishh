import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { SquishhEngine } from '../plugins/squishhEngine';

vi.mock('../plugins/squishhEngine', () => {
  return {
    SquishhEngine: {
      addListener: vi.fn().mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) }),
      getIncomingShare: vi.fn().mockResolvedValue({ count: 0, uris: [], mimeType: '' }),
      getAvailableStorage: vi.fn().mockResolvedValue({
        freeBytes: 8.5 * 1024 * 1024 * 1024,
      }),
      clearCache: vi.fn().mockResolvedValue({ success: true, freeBytes: 8.5 * 1024 * 1024 * 1024 }),
      resolveFile: vi.fn(),
      processImage: vi.fn(),
      saveToGallery: vi.fn().mockResolvedValue({ success: true, uri: 'blob:mock-saved' }),
      shareFiles: vi.fn().mockResolvedValue({ success: true }),
      cancelJob: vi.fn().mockResolvedValue({ success: true }),
    },
  };
});

describe('Narrow E2E: App.tsx end-to-end integration (TEST-010)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders application header and storage badge', async () => {
    render(<App />);

    expect(screen.getByText('squishh')).toBeInTheDocument();
    expect(screen.getByText(/100% offline • private/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/8.5 GB free/i)).toBeInTheDocument();
    });
  });

  it('completes full image workflow: pick -> configure -> compress -> result -> save', async () => {
    // Mock incoming system share resolving an image into Squishh
    (SquishhEngine.getIncomingShare as any).mockResolvedValueOnce({
      count: 1,
      mimeType: 'image/jpeg',
      uris: ['content://media/external/images/media/42'],
    });

    (SquishhEngine.resolveFile as any).mockResolvedValueOnce({
      localPath: '/cache/sample_photo.jpg',
      displayName: 'sample_photo.jpg',
      sizeBytes: 4 * 1024 * 1024, // 4 MB
      mimeType: 'image/jpeg',
    });

    (SquishhEngine.processImage as any).mockResolvedValueOnce({
      outputPath: '/cache/squishh_sample_photo.webp',
      originalSizeBytes: 4 * 1024 * 1024,
      compressedSizeBytes: 800 * 1024, // 800 KB (80% saved)
      width: 1920,
      height: 1080,
      format: 'webp',
    });

    render(<App />);

    // 1. Intake: App resolves incoming share and automatically switches to 'configuring' stage
    await waitFor(() => {
      expect(screen.getByText('sample_photo.jpg')).toBeInTheDocument();
    });

    const squishButton = screen.getByRole('button', { name: /squish photo now/i });
    expect(squishButton).toBeInTheDocument();

    // 2. Compress: Click squish now
    fireEvent.click(squishButton);

    // 3. Result: Done stage is presented with savings
    await waitFor(() => {
      expect(screen.getByText(/photo successfully squished/i)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /save to gallery/i })[0]).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /share image/i })[0]).toBeInTheDocument();
    });

    // 4. Save: Click save to gallery
    const saveButton = screen.getAllByRole('button', { name: /save to gallery/i })[0];
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(SquishhEngine.saveToGallery).toHaveBeenCalled();
    });
  });
});
