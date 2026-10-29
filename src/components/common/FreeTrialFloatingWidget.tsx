import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { loadCachedTrialDays } from '../../lib/store';
import { Sparkles, Clock, AlertTriangle, ArrowRight, X, ChevronUp, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useScrollDirection } from '../../hooks/useScrollDirection';

export const FreeTrialFloatingWidget: React.FC = () => {
  const navigate = useNavigate();
  const { isTrial, daysLeft, isExpired, trialEnds, currentPlan, usage } = usePlanLimits();
  const { isScrolledDown } = useScrollDirection({ threshold: 10, topThreshold: 30 });
  const [isExpanded, setIsExpanded] = useState(false);

  // Dragging support across the screen
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number }>({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  // Strictly block widget if platform trial policy is 0d, or owner is not on active trial with positive days
  const cachedTrialDays = loadCachedTrialDays();
  if (!isTrial || daysLeft <= 0 || cachedTrialDays === 0) {
    return null;
  }

  const isUrgent = daysLeft <= 3 || isExpired;

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag with primary mouse button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const widgetEl = e.currentTarget as HTMLElement;
    const rect = widgetEl.getBoundingClientRect();

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position ? position.x : rect.left,
      initialY: position ? position.y : rect.top,
    };
    isDraggingRef.current = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          setIsDragging(true);
        }
      }
      if (isDraggingRef.current) {
        const newX = Math.max(10, Math.min(window.innerWidth - rect.width - 10, dragStartRef.current.initialX + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - rect.height - 10, dragStartRef.current.initialY + dy));
        setPosition({ x: newX, y: newY });
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setTimeout(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
      }, 50);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handlePillClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setIsExpanded((prev) => !prev);
  };

  const handleUpgradeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate('/owner/subscription');
  };

  // Determine popover direction relative to widget position on screen
  const isNearTop = position ? position.y < 380 : false;
  const isNearLeft = position ? position.x < 340 : false;

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        position: 'fixed',
        ...(position
          ? { left: `${position.x}px`, top: `${position.y}px` }
          : { bottom: '24px', right: '28px' }),
        zIndex: 9999,
        fontFamily: 'inherit',
        touchAction: 'none',
        userSelect: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {/* Expanded Popover Card */}
      {isExpanded && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            ...(isNearTop ? { top: '48px' } : { bottom: '48px' }),
            ...(isNearLeft ? { left: 0 } : { right: 0 }),
            width: '320px',
            backgroundColor: 'var(--surface)',
            color: 'var(--ink)',
            borderRadius: '16px',
            cursor: 'default',
            border: isUrgent ? '1px solid var(--danger)' : '1px solid var(--line)',
            boxShadow: 'var(--shadow-lg)',
            padding: '18px',
            marginBottom: '8px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: isUrgent ? 'var(--danger-soft)' : 'var(--amber-soft)',
                  color: isUrgent ? 'var(--danger)' : 'var(--amber)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isUrgent ? <AlertTriangle size={15} /> : <Sparkles size={15} />}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                  {isExpired ? 'Trial Expired' : 'Free Trial Active'}
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  {currentPlan?.name || 'Free Trial Plan'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-soft)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
              }}
              aria-label="Close Popover"
            >
              <X size={16} />
            </button>
          </div>

          {/* Expiry Banner */}
          <div
            style={{
              background: isUrgent ? 'var(--danger-soft)' : 'var(--surface-sunken)',
              border: isUrgent ? '1px solid var(--danger)' : '1px solid var(--line)',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={15} color={isUrgent ? 'var(--danger)' : 'var(--amber)'} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: isUrgent ? 'var(--danger)' : 'var(--ink)' }}>
                {isExpired
                  ? 'Your trial has ended'
                  : daysLeft === 1
                  ? '1 day remaining'
                  : `${daysLeft} days remaining`}
              </span>
            </div>
            {trialEnds && (
              <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                {new Date(trialEnds).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* Usage Gauges */}
          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--ink-soft)' }}>Properties</span>
              <strong style={{ color: usage.properties.isFull ? 'var(--danger)' : 'var(--ink)' }}>
                {usage.properties.used} / {usage.properties.max}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--ink-soft)' }}>Units</span>
              <strong style={{ color: usage.units.isFull ? 'var(--danger)' : 'var(--ink)' }}>
                {usage.units.used} / {usage.units.max}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--ink-soft)' }}>Tenants</span>
              <strong style={{ color: usage.tenants.isFull ? 'var(--danger)' : 'var(--ink)' }}>
                {usage.tenants.used} / {usage.tenants.max}
              </strong>
            </div>
          </div>

          {/* Upgrade CTA */}
          <button
            type="button"
            onClick={handleUpgradeClick}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: 'none',
              background: isUrgent
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
              transition: 'transform 0.15s ease',
            }}
          >
            <Sparkles size={14} />
            Upgrade to Full Plan
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Floating Pill Button */}
      <button
        type="button"
        onClick={handlePillClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isScrolledDown && !isExpanded ? '0px' : '8px',
          padding: isScrolledDown && !isExpanded ? '7px 8px' : '7px 12px 7px 10px',
          borderRadius: '999px',
          background: isUrgent ? 'var(--danger-soft)' : 'var(--amber-soft)',
          border: isUrgent ? '1px solid var(--danger)' : '1px solid var(--amber)',
          boxShadow: 'var(--shadow-md)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isExpanded ? 'scale(0.97)' : 'scale(1)',
          opacity: isScrolledDown && !isExpanded ? 0.75 : 1,
        }}
        aria-label="Toggle Free Trial Info"
      >
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isUrgent ? 'var(--danger)' : 'var(--amber)',
            flexShrink: 0,
          }}
        >
          {isUrgent ? <AlertTriangle size={13} strokeWidth={2.5} /> : <Sparkles size={13} strokeWidth={2.5} />}
        </div>

        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: isUrgent ? 'var(--danger)' : 'var(--amber)',
            letterSpacing: '0.02em',
            maxWidth: isScrolledDown && !isExpanded ? '0px' : '100px',
            opacity: isScrolledDown && !isExpanded ? 0 : 1,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'max-width 0.3s ease, opacity 0.25s ease',
          }}
        >
          {isExpired ? 'Trial Ended' : daysLeft === 1 ? '1d left' : `${daysLeft}d left`}
        </span>

        {(!isScrolledDown || isExpanded) && (
          <span style={{ color: isUrgent ? 'var(--danger)' : 'var(--amber)', display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronUp size={14} strokeWidth={2.5} />}
          </span>
        )}
      </button>
    </div>
  );
};
