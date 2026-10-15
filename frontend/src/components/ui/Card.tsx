import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-surface-card border border-surface-border rounded-lg shadow-none p-5 text-content-primary ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
