import React, { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { haptics } from '../../services/haptics';

interface SquishhButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function SquishhButton({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  onClick,
  className = '',
  disabled = false,
  ...props
}: SquishhButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { contextSafe } = useGSAP({ scope: buttonRef });

  const handlePointerDown = contextSafe(() => {
    if (disabled || !buttonRef.current) return;
    gsap.to(buttonRef.current, {
      scale: 0.95,
      duration: 0.12,
      ease: 'power2.out',
    });
  });

  const handlePointerUp = contextSafe(() => {
    if (disabled || !buttonRef.current) return;
    gsap.to(buttonRef.current, {
      scale: 1,
      duration: 0.25,
      ease: 'back.out(2)',
    });
  });

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    haptics.lightImpact();
    onClick?.(e);
  };

  const variantStyles = {
    primary:
      'bg-[#4A6B53] text-white hover:bg-[#3D5A45] active:bg-[#37523F] dark:bg-[#76A183] dark:text-[#101512] dark:hover:bg-[#85B293] shadow-sm',
    secondary:
      'bg-[#EBE5DC] text-[#37413A] dark:bg-[#272B30] dark:text-[#E0DDD8] border border-[#E5DFD5] dark:border-[#2D3238]',
    accent:
      'bg-[#F6D6C6] text-[#4A352D] dark:bg-[#4A352D] dark:text-[#F6D6C6] border border-[#EAC5B3] dark:border-[#5C4237]',
    ghost:
      'bg-transparent text-[#767B77] dark:text-[#949995] hover:bg-[#EDE8E0] dark:hover:bg-[#24282D]',
  };

  const sizeStyles = {
    sm: 'h-9 px-4 text-xs gap-1.5 rounded-full',
    md: 'h-12 px-6 text-sm gap-2 rounded-full font-medium',
    lg: 'h-14 px-8 text-base gap-2.5 rounded-full font-semibold',
  };

  return (
    <button
      ref={buttonRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-opacity select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
