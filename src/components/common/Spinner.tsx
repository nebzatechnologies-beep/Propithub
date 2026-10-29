import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'current' | 'brass' | 'emerald' | 'crimson' | 'white' | 'muted';
  label?: string;
  className?: string;
}

const sizeMap = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 36,
};

const variantClassMap = {
  current: 'text-current',
  brass: 'text-brass-gold',
  emerald: 'text-emerald-500',
  crimson: 'text-rose-500',
  white: 'text-white',
  muted: 'text-gray-400',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'sm',
  variant = 'current',
  label,
  className = '',
}) => {
  const pixelSize = sizeMap[size];
  const variantClass = variantClassMap[variant] || '';

  return (
    <span
      className={`inline-flex items-center gap-2 align-middle leading-none ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label || 'Loading...'}
    >
      <Loader2
        size={pixelSize}
        className={`animate-spin-fast ${variantClass} flex-shrink-0`}
      />
      {label && <span className="text-xs font-medium tracking-wide">{label}</span>}
    </span>
  );
};

export interface ButtonProcessingProps {
  loading: boolean;
  loadingText?: string;
  defaultText: React.ReactNode;
  icon?: React.ReactNode;
  spinnerSize?: 'xs' | 'sm' | 'md';
}

export const ButtonProcessing: React.FC<ButtonProcessingProps> = ({
  loading,
  loadingText,
  defaultText,
  icon,
  spinnerSize = 'sm',
}) => {
  if (loading) {
    return (
      <span className="inline-flex items-center justify-center gap-2" style={{ pointerEvents: 'none' }}>
        <Spinner size={spinnerSize} variant="current" />
        <span>{loadingText || 'Processing...'}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center gap-2" style={{ pointerEvents: 'none' }}>
      {icon}
      <span>{defaultText}</span>
    </span>
  );
};
