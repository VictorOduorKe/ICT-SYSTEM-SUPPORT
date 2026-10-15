import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'pending' | 'inprogress' | 'resolved' | 'cancelled' | 'neutral' | 'brand' | 'info' | 'warning' | 'success' | 'error';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs font-medium rounded',
    md: 'px-2.5 py-1 text-xs font-semibold rounded-full',
  };

  // Strictly solid colors with strong contrast - NO GRADIENTS
  const variantStyles = {
    pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300 dark:border-amber-700',
    warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300 dark:border-amber-700',
    inprogress: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-300 dark:border-blue-700',
    info: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-300 dark:border-blue-700',
    resolved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
    success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
    cancelled: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
    error: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
    neutral: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
    brand: 'bg-brand-100 text-brand-900 dark:bg-brand-900/40 dark:text-brand-200 border border-brand-300 dark:border-brand-700',
  };

  return (
    <span className={`inline-flex items-center justify-center ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
};
