import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { formatBytes, WorkflowFile } from '../services/engineManager';
import { useEngineManager, useHaptics } from '../services/ServiceContext';
import { AUDIO_BITRATE_OPTIONS } from '../constants/compression';
import { useWorkflow } from '../hooks/useWorkflow';
import {
  WorkflowDoneShell,
  WorkflowDropZone,
  WorkflowErrorBanner,
  WorkflowProgressCard,
} from './workflow/WorkflowStageUI';
import { AudioProcessResult } from '../plugins/squishhEngine';
import { SquishhButton } from './ui/SquishhButton';
import {
  Music,
  Sparkles,
  FileAudio
} from 'lucide-react';

interface SelectedAudio {
  name: string;
  sizeBytes: number;
  uri: string;
  previewUrl: string;
  isVideo: boolean;
}

interface AudioWorkflowProps {
  sharedFile?: WorkflowFile | null;
  onSharedFileConsumed?: () => void;
}

const EQUALIZER_BAR_COUNT = 16;
const RESTING_BAR_SCALE = 0.18;

export function AudioWorkflow({ sharedFile, onSharedFileConsumed }: AudioWorkflowProps = {}) {
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

  const [selectedAudio, setSelectedAudio] = useState<SelectedAudio | null>(null);
  const [targetFormat] = useState<'m4a'>('m4a');
  const [bitrateKbps, setBitrateKbps] = useState<number>(128);
  const [monoDownmix, setMonoDownmix] = useState<boolean>(false);
  const [result, setResult] = useState<AudioProcessResult | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const audioGraphRef = useRef<{
    element: HTMLAudioElement;
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaElementAudioSourceNode;
    bins: Uint8Array<ArrayBuffer>;
  } | null>(null);

  const resetVisualizerBars = useCallback(() => {
    for (const bar of barRefs.current) {
      if (bar) {
        bar.style.transform = `scaleY(${RESTING_BAR_SCALE})`;
      }
    }
  }, []);

  const stopVisualizerLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    resetVisualizerBars();
  }, [resetVisualizerBars]);

  const teardownAudioGraph = useCallback(() => {
    stopVisualizerLoop();
    const graph = audioGraphRef.current;
    audioGraphRef.current = null;
    if (graph) {
      try {
        graph.source.disconnect();
        graph.analyser.disconnect();
        if (graph.context.state !== 'closed') {
          graph.context.close().catch(() => {});
        }
      } catch {
        // Ignore teardown errors on already closed AudioContext
      }
    }
    setIsPlaying(false);
  }, [stopVisualizerLoop]);

  useEffect(() => {
    return () => {
      teardownAudioGraph();
    };
  }, [teardownAudioGraph]);

  const ensureAnalyser = useCallback((el: HTMLAudioElement) => {
    if (audioGraphRef.current && audioGraphRef.current.element === el) {
      return audioGraphRef.current;
    }
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      const context = new AudioCtx();
      const source = context.createMediaElementSource(el);
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyser.connect(context.destination);

      const bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      const graph = { element: el, context, analyser, source, bins };
      audioGraphRef.current = graph;
      return graph;
    } catch {
      return null;
    }
  }, []);

  const startVisualizerLoop = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    const graph = ensureAnalyser(el);
    if (!graph) return;

    if (graph.context.state === 'suspended') {
      graph.context.resume().catch(() => {});
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    const renderFrame = () => {
      const active = audioGraphRef.current;
      const currentEl = audioElRef.current;
      if (!active || !currentEl || currentEl.paused || currentEl.ended) {
        rafIdRef.current = null;
        resetVisualizerBars();
        return;
      }

      active.analyser.getByteFrequencyData(active.bins);
      const step = Math.max(1, Math.floor(active.bins.length / EQUALIZER_BAR_COUNT));
      for (let i = 0; i < EQUALIZER_BAR_COUNT; i++) {
        const bar = barRefs.current[i];
        if (!bar) continue;
        const binIndex = Math.min(active.bins.length - 1, i * step);
        const normalized = active.bins[binIndex] / 255;
        const scale = Math.max(RESTING_BAR_SCALE, Math.min(1, RESTING_BAR_SCALE + normalized * 0.82));
        bar.style.transform = `scaleY(${scale.toFixed(3)})`;
      }

      rafIdRef.current = requestAnimationFrame(renderFrame);
    };

    rafIdRef.current = requestAnimationFrame(renderFrame);
  }, [ensureAnalyser, resetVisualizerBars]);

  const handlePlaybackStart = () => {
    setIsPlaying(true);
    startVisualizerLoop();
  };

  const handlePlaybackStop = () => {
    setIsPlaying(false);
    stopVisualizerLoop();
  };

  const applySelectedAudio = (item: WorkflowFile & { isVideo?: boolean }) => {
    const isVideo =
      Boolean(item.isVideo) ||
      item.name.match(/\.(mp4|mov|mkv|webm)$/i) !== null;
    teardownAudioGraph();
    setSelectedAudio({
      ...item,
      isVideo,
    });
    setResult(null);
    beginConfigure();
  };

  useEffect(() => {
    if (!sharedFile) return;
    applySelectedAudio(sharedFile);
    onSharedFileConsumed?.();
  }, [sharedFile, onSharedFileConsumed]);

  const registerWebChooser = () => {
    engineManager.setPendingWebChooserHandler((resolved) => {
      if (resolved.length > 0) {
        haptics.mediumImpact();
        applySelectedAudio(resolved[0]);
      }
    });
  };

  const handleTriggerPick = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('audio/*,video/*', false);
    if (picked !== null) {
      if (picked.length > 0) {
        applySelectedAudio(picked[0]);
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
    const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|mkv|webm)$/i) !== null;
    const item = await engineManager.cacheWebFile(file);
    applySelectedAudio({
      ...item,
      isVideo,
    });
  };

  const handleStartCompression = async () => {
    if (!selectedAudio) return;
    teardownAudioGraph();

    await executeJob({
      jobId: `aud_${Date.now()}`,
      fallbackError: "couldn't tune this audio track, try another file?",
      run: async (jobId) => {
        const res = await engineManager.compressAudio(
          {
            jobId,
            inputPath: selectedAudio.uri,
            targetFormat,
            bitrateKbps,
            monoDownmix,
            extractFromVideo: selectedAudio.isVideo,
          },
          (p) => {
            setProgress(Math.round(p.progress * 100));
          }
        );
        setResult(res);
      },
    });
  };

  const handleSaveToGallery = () => {
    if (!result) return;
    return runSave(async () => {
      await engineManager.saveOutputToGallery(
        result.outputPath,
        'audio',
        `squishh_${Date.now()}.${result.format}`
      );
    }, 'failed to save audio track');
  };

  const handleShare = () => {
    if (!result) return;
    return runShare(() => engineManager.shareFiles([result.outputPath], 'Squished Audio'));
  };

  const resetAll = () =>
    resetWorkflow(() => {
      teardownAudioGraph();
      setSelectedAudio(null);
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
        accept="audio/*,video/*"
        onClick={registerWebChooser}
        onChange={handleFileChange}
        className="hidden"
        id="audio-file-input"
      />

      <WorkflowErrorBanner message={errorMessage} />

      {/* STAGE 1: IDLE / DROP ZONE */}
      {stage === 'idle' && (
        <WorkflowDropZone
          onClick={handleTriggerPick}
          icon={<Music className="w-7 h-7" />}
          title="drop audio or video file here"
          subtitle="MP3, AAC, WAV, FLAC or MP4/MOV soundtrack • 100% offline"
          buttonLabel="select audio / video"
        />
      )}

      {/* STAGE 2: CONFIGURING OPTIONS */}
      {stage === 'configuring' && selectedAudio && (
        <div className="flex flex-col gap-4">
          {/* File summary badge */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
            <div className="w-12 h-12 rounded-xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183]">
              <FileAudio className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold truncate">{selectedAudio.name}</p>
              <p className="text-xs text-[#767B77] dark:text-[#949995]">
                {selectedAudio.isVideo ? 'video soundtrack' : 'audio file'} &bull; {formatBytes(selectedAudio.sizeBytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleTriggerPick}
              aria-label="Change selected audio or video file"
              className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium px-2 py-1 rounded-lg hover:underline cursor-pointer"
            >
              change
            </button>
          </div>

          {/* Audio Direct Controls */}
          <div className="p-4 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-3.5 text-left">
            {/* Format indicator (M4A AAC only via native Media3) */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">target format:</span>
              <span className="py-1.5 px-3 rounded-xl text-xs font-bold uppercase bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm">
                M4A (AAC)
              </span>
            </div>

            {/* Bitrate selection */}
            <div className="flex items-center justify-between">
              <label htmlFor="audio-bitrate-select" className="text-xs font-semibold">
                bitrate:
              </label>
              <select
                id="audio-bitrate-select"
                value={bitrateKbps}
                onChange={(e) => {
                  setBitrateKbps(parseInt(e.target.value));
                  haptics.selection();
                }}
                className="px-2.5 py-1.5 rounded-xl border border-[#E5DFD5] dark:border-[#2D3238] bg-[#F2EFE9] dark:bg-[#1D2024] text-xs font-semibold"
              >
                {AUDIO_BITRATE_OPTIONS.map((opt) => (
                  <option key={opt.kbps} value={opt.kbps}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Mono downmixing */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E5DFD5] dark:border-[#2D3238]">
              <label htmlFor="audio-mono-downmix" className="cursor-pointer pr-3">
                <span className="text-xs font-semibold block">mono downmixing</span>
                <span className="text-[11px] text-[#767B77] dark:text-[#949995]">
                  Merges stereo channels into 1 channel, cutting file size in half
                </span>
              </label>
              <input
                id="audio-mono-downmix"
                type="checkbox"
                checked={monoDownmix}
                onChange={(e) => setMonoDownmix(e.target.checked)}
                className="w-4 h-4 accent-[#4A6B53] rounded cursor-pointer flex-shrink-0"
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
            {selectedAudio.isVideo ? 'extract audio track' : 'squish audio now'}
          </SquishhButton>
        </div>
      )}

      {/* STAGE 3: PROCESSING */}
      {stage === 'processing' && (
        <WorkflowProgressCard
          iconSlot={
            <div className="w-20 h-20 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-5 shadow-sm">
              <Music className="w-9 h-9 animate-pulse" aria-hidden="true" />
            </div>
          }
          title={selectedAudio?.isVideo ? 'extracting soundtrack…' : 'squishing your audio…'}
          subtitle="hardware transcoding via Media3 AAC"
          progress={progress}
          onCancel={cancelActiveJob}
        />
      )}

      {/* STAGE 4: DONE & SHARE */}
      {stage === 'done' && result && (
        <WorkflowDoneShell
          subtitle="audio track ready"
          savings={{
            originalBytes: result.originalSizeBytes,
            compressedBytes: result.compressedSizeBytes,
          }}
          saveLabel="save to music library"
          savingLabel="saving to music…"
          savedLabel="saved to music ✓"
          isSaving={isSaving}
          savedSuccess={savedSuccess}
          onSave={handleSaveToGallery}
          shareLabel="share audio"
          onShare={handleShare}
          resetLabel="squish another track"
          onReset={resetAll}
        >
          {/* Built-in Audio Player with AnalyserNode-driven Equalizer (UI-003) */}
          <div className="w-full p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] mb-4 flex flex-col gap-3">
            <div
              aria-hidden="true"
              className="flex items-end justify-center gap-1.5 h-12 px-2 rounded-xl bg-[#EDE8E0]/60 dark:bg-[#1D2024]"
            >
              {Array.from({ length: EQUALIZER_BAR_COUNT }).map((_, i) => (
                <div
                  key={i}
                  ref={(node) => {
                    barRefs.current[i] = node;
                  }}
                  style={{ transform: `scaleY(${RESTING_BAR_SCALE})` }}
                  className={`w-1.5 h-10 origin-bottom rounded-full transition-colors ${
                    isPlaying
                      ? 'bg-[#4A6B53] dark:bg-[#76A183]'
                      : 'bg-[#767B77]/45 dark:bg-[#949995]/40'
                  }`}
                />
              ))}
            </div>

            <audio
              ref={audioElRef}
              controls
              onPlay={handlePlaybackStart}
              onPause={handlePlaybackStop}
              onEnded={handlePlaybackStop}
              aria-label="Compressed audio preview player"
              src={
                result.outputPath.startsWith('blob:')
                  ? result.outputPath
                  : (Capacitor.isNativePlatform()
                      ? Capacitor.convertFileSrc(result.outputPath)
                      : (selectedAudio?.previewUrl || ''))
              }
              className="w-full h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 w-full text-xs text-left mb-4 md:mb-0">
            <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
              <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">FORMAT</span>
              <span className="font-bold uppercase">{result.format} ({result.bitrateKbps}k)</span>
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
