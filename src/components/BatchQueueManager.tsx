import { formatBytes } from '../services/engineManager';
import { useHaptics } from '../services/ServiceContext';
import {
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export interface BatchQueueItem {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number;
  status: 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

interface BatchQueueManagerProps {
  items: BatchQueueItem[];
  onCancelItem?: (id: string) => void;
  onClearCompleted?: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function BatchQueueManager({
  items,
  onCancelItem,
  onClearCompleted,
  isExpanded,
  onToggleExpand,
}: BatchQueueManagerProps) {
  const haptics = useHaptics();
  if (items.length === 0) return null;

  const completedCount = items.filter((it) => it.status === 'completed').length;
  const processingCount = items.filter((it) => it.status === 'processing').length;

  /*
   * Overall progress formula across all 5 BatchQueueItem statuses (QUAL-008):
   * - Exclude aborted terminal statuses ('failed', 'cancelled') from the denominator so
   *   cancelling or failing part of a batch never traps overallProgress permanently below 100%
   *   once remaining work finishes.
   * - If every item failed or was cancelled (trackableItems.length === 0), report 0%.
   * - For remaining trackable items:
   *   - 'completed'  -> 100
   *   - 'waiting'    -> 0
   *   - 'processing' -> clamp(it.progress, 0, 100)
   */
  const trackableItems = items.filter(
    (it) => it.status !== 'failed' && it.status !== 'cancelled'
  );
  const overallProgress =
    trackableItems.length > 0
      ? Math.round(
          trackableItems.reduce((acc, it) => {
            if (it.status === 'completed') return acc + 100;
            if (it.status === 'waiting') return acc;
            return acc + Math.max(0, Math.min(100, it.progress));
          }, 0) / trackableItems.length
        )
      : 0;

  return (
    <div className="w-full mx-auto my-2 rounded-3xl bg-[#FBF9F5] dark:bg-[#141618] border border-[#E5DFD5] dark:border-[#2D3238] shadow-sm overflow-hidden text-left transition-all">
      {/* Collapsed Header Pill */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={`Batch queue, ${completedCount} of ${items.length} completed, ${overallProgress}%`}
        onClick={() => {
          haptics.selection();
          onToggleExpand();
        }}
        className="w-full p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#EDE8E0]/40 dark:hover:bg-[#24282D]/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-xl bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center flex-shrink-0"
          >
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
            <ChevronUp className="w-4 h-4 text-[#767B77]" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#767B77]" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Expanded Queue Drawer */}
      {isExpanded && (
        <div className="p-3.5 pt-0 border-t border-[#E5DFD5] dark:border-[#2D3238] flex flex-col gap-2">
          {/* Progress bar */}
          <div
            role="progressbar"
            aria-valuenow={overallProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall batch queue progress"
            className="w-full bg-[#EDE8E0] dark:bg-[#24282D] h-1.5 rounded-full overflow-hidden mt-3 mb-1"
          >
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
                    <CheckCircle2 className="w-4 h-4 text-[#4A6B53] dark:text-[#76A183] flex-shrink-0" aria-hidden="true" />
                  )}
                  {item.status === 'processing' && (
                    <div aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-[#4A6B53] dark:border-[#76A183] border-t-transparent animate-spin flex-shrink-0" />
                  )}
                  {item.status === 'waiting' && (
                    <Clock className="w-4 h-4 text-[#767B77] flex-shrink-0" aria-hidden="true" />
                  )}
                  {(item.status === 'failed' || item.status === 'cancelled') && (
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" aria-hidden="true" />
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

                {(item.status === 'waiting' || item.status === 'processing') && onCancelItem && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      onCancelItem(item.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#767B77] cursor-pointer"
                    aria-label={`Cancel ${item.name}`}
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Queue Actions */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#E5DFD5] dark:border-[#2D3238]">
            {onClearCompleted && (
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  onClearCompleted();
                }}
                aria-label="Clear completed batch items"
                className="px-3 py-2 text-xs font-semibold rounded-xl text-[#767B77] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>clear</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
