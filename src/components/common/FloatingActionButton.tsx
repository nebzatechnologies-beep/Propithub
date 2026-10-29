import React from 'react';
import { Plus, LucideIcon } from 'lucide-react';
import { useScrollDirection } from '../../hooks/useScrollDirection';

export interface FloatingActionButtonProps {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  title?: string;
  variant?: 'primary' | 'secondary' | 'dark' | 'terracotta';
  hideOnScroll?: boolean; // If true, hides completely on scroll down instead of collapsing to circle
  mobileOnly?: boolean; // Only visible on mobile/small viewports
  className?: string;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  label,
  onClick,
  icon: Icon = Plus,
  disabled = false,
  title,
  variant = 'primary',
  hideOnScroll = false,
  mobileOnly = true,
  className = '',
}) => {
  const { isScrolledDown } = useScrollDirection({ threshold: 12, topThreshold: 40 });

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      className={`app-fab ${variant} ${isScrolledDown ? (hideOnScroll ? 'fab-hidden' : 'fab-collapsed') : 'fab-expanded'} ${mobileOnly ? 'fab-mobile-only' : ''} ${className}`}
    >
      <span className="fab-icon">
        <Icon size={15} />
      </span>
      <span className="fab-label">{label}</span>
    </button>
  );
};
