import React, { useState, useRef } from 'react';
import { engineManager, formatBytes, humanizeError } from '../services/engineManager';
import { haptics } from '../services/haptics';
import { AudioProcessResult } from '../plugins/squishhEngine';
import { SquishhButton } from './ui/SquishhButton';
import { gsap, useGSAP } from '../lib/gsap';
import {
  Music,
  CheckCircle2,
  Share2,
  Download,
  RotateCcw,
  Sparkles,
  AlertCircle,
  FileAudio
} from 'lucide-react';

interface SelectedAudio {
  name: string;
  sizeBytes: number;
  uri: string;
  previewUrl: string;
  isVideo: boolean;
}

export function AudioWorkflow() {
  const [stage, setStage] = useState<'idle' | 'configuring' | 'processing' | 'done'>('idle');
  const [selectedAudio, setSelectedAudio] = useState<SelectedAudio | null>(null);
  const [targetFormat, setTargetFormat] = useState<'m4a' | 'mp3' | 'wav'>('m4a');
  const [bitrateKbps, setBitrateKbps] = useState<number>(128);
  const [monoDownmix, setMonoDownmix] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [result, setResult] = useState<AudioProcessResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const soundwaveRef = useRef<HTMLDivElement>(null);

  // GSAP animation on the rhythmic soundwave bars during processing
  useGSAP(() => {
    if (stage === 'processing' && soundwaveRef.current) {
      const bars = soundwaveRef.current.querySelectorAll('.soundwave-bar');
      gsap.to(bars, {
        scaleY: 'random(0.3, 1.8)',
        duration: 0.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        stagger: {
          each: 0.08,
          from: 'center',
        },
      });
    }
  }, [stage]);

  const handleTriggerPick = async () => {
    haptics.selection();
    const picked = await engineManager.pickFiles('audio/*,video/*', false);
    if (picked.length > 0) {
      const p = picked[0];
      const isVideo = p.name.match(/\.(mp4|mov|mkv|webm)$/i) !== null;
      setSelectedAudio({
        ...p,
        isVideo,
      });
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
    const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|mkv|webm)$/i) !== null;
    const item = await engineManager.cacheWebFile(file);
    setSelectedAudio({
      ...item,
      isVideo,
    });
    setStage('configuring');
    setErrorMessage(null);
  };

  const handleStartCompression = async () => {
    if (!selectedAudio) return;

    haptics.mediumImpact();
    setStage('processing');
    setProgress(0);
    setErrorMessage(null);
    setSavedSuccess(false);

    const jobId = `aud_${Date.now()}`;
    setActiveJobId(jobId);

    try {
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
      setStage('done');
      haptics.success();
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        setStage('configuring');
      } else {
        setErrorMessage(humanizeError(err, "couldn't tune this audio track, try another file?"));
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
      await engineManager.saveOutputToGallery(
        result.outputPath,
        'audio',
        `squishh_${Date.now()}.${result.format}`
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
      await engineManager.shareFiles([result.outputPath], 'Squished Audio');
    } catch {
      // User dismissed share
    }
  };

  const resetAll = () => {
    haptics.selection();
    setStage('idle');
    setSelectedAudio(null);
    setResult(null);
    setProgress(0);
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
        accept="audio/*,video/*"
        onChange={handleFileChange}
        className="hidden"
        id="audio-file-input"
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
            <Music className="w-7 h-7" />
          </div>
          <p className="text-base font-bold mb-1">drop audio or video file here</p>
          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            MP3, AAC, WAV, FLAC or MP4/MOV soundtrack &bull; 100% offline
          </p>

          <SquishhButton
            size="md"
            variant="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleTriggerPick();
            }}
          >
            select audio / video
          </SquishhButton>
        </div>
      )}

      {/* STAGE 2: CONFIGURING OPTIONS */}
      {stage === 'configuring' && selectedAudio && (
        <div className="flex flex-col gap-4">
          {/* File summary badge */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
            <div className="w-12 h-12 rounded-xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183]">
              <FileAudio className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold truncate">{selectedAudio.name}</p>
              <p className="text-xs text-[#767B77] dark:text-[#949995]">
                {selectedAudio.isVideo ? 'video soundtrack' : 'audio file'} &bull; {formatBytes(selectedAudio.sizeBytes)}
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-[#4A6B53] dark:text-[#76A183] font-medium px-2 py-1 rounded-lg hover:underline"
            >
              change
            </button>
          </div>

          {/* Audio Direct Controls */}
          <div className="p-4 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-3.5 text-left">
            {/* Format selector */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">target format:</span>
              <div className="flex gap-1.5">
                {(['m4a', 'mp3', 'wav'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setTargetFormat(fmt);
                      haptics.selection();
                    }}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold uppercase transition-all ${
                      targetFormat === fmt
                        ? 'bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm'
                        : 'bg-[#EDE8E0] dark:bg-[#24282D] text-[#767B77] hover:opacity-80'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Bitrate selection */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">bitrate:</span>
              <select
                value={bitrateKbps}
                onChange={(e) => {
                  setBitrateKbps(parseInt(e.target.value));
                  haptics.selection();
                }}
                className="px-2.5 py-1.5 rounded-xl border border-[#E5DFD5] dark:border-[#2D3238] bg-[#F2EFE9] dark:bg-[#1D2024] text-xs font-semibold"
              >
                <option value="64">64 kbps (Voice / Speech)</option>
                <option value="96">96 kbps (Compact)</option>
                <option value="128">128 kbps (Standard)</option>
                <option value="192">192 kbps (High Quality)</option>
                <option value="256">256 kbps (Crisp Studio)</option>
                <option value="320">320 kbps (Maximum Fidelity)</option>
              </select>
            </div>

            {/* Mono downmixing */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E5DFD5] dark:border-[#2D3238]">
              <div>
                <span className="text-xs font-semibold block">mono downmixing</span>
                <span className="text-[11px] text-[#767B77] dark:text-[#949995]">
                  Merges stereo channels into 1 channel, cutting file size in half
                </span>
              </div>
              <input
                type="checkbox"
                checked={monoDownmix}
                onChange={(e) => setMonoDownmix(e.target.checked)}
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
            {selectedAudio.isVideo ? 'extract audio track' : 'squish audio now'}
          </SquishhButton>
        </div>
      )}

      {/* STAGE 3: PROCESSING */}
      {stage === 'processing' && (
        <div className="p-8 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col items-center text-center">
          {/* GSAP Rhythmic Soundwave Visualizer */}
          <div ref={soundwaveRef} className="flex items-center justify-center gap-2 h-20 mb-5">
            {[40, 70, 100, 70, 45, 90, 60].map((h, i) => (
              <div
                key={i}
                className="soundwave-bar w-2 bg-[#4A6B53] dark:bg-[#76A183] rounded-full"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

          <h3 className="text-lg font-bold mb-1">
            {selectedAudio?.isVideo ? 'extracting soundtrack…' : 'squishing your audio…'}
          </h3>
          <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">
            hardware transcoding via Media3 AAC
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
      {stage === 'done' && result && (
        <div className="flex flex-col gap-4">
          <div className="p-6 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold mb-1">all done ✨</h3>
            <p className="text-xs text-[#767B77] dark:text-[#949995] mb-4">
              audio track ready
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

            {/* Built-in Audio Player */}
            <div className="w-full p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] mb-4">
              <audio
                controls
                src={result.outputPath.startsWith('blob:') ? result.outputPath : (selectedAudio?.previewUrl || '')}
                className="w-full h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 w-full text-xs text-left mb-4">
              <div className="p-3 rounded-2xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238]">
                <span className="text-[#767B77] dark:text-[#949995] block text-[10px]">FORMAT</span>
                <span className="font-bold uppercase">{result.format} ({result.bitrateKbps}k)</span>
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
                {savedSuccess ? 'saved to music ✓' : 'save to music library'}
              </SquishhButton>

              <SquishhButton
                size="md"
                variant="secondary"
                onClick={handleShare}
                icon={<Share2 className="w-4 h-4" />}
                className="w-full"
              >
                share audio
              </SquishhButton>

              <button
                onClick={resetAll}
                className="mt-2 text-xs text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>squish another track</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
