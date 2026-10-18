import React, { useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { engineManager, formatBytes, formatEta, humanizeError } from '../services/engineManager';
import { haptics } from '../services/haptics';
import { VideoProcessResult } from '../plugins/squishhEngine';
import { SquishhButton } from './ui/SquishhButton';
import {
  Film,
  Target,
  CheckCircle2,
  Share2,
  Download,
  RotateCcw,
  Sparkles,
  VolumeX,
  Volume2,
  AlertCircle
} from 'lucide-react';

interface SelectedVideo {
  name: string;
  sizeBytes: number;
  uri: string;
  previewUrl: string;
}

export function VideoWorkflow() {
  const [stage, setStage] = useState<'idle' | 'configuring' | 'processing' | 'done'>('idle');
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [operationMode, setOperationMode] = useState<'target' | 'resolution'>('target');
  const [compressionLevel, setCompressionLevel] = useState<'light' | 'balanced' | 'high'>('balanced');
  const [resolution, setResolution] = useState<'original' | '1080p' | '720p' | '480p' | '360p'>('720p');
  const [fpsLimit, setFpsLimit] = useState<'original' | '60' | '30' | '24'>('30');
  const [muteAudio, setMuteAudio] = useState<boolean>(false);
  const [asGif, setAsGif] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [etaMs, setEtaMs] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [result, setResult] = useState<VideoProcessResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTriggerPick = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('video/*', false);
    if (picked.length > 0) {
      setSelectedVideo(picked[0]);
      setStage('configuring');
      setErrorMessage(null);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.mediumImpact();
    const item = await engineManager.cacheWebFile(file);
    setSelectedVideo(item);
    setStage('configuring');
    setErrorMessage(null);
  };

  const handleStartCompression = async () => {
    if (!selectedVideo) return;

    haptics.mediumImpact();
    setStage('processing');
    setProgress(0);
    setEtaMs(0);
    setErrorMessage(null);
    setSavedSuccess(false);

    const jobId = `vid_${Date.now()}`;
    setActiveJobId(jobId);

    const targetResolution = operationMode === 'resolution' ? resolution : 'original';
    const targetFps = operationMode === 'resolution' && fpsLimit !== 'original' ? parseInt(fpsLimit) : 0;

    try {
      const res = await engineManager.compressVideo(
        {
          jobId,
          inputPath: selectedVideo.uri,
          compressionLevel: operationMode === 'target' ? compressionLevel : undefined,
          targetSizeBytes: 0,
          resolution: targetResolution,
          fpsLimit: targetFps,
          muteAudio,
          asGif,
        },
        (p) => {
          setProgress(Math.round(p.progress * 100));
          setEtaMs(p.etaRemainingMs);
        }
      );

      setResult(res);
      setStage('done');
      haptics.success();
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        setStage('configuring');
      } else {
        setErrorMessage(humanizeError(err, "couldn't squish this video, maybe the codec's unusual?"));
        setStage('configuring');
        haptics.error();
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
    if (!result) return;
    try {
      const ext = result.isGif ? 'gif' : 'mp4';
      await engineManager.saveOutputToGallery(
        result.outputPath,
        result.isGif ? 'image' : 'video',
        `squishh_${Date.now()}.${ext}`
      );
      setSavedSuccess(true);
      haptics.success();
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      haptics.selection();
      const title = result.isGif ? 'Squished GIF' : 'Squished Video';
      await engineManager.shareFiles([result.outputPath], title);
    } catch {
      // User dismissed share
    }
  };

  const resetAll = () => {
    haptics.selection();
    setStage('idle');
    setSelectedVideo(null);
    setResult(null);
    setProgress(0);
    setEtaMs(0);
    setSavedSuccess(false);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        className="hidden"
        id="video-file-input"
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
            <Film className="w-7 h-7" />
          </div>
          <p className="text-base font-bold mb-1">drop video here or tap to pick</p>
          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            MP4, MOV, MKV, WebM &bull; hardware Media3 transcoding
          </p>

          <SquishhButton
            size="md"
            variant="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleTriggerPick();
            }}
          >
            select video
          </SquishhButton>
        </div>
      )}

      {/* STAGE 2: CONFIGURING OPTIONS */}
      {stage === 'configuring' && selectedVideo && (
        <div className="flex flex-col gap-4">
          {/* File summary badge */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
            <div className="w-12 h-12 rounded-xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183]">
              <Film className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold truncate">{selectedVideo.name}</p>
              <p className="text-xs text-[#767B77] dark:text-[#949995]">
                original: {formatBytes(selectedVideo.sizeBytes)}
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium px-2 py-1 rounded-lg hover:underline"
            >
              change
            </button>
          </div>

          {/* Operation Mode Selector: Target Limit vs Resolution & Frames */}
          <div className="flex p-1 bg-[#EDE8E0] dark:bg-[#24282D] rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setOperationMode('target');
                setAsGif(false);
                haptics.selection();
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                operationMode === 'target' && !asGif
                  ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-sm'
                  : 'text-[#767B77] dark:text-[#949995]'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>target limit</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOperationMode('resolution');
                setAsGif(false);
                haptics.selection();
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                operationMode === 'resolution' && !asGif
                  ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-sm'
                  : 'text-[#767B77] dark:text-[#949995]'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>resolution & frames</span>
            </button>
          </div>

          {/* Operation Details Card */}
          {operationMode === 'target' && !asGif && (
            <div className="p-4 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-3 text-left">
              <label className="text-xs font-semibold text-[#767B77] dark:text-[#949995] block">
                target compression level
              </label>

              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  {
                    id: 'light' as const,
                    label: 'Light',
                    reduction: '~25%',
                    estBytes: Math.round(selectedVideo.sizeBytes * 0.75),
                    desc: 'Crisp quality',
                  },
                  {
                    id: 'balanced' as const,
                    label: 'Balanced',
                    reduction: '~50%',
                    estBytes: Math.round(selectedVideo.sizeBytes * 0.50),
                    desc: 'Optimal size',
                  },
                  {
                    id: 'high' as const,
                    label: 'High',
                    reduction: '~80%',
                    estBytes: Math.round(selectedVideo.sizeBytes * 0.22),
                    desc: 'Ultra small',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCompressionLevel(item.id);
                      haptics.selection();
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      compressionLevel === item.id
                        ? 'border-[#4A6B53] dark:border-[#76A183] bg-[#4A6B53]/10 dark:bg-[#76A183]/15 shadow-sm'
                        : 'bg-[#EDE8E0]/40 dark:bg-[#1D2024] border-[#E5DFD5] dark:border-[#2D3238] hover:border-[#767B77]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs capitalize">{item.label}</span>
                      <span className="text-[10px] font-mono font-bold text-[#4A6B53] dark:text-[#76A183]">
                        {item.reduction}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono font-semibold text-[#2C302E] dark:text-[#EDE9E3]">
                      &asymp; {formatBytes(item.estBytes)}
                    </p>
                    <p className="text-[10px] text-[#767B77] dark:text-[#949995] mt-0.5">
                      {item.desc}
                    </p>
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-[#767B77] dark:text-[#949995]">
                {compressionLevel === 'light'
                  ? 'High bitrate preservation with original resolution. Ideal for keeping pristine quality while shedding unnecessary weight.'
                  : compressionLevel === 'balanced'
                  ? 'Reduces file size by ~50% with balanced bitrate and HD scaling. Recommended for everyday sharing and cloud storage.'
                  : 'Maximum squish down to ~20% of original size with compact downscaling. Great for quick messaging and slow connections.'}
              </p>
            </div>
          )}

          {operationMode === 'resolution' && !asGif && (
            <div className="p-4 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-3 text-left">
              {/* Resolution selection */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">resolution:</span>
                <select
                  value={resolution}
                  onChange={(e) => {
                    setResolution(e.target.value as any);
                    haptics.selection();
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-[#E5DFD5] dark:border-[#2D3238] bg-[#F2EFE9] dark:bg-[#1D2024] text-xs font-semibold"
                >
                  <option value="1080p">1080p Full HD</option>
                  <option value="720p">720p HD (Recommended)</option>
                  <option value="480p">480p SD (Compact)</option>
                  <option value="360p">360p Low (Smallest)</option>
                  <option value="original">Original Dimensions</option>
                </select>
              </div>

              {/* FPS Limit selection */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">frame rate:</span>
                <select
                  value={fpsLimit}
                  onChange={(e) => {
                    setFpsLimit(e.target.value as any);
                    haptics.selection();
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-[#E5DFD5] dark:border-[#2D3238] bg-[#F2EFE9] dark:bg-[#1D2024] text-xs font-semibold"
                >
                  <option value="60">60 fps (Ultra Smooth)</option>
                  <option value="30">30 fps (Standard Smooth)</option>
                  <option value="24">24 fps (Cinematic Film)</option>
                  <option value="original">Original Frame Rate</option>
                </select>
              </div>

              <p className="text-[11px] text-[#767B77] dark:text-[#949995]">
                Downsamples dimensions and limits frames directly without a fixed MB ceiling.
              </p>
            </div>
          )}

          {/* Audio & GIF Options Card */}
          <div className="p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-2.5 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                {muteAudio ? (
                  <VolumeX className="w-4 h-4 text-[#767B77] dark:text-[#949995]" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183]" />
                )}
                <span>mute audio track</span>
              </div>
              <input
                type="checkbox"
                checked={muteAudio}
                onChange={(e) => setMuteAudio(e.target.checked)}
                className="w-4 h-4 accent-[#4A6B53] rounded"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#E5DFD5] dark:border-[#2D3238]">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183]" />
                <span>export as animated GIF loop</span>
              </div>
              <input
                type="checkbox"
                checked={asGif}
                onChange={(e) => setAsGif(e.target.checked)}
                className="w-4 h-4 accent-[#4A6B53] rounded"
              />
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
            {asGif
              ? 'convert to animated GIF'
              : operationMode === 'target'
              ? `squish video (${compressionLevel})`
              : 'squish resolution & frames'}
          </SquishhButton>
        </div>
      )}

      {/* STAGE 3: PROCESSING */}
      {stage === 'processing' && (
        <div className="p-8 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-5 animate-pulse">
            <Film className="w-9 h-9" />
          </div>

          <h3 className="text-lg font-bold mb-1">squishing your video…</h3>
          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            hardware transcoding via MediaCodec
          </p>

          {/* Progress Bar */}
          <div className="w-full bg-[#E5DFD5] dark:bg-[#2D3238] h-3 rounded-full overflow-hidden mb-3">
            <div
              className="bg-[#4A6B53] dark:bg-[#76A183] h-full transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between w-full text-xs font-mono font-semibold mb-6 px-1">
            <span>{progress}% complete</span>
            <span className="text-[#767B77] dark:text-[#949995]">{formatEta(etaMs)}</span>
          </div>

          <SquishhButton size="sm" variant="secondary" onClick={handleCancel}>
            cancel
          </SquishhButton>
        </div>
      )}

      {/* STAGE 4: DONE & SHARE */}
      {stage === 'done' && result && (
        <div className="flex flex-col gap-4">
          <div className="p-6 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold mb-1">all done ✨</h3>
            <p className="text-xs text-[#767B77] dark:text-[#949995] mb-4">
              {result.isGif ? 'animated GIF created' : 'video squished to target size'}
            </p>

            {/* Savings Pill */}
            {result.originalSizeBytes > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4] text-xs font-semibold mb-5">
                <span>
                  Saved{' '}
                  {Math.round(
                    ((result.originalSizeBytes - result.compressedSizeBytes) /
                      result.originalSizeBytes) *
                      100
                  )}
                  %
                </span>
                <span>&bull;</span>
                <span>
                  {formatBytes(result.originalSizeBytes)} &rarr; {formatBytes(result.compressedSizeBytes)}
                </span>
              </div>
            )}

            {/* Video or Animated GIF Preview Player */}
            <div className="w-full h-44 rounded-2xl overflow-hidden bg-black flex items-center justify-center mb-4 border border-[#E5DFD5] dark:border-[#2D3238]">
              {result.isGif ? (
                <img
                  src={
                    result.outputPath.startsWith('blob:')
                      ? result.outputPath
                      : Capacitor.convertFileSrc(result.outputPath)
                  }
                  alt="Squished GIF"
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  src={
                    result.outputPath.startsWith('blob:')
                      ? result.outputPath
                      : Capacitor.convertFileSrc(result.outputPath)
                  }
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 w-full text-xs text-left mb-4">
              <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
                <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">FORMAT</span>
                <span className="font-bold uppercase">{result.isGif ? 'GIF' : 'MP4 (H.264)'}</span>
              </div>
              <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
                <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">NEW SIZE</span>
                <span className="font-mono font-bold">{formatBytes(result.compressedSizeBytes)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 w-full">
              <SquishhButton
                size="md"
                variant="primary"
                onClick={handleSaveToGallery}
                icon={<Download className="w-4 h-4" />}
                className="w-full"
              >
                {savedSuccess ? 'saved to gallery ✓' : 'save to gallery'}
              </SquishhButton>

              <SquishhButton
                size="md"
                variant="secondary"
                onClick={handleShare}
                icon={<Share2 className="w-4 h-4" />}
                className="w-full"
              >
                share video
              </SquishhButton>

              <button
                onClick={resetAll}
                className="mt-2 text-xs text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>squish another video</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
