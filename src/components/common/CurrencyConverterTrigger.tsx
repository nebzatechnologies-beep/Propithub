import React from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import { CircleDollarSign } from 'lucide-react';

interface CurrencyConverterTriggerProps {
  amount?: number;
  currency?: string;
  label?: string;
  variant?: 'button' | 'badge' | 'icon';
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

export const CurrencyConverterTrigger: React.FC<CurrencyConverterTriggerProps> = ({
  amount = 100,
  currency = 'USD',
  label = 'View in your currency',
  variant = 'badge',
  size = 'sm',
  className,
  style,
}) => {
  const { openConverter } = useCurrency();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openConverter(amount, currency);
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`bell-btn ${className || ''}`}
        onClick={handleClick}
        title="Live Currency Converter"
        aria-label="Live Currency Converter"
        style={{
          cursor: 'pointer',
          ...style,
        }}
      >
        <CircleDollarSign size={17} />
      </button>
    );
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        className="btn secondary small"
        onClick={handleClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: size === 'sm' ? '12px' : '13px',
          fontWeight: 600,
          cursor: 'pointer',
          ...style,
        }}
      >
        <CircleDollarSign size={13} style={{ color: 'var(--brass)' }} />
        <span>{label}</span>
      </button>
    );
  }

  // Default: subtle interactive badge
  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '6px',
        background: 'var(--surface-sunken)',
        border: '1px solid var(--line)',
        color: 'var(--ink-soft)',
        fontSize: '11.5px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        ...style,
      }}
      title="Click to view live conversion in 160+ world currencies"
    >
      <CircleDollarSign size={12} style={{ color: 'var(--brass, #F59E0B)' }} />
      <span>{label}</span>
    </button>
  );
};
