import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { formatBytes, WorkflowFile } from '../services/engineManager';
import { useEngineManager, useHaptics } from '../services/ServiceContext';
import { IMAGE_QUALITY_BOUNDS, IMAGE_QUICK_SIZE_CHIPS } from '../constants/compression';
import { mapWithConcurrency, useWorkflow } from '../hooks/useWorkflow';
import {
  WorkflowDoneShell,
  WorkflowDropZone,
  WorkflowErrorBanner,
  WorkflowProgressCard,
} from './workflow/WorkflowStageUI';
import { ImageProcessResult } from '../plugins/squishhEngine';
import { BeforeAfterSlider } from './ui/BeforeAfterSlider';
import { SquishhButton } from './ui/SquishhButton';
import { gsap, useGSAP } from '../lib/gsap';
import {
  ArrowDownToLine,
  Sparkles,
  Target,
  Images
} from 'lucide-react';

import { BatchQueueItem } from './BatchQueueManager';

interface SelectedImage {
  name: string;
  sizeBytes: number;
  uri: string;
  previewUrl: string;
}

function detectImageFormat(name?: string, mime?: string): 'webp' | 'jpg' | 'png' | 'avif' {
  const ext = name?.split('.').pop()?.toLowerCase() || '';
  const m = (mime || '').toLowerCase();
  if (ext === 'png' || m.includes('png')) return 'png';
  if (ext === 'webp' || m.includes('webp')) return 'webp';
  if (ext === 'avif' || m.includes('avif')) return 'avif';
  return 'jpg';
}

interface ImageWorkflowProps {
  onQueueUpdate?: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
  sharedFiles?: WorkflowFile[] | null;
  onSharedFilesConsumed?: () => void;
}

export function ImageWorkflow({
  onQueueUpdate,
  sharedFiles,
  onSharedFilesConsumed,
}: ImageWorkflowProps = {}) {
  const engineManager = useEngineManager();
  const haptics = useHaptics();
  const {
    stage,
    progress,
    setProgress,
    errorMessage,
    isSaving,
    savedSuccess,
    beginConfigure,
    executeJob,
    cancelActiveJob,
    runSave,
    runShare,
    resetWorkflow,
  } = useWorkflow();

  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [targetFormat, setTargetFormat] = useState<'webp' | 'jpg' | 'png' | 'avif'>('webp');
  const [quality, setQuality] = useState<number>(IMAGE_QUALITY_BOUNDS.default);
  const [useTargetSize, setUseTargetSize] = useState<boolean>(false);
  const [targetSizeMb, setTargetSizeMb] = useState<number>(1.0);
  const [results, setResults] = useState<ImageProcessResult[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const morphBlobRef = useRef<HTMLDivElement>(null);

  // GSAP animation on the morphing progress indicator
  useGSAP(() => {
    if (stage === 'processing' && morphBlobRef.current) {
      gsap.to(morphBlobRef.current, {
        scale: 1.15,
        rotation: 360,
        borderRadius: '40% 60% 70% 30% / 40% 50% 60% 55%',
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
  }, [stage]);

  const applySelectedImages = (items: SelectedImage[]) => {
    if (items.length === 0) return;
    setSelectedImages(items);
    const defaultFmt = detectImageFormat(items[0].name);
    setTargetFormat(defaultFmt);
    setResults([]);
    beginConfigure();
  };

  useEffect(() => {
    if (!sharedFiles || sharedFiles.length === 0) return;
    applySelectedImages(sharedFiles);
    onSharedFilesConsumed?.();
  }, [sharedFiles, onSharedFilesConsumed]);

  const registerWebChooser = () => {
    engineManager.setPendingWebChooserHandler((resolved) => {
      haptics.mediumImpact();
      applySelectedImages(resolved);
    });
  };

  const handleTriggerPick = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('image/*', true);
    if (picked !== null) {
      if (picked.length > 0) {
        applySelectedImages(picked);
      }
      return;
    }
    registerWebChooser();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    haptics.mediumImpact();
    const loadedList = await mapWithConcurrency(Array.from(files), 4, (file) =>
      engineManager.cacheWebFile(file)
    );

    applySelectedImages(loadedList);
  };

  const handleStartCompression = async () => {
    if (selectedImages.length === 0) return;

    const targetSizeBytes = useTargetSize ? Math.round(targetSizeMb * 1024 * 1024) : 0;

    if (selectedImages.length === 1) {
      const singleImage = selectedImages[0];
      const jobId = `img_${Date.now()}`;
      await executeJob({
        jobId,
        fallbackError: "that file's being stubborn, try another?",
        run: async (id) => {
          const res = await engineManager.compressImage(
            {
              jobId: id,
              inputPath: singleImage.uri,
              targetFormat,
              quality,
              targetSizeBytes,
            },
            (p) => {
              setProgress(Math.round(p.progress * 100));
            }
          );
          setResults([res]);
        },
      });
    } else {
      const batchId = `batch_${Date.now()}`;
      const markBatchStatus = (status: 'cancelled' | 'failed') => {
        onQueueUpdate?.((prev) =>
          prev.map((it) =>
            it.id.startsWith(`${batchId}-`) && it.status === 'processing'
              ? { ...it, status }
              : it
          )
        );
      };

      await executeJob({
        jobId: batchId,
        fallbackError: "batch squishing couldn't finish, try smaller batches?",
        onCancelled: () => markBatchStatus('cancelled'),
        onFailed: () => markBatchStatus('failed'),
        run: async (id) => {
          const batchItems = selectedImages.map((img, i) => ({
            jobId: `${id}-${i}`,
            inputPath: img.uri,
            targetFormat,
            quality,
            targetSizeBytes,
          }));

          const initialQueue: BatchQueueItem[] = selectedImages.map((img, i) => ({
            id: `${id}-${i}`,
            name: img.name,
            sizeBytes: img.sizeBytes,
            progress: 0,
            status: 'processing',
          }));
          onQueueUpdate?.((prev) => [...prev, ...initialQueue]);

          const itemProgressMap = new Map<string, number>();
          const res = await engineManager.batchCompressImages(
            batchItems,
            id,
            (p) => {
              if (p.status === 'completed' || p.status === 'cancelled' || p.status === 'failed') {
                itemProgressMap.set(p.jobId, 1.0);
              } else {
                itemProgressMap.set(p.jobId, p.progress);
              }
              let totalAcc = 0;
              itemProgressMap.forEach((val) => {
                totalAcc += val;
              });
              const overall = (totalAcc / selectedImages.length) * 100;
              setProgress(Math.min(100, Math.round(overall)));

              onQueueUpdate?.((prev) =>
                prev.map((it) =>
                  it.id === p.jobId
                    ? {
                        ...it,
                        progress: Math.round(p.progress * 100),
                        status:
                          p.status === 'completed'
                            ? 'completed'
                            : p.status === 'cancelled'
                              ? 'cancelled'
                              : p.status === 'failed'
                                ? 'failed'
                                : 'processing',
                      }
                    : it
                )
              );
            }
          );

          if (res.results.length === 0) {
            return false;
          }
          setResults(res.results);
        },
      });
    }
  };

  const handleSaveToGallery = () =>
    runSave(async () => {
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        await engineManager.saveOutputToGallery(
          res.outputPath,
          'image',
          `squishh_${Date.now()}_${i}.${res.format}`
        );
      }
    }, 'failed to save photos to gallery');

  const handleShare = () => {
    if (results.length === 0) return;
    runShare(
      () => {
        const paths = results.map((r) => r.outputPath);
        const title = results.length > 1
          ? `Squished Photos (${results.length} photos)`
          : 'Squished Photo';
        return engineManager.shareFiles(paths, title);
      },
      (e) => console.error('Failed to share photos:', e)
    );
  };

  const resetAll = () =>
    resetWorkflow(() => {
      setSelectedImages([]);
      setResults([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    });

  // Calculations for total original and compressed bytes
  const totalOriginalBytes = results.reduce((acc, r) => acc + r.originalSizeBytes, 0) ||
    selectedImages.reduce((acc, img) => acc + img.sizeBytes, 0);
  const totalCompressedBytes = results.reduce((acc, r) => acc + r.compressedSizeBytes, 0);

  return (
    <div className="w-full flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onClick={registerWebChooser}
        onChange={handleFileChange}
        className="hidden"
        id="image-file-input"
      />

      <WorkflowErrorBanner message={errorMessage} />

      {/* STAGE 1: IDLE / DROP ZONE */}
      {stage === 'idle' && (
        <WorkflowDropZone
          onClick={handleTriggerPick}
          icon={<ArrowDownToLine className="w-7 h-7" />}
          title="drop image(s) here or tap to pick"
          subtitle="Single or batch selection • JPG, PNG, WebP, HEIC • 100% offline"
          buttonLabel="select photos"
        />
      )}

      {/* STAGE 2: CONFIGURING OPTIONS */}
      {stage === 'configuring' && selectedImages.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* File summary badge (Single or Batch) */}
          {selectedImages.length === 1 ? (
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
              <img
                src={selectedImages[0].previewUrl}
                alt="Preview"
                className="w-12 h-12 rounded-xl object-cover border border-[#E5DFD5] dark:border-[#2D3238]"
              />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold truncate">{selectedImages[0].name}</p>
                <p className="text-xs text-[#767B77] dark:text-[#949995]">
                  original: {formatBytes(selectedImages[0].sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleTriggerPick}
                aria-label="Change selected photo"
                className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium px-2 py-1 rounded-lg hover:underline cursor-pointer"
              >
                change
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] text-left">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Images className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183]" aria-hidden="true" />
                  <span className="text-sm font-bold">{selectedImages.length} photos selected</span>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerPick}
                  aria-label="Re-select photos"
                  className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium hover:underline cursor-pointer"
                >
                  re-select
                </button>
              </div>
              <p className="text-xs text-[#767B77] dark:text-[#949995] mb-2.5">
                Total size: {formatBytes(totalOriginalBytes)}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedImages.slice(0, 5).map((img, idx) => (
                  <img
                    key={idx}
                    src={img.previewUrl}
                    alt={img.name}
                    className="w-12 h-12 rounded-xl object-cover border border-[#E5DFD5] dark:border-[#2D3238] flex-shrink-0"
                  />
                ))}
                {selectedImages.length > 5 && (
                  <div className="w-12 h-12 rounded-xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-xs font-bold text-[#767B77] flex-shrink-0">
                    +{selectedImages.length - 5}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode Selector: Quality vs Target Size */}
          <div className="p-4 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] text-left">
            <label className="text-xs font-semibold text-[#767B77] dark:text-[#949995] mb-2.5 block">
              compression mode
            </label>
            <div role="tablist" aria-label="Compression mode" className="grid grid-cols-2 p-1 rounded-xl bg-[#EDE8E0] dark:bg-[#1E2226] mb-4">
              <button
                type="button"
                role="tab"
                aria-selected={!useTargetSize}
                onClick={() => {
                  setUseTargetSize(false);
                  haptics.selection();
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 select-none cursor-pointer ${
                  !useTargetSize
                    ? 'bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm'
                    : 'text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>quality</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={useTargetSize}
                onClick={() => {
                  setUseTargetSize(true);
                  haptics.selection();
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 select-none cursor-pointer ${
                  useTargetSize
                    ? 'bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm'
                    : 'text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3]'
                }`}
              >
                <Target className="w-3.5 h-3.5" aria-hidden="true" />
                <span>target size</span>
              </button>
            </div>

            {useTargetSize ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="target-size-mb" className="text-xs text-[#767B77] dark:text-[#949995]">
                    target file limit:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="target-size-mb"
                      type="number"
                      step="0.1"
                      min="0.05"
                      max="50"
                      value={targetSizeMb}
                      onChange={(e) => setTargetSizeMb(parseFloat(e.target.value) || 0.5)}
                      className="w-20 px-2.5 py-1.5 rounded-xl border border-[#E5DFD5] dark:border-[#2D3238] bg-[#F2EFE9] dark:bg-[#1D2024] text-sm font-semibold text-center"
                    />
                    <span className="text-xs font-bold">MB</span>
                  </div>
                </div>
                {/* Quick Target Size Chips */}
                <div className="flex gap-2">
                  {IMAGE_QUICK_SIZE_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      aria-pressed={Math.abs(targetSizeMb - chip.mb) < 0.01}
                      onClick={() => {
                        setTargetSizeMb(chip.mb);
                        haptics.selection();
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors select-none cursor-pointer ${
                        Math.abs(targetSizeMb - chip.mb) < 0.01
                          ? 'border-[#4A6B53] dark:border-[#76A183] bg-[#EAE5DC] dark:bg-[#252A2F] text-[#4A6B53] dark:text-[#76A183]'
                          : 'border-[#E5DFD5] dark:border-[#2D3238] bg-[#F2EFE9] dark:bg-[#1D2024] text-[#767B77] dark:text-[#949995]'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs">
                  <label htmlFor="image-quality-range" className="text-[#767B77] dark:text-[#949995]">
                    compression quality:
                  </label>
                  <span className="font-mono font-bold text-[#4A6B53] dark:text-[#76A183]">{quality}%</span>
                </div>
                <input
                  id="image-quality-range"
                  type="range"
                  min={IMAGE_QUALITY_BOUNDS.min}
                  max={IMAGE_QUALITY_BOUNDS.max}
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="w-full accent-[#4A6B53] dark:accent-[#76A183] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#767B77] dark:text-[#949995]">
                  <span>smaller size ({IMAGE_QUALITY_BOUNDS.min}%)</span>
                  <span>balanced ({IMAGE_QUALITY_BOUNDS.default}%)</span>
                  <span>higher visual quality ({IMAGE_QUALITY_BOUNDS.max}%)</span>
                </div>
              </div>
            )}
          </div>

          {/* Output Format Selector */}
          <div className="text-left">
            <span className="text-xs font-semibold text-[#767B77] dark:text-[#949995] mb-2 block">
              output format
            </span>
            <div className="grid grid-cols-4 gap-2">
              {(['webp', 'jpg', 'png', 'avif'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  aria-pressed={targetFormat === fmt}
                  onClick={() => {
                    setTargetFormat(fmt);
                    haptics.selection();
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all select-none cursor-pointer ${
                    targetFormat === fmt
                      ? 'bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm'
                      : 'bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] text-[#767B77] dark:text-[#949995]'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Action button */}
          <SquishhButton
            size="lg"
            variant="primary"
            onClick={handleStartCompression}
            icon={<Sparkles className="w-5 h-5" />}
            className="w-full mt-2"
          >
            {selectedImages.length > 1
              ? `squish ${selectedImages.length} photos now`
              : 'squish photo now'}
          </SquishhButton>
        </div>
      )}

      {/* STAGE 3: PROCESSING */}
      {stage === 'processing' && (
        <WorkflowProgressCard
          iconSlot={
            <div
              ref={morphBlobRef}
              className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#76A183] to-[#F6D6C6] dark:from-[#4A6B53] dark:to-[#4A352D] flex items-center justify-center text-white mb-6 shadow-md"
            >
              <Sparkles className="w-10 h-10 animate-spin" />
            </div>
          }
          title={selectedImages.length > 1 ? `squishing ${selectedImages.length} photos…` : 'squishing your photo…'}
          subtitle="binary search & on-device optimization"
          progress={progress}
          onCancel={cancelActiveJob}
        />
      )}

      {/* STAGE 4: DONE & SHARE */}
      {stage === 'done' && results.length > 0 && (
        <WorkflowDoneShell
          subtitle={results.length > 1 ? `${results.length} photos successfully squished` : 'photo successfully squished'}
          savings={{
            originalBytes: totalOriginalBytes,
            compressedBytes: totalCompressedBytes,
            requirePositivePercent: true,
          }}
          saveLabel={results.length > 1 ? 'save all to gallery' : 'save to gallery'}
          savingLabel="saving to gallery…"
          savedLabel={results.length > 1 ? 'all saved to gallery ✓' : 'saved to gallery ✓'}
          isSaving={isSaving}
          savedSuccess={savedSuccess}
          onSave={handleSaveToGallery}
          shareLabel={results.length > 1 ? 'share photos' : 'share image'}
          onShare={handleShare}
          resetLabel="squish more photos"
          onReset={resetAll}
        >
          {/* Before / After visual comparison slider for single photo (UI-001) */}
          {selectedImages.length === 1 && results.length === 1 && (
            <div className="w-full mb-4 md:mb-0">
              <BeforeAfterSlider
                beforeSrc={selectedImages[0].previewUrl}
                afterSrc={
                  results[0]?.outputPath
                    ? (Capacitor.isNativePlatform()
                        ? Capacitor.convertFileSrc(results[0].outputPath)
                        : results[0].outputPath)
                    : selectedImages[0].previewUrl
                }
                beforeBytes={selectedImages[0].sizeBytes}
                afterBytes={results[0].compressedSizeBytes}
              />
            </div>
          )}

          {/* Batch summary cards if multi-select */}
          {selectedImages.length > 1 && results.length >= 1 && (
            <div className="w-full flex flex-col gap-1.5 mb-4 max-h-48 overflow-y-auto pr-1">
              {results.map((r, i) => {
                const lastDash = r.jobId ? r.jobId.lastIndexOf('-') : -1;
                const parsedIdx = lastDash >= 0 ? Number(r.jobId!.slice(lastDash + 1)) : NaN;
                const matchedImage =
                  Number.isInteger(parsedIdx) && selectedImages[parsedIdx]
                    ? selectedImages[parsedIdx]
                    : selectedImages[i];
                return (
                  <div
                    key={r.jobId || i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] text-xs text-left"
                  >
                    <span className="font-semibold truncate max-w-[130px]">
                      {matchedImage?.name || `Photo ${i + 1}`}
                    </span>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-[#767B77] line-through">
                        {formatBytes(r.originalSizeBytes)}
                      </span>
                      <span>&rarr;</span>
                      <span className="font-bold text-[#4A6B53] dark:text-[#76A183]">
                        {formatBytes(r.compressedSizeBytes)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WorkflowDoneShell>
      )}
    </div>
  );
}
