import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { formatBytes } from '../../services/engineManager';
import { SquishhButton } from '../ui/SquishhButton';

interface WorkflowErrorBannerProps {
  message: string | null;
}

export function WorkflowErrorBanner({ message }: WorkflowErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="p-3.5 rounded-2xl bg-[#F6D6C6]/80 dark:bg-[#4A352D]/80 border border-[#EAC5B3] dark:border-[#5C4237] text-xs flex items-center gap-2 text-[#4A352D] dark:text-[#F6D6C6]"
    >
      <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

interface WorkflowDropZoneProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  buttonLabel: string;
  buttonIcon?: React.ReactNode;
}

export function WorkflowDropZone({
  onClick,
  icon,
  title,
  subtitle,
  buttonLabel,
  buttonIcon,
}: WorkflowDropZoneProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${buttonLabel}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="p-8 rounded-3xl border-2 border-dashed border-[#DDD7CC] dark:border-[#383E46] bg-[#FBF9F5]/80 dark:bg-[#141618]/80 flex flex-col items-center text-center cursor-pointer transition-all hover:border-[#4A6B53] dark:hover:border-[#76A183] active:scale-[0.99]"
    >
      <div
        aria-hidden="true"
        className="w-14 h-14 rounded-2xl bg-[#EDE8E0] dark:bg-[#24282D] flex items-center justify-center text-[#4A6B53] dark:text-[#76A183] mb-3.5 shadow-sm"
      >
        {icon}
      </div>
      <p className="text-base font-bold mb-1">{title}</p>
      <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">{subtitle}</p>
      {/* Decorative CTA pill inside accessible dropzone button to avoid nested interactive controls */}
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center select-none h-12 px-6 text-sm gap-2 rounded-full font-medium bg-[#4A6B53] text-white dark:bg-[#76A183] dark:text-[#101512] shadow-sm"
      >
        {buttonIcon && <span className="flex-shrink-0">{buttonIcon}</span>}
        <span>{buttonLabel}</span>
      </span>
    </div>
  );
}

interface WorkflowProgressCardProps {
  iconSlot: React.ReactNode;
  title: string;
  subtitle: string;
  progress: number;
  etaLabel?: string;
  onCancel: () => void;
}

export function WorkflowProgressCard({
  iconSlot,
  title,
  subtitle,
  progress,
  etaLabel,
  onCancel,
}: WorkflowProgressCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="p-8 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] flex flex-col items-center text-center"
    >
      {iconSlot}

      <h3 className="text-lg font-bold mb-1">{title}</h3>
      <p className="text-xs text-[#767B77] dark:text-[#949995] mb-5">{subtitle}</p>

      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={title}
        className="w-full bg-[#E5DFD5] dark:bg-[#2D3238] h-3 rounded-full overflow-hidden mb-3"
      >
        <div
          className="bg-[#4A6B53] dark:bg-[#76A183] h-full transition-all duration-300 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>

      {etaLabel ? (
        <div className="flex items-center justify-between w-full text-xs font-mono font-semibold mb-6 px-1">
          <span>{progress}% complete</span>
          <span className="text-[#767B77] dark:text-[#949995]">{etaLabel}</span>
        </div>
      ) : (
        <span className="font-mono text-xs font-semibold mb-6">{progress}% complete</span>
      )}

      <SquishhButton size="sm" variant="secondary" onClick={onCancel}>
        cancel
      </SquishhButton>
    </div>
  );
}

interface WorkflowDoneShellProps {
  subtitle: string;
  savings?: {
    originalBytes: number;
    compressedBytes: number;
    requirePositivePercent?: boolean;
  };
  saveLabel: string;
  savingLabel: string;
  savedLabel: string;
  isSaving: boolean;
  savedSuccess: boolean;
  onSave: () => void;
  shareLabel: string;
  onShare: () => void;
  resetLabel: string;
  onReset: () => void;
  children: React.ReactNode;
}

export function WorkflowDoneShell({
  subtitle,
  savings,
  saveLabel,
  savingLabel,
  savedLabel,
  isSaving,
  savedSuccess,
  onSave,
  shareLabel,
  onShare,
  resetLabel,
  onReset,
  children,
}: WorkflowDoneShellProps) {
  const showSavings =
    savings &&
    savings.originalBytes > 0 &&
    (savings.requirePositivePercent
      ? savings.compressedBytes > 0 && savings.originalBytes > savings.compressedBytes
      : true);

  const savedPercent =
    savings && savings.originalBytes > 0
      ? Math.round(((savings.originalBytes - savings.compressedBytes) / savings.originalBytes) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="p-6 rounded-3xl bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238]">
        {/* Single-column stacked on phones (<768px); adaptive two-column result layout on >=768px (UI-007) */}
        <div className="flex flex-col md:grid md:grid-cols-12 md:gap-6 md:items-start">
          {/* Summary & Action Controls */}
          <div className="order-1 md:order-2 md:col-span-5 flex flex-col items-center md:items-stretch text-center md:text-left">
            <div className="flex flex-col items-center md:items-start">
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-full bg-[#4A6B53]/15 dark:bg-[#76A183]/20 text-[#4A6B53] dark:text-[#76A183] flex items-center justify-center mb-3"
              >
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <h3 className="text-xl font-bold mb-1">all done ✨</h3>
              <p className="text-xs text-[#767B77] dark:text-[#949995] mb-4">{subtitle}</p>

              {showSavings && savings && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#E4DDF4] dark:bg-[#3B344D] text-[#4A6B53] dark:text-[#E4DDF4] text-xs font-semibold mb-5">
                  <span>Saved {savedPercent}%</span>
                  <span>&bull;</span>
                  <span>
                    {formatBytes(savings.originalBytes)} &rarr; {formatBytes(savings.compressedBytes)}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons appear below preview on mobile, inside right summary pane on >=768px */}
            <div className="hidden md:flex flex-col gap-2 w-full">
              <SquishhButton
                size="md"
                variant="primary"
                onClick={onSave}
                disabled={isSaving || savedSuccess}
                icon={<Download className="w-4 h-4" />}
                className="w-full"
              >
                {isSaving ? savingLabel : savedSuccess ? savedLabel : saveLabel}
              </SquishhButton>

              <SquishhButton
                size="md"
                variant="secondary"
                onClick={onShare}
                icon={<Share2 className="w-4 h-4" />}
                className="w-full"
              >
                {shareLabel}
              </SquishhButton>

              <button
                type="button"
                onClick={onReset}
                className="mt-2 py-1.5 text-xs text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{resetLabel}</span>
              </button>
            </div>
          </div>

          {/* Preview / Media / Metadata pane */}
          <div className="order-2 md:order-1 md:col-span-7 w-full flex flex-col items-center">
            {children}
          </div>

          {/* Mobile-only action buttons positioned below preview as before */}
          <div className="order-3 md:hidden flex flex-col gap-2 w-full">
            <SquishhButton
              size="md"
              variant="primary"
              onClick={onSave}
              disabled={isSaving || savedSuccess}
              icon={<Download className="w-4 h-4" />}
              className="w-full"
            >
              {isSaving ? savingLabel : savedSuccess ? savedLabel : saveLabel}
            </SquishhButton>

            <SquishhButton
              size="md"
              variant="secondary"
              onClick={onShare}
              icon={<Share2 className="w-4 h-4" />}
              className="w-full"
            >
              {shareLabel}
            </SquishhButton>

            <button
              type="button"
              onClick={onReset}
              className="mt-2 py-1.5 text-xs text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{resetLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
