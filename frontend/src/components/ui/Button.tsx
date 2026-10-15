import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs rounded',
    md: 'px-3.5 py-2 text-sm rounded-md',
    lg: 'px-5 py-2.5 text-base rounded-md',
  };

  // Strictly solid colors - NO GRADIENTS
  const variantStyles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus:ring-brand-500 border border-transparent',
    secondary: 'bg-surface-hover text-content-primary hover:bg-surface-border active:bg-surface-border focus:ring-brand-500 border border-surface-border',
    danger: 'bg-status-cancelled text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500 border border-transparent',
    outline: 'bg-transparent text-content-primary hover:bg-surface-hover focus:ring-brand-500 border border-surface-border',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
