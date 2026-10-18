import React, { useState, useRef } from 'react';
import { engineManager, formatBytes, humanizeError } from '../services/engineManager';
import { haptics } from '../services/haptics';
import { ImageProcessResult } from '../plugins/squishhEngine';
import { SquishhButton } from './ui/SquishhButton';
import { gsap, useGSAP } from '../lib/gsap';
import {
  ArrowDownToLine,
  CheckCircle2,
  Share2,
  Download,
  RotateCcw,
  Sparkles,
  Target,
  AlertCircle,
  Images
} from 'lucide-react';

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

export function ImageWorkflow() {
  const [stage, setStage] = useState<'idle' | 'configuring' | 'processing' | 'done'>('idle');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [targetFormat, setTargetFormat] = useState<'webp' | 'jpg' | 'png' | 'avif'>('webp');
  const [quality, setQuality] = useState<number>(80);
  const [useTargetSize, setUseTargetSize] = useState<boolean>(false);
  const [targetSizeMb, setTargetSizeMb] = useState<number>(1.0);
  const [progress, setProgress] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [results, setResults] = useState<ImageProcessResult[]>([]);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<'after' | 'before' | 'split'>('after');

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

  const handleTriggerPick = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('image/*', true);
    if (picked.length > 0) {
      setSelectedImages(picked);
      const defaultFmt = detectImageFormat(picked[0].name);
      setTargetFormat(defaultFmt);
      setStage('configuring');
      setErrorMessage(null);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    haptics.mediumImpact();
    const loadedList: SelectedImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const item = await engineManager.cacheWebFile(files[i]);
      loadedList.push(item);
    }

    if (loadedList.length > 0) {
      setSelectedImages(loadedList);
      const defaultFmt = detectImageFormat(loadedList[0].name);
      setTargetFormat(defaultFmt);
      setStage('configuring');
      setErrorMessage(null);
    }
  };

  const handleStartCompression = async () => {
    if (selectedImages.length === 0) return;

    haptics.mediumImpact();
    setStage('processing');
    setProgress(0);
    setErrorMessage(null);
    setSavedSuccess(false);

    const targetSizeBytes = useTargetSize ? Math.round(targetSizeMb * 1024 * 1024) : 0;

    if (selectedImages.length === 1) {
      // Single Image Flow
      const singleImage = selectedImages[0];
      const jobId = `img_${Date.now()}`;
      setActiveJobId(jobId);

      try {
        const res = await engineManager.compressImage(
          {
            jobId,
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
        setStage('done');
        haptics.success();
      } catch (err: any) {
        if (err.message?.includes('cancelled')) {
          setStage('configuring');
        } else {
          setErrorMessage(humanizeError(err, "that file's being stubborn, try another?"));
          setStage('configuring');
          haptics.error();
        }
      }
    } else {
      // Native Batch Flow
      const batchId = `batch_${Date.now()}`;
      setActiveJobId(batchId);

      try {
        const batchItems = selectedImages.map((img, i) => ({
          jobId: `${batchId}-${i}`,
          inputPath: img.uri,
          targetFormat,
          quality,
          targetSizeBytes,
        }));

        let completedItems = 0;
        const res = await engineManager.batchCompressImages(
          batchItems,
          batchId,
          (p) => {
            if (p.status === 'completed') {
              completedItems++;
            }
            const overall = ((completedItems + p.progress) / selectedImages.length) * 100;
            setProgress(Math.min(100, Math.round(overall)));
          }
        );

        setResults(res.results);
        setStage('done');
        haptics.success();
      } catch (err: any) {
        if (err.message?.includes('cancelled')) {
          setStage('configuring');
        } else {
          setErrorMessage(humanizeError(err, "batch squishing couldn't finish, try smaller batches?"));
          setStage('configuring');
          haptics.error();
        }
      }
    }
  };

  const handleCancel = async () => {
    if (activeJobId) {
      await engineManager.cancelJob(activeJobId);
      setActiveJobId(null);
      setStage('configuring');
    }
  };

  const handleSaveToGallery = async () => {
    if (results.length === 0) return;
    try {
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        await engineManager.saveOutputToGallery(
          res.outputPath,
          'image',
          `squishh_${Date.now()}_${i}.${res.format}`
        );
      }
      setSavedSuccess(true);
      haptics.success();
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    }
  };

  const handleShare = async () => {
    if (results.length === 0) return;
    try {
      haptics.selection();
      const paths = results.map((r) => r.outputPath);
      const title = results.length > 1
        ? `Squished Photos (${results.length} photos)`
        : 'Squished Photo';
      await engineManager.shareFiles(paths, title);
    } catch (e) {
      console.error('Failed to share photos:', e);
    }
  };

  const resetAll = () => {
    haptics.selection();
    setStage('idle');
    setSelectedImages([]);
    setResults([]);
    setProgress(0);
    setSavedSuccess(false);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Calculations for total original and compressed bytes
  const totalOriginalBytes = results.reduce((acc, r) => acc + r.originalSizeBytes, 0) ||
    selectedImages.reduce((acc, img) => acc + img.sizeBytes, 0);
  const totalCompressedBytes = results.reduce((acc, r) => acc + r.compressedSizeBytes, 0);
  const totalSavedPercent = totalOriginalBytes > 0 && totalCompressedBytes > 0
    ? Math.round(((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) * 100)
    : 0;

  return (
    <div className="w-full flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
        id="image-file-input"
      />

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-[#F6D6C6]/80 dark:bg-[#4A352D]/80 border border-[#EAC5B3] dark:border-[#5C4237] text-xs flex items-center gap-2 text-[#4A352D] dark:text-[#F6D6C6]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STAGE 1: IDLE / DROP ZONE */}
      {stage === 'idle' && (
        <div
          onClick={handleTriggerPick}
          className="p-8 rounded-3xl border-2 border-dashed border-[#DDD7CC] dark:border-[#383E46] bg-[#FBF9F5]/80 dark:bg-[#141618]/80 flex flex-col items-center text-center cursor-pointer transition-all hover:border-[#4A6B53] dark:hover:border-[#76A183] active:scale-[0.99]"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183] mb-3.5 shadow-sm">
            <ArrowDownToLine className="w-7 h-7" />
          </div>
          <p className="text-base font-bold mb-1">drop image(s) here or tap to pick</p>
          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            Single or batch selection &bull; JPG, PNG, WebP, HEIC &bull; 100% offline
          </p>

          <SquishhButton
            size="md"
            variant="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleTriggerPick();
            }}
          >
            select photos
          </SquishhButton>
        </div>
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
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium px-2 py-1 rounded-lg hover:underline"
              >
                change
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] text-left">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Images className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183]" />
                  <span className="text-sm font-bold">{selectedImages.length} photos selected</span>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium hover:underline"
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
            <div className="grid grid-cols-2 p-1 rounded-xl bg-[#EDE8E0] dark:bg-[#1E2226] mb-4">
              <button
                type="button"
                onClick={() => {
                  setUseTargetSize(false);
                  haptics.selection();
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  !useTargetSize
                    ? 'bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm'
                    : 'text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>quality</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseTargetSize(true);
                  haptics.selection();
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  useTargetSize
                    ? 'bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm'
                    : 'text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3]'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>target size</span>
              </button>
            </div>

            {useTargetSize ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#767B77] dark:text-[#949995]">target file limit:</span>
                  <div className="flex items-center gap-1.5">
                    <input
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
                  {[
                    { label: '200 KB', mb: 0.2 },
                    { label: '500 KB', mb: 0.5 },
                    { label: '1 MB', mb: 1.0 },
                    { label: '2 MB', mb: 2.0 },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => {
                        setTargetSizeMb(chip.mb);
                        haptics.selection();
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
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
                  <span className="text-[#767B77] dark:text-[#949995]">compression quality:</span>
                  <span className="font-mono font-bold text-[#4A6B53] dark:text-[#76A183]">{quality}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="95"
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="w-full accent-[#4A6B53] dark:accent-[#76A183] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#767B77] dark:text-[#949995]">
                  <span>smaller size (10%)</span>
                  <span>balanced (80%)</span>
                  <span>higher visual quality (95%)</span>
                </div>
              </div>
            )}
          </div>

          {/* Output Format Selector */}
          <div className="text-left">
            <label className="text-xs font-semibold text-[#767B77] dark:text-[#949995] mb-2 block">
              output format
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['webp', 'jpg', 'png', 'avif'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => {
                    setTargetFormat(fmt);
                    haptics.selection();
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all ${
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
        <div className="p-8 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col items-center text-center">
          <div
            ref={morphBlobRef}
            className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#76A183] to-[#F6D6C6] dark:from-[#4A6B53] dark:to-[#4A352D] flex items-center justify-center text-white mb-6 shadow-md"
          >
            <Sparkles className="w-10 h-10 animate-spin" />
          </div>

          <h3 className="text-lg font-bold mb-1">
            {selectedImages.length > 1 ? `squishing ${selectedImages.length} photos…` : 'squishing your photo…'}
          </h3>
          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            binary search & on-device optimization
          </p>

          {/* Progress Bar */}
          <div className="w-full bg-[#E5DFD5] dark:bg-[#2D3238] h-3 rounded-full overflow-hidden mb-3">
            <div
              className="bg-[#4A6B53] dark:bg-[#76A183] h-full transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-xs font-semibold mb-6">{progress}% complete</span>

          <SquishhButton size="sm" variant="secondary" onClick={handleCancel}>
            cancel
          </SquishhButton>
        </div>
      )}

      {/* STAGE 4: DONE & SHARE */}
      {stage === 'done' && results.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="p-6 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold mb-1">all done ✨</h3>
            <p className="text-xs text-[#767B77] dark:text-[#949995] mb-4">
              {results.length > 1
                ? `${results.length} photos successfully squished`
                : 'photo successfully squished'}
            </p>

            {/* Savings Pill */}
            {totalOriginalBytes > 0 && totalSavedPercent > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4] text-xs font-semibold mb-5">
                <span>Saved {totalSavedPercent}%</span>
                <span>&bull;</span>
                <span>
                  {formatBytes(totalOriginalBytes)} &rarr; {formatBytes(totalCompressedBytes)}
                </span>
              </div>
            )}

            {/* Before / After visual comparison slider for single photo */}
            {selectedImages.length === 1 && results.length === 1 && (
              <div className="w-full mb-4">
                <div className="flex items-center justify-center gap-1.5 p-1 bg-[#E5DFD5]/60 dark:bg-[#2D3238]/60 rounded-xl mb-2 w-fit mx-auto text-xs">
                  <button
                    onClick={() => {
                      setCompareMode('after');
                      haptics.selection();
                    }}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      compareMode === 'after'
                        ? 'bg-[#FBF9F5] dark:bg-[#141618] shadow-xs font-semibold'
                        : 'text-[#767B77] dark:text-[#949995]'
                    }`}
                  >
                    Squished (After)
                  </button>
                  <button
                    onClick={() => {
                      setCompareMode('before');
                      haptics.selection();
                    }}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      compareMode === 'before'
                        ? 'bg-[#FBF9F5] dark:bg-[#141618] shadow-xs font-semibold'
                        : 'text-[#767B77] dark:text-[#949995]'
                    }`}
                  >
                    Original (Before)
                  </button>
                </div>

                <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-[#E5DFD5] dark:border-[#2D3238] bg-[#141618]">
                  <img
                    src={selectedImages[0].previewUrl}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-black/60 text-white text-[10px] font-mono backdrop-blur-xs">
                    {compareMode === 'after'
                      ? `SQUISHED: ${formatBytes(results[0].compressedSizeBytes)}`
                      : `ORIGINAL: ${formatBytes(selectedImages[0].sizeBytes)}`}
                  </div>
                </div>
              </div>
            )}

            {/* Batch summary cards if multi-select */}
            {results.length > 1 && (
              <div className="w-full flex flex-col gap-1.5 mb-4 max-h-48 overflow-y-auto pr-1">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] text-xs text-left"
                  >
                    <span className="font-semibold truncate max-w-[130px]">
                      {selectedImages[i]?.name || `Photo ${i + 1}`}
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
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 w-full">
              <SquishhButton
                size="md"
                variant="primary"
                onClick={handleSaveToGallery}
                icon={<Download className="w-4 h-4" />}
                className="w-full"
              >
                {savedSuccess
                  ? results.length > 1
                    ? 'all saved to gallery ✓'
                    : 'saved to gallery ✓'
                  : results.length > 1
                  ? 'save all to gallery'
                  : 'save to gallery'}
              </SquishhButton>

              <SquishhButton
                size="md"
                variant="secondary"
                onClick={handleShare}
                icon={<Share2 className="w-4 h-4" />}
                className="w-full"
              >
                {results.length > 1 ? 'share photos' : 'share image'}
              </SquishhButton>

              <button
                onClick={resetAll}
                className="mt-2 text-xs text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>squish more photos</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
