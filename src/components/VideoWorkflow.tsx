import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { formatBytes, formatEta, WorkflowFile } from '../services/engineManager';
import { useEngineManager, useHaptics } from '../services/ServiceContext';
import { GIF_PREVIEW_DIMENSIONS, VIDEO_COMPRESSION_PRESETS } from '../constants/compression';
import { useWorkflow } from '../hooks/useWorkflow';
import {
  WorkflowDoneShell,
  WorkflowDropZone,
  WorkflowErrorBanner,
  WorkflowProgressCard,
} from './workflow/WorkflowStageUI';
import { VideoProcessResult } from '../plugins/squishhEngine';
import { SquishhButton } from './ui/SquishhButton';
import { gsap, useGSAP } from '../lib/gsap';
import {
  Film,
  Target,
  Sparkles,
  VolumeX,
  Volume2
} from 'lucide-react';

interface SelectedVideo {
  name: string;
  sizeBytes: number;
  uri: string;
  previewUrl: string;
}

interface VideoWorkflowProps {
  sharedFile?: WorkflowFile | null;
  onSharedFileConsumed?: () => void;
}

export function VideoWorkflow({ sharedFile, onSharedFileConsumed }: VideoWorkflowProps = {}) {
  const engineManager = useEngineManager();
  const haptics = useHaptics();
  const {
    stage,
    progress,
    setProgress,
    etaMs,
    setEtaMs,
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

  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [operationMode, setOperationMode] = useState<'target' | 'resolution'>('target');
  const [compressionLevel, setCompressionLevel] = useState<'light' | 'balanced' | 'high'>('balanced');
  const [resolution, setResolution] = useState<'original' | '1080p' | '720p' | '480p' | '360p'>('720p');
  const [fpsLimit, setFpsLimit] = useState<'original' | '60' | '30' | '24'>('30');
  const [muteAudio, setMuteAudio] = useState<boolean>(false);
  const [asGif, setAsGif] = useState<boolean>(false);
  const [result, setResult] = useState<VideoProcessResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filmIconRef = useRef<HTMLDivElement>(null);

  // GSAP animation for video transcoding reel
  useGSAP(() => {
    if (stage === 'processing' && filmIconRef.current) {
      gsap.to(filmIconRef.current, {
        rotation: 360,
        duration: 4,
        repeat: -1,
        ease: 'none',
      });
      gsap.to(filmIconRef.current, {
        scale: 1.08,
        duration: 1.2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
  }, [stage]);

  const applySelectedVideo = (item: SelectedVideo) => {
    setSelectedVideo(item);
    setResult(null);
    beginConfigure();
  };

  useEffect(() => {
    if (!sharedFile) return;
    applySelectedVideo(sharedFile);
    onSharedFileConsumed?.();
  }, [sharedFile, onSharedFileConsumed]);

  const registerWebChooser = () => {
    engineManager.setPendingWebChooserHandler((resolved) => {
      if (resolved.length > 0) {
        haptics.mediumImpact();
        applySelectedVideo(resolved[0]);
      }
    });
  };

  const handleTriggerPick = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('video/*', false);
    if (picked !== null) {
      if (picked.length > 0) {
        applySelectedVideo(picked[0]);
      }
      return;
    }
    registerWebChooser();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.mediumImpact();
    const item = await engineManager.cacheWebFile(file);
    applySelectedVideo(item);
  };

  const handleStartCompression = async () => {
    if (!selectedVideo) return;

    const targetResolution = operationMode === 'resolution' ? resolution : 'original';
    const targetFps = operationMode === 'resolution' && fpsLimit !== 'original' ? parseInt(fpsLimit) : 0;

    await executeJob({
      jobId: `vid_${Date.now()}`,
      fallbackError: "couldn't squish this video, maybe the codec's unusual?",
      run: async (jobId) => {
        const res = await engineManager.compressVideo(
          {
            jobId,
            inputPath: selectedVideo.uri,
            compressionLevel: operationMode === 'target' ? compressionLevel : undefined,
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
      },
    });
  };

  const handleSaveToGallery = () => {
    if (!result) return;
    return runSave(async () => {
      const pathExt = result.outputPath.split('.').pop()?.split('?')[0]?.toLowerCase();
      const ext = result.isGif ? 'gif' : (pathExt && /^[a-z0-9]{2,5}$/.test(pathExt) ? pathExt : 'mp4');
      await engineManager.saveOutputToGallery(
        result.outputPath,
        result.isGif ? 'image' : 'video',
        `squishh_${Date.now()}.${ext}`
      );
    }, 'failed to save video to gallery');
  };

  const handleShare = () => {
    if (!result) return;
    const title = result.isGif ? 'Squished GIF' : 'Squished Video';
    return runShare(() => engineManager.shareFiles([result.outputPath], title));
  };

  const resetAll = () =>
    resetWorkflow(() => {
      setSelectedVideo(null);
      setResult(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    });

  return (
    <div className="w-full flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onClick={registerWebChooser}
        onChange={handleFileChange}
        className="hidden"
        id="video-file-input"
      />

      <WorkflowErrorBanner message={errorMessage} />

      {/* STAGE 1: IDLE / DROP ZONE */}
      {stage === 'idle' && (
        <WorkflowDropZone
          onClick={handleTriggerPick}
          icon={<Film className="w-7 h-7" />}
          title="drop video here or tap to pick"
          subtitle="MP4, MOV, MKV, WebM • hardware Media3 transcoding"
          buttonLabel="select video"
        />
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
              type="button"
              onClick={handleTriggerPick}
              aria-label="Change selected video"
              className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium px-2 py-1 rounded-lg hover:underline cursor-pointer"
            >
              change
            </button>
          </div>

          {/* Operation Mode Selector: Target Limit vs Resolution & Frames */}
          <div role="tablist" aria-label="Video compression mode" className="flex p-1 bg-[#EDE8E0] dark:bg-[#24282D] rounded-2xl">
            <button
              type="button"
              role="tab"
              aria-selected={operationMode === 'target' && !asGif}
              onClick={() => {
                setOperationMode('target');
                setAsGif(false);
                haptics.selection();
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 select-none cursor-pointer ${
                operationMode === 'target' && !asGif
                  ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-sm'
                  : 'text-[#767B77] dark:text-[#949995]'
              }`}
            >
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              <span>target limit</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={operationMode === 'resolution' && !asGif}
              onClick={() => {
                setOperationMode('resolution');
                setAsGif(false);
                haptics.selection();
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 select-none cursor-pointer ${
                operationMode === 'resolution' && !asGif
                  ? 'bg-[#FBF9F5] dark:bg-[#141618] text-[#4A6B53] dark:text-[#76A183] shadow-sm'
                  : 'text-[#767B77] dark:text-[#949995]'
              }`}
            >
              <Film className="w-3.5 h-3.5" aria-hidden="true" />
              <span>resolution & frames</span>
            </button>
          </div>

          {/* Operation Details Card */}
          {operationMode === 'target' && !asGif && (
            <div className="p-4 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-3 text-left">
              <span className="text-xs font-semibold text-[#767B77] dark:text-[#949995] block">
                target compression level
              </span>

              <div className="grid grid-cols-3 gap-2 text-xs">
                {VIDEO_COMPRESSION_PRESETS.map((item) => {
                  const estBytes = Math.round(selectedVideo.sizeBytes * item.sizeRatio);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={compressionLevel === item.id}
                      onClick={() => {
                        setCompressionLevel(item.id);
                        haptics.selection();
                      }}
                      className={`p-3 rounded-2xl border text-left transition-all select-none cursor-pointer ${
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
                        &asymp; {formatBytes(estBytes)}
                      </p>
                      <p className="text-[10px] text-[#767B77] dark:text-[#949995] mt-0.5">
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-[#767B77] dark:text-[#949995]">
                {VIDEO_COMPRESSION_PRESETS.find((p) => p.id === compressionLevel)?.detail}
              </p>
            </div>
          )}

          {operationMode === 'resolution' && !asGif && (
            <div className="p-4 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-3 text-left">
              {/* Resolution selection */}
              <div className="flex items-center justify-between">
                <label htmlFor="video-resolution-select" className="text-xs font-semibold">
                  resolution:
                </label>
                <select
                  id="video-resolution-select"
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
                <label htmlFor="video-fps-select" className="text-xs font-semibold">
                  frame rate:
                </label>
                <select
                  id="video-fps-select"
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
              <label htmlFor="video-mute-audio" className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                {muteAudio ? (
                  <VolumeX className="w-4 h-4 text-[#767B77] dark:text-[#949995]" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183]" aria-hidden="true" />
                )}
                <span>mute audio track</span>
              </label>
              <input
                id="video-mute-audio"
                type="checkbox"
                checked={muteAudio}
                onChange={(e) => setMuteAudio(e.target.checked)}
                className="w-4 h-4 accent-[#4A6B53] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#E5DFD5] dark:border-[#2D3238]">
              <label htmlFor="video-export-gif" className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                <Sparkles className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183]" aria-hidden="true" />
                <span>export as animated GIF loop</span>
              </label>
              <input
                id="video-export-gif"
                type="checkbox"
                checked={asGif}
                onChange={(e) => setAsGif(e.target.checked)}
                className="w-4 h-4 accent-[#4A6B53] rounded cursor-pointer"
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
        <WorkflowProgressCard
          iconSlot={
            <div
              ref={filmIconRef}
              className="w-20 h-20 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-5 shadow-sm"
            >
              <Film className="w-9 h-9" />
            </div>
          }
          title="squishing your video…"
          subtitle="hardware transcoding via MediaCodec"
          progress={progress}
          etaLabel={formatEta(etaMs)}
          onCancel={cancelActiveJob}
        />
      )}

      {/* STAGE 4: DONE & SHARE */}
      {stage === 'done' && result && (
        <WorkflowDoneShell
          subtitle={result.isGif ? 'animated GIF created' : 'video squished to target size'}
          savings={{
            originalBytes: result.originalSizeBytes,
            compressedBytes: result.compressedSizeBytes,
          }}
          saveLabel="save to gallery"
          savingLabel="saving to gallery…"
          savedLabel="saved to gallery ✓"
          isSaving={isSaving}
          savedSuccess={savedSuccess}
          onSave={handleSaveToGallery}
          shareLabel="share video"
          onShare={handleShare}
          resetLabel="squish another video"
          onReset={resetAll}
        >
          {/* Video or Animated GIF Preview Player */}
          <div className="w-full h-44 md:h-56 rounded-2xl overflow-hidden bg-black flex items-center justify-center mb-4 border border-[#E5DFD5] dark:border-[#2D3238]">
            {result.isGif ? (
              <img
                src={
                  result.outputPath.startsWith('blob:')
                    ? result.outputPath
                    : Capacitor.convertFileSrc(result.outputPath)
                }
                alt="Squished animated GIF"
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

          <div className="grid grid-cols-3 gap-2 w-full text-xs text-left mb-4 md:mb-0">
            <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
              <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">FORMAT</span>
              <span className="font-bold uppercase">
                {result.isGif
                  ? 'GIF'
                  : (() => {
                      const ext = result.outputPath.split('.').pop()?.split('?')[0]?.toLowerCase();
                      return ext && ext !== 'mp4' && /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'MP4 (H.264)';
                    })()}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
              <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">DIMENSIONS</span>
              <span className="font-mono font-bold">
                {result.width > 0 && result.height > 0
                  ? `${result.width}×${result.height}`
                  : result.isGif
                  ? `${GIF_PREVIEW_DIMENSIONS.width}w`
                  : 'Original'}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
              <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">NEW SIZE</span>
              <span className="font-mono font-bold">{formatBytes(result.compressedSizeBytes)}</span>
            </div>
          </div>
        </WorkflowDoneShell>
      )}
    </div>
  );
}
