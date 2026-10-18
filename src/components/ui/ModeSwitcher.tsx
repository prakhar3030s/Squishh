import { useRef } from 'react';
import { Image, Film, Music, FileText } from 'lucide-react';
import { Flip, isReducedMotion } from '../../lib/gsap';
import { haptics } from '../../services/haptics';

export type AppMode = 'images' | 'video' | 'audio' | 'pdf';

interface ModeSwitcherProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const MODES: { id: AppMode; label: string; icon: typeof Image }[] = [
  { id: 'images', label: 'Images', icon: Image },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'pdf', label: 'PDF', icon: FileText },
];

export function ModeSwitcher({ currentMode, onModeChange }: ModeSwitcherProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = (mode: AppMode) => {
    if (mode === currentMode) return;
    haptics.selection();

    if (!isReducedMotion() && containerRef.current) {
      const state = Flip.getState('.mode-pill-active');
      onModeChange(mode);
      // Wait for React to re-render the DOM then animate Flip
      requestAnimationFrame(() => {
        Flip.from(state, {
          duration: 0.32,
          ease: 'power2.out',
        });
      });
    } else {
      onModeChange(mode);
    }
  };

  return (
    <nav
      ref={containerRef}
      className="w-full max-w-sm mx-auto p-1.5 rounded-full bg-[#EDE8E0] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] flex items-center justify-between relative shadow-inner"
      aria-label="File Mode Switcher"
    >
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = currentMode === mode.id;

        return (
          <button
            key={mode.id}
            onClick={() => handleSelect(mode.id)}
            className={`relative flex-1 py-2 px-3 rounded-full flex items-center justify-center gap-1.5 text-xs font-medium z-10 transition-colors duration-200 select-none ${
              isActive
                ? 'text-[#2C302E] dark:text-[#EDE9E3]'
                : 'text-[#767B77] dark:text-[#949995] hover:text-[#2C302E] dark:hover:text-[#EDE9E3]'
            }`}
          >
            {isActive && (
              <div
                className="mode-pill-active absolute inset-0 rounded-full bg-[#FBF9F5] dark:bg-[#2C3036] shadow-sm border border-[#E5DFD5] dark:border-[#383E46] -z-10"
              />
            )}
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{mode.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
