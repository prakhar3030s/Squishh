import { useRef, useEffect } from 'react';
import { gsap, useGSAP, isReducedMotion } from '../lib/gsap';
import { App as CapacitorApp } from '@capacitor/app';

export function AmbientBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const blob3Ref = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(() => {
    if (isReducedMotion()) return;

    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    timelineRef.current = tl;

    if (blob1Ref.current) {
      tl.to(
        blob1Ref.current,
        {
          x: 35,
          y: -25,
          scale: 1.12,
          rotation: 20,
          duration: 9,
          ease: 'sine.inOut',
        },
        0
      );
    }

    if (blob2Ref.current) {
      tl.to(
        blob2Ref.current,
        {
          x: -40,
          y: 30,
          scale: 1.08,
          rotation: -15,
          duration: 11,
          ease: 'sine.inOut',
        },
        0
      );
    }

    if (blob3Ref.current) {
      tl.to(
        blob3Ref.current,
        {
          x: 20,
          y: 35,
          scale: 1.15,
          rotation: 30,
          duration: 13,
          ease: 'sine.inOut',
        },
        0
      );
    }
  }, { scope: containerRef });

  // Battery-saving lifecycle integration: Pause ambient motion when app is backgrounded
  useEffect(() => {
    let handle: { remove: () => void } | null = null;

    const setupListener = async () => {
      try {
        handle = await CapacitorApp.addListener('appStateChange', (state) => {
          if (!timelineRef.current) return;
          if (state.isActive) {
            timelineRef.current.resume();
          } else {
            timelineRef.current.pause();
          }
        });
      } catch {
        // Fallback for desktop/web testing
      }
    };

    setupListener();

    return () => {
      handle?.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 overflow-hidden -z-10 select-none"
      aria-hidden="true"
    >
      {/* Top right sage blob */}
      <div
        ref={blob1Ref}
        className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[90px] opacity-40 dark:opacity-25 transition-colors duration-700 bg-[#76A183]"
      />

      {/* Bottom left peach blob */}
      <div
        ref={blob2Ref}
        className="absolute -bottom-32 -left-28 w-[28rem] h-[28rem] rounded-full blur-[100px] opacity-35 dark:opacity-20 transition-colors duration-700 bg-[#F6D6C6] dark:bg-[#4A352D]"
      />

      {/* Center ambient lavender glow */}
      <div
        ref={blob3Ref}
        className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full blur-[110px] opacity-25 dark:opacity-15 transition-colors duration-700 bg-[#E4DDF4] dark:bg-[#3B344D]"
      />
    </div>
  );
}
