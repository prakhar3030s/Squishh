import { useCallback, useState } from 'react';
import { humanizeError } from '../services/engineManager';
import { useEngineManager, useHaptics } from '../services/ServiceContext';

export type WorkflowStage = 'idle' | 'configuring' | 'processing' | 'done';

export interface ExecuteJobOptions {
  jobId: string;
  fallbackError: string;
  run: (jobId: string) => Promise<boolean | void>;
  onCancelled?: () => void;
  onFailed?: (error: unknown) => void;
}

/**
 * Executes an async mapper across items with bounded concurrency while preserving item order (PERF-005).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Shared state machine for media workflows (idle -> configuring -> processing -> done),
 * unifying progress, ETA, error handling, cancellation, gallery export, and sharing (ARCH-002).
 */
export function useWorkflow(initialStage: WorkflowStage = 'idle') {
  const engine = useEngineManager();
  const haptics = useHaptics();

  const [stage, setStage] = useState<WorkflowStage>(initialStage);
  const [progress, setProgress] = useState<number>(0);
  const [etaMs, setEtaMs] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const beginConfigure = useCallback(() => {
    setSavedSuccess(false);
    setErrorMessage(null);
    setStage('configuring');
  }, []);

  const executeJob = useCallback(
    async ({ jobId, fallbackError, run, onCancelled, onFailed }: ExecuteJobOptions) => {
      haptics.mediumImpact();
      setStage('processing');
      setProgress(0);
      setEtaMs(0);
      setErrorMessage(null);
      setSavedSuccess(false);
      setActiveJobId(jobId);

      try {
        const completed = await run(jobId);
        setActiveJobId(null);
        if (completed === false) {
          setStage('configuring');
        } else {
          setStage('done');
          haptics.success();
        }
      } catch (err: unknown) {
        setActiveJobId(null);
        const msg = err instanceof Error ? err.message : String(err ?? '');
        if (msg.includes('cancelled')) {
          onCancelled?.();
          setStage('configuring');
        } else {
          onFailed?.(err);
          setErrorMessage(humanizeError(err, fallbackError));
          setStage('configuring');
          haptics.error();
        }
      }
    },
    [haptics]
  );

  const cancelActiveJob = useCallback(async () => {
    if (!activeJobId) return;
    await engine.cancelJob(activeJobId);
    setActiveJobId(null);
    setStage('configuring');
  }, [activeJobId, engine]);

  const runSave = useCallback(
    async (saveFn: () => Promise<void>, fallbackError: string) => {
      if (isSaving || savedSuccess) return;
      setIsSaving(true);
      setErrorMessage(null);
      try {
        await saveFn();
        setSavedSuccess(true);
        haptics.success();
      } catch (err: unknown) {
        setErrorMessage(humanizeError(err, fallbackError));
        haptics.error();
      } finally {
        setIsSaving(false);
      }
    },
    [haptics, isSaving, savedSuccess]
  );

  const runShare = useCallback(
    async (shareFn: () => Promise<unknown>, onError?: (err: unknown) => void) => {
      try {
        haptics.selection();
        await shareFn();
      } catch (err) {
        onError?.(err);
      }
    },
    [haptics]
  );

  const resetWorkflow = useCallback(
    (onReset?: () => void) => {
      haptics.selection();
      setStage('idle');
      setProgress(0);
      setEtaMs(0);
      setSavedSuccess(false);
      setIsSaving(false);
      setActiveJobId(null);
      setErrorMessage(null);
      onReset?.();
    },
    [haptics]
  );

  return {
    stage,
    setStage,
    progress,
    setProgress,
    etaMs,
    setEtaMs,
    activeJobId,
    errorMessage,
    setErrorMessage,
    isSaving,
    savedSuccess,
    beginConfigure,
    executeJob,
    cancelActiveJob,
    runSave,
    runShare,
    resetWorkflow,
  };
}
