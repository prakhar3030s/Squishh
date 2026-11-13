import { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { AmbientBackground } from './components/AmbientBackground';
import { ModeSwitcher, AppMode } from './components/ui/ModeSwitcher';
import { SquishhCard } from './components/ui/SquishhCard';
import { ImageWorkflow } from './components/ImageWorkflow';
import { VideoWorkflow } from './components/VideoWorkflow';
import { AudioWorkflow } from './components/AudioWorkflow';
import { PdfWorkflow } from './components/PdfWorkflow';
import { BatchQueueManager, BatchQueueItem } from './components/BatchQueueManager';
import type { WorkflowFile } from './services/engineManager';
import { useEngineManager } from './services/ServiceContext';
import { LOW_STORAGE_THRESHOLD_BYTES } from './constants/compression';
import { FileInfo } from './plugins/squishhEngine';
import {
  Sparkles,
  ShieldCheck,
  Zap,
  HardDrive,
  Music,
  FileText,
  AlertTriangle,
  X
} from 'lucide-react';

function ModeBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4]">
      {icon}
      <span>{label}</span>
    </span>
  );
}

export default function App() {
  const engineManager = useEngineManager();
  const [mode, setMode] = useState<AppMode>('images');
  const [storageText, setStorageText] = useState<string>('checking storage…');
  const [lowStorageWarning, setLowStorageWarning] = useState<boolean>(false);
  const [batchItems, setBatchItems] = useState<BatchQueueItem[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState<boolean>(false);
  const [clearingCache, setClearingCache] = useState<boolean>(false);
  const [sharedImages, setSharedImages] = useState<WorkflowFile[] | null>(null);
  const [sharedVideo, setSharedVideo] = useState<WorkflowFile | null>(null);
  const [sharedAudio, setSharedAudio] = useState<WorkflowFile | null>(null);
  const [sharedPdf, setSharedPdf] = useState<WorkflowFile | null>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);
  const checkingShareRef = useRef<boolean>(false);

  const consumeSharedImages = useCallback(() => setSharedImages(null), []);
  const consumeSharedVideo = useCallback(() => setSharedVideo(null), []);
  const consumeSharedAudio = useCallback(() => setSharedAudio(null), []);
  const consumeSharedPdf = useCallback(() => setSharedPdf(null), []);

  const handleManualClearCache = async () => {
    setClearingCache(true);
    await engineManager.clearCache();
    try {
      const info = await engineManager.getStorageInfo();
      setStorageText(`${info.formatted} free`);
      // Keep warning active whenever freeBytes === 0 (full device) or below 200 MB (BUG-022 / QUAL-009)
      setLowStorageWarning(info.freeBytes < LOW_STORAGE_THRESHOLD_BYTES);
    } catch {
      // Ignore transient storage query failure
    }
    setTimeout(() => {
      setClearingCache(false);
    }, 1500);
  };

  useEffect(() => {
    engineManager.init();

    // Check storage capacity (freeBytes === 0 retains warning per BUG-022 / QUAL-009)
    engineManager.getStorageInfo().then((info) => {
      setStorageText(`${info.formatted} free`);
      if (info.freeBytes < LOW_STORAGE_THRESHOLD_BYTES) {
        setLowStorageWarning(true);
      }
    }).catch(() => {});

    // Clear cache as soon as app is closed / hidden
    const handleAppClosed = () => {
      engineManager.clearCache().catch(() => {});
    };
    window.addEventListener('pagehide', handleAppClosed);
    window.addEventListener('beforeunload', handleAppClosed);

    // Resolve and route files shared into Squishh via Android System Share
    const checkIncomingShare = async () => {
      if (checkingShareRef.current) return;
      checkingShareRef.current = true;
      try {
        const share = await engineManager.getIncomingShare();
        if (!share || share.count === 0 || !share.uris || share.uris.length === 0) return;

        const settled = await Promise.allSettled(
          share.uris.map((uri) => engineManager.resolveContentUri(uri))
        );
        const resolvedInfos: FileInfo[] = [];
        for (const item of settled) {
          if (item.status === 'fulfilled') {
            resolvedInfos.push(item.value);
          }
        }
        if (resolvedInfos.length === 0) return;

        const workflowFiles: WorkflowFile[] = resolvedInfos.map((info) => ({
          name: info.displayName,
          sizeBytes: info.sizeBytes,
          uri: info.localPath,
          previewUrl: Capacitor.isNativePlatform()
            ? Capacitor.convertFileSrc(info.localPath)
            : info.localPath,
        }));

        const effectiveMime = (
          share.mimeType && share.mimeType !== '*/*' && share.mimeType !== 'application/octet-stream'
            ? share.mimeType
            : resolvedInfos[0].mimeType || ''
        ).toLowerCase();

        if (effectiveMime.startsWith('video/')) {
          setSharedVideo(workflowFiles[0]);
          setMode('video');
        } else if (effectiveMime.startsWith('audio/')) {
          setSharedAudio(workflowFiles[0]);
          setMode('audio');
        } else if (effectiveMime.includes('pdf')) {
          setSharedPdf(workflowFiles[0]);
          setMode('pdf');
        } else {
          setSharedImages(workflowFiles);
          setMode('images');
        }
      } catch (err) {
        console.error('Failed to process incoming share:', err);
      } finally {
        checkingShareRef.current = false;
      }
    };

    checkIncomingShare();

    let removeShareListener: (() => void) | null = null;
    let removeAppStateListener: (() => Promise<void>) | null = null;
    let disposed = false;

    engineManager.onIncomingShareReady(() => {
      checkIncomingShare();
    }).then((unsub) => {
      if (disposed) {
        unsub();
      } else {
        removeShareListener = unsub;
      }
    });

    Promise.resolve(
      CapacitorApp.addListener('appStateChange', (state) => {
        if (state.isActive) {
          checkIncomingShare();
        }
      })
    ).then((handle) => {
      if (disposed) {
        handle.remove().catch(() => {});
      } else {
        removeAppStateListener = () => handle.remove();
      }
    }).catch(() => {});

    return () => {
      disposed = true;
      window.removeEventListener('pagehide', handleAppClosed);
      window.removeEventListener('beforeunload', handleAppClosed);
      removeShareListener?.();
      removeAppStateListener?.().catch(() => {});
    };
  }, [engineManager]);

  return (
    <div
      ref={appContainerRef}
      className="min-h-screen relative overflow-hidden flex flex-col justify-between p-5 pt-safe pb-safe bg-[#141618] text-[#EDE9E3]"
    >
      {/* Ambient drifting background (pauses when backgrounded) */}
      <AmbientBackground />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="w-10 h-10 rounded-2xl bg-[#4A6B53] dark:bg-[#76A183] flex items-center justify-center text-white shadow-sm transition-transform active:scale-95"
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">squishh</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-[#949995]">
              <ShieldCheck className="w-3 h-3 text-[#76A183]" aria-hidden="true" />
              <span>100% offline &bull; private</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleManualClearCache}
          aria-label={`Clear temporary cache (${storageText})`}
          title="Tap to clear cache immediately"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#24282D] hover:bg-[#2D3238] border border-[#2D3238] text-[11px] font-mono text-[#949995] active:scale-95 transition-all cursor-pointer"
        >
          <HardDrive className="w-3 h-3 text-[#76A183]" aria-hidden="true" />
          <span>{clearingCache ? 'cache cleared ✨' : storageText}</span>
        </button>
      </header>

      {/* Main Interactive Stage */}
      <main className="relative z-10 my-auto py-5 w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto flex flex-col gap-3">
        {mode === 'images' && (
          <SquishhCard
            badge={<ModeBadge icon={<Zap className="w-3 h-3" />} label="images active" />}
            title="image compressor & converter"
          >
            <ImageWorkflow
              onQueueUpdate={setBatchItems}
              sharedFiles={sharedImages}
              onSharedFilesConsumed={consumeSharedImages}
            />
          </SquishhCard>
        )}

        {mode === 'video' && (
          <SquishhCard
            badge={<ModeBadge icon={<Zap className="w-3 h-3" />} label="video active" />}
            title="hardware video transcoder"
          >
            <VideoWorkflow
              sharedFile={sharedVideo}
              onSharedFileConsumed={consumeSharedVideo}
            />
          </SquishhCard>
        )}

        {mode === 'audio' && (
          <SquishhCard
            badge={<ModeBadge icon={<Music className="w-3 h-3" />} label="audio active" />}
            title="audio & soundtrack engine"
          >
            <AudioWorkflow
              sharedFile={sharedAudio}
              onSharedFileConsumed={consumeSharedAudio}
            />
          </SquishhCard>
        )}

        {mode === 'pdf' && (
          <SquishhCard
            badge={<ModeBadge icon={<FileText className="w-3 h-3" />} label="pdf active" />}
            title="offline PDF squisher & builder"
          >
            <PdfWorkflow
              sharedFile={sharedPdf}
              onSharedFileConsumed={consumeSharedPdf}
            />
          </SquishhCard>
        )}

        {/* Low Storage Alert */}
        {lowStorageWarning && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-2xl bg-[#F6D6C6]/90 dark:bg-[#4A352D]/90 border border-[#EAC5B3] dark:border-[#5C4237] text-xs flex items-center justify-between gap-2.5 text-[#4A352D] dark:text-[#F6D6C6] text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>device space is low ({storageText}) — squishing files will help free up storage!</span>
            </div>
            <button
              type="button"
              onClick={() => setLowStorageWarning(false)}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-current flex-shrink-0 cursor-pointer"
              aria-label="Dismiss low storage warning"
              title="Dismiss warning"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Batch Queue Manager */}
        <BatchQueueManager
          items={batchItems}
          isExpanded={isQueueExpanded}
          onToggleExpand={() => setIsQueueExpanded(!isQueueExpanded)}
          onCancelItem={(id) => {
            engineManager.cancelJob(id).catch(() => {});
            setBatchItems((prev) => prev.filter((it) => it.id !== id));
          }}
          onClearCompleted={() => setBatchItems((prev) => prev.filter((it) => it.status !== 'completed'))}
        />
      </main>

      {/* Bottom Floating Navigation & Mode Switcher */}
      <footer className="relative z-10 w-full max-w-md md:max-w-lg mx-auto pt-1">
        <ModeSwitcher currentMode={mode} onModeChange={setMode} />
      </footer>
    </div>
  );
}
