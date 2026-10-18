import { formatBytes } from '../services/engineManager';
import { haptics } from '../services/haptics';
import { SquishhButton } from './ui/SquishhButton';
import {
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export interface BatchQueueItem {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  outputPath?: string;
  error?: string;
}

interface BatchQueueManagerProps {
  items: BatchQueueItem[];
  onCancelItem?: (id: string) => void;
  onSaveAll?: () => void;
  onClearCompleted?: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function BatchQueueManager({
  items,
  onCancelItem,
  onSaveAll,
  onClearCompleted,
  isExpanded,
  onToggleExpand,
}: BatchQueueManagerProps) {
  if (items.length === 0) return null;

  const completedCount = items.filter((it) => it.status === 'completed').length;
  const processingCount = items.filter((it) => it.status === 'processing').length;
  const overallProgress = items.length > 0
    ? Math.round(
        (items.reduce((acc, it) => acc + (it.status === 'completed' ? 100 : it.progress), 0) /
          (items.length * 100)) *
          100
      )
    : 0;

  return (
    <div className="w-full max-w-md mx-auto my-2 rounded-3xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] shadow-sm overflow-hidden text-left transition-all">
      {/* Collapsed Header Pill */}
      <div
        onClick={() => {
          haptics.selection();
          onToggleExpand();
        }}
        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#EDE8E0]/40 dark:hover:bg-[#24282D]/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center flex-shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight">batch queue</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EDE8E0] dark:bg-[#24282D] font-mono font-semibold">
                {completedCount}/{items.length}
              </span>
            </div>
            <p className="text-[11px] text-[#767B77] dark:text-[#949995] truncate">
              {processingCount > 0 ? `squishing ${processingCount} file(s)…` : 'all files settled'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold">{overallProgress}%</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#767B77]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#767B77]" />
          )}
        </div>
      </div>

      {/* Expanded Queue Drawer */}
      {isExpanded && (
        <div className="p-3.5 pt-0 border-t border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-2">
          {/* Progress bar */}
          <div className="w-full bg-[#EDE8E0] dark:bg-[#24282D] h-1.5 rounded-full overflow-hidden mt-3 mb-1">
            <div
              className="bg-[#4A6B53] dark:bg-[#76A183] h-full transition-all duration-300 rounded-full"
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          {/* Items List */}
          <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1 mt-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {item.status === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183] flex-shrink-0" />
                  )}
                  {item.status === 'processing' && (
                    <div className="w-4 h-4 rounded-full border-2 border-[#4A6B53] dark:border-[#76A183] border-t-transparent animate-spin flex-shrink-0" />
                  )}
                  {item.status === 'waiting' && (
                    <Clock className="w-4 h-4 text-[#767B77] flex-shrink-0" />
                  )}
                  {item.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{item.name}</p>
                    <p className="text-[10px] text-[#767B77] dark:text-[#949995]">
                      {formatBytes(item.sizeBytes)} &bull;{' '}
                      {item.status === 'processing'
                        ? `${item.progress}%`
                        : item.status}
                    </p>
                  </div>
                </div>

                {item.status !== 'completed' && onCancelItem && (
                  <button
                    onClick={() => {
                      haptics.selection();
                      onCancelItem(item.id);
                    }}
                    className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#767B77]"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Queue Actions */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#E5DFD5] dark:border-[#2D3238]">
            {completedCount > 0 && onSaveAll && (
              <SquishhButton
                size="sm"
                variant="primary"
                onClick={() => {
                  haptics.mediumImpact();
                  onSaveAll();
                }}
                icon={<Download className="w-3.5 h-3.5" />}
                className="flex-1"
              >
                save all ({completedCount})
              </SquishhButton>
            )}

            {onClearCompleted && (
              <button
                onClick={() => {
                  haptics.selection();
                  onClearCompleted();
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl text-[#767B77] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>clear</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
