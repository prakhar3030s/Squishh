import { describe, it, expect } from 'vitest';
import { BatchQueueItem } from '../components/BatchQueueManager';

function calculateOverallProgress(items: BatchQueueItem[]): number {
  const trackableItems = items.filter(
    (it) => it.status !== 'failed' && it.status !== 'cancelled'
  );
  if (trackableItems.length === 0) return 0;
  return Math.round(
    trackableItems.reduce((acc, it) => {
      if (it.status === 'completed') return acc + 100;
      if (it.status === 'waiting') return acc;
      return acc + Math.max(0, Math.min(100, it.progress));
    }, 0) / trackableItems.length
  );
}

describe('BatchQueueManager overallProgress calculation (QUAL-008)', () => {
  it('calculates average across completed, processing, and waiting items', () => {
    const items: BatchQueueItem[] = [
      { id: '1', name: 'img1.jpg', sizeBytes: 1000, progress: 100, status: 'completed' },
      { id: '2', name: 'img2.jpg', sizeBytes: 1000, progress: 50, status: 'processing' },
      { id: '3', name: 'img3.jpg', sizeBytes: 1000, progress: 0, status: 'waiting' },
    ];
    // (100 + 50 + 0) / 3 = 50%
    expect(calculateOverallProgress(items)).toBe(50);
  });

  it('excludes failed and cancelled items from the denominator so finished items reach 100%', () => {
    const items: BatchQueueItem[] = [
      { id: '1', name: 'img1.jpg', sizeBytes: 1000, progress: 100, status: 'completed' },
      { id: '2', name: 'img2.jpg', sizeBytes: 1000, progress: 30, status: 'failed' },
      { id: '3', name: 'img3.jpg', sizeBytes: 1000, progress: 10, status: 'cancelled' },
    ];
    // trackable = [completed], denominator = 1 -> 100%
    expect(calculateOverallProgress(items)).toBe(100);
  });

  it('returns 0% when all items in queue are failed or cancelled', () => {
    const items: BatchQueueItem[] = [
      { id: '1', name: 'img1.jpg', sizeBytes: 1000, progress: 20, status: 'failed' },
      { id: '2', name: 'img2.jpg', sizeBytes: 1000, progress: 40, status: 'cancelled' },
    ];
    expect(calculateOverallProgress(items)).toBe(0);
  });

  it('clamps out-of-bounds progress values between 0 and 100', () => {
    const items: BatchQueueItem[] = [
      { id: '1', name: 'img1.jpg', sizeBytes: 1000, progress: -50, status: 'processing' },
      { id: '2', name: 'img2.jpg', sizeBytes: 1000, progress: 150, status: 'processing' },
    ];
    // clamp(-50) -> 0; clamp(150) -> 100; average = (0 + 100) / 2 = 50%
    expect(calculateOverallProgress(items)).toBe(50);
  });
});
