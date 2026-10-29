import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { TOUR_STEPS_BY_ROLE, TourStep } from './tourConfig';
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  CreditCard,
  Wrench,
  Settings,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Minus,
  Compass,
  Trophy,
  MapPin,
  ChevronDown,
} from 'lucide-react';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export const GameGuidedTour: React.FC = () => {
  const { user, role, updateUserProfile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const location = useLocation();
  const steps = useMemo(() => TOUR_STEPS_BY_ROLE[role] || [], [role]);

  const [isActive, setIsActive] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [chapterMenuOpen, setChapterMenuOpen] = useState<boolean>(false);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const retryTimerRef = useRef<any>(null);
  const checkedUserIdRef = useRef<string | null>(null);

  const currentStep: TourStep | undefined = steps[currentStepIndex];

  const userId = user?.id || null;
  const userHasCompletedTour = Boolean(user?.hasCompletedTour);

  // Helper to check if tour has been completed previously
  const isTourCompleted = useCallback(() => {
    if (!userId) return true;
    if (userHasCompletedTour) return true;
    const local = localStorage.getItem(`propithub_tour_completed_${userId}`);
    return local === 'true';
  }, [userId, userHasCompletedTour]);

  // Route synchronization: automatically navigate if current step requires a specific page
  useEffect(() => {
    if (!isActive || isMinimized || !currentStep) return;
    if (currentStep.route && location.pathname !== currentStep.route) {
      navigate(currentStep.route);
    }
  }, [isActive, isMinimized, currentStepIndex, currentStep, location.pathname, navigate]);

  // Initial check on login / signup: automatically launch for new users ONCE per userId
  useEffect(() => {
    if (!userId || steps.length === 0 || checkedUserIdRef.current === userId) return;

    if (isTourCompleted()) {
      checkedUserIdRef.current = userId;
      return;
    }

    const timer = setTimeout(() => {
      checkedUserIdRef.current = userId;
      const defaultRoute = steps[0]?.route || `/${role}/dashboard`;
      if (window.location.pathname !== defaultRoute) {
        navigate(defaultRoute);
      }
      setIsMinimized(false);
      setCurrentStepIndex(0);
      setIsActive(true);
    }, 650);
    return () => clearTimeout(timer);
  }, [userId, role, steps, isTourCompleted, navigate]);

  // Listen for manual replay events triggered from anywhere (e.g. Profile Menu / Helpdesk)
  useEffect(() => {
    const handleStartTour = () => {
      setIsMinimized(false);
      setChapterMenuOpen(false);
      setCurrentStepIndex(0);
      const defaultRoute = steps[0]?.route || `/${role}/dashboard`;
      if (window.location.pathname !== defaultRoute) {
        navigate(defaultRoute);
      }
      setIsActive(true);
    };

    window.addEventListener('propithub_start_tour', handleStartTour);
    return () => {
      window.removeEventListener('propithub_start_tour', handleStartTour);
    };
  }, [steps, role, navigate]);

  // Update element bounding rectangle whenever step index or window size changes
  const updateTargetRect = useCallback(() => {
    if (!isActive || isMinimized || !currentStep) return;

    const el = document.querySelector(currentStep.selector);
    if (el) {
      // Scroll into view gently if not comfortably visible
      const rect = el.getBoundingClientRect();
      const isVisible =
        rect.top >= 20 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) - 20 &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth);

      if (!isVisible) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }

      // Re-read coordinates after potential scroll
      requestAnimationFrame(() => {
        const freshRect = el.getBoundingClientRect();
        setTargetRect({
          top: freshRect.top,
          left: freshRect.left,
          width: freshRect.width,
          height: freshRect.height,
          bottom: freshRect.bottom,
          right: freshRect.right,
        });
      });
    } else {
      // Retry in 250ms in case DOM is still rendering
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        const retryEl = document.querySelector(currentStep.selector);
        if (retryEl) {
          const freshRect = retryEl.getBoundingClientRect();
          setTargetRect({
            top: freshRect.top,
            left: freshRect.left,
            width: freshRect.width,
            height: freshRect.height,
            bottom: freshRect.bottom,
            right: freshRect.right,
          });
        }
      }, 300);
    }
  }, [isActive, isMinimized, currentStep]);

  useEffect(() => {
    updateTargetRect();

    const handleResize = () => updateTargetRect();
    const handleScroll = () => updateTargetRect();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [updateTargetRect]);

  // Complete Tour handler
  const handleFinishTour = useCallback(async () => {
    setIsActive(false);
    setIsMinimized(false);

    if (user?.id) {
      localStorage.setItem(`propithub_tour_completed_${user.id}`, 'true');
      try {
        await updateUserProfile({ hasCompletedTour: true });
      } catch (err) {
        console.warn('Could not save tour state to user profile:', err);
      }
    }
  }, [user?.id, updateUserProfile]);

  // Dismiss / Skip handler
  const handleSkipTour = useCallback(async () => {
    setIsActive(false);
    setIsMinimized(false);
    if (user?.id) {
      localStorage.setItem(`propithub_tour_completed_${user.id}`, 'true');
      try {
        await updateUserProfile({ hasCompletedTour: true });
      } catch (err) {
        console.warn('Could not save tour skip state:', err);
      }
    }
  }, [user?.id, updateUserProfile]);

  // Next step
  const handleNext = () => {
    setChapterMenuOpen(false);
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleFinishTour();
    }
  };

  // Prev step
  const handlePrev = () => {
    setChapterMenuOpen(false);
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  // Jump to specific step
  const handleJumpToStep = (index: number) => {
    setCurrentStepIndex(index);
    setChapterMenuOpen(false);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isActive || isMinimized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        setIsMinimized(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isMinimized, currentStepIndex, steps.length]);

  // Icon resolver
  const renderStepIcon = (iconName: string) => {
    switch (iconName) {
      case 'dashboard':
        return <LayoutDashboard size={20} color="#10B981" />;
      case 'properties':
        return <Building2 size={20} color="#10B981" />;
      case 'tenants':
        return <Users size={20} color="#10B981" />;
      case 'leasing':
        return <FileText size={20} color="#10B981" />;
      case 'payments':
        return <CreditCard size={20} color="#10B981" />;
      case 'maintenance':
        return <Wrench size={20} color="#10B981" />;
      case 'controls':
        return <Settings size={20} color="#10B981" />;
      case 'award':
        return <Trophy size={20} color="#10B981" />;
      default:
        return <Sparkles size={20} color="#10B981" />;
    }
  };

  // Dynamic speech bubble position calculator
  const calculateBubblePosition = () => {
    const cardWidth = Math.min(430, window.innerWidth - 32);
    const cardHeight = 440;
    const padding = 16;

    if (!targetRect) {
      return {
        top: Math.max(20, window.innerHeight / 2 - cardHeight / 2),
        left: Math.max(16, window.innerWidth / 2 - cardWidth / 2),
        width: cardWidth,
      };
    }

    const { preferredPlacement } = currentStep || { preferredPlacement: 'right' };

    let top = 0;
    let left = 0;

    // 1. Right placement (ideal for sidebar items)
    if (preferredPlacement === 'right') {
      left = targetRect.right + padding;
      top = targetRect.top + targetRect.height / 2 - 100;

      // Check if clipping right edge
      if (left + cardWidth > window.innerWidth - 16) {
        left = Math.max(16, targetRect.left);
        top = targetRect.bottom + padding;
      }
    }
    // 2. Left placement (ideal for right-aligned buttons)
    else if (preferredPlacement === 'left') {
      left = targetRect.left - cardWidth - padding;
      top = targetRect.top + targetRect.height / 2 - 80;

      if (left < 16) {
        left = 16;
        top = targetRect.bottom + padding;
      }
    }
    // 3. Bottom placement (ideal for topbar or top KPIs)
    else if (preferredPlacement === 'bottom') {
      top = targetRect.bottom + padding;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;

      if (left < 16) left = 16;
      if (left + cardWidth > window.innerWidth - 16) {
        left = window.innerWidth - cardWidth - 16;
      }
    }
    // 4. Top placement
    else if (preferredPlacement === 'top') {
      top = targetRect.top - cardHeight - padding;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;

      if (left < 16) left = 16;
      if (left + cardWidth > window.innerWidth - 16) {
        left = window.innerWidth - cardWidth - 16;
      }
    }

    // Safety vertical clamp
    if (top < 16) top = 16;
    if (top + cardHeight > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - cardHeight - 16);
    }

    return { top, left, width: cardWidth };
  };

  // If minimized, show floating orb
  if (isMinimized && isActive) {
    return createPortal(
      <div
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 999999,
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          color: '#FFFFFF',
          borderRadius: '50px',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.45)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '13px',
          fontWeight: 700,
          border: '1px solid rgba(255, 255, 255, 0.25)',
          animation: 'tourPulseFloat 2.5s infinite ease-in-out',
        }}
      >
        <Compass size={17} />
        <span>Resume Guide ({currentStepIndex + 1}/{steps.length})</span>
      </div>,
      document.body
    );
  }

  // Active Tour HUD
  if (!isActive || !currentStep) return null;

  const bubblePos = calculateBubblePosition();
  const spotlightPad = 8;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999990,
        pointerEvents: 'auto',
      }}
    >
      {/* 1. Full-screen Dimmed Scrim with SVG Hole Cutout */}
      <svg
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 999991,
          pointerEvents: 'none',
        }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            {/* White covers all (opaque) */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black hole cuts out the target element */}
            {targetRect && (
              <rect
                x={targetRect.left - spotlightPad}
                y={targetRect.top - spotlightPad}
                width={targetRect.width + spotlightPad * 2}
                height={targetRect.height + spotlightPad * 2}
                rx="10"
                ry="10"
                fill="black"
              />
            )}
          </mask>
        </defs>

        {/* The Darkened Overlay */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={isDark ? "rgba(5, 9, 16, 0.78)" : "rgba(15, 23, 42, 0.42)"}
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* 2. Glowing Animated Halo Box over target */}
      {targetRect && (
        <div
          onClick={handleNext}
          title="Click to advance guide"
          style={{
            position: 'fixed',
            top: targetRect.top - spotlightPad,
            left: targetRect.left - spotlightPad,
            width: targetRect.width + spotlightPad * 2,
            height: targetRect.height + spotlightPad * 2,
            borderRadius: '12px',
            border: '2px solid #10B981',
            boxShadow: isDark
              ? '0 0 0 3px rgba(16, 185, 129, 0.3), 0 0 25px rgba(16, 185, 129, 0.45)'
              : '0 0 0 3px rgba(16, 185, 129, 0.25), 0 0 20px rgba(16, 185, 129, 0.35)',
            zIndex: 999993,
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'auto',
            animation: 'tourHaloPulse 2s infinite ease-in-out',
          }}
        />
      )}

      {/* 3. Floating Game Dialogue Card */}
      <div
        ref={bubbleRef}
        style={{
          position: 'fixed',
          top: `${bubblePos.top}px`,
          left: `${bubblePos.left}px`,
          width: `${bubblePos.width}px`,
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          zIndex: 999995,
          background: isDark
            ? 'linear-gradient(155deg, #131B2A 0%, #0A0F1A 100%)'
            : 'linear-gradient(155deg, #FFFFFF 0%, #F8FAFC 100%)',
          border: isDark ? '1px solid rgba(16, 185, 129, 0.38)' : '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '20px',
          padding: '22px',
          boxShadow: isDark
            ? '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 25px rgba(16, 185, 129, 0.2)'
            : '0 20px 50px rgba(15, 23, 42, 0.16), 0 0 24px rgba(16, 185, 129, 0.12)',
          color: isDark ? '#F1F5F9' : '#0F172A',
          fontFamily: 'inherit',
          transition: 'top 0.3s cubic-bezier(0.16, 1, 0.3, 1), left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'auto',
          animation: 'tourCardSlide 0.25s ease-out',
        }}
      >
        {/* Header: Chapter Badge, Navigator Dropdown, Controls */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                border: isDark ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {renderStepIcon(currentStep.iconName)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentStep.chapter}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B' }}>
                {currentStep.badge} · <span style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>{currentStepIndex + 1}/{steps.length}</span>
              </div>
            </div>
          </div>

          {/* Quick Chapter Navigator & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setChapterMenuOpen((prev) => !prev)}
                title="Select Quest Chapter"
                style={{
                  background: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
                  border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(16, 185, 129, 0.22)',
                  color: isDark ? '#10B981' : '#059669',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                <MapPin size={12} />
                <span>Quests</span>
                <ChevronDown size={11} />
              </button>

              {/* Chapter Dropdown Popover */}
              {chapterMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '28px',
                    right: 0,
                    width: '240px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    background: isDark ? '#0B0F19' : '#FFFFFF',
                    border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '10px',
                    padding: '6px',
                    boxShadow: isDark ? '0 12px 30px rgba(0,0,0,0.85)' : '0 12px 30px rgba(15,23,42,0.18)',
                    zIndex: 999999,
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 800, color: isDark ? '#64748B' : '#94A3B8', textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                    Jump to Mission
                  </div>
                  {steps.map((s: TourStep, idx: number) => (
                    <div
                      key={s.id}
                      onClick={() => handleJumpToStep(idx)}
                      style={{
                        padding: '7px 8px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: idx === currentStepIndex ? 700 : 500,
                        color: idx === currentStepIndex ? (isDark ? '#10B981' : '#059669') : isDark ? '#CBD5E1' : '#334155',
                        background: idx === currentStepIndex ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)') : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {idx + 1}. {s.title}
                      </span>
                      {idx < currentStepIndex && <span style={{ color: '#10B981', fontSize: '11px' }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              title="Minimize guide (press Esc)"
              aria-label="Minimize Guide"
              style={{
                background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                border: 'none',
                color: isDark ? '#94A3B8' : '#64748B',
                borderRadius: '6px',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={handleSkipTour}
              title="Skip guide"
              aria-label="Skip Guide"
              style={{
                background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                border: 'none',
                color: isDark ? '#94A3B8' : '#64748B',
                borderRadius: '6px',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 style={{ fontSize: '17px', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A', margin: '0 0 8px', letterSpacing: '-0.3px', lineHeight: 1.35 }}>
          {currentStep.title}
        </h3>

        {/* Dialogue Body */}
        <p style={{ fontSize: '13px', color: isDark ? '#94A3B8' : '#475569', lineHeight: 1.55, margin: '0 0 14px' }}>
          {currentStep.dialogue}
        </p>

        {/* Capabilities Section */}
        {currentStep.capabilities && currentStep.capabilities.length > 0 && (
          <div
            style={{
              background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(16, 185, 129, 0.04)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1px solid rgba(16, 185, 129, 0.18)',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Key Operational Capabilities
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {currentStep.capabilities.map((cap, i) => (
                <div key={i} style={{ fontSize: '12px', color: isDark ? '#CBD5E1' : '#334155', display: 'flex', alignItems: 'flex-start', gap: '6px', lineHeight: 1.4 }}>
                  <span style={{ color: '#10B981', fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>✦</span>
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pro-Tip Box */}
        {currentStep.proTip && (
          <div
            style={{
              background: isDark ? 'rgba(217, 119, 6, 0.1)' : '#FFFBEB',
              border: isDark ? '1px solid rgba(217, 119, 6, 0.28)' : '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '10px',
              padding: '9px 12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <Sparkles size={15} style={{ color: '#F59E0B', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: isDark ? '#FDE68A' : '#92400E', lineHeight: 1.45 }}>
              <b>Pro-Tip:</b> {currentStep.proTip}
            </div>
          </div>
        )}

        {/* Energy Dots Progress Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px' }}>
          {steps.map((s: TourStep, idx: number) => (
            <div
              key={s.id}
              onClick={() => handleJumpToStep(idx)}
              title={`${idx + 1}. ${s.title}`}
              style={{
                height: '4px',
                flex: 1,
                borderRadius: '3px',
                background:
                  idx === currentStepIndex
                    ? '#10B981'
                    : idx < currentStepIndex
                    ? (isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)')
                    : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* Action Button Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {currentStepIndex > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                style={{
                  background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
                  color: isDark ? '#CBD5E1' : '#334155',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ChevronLeft size={14} />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSkipTour}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isDark ? '#64748B' : '#64748B',
                  padding: '7px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Skip Guide
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNext}
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 3px 12px rgba(16, 185, 129, 0.35)',
            }}
          >
            <span>{currentStepIndex === steps.length - 1 ? 'Finish Tour 🚀' : 'Next Mission'}</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
