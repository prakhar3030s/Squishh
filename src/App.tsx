import { useState, useRef, useEffect } from 'react';
import { AmbientBackground } from './components/AmbientBackground';
import { ModeSwitcher, AppMode } from './components/ui/ModeSwitcher';
import { SquishhCard } from './components/ui/SquishhCard';
import { ImageWorkflow } from './components/ImageWorkflow';
import { VideoWorkflow } from './components/VideoWorkflow';
import { AudioWorkflow } from './components/AudioWorkflow';
import { PdfWorkflow } from './components/PdfWorkflow';
import { BatchQueueManager, BatchQueueItem } from './components/BatchQueueManager';
import { engineManager } from './services/engineManager';
import {
  Sparkles,
  ShieldCheck,
  Zap,
  HardDrive,
  Music,
  FileText,
  AlertTriangle
} from 'lucide-react';

export default function App() {
  const [mode, setMode] = useState<AppMode>('images');
  const [storageText, setStorageText] = useState<string>('checking storage…');
  const [lowStorageWarning, setLowStorageWarning] = useState<boolean>(false);
  const [batchItems, setBatchItems] = useState<BatchQueueItem[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState<boolean>(false);
  const [clearingCache, setClearingCache] = useState<boolean>(false);
  const appContainerRef = useRef<HTMLDivElement>(null);

  const handleManualClearCache = async () => {
    setClearingCache(true);
    await engineManager.clearCache();
    const info = await engineManager.getStorageInfo();
    setStorageText(`${info.formatted} free`);
    setTimeout(() => {
      setClearingCache(false);
    }, 1500);
  };

  useEffect(() => {
    // Enforce dark mode as permanent default
    document.documentElement.classList.add('dark');
    engineManager.init();

    // Check storage capacity
    engineManager.getStorageInfo().then((info) => {
      setStorageText(`${info.formatted} free`);
      if (info.freeBytes < 200 * 1024 * 1024 && info.freeBytes > 0) {
        setLowStorageWarning(true);
      }
    });

    // Clear cache as soon as app is closed / hidden
    const handleAppClosed = () => {
      engineManager.clearCache().catch(() => {});
    };
    window.addEventListener('pagehide', handleAppClosed);
    window.addEventListener('beforeunload', handleAppClosed);

    // Check for files shared into Squishh via Android System Share
    engineManager.getIncomingShare().then((share) => {
      if (share && share.count > 0) {
        if (share.mimeType.startsWith('video/')) {
          setMode('video');
        } else if (share.mimeType.startsWith('audio/')) {
          setMode('audio');
        } else if (share.mimeType.includes('pdf')) {
          setMode('pdf');
        } else {
          setMode('images');
        }
      }
    });

    return () => {
      window.removeEventListener('pagehide', handleAppClosed);
      window.removeEventListener('beforeunload', handleAppClosed);
    };
  }, []);

  return (
    <div
      ref={appContainerRef}
      className="min-h-screen relative overflow-hidden flex flex-col justify-between p-5 pt-safe pb-safe bg-[#141618] text-[#EDE9E3]"
    >
      {/* Ambient drifting background (pauses when backgrounded) */}
      <AmbientBackground />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between w-full max-w-md mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#4A6B53] dark:bg-[#76A183] flex items-center justify-center text-white shadow-sm transition-transform active:scale-95">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">squishh</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-[#949995]">
              <ShieldCheck className="w-3 h-3 text-[#76A183]" />
              <span>100% offline &bull; private</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleManualClearCache}
          title="Tap to clear cache immediately"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#24282D] hover:bg-[#2D3238] border border-[#2D3238] text-[11px] font-mono text-[#949995] active:scale-95 transition-all cursor-pointer"
        >
          <HardDrive className="w-3 h-3 text-[#76A183]" />
          <span>{clearingCache ? 'cache cleared ✨' : storageText}</span>
        </button>
      </header>

      {/* Main Interactive Stage */}
      <main className="relative z-10 my-auto py-5 w-full max-w-md mx-auto flex flex-col gap-3">
        {mode === 'images' && (
          <SquishhCard
            badge={
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4]">
                <Zap className="w-3 h-3" />
                <span>images active</span>
              </span>
            }
            title="image compressor & converter"
          >
            <ImageWorkflow />
          </SquishhCard>
        )}

        {mode === 'video' && (
          <SquishhCard
            badge={
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4]">
                <Zap className="w-3 h-3" />
                <span>video active</span>
              </span>
            }
            title="hardware video transcoder"
          >
            <VideoWorkflow />
          </SquishhCard>
        )}

        {mode === 'audio' && (
          <SquishhCard
            badge={
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4]">
                <Music className="w-3 h-3" />
                <span>audio active</span>
              </span>
            }
            title="audio & soundtrack engine"
          >
            <AudioWorkflow />
          </SquishhCard>
        )}

        {mode === 'pdf' && (
          <SquishhCard
            badge={
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4]">
                <FileText className="w-3 h-3" />
                <span>pdf active</span>
              </span>
            }
            title="offline PDF squisher & builder"
          >
            <PdfWorkflow />
          </SquishhCard>
        )}

        {/* Low Storage Alert */}
        {lowStorageWarning && (
          <div className="p-3 rounded-2xl bg-[#F6D6C6]/90 dark:bg-[#4A352D]/90 border border-[#EAC5B3] dark:border-[#5C4237] text-xs flex items-center gap-2.5 text-[#4A352D] dark:text-[#F6D6C6] text-left">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>device space is low ({storageText}) — squishing files will help free up storage!</span>
          </div>
        )}

        {/* Batch Queue Manager */}
        <BatchQueueManager
          items={batchItems}
          isExpanded={isQueueExpanded}
          onToggleExpand={() => setIsQueueExpanded(!isQueueExpanded)}
          onCancelItem={(id) => setBatchItems((prev) => prev.filter((it) => it.id !== id))}
          onClearCompleted={() => setBatchItems((prev) => prev.filter((it) => it.status !== 'completed'))}
        />
      </main>

      {/* Bottom Floating Navigation & Mode Switcher */}
      <footer className="relative z-10 w-full max-w-md mx-auto pt-1">
        <ModeSwitcher currentMode={mode} onModeChange={setMode} />
      </footer>
    </div>
  );
}
