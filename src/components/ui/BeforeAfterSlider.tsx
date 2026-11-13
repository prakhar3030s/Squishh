import React, { useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { formatBytes } from '../../services/engineManager';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeBytes: number;
  afterBytes: number;
}

/**
 * Interactive pointer-draggable and keyboard-accessible split comparison viewer (UI-001, UI-005).
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeBytes,
  afterBytes,
}: BeforeAfterSliderProps) {
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  const updateFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const raw = ((clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(0, Math.min(100, raw));
    setSplitPercent(clamped);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = splitPercent - 5;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = splitPercent + 5;
    else if (e.key === 'PageDown') next = splitPercent - 15;
    else if (e.key === 'PageUp') next = splitPercent + 15;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;

    if (next !== null) {
      e.preventDefault();
      setSplitPercent(Math.max(0, Math.min(100, next)));
    }
  };

  const rounded = Math.round(splitPercent);

  return (
    <div className="w-full flex flex-col gap-2">
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Before and after image comparison slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded}% original, ${100 - rounded}% squished`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="relative w-full h-48 md:h-64 rounded-2xl overflow-hidden border border-[#E5DFD5] dark:border-[#2D3238] bg-[#141618] touch-none select-none cursor-ew-resize"
      >
        {/* Right / Base layer: Squished (After) */}
        <img
          src={afterSrc}
          alt="Squished preview"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Left / Clipped layer: Original (Before) */}
        <img
          src={beforeSrc}
          alt="Original preview"
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Corner size badges */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/65 text-[#EDE9E3] text-[10px] font-mono backdrop-blur-xs pointer-events-none">
          BEFORE &bull; {formatBytes(beforeBytes)}
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-[#4A6B53]/90 text-white text-[10px] font-mono backdrop-blur-xs pointer-events-none">
          AFTER &bull; {formatBytes(afterBytes)}
        </div>

        {/* Vertical divider line & draggable thumb */}
        <div
          aria-hidden="true"
          style={{ left: `${splitPercent}%` }}
          className="absolute inset-y-0 -translate-x-1/2 flex items-center justify-center pointer-events-none"
        >
          <div className="w-0.5 h-full bg-[#EDE9E3]/90 shadow-sm" />
          <div className="absolute w-8 h-8 rounded-full bg-[#141618]/90 border-2 border-[#76A183] text-[#EDE9E3] shadow-md flex items-center justify-center">
            <MoveHorizontal className="w-4 h-4" />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#767B77] dark:text-[#949995] text-center">
        drag slider to compare original vs squished ({rounded}% / {100 - rounded}%)
      </p>
    </div>
  );
}
