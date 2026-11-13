/**
 * Named compression, storage, and UI preset constants (QUAL-004).
 */

/** Minimum free storage threshold (200 MB) below which the low-storage banner triggers. */
export const LOW_STORAGE_THRESHOLD_BYTES = 200 * 1024 * 1024;

/** Default image quality bounds and quick target-size chip presets. */
export const IMAGE_QUALITY_BOUNDS = {
  min: 10,
  max: 95,
  default: 80,
} as const;

export const IMAGE_QUICK_SIZE_CHIPS = [
  { label: '200 KB', mb: 0.2 },
  { label: '500 KB', mb: 0.5 },
  { label: '1 MB', mb: 1.0 },
  { label: '2 MB', mb: 2.0 },
] as const;

/** Estimated output size multipliers matching native `VideoProcessor` presets. */
export const VIDEO_COMPRESSION_PRESETS = [
  {
    id: 'light' as const,
    label: 'Light',
    reduction: '~25%',
    sizeRatio: 0.75,
    desc: 'Crisp quality',
    detail:
      'High bitrate preservation with original resolution. Ideal for keeping pristine quality while shedding unnecessary weight.',
  },
  {
    id: 'balanced' as const,
    label: 'Balanced',
    reduction: '~50%',
    sizeRatio: 0.5,
    desc: 'Optimal size',
    detail:
      'Reduces file size by ~50% with balanced bitrate and HD scaling. Recommended for everyday sharing and cloud storage.',
  },
  {
    id: 'high' as const,
    label: 'High',
    reduction: '~80%',
    sizeRatio: 0.22,
    desc: 'Ultra small',
    detail:
      'Maximum squish down to ~20% of original size with compact downscaling. Great for quick messaging and slow connections.',
  },
] as const;

/** Supported AAC M4A bitrates offered in AudioWorkflow. */
export const AUDIO_BITRATE_OPTIONS = [
  { kbps: 64, label: '64 kbps (Voice / Speech)' },
  { kbps: 96, label: '96 kbps (Compact)' },
  { kbps: 128, label: '128 kbps (Standard)' },
  { kbps: 192, label: '192 kbps (High Quality)' },
  { kbps: 256, label: '256 kbps (Crisp Studio)' },
  { kbps: 320, label: '320 kbps (Maximum Fidelity)' },
] as const;

/** Native PDF compression preset cards matching `PdfProcessor`. */
export const PDF_COMPRESSION_PRESETS = [
  { id: 'light' as const, label: 'Light', reduction: '~20%', desc: 'Crisp text' },
  { id: 'balanced' as const, label: 'Balanced', reduction: '~45-50%', desc: 'Optimal' },
  { id: 'highly' as const, label: 'Highly', reduction: '~80-90%', desc: 'Ultra small' },
] as const;

/** Web mock animated GIF fallback dimensions matching native 360px output width. */
export const GIF_PREVIEW_DIMENSIONS = {
  width: 360,
  height: 202,
} as const;
