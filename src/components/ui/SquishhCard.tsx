import React from 'react';

interface SquishhCardProps {
  children: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function SquishhCard({
  children,
  className = '',
  badge,
  title,
  subtitle,
  action,
}: SquishhCardProps) {
  return (
    <div
      className={`rounded-3xl p-6 bg-[#F2EFE9] dark:bg-[#1D2024] border border-[#E5DFD5] dark:border-[#2D3238] shadow-sm transition-colors duration-300 ${className}`}
    >
      {(badge || title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col gap-1">
            {badge && <div>{badge}</div>}
            {title && <h3 className="text-lg font-bold tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-[#767B77] dark:text-[#949995]">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
