import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Flip } from 'gsap/Flip';

// Register plugins globally
gsap.registerPlugin(useGSAP, Flip);

// Configure project-wide tween defaults for a calm, organic feel
gsap.defaults({
  duration: 0.45,
  ease: 'power2.out',
});

// Check if user prefers reduced motion
export const isReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export { gsap, useGSAP, Flip };
