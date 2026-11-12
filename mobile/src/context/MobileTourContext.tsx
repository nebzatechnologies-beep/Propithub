import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { View, StyleProp, ViewStyle, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileAuth } from './MobileAuthContext';
import { MOBILE_TOUR_STEPS, MobileTourStep } from '../components/tour/mobileTourConfig';

export interface TourTargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

interface MobileTourContextType {
  isActive: boolean;
  isMinimized: boolean;
  currentStepIndex: number;
  currentStep: MobileTourStep | null;
  steps: MobileTourStep[];
  totalSteps: number;
  targetRect: TourTargetRect | null;
  startTour: (initialIndex?: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  jumpToStep: (index: number) => void;
  minimizeTour: () => void;
  resumeTour: () => void;
  skipTour: () => Promise<void>;
  finishTour: () => Promise<void>;
  registerNavigate: (fn: (screenKey: string) => void) => void;
  registerOverlayRoot: (ref: React.RefObject<View>) => void;
  registerTarget: (id: string, ref: React.RefObject<View>) => void;
  unregisterTarget: (id: string) => void;
  refreshTargetRect: () => void;
}

const MobileTourContext = createContext<MobileTourContextType | null>(null);

const STORAGE_PREFIX = 'propithub_mobile_tour_completed_';

const areRectsEqual = (r1: TourTargetRect | null, r2: TourTargetRect | null): boolean => {
  if (!r1 && !r2) return true;
  if (!r1 || !r2) return false;
  return (
    Math.abs(r1.top - r2.top) < 1 &&
    Math.abs(r1.left - r2.left) < 1 &&
    Math.abs(r1.width - r2.width) < 1 &&
    Math.abs(r1.height - r2.height) < 1
  );
};

export const MobileTourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, isAuthenticated, isLoading, updateUserProfile } = useMobileAuth();
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<TourTargetRect | null>(null);

  const navigateScreenRef = useRef<((screenKey: string) => void) | null>(null);
  const overlayRootRef = useRef<React.RefObject<View> | null>(null);
  const targetRefsMap = useRef<Map<string, React.RefObject<View>>>(new Map());
  const retryTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const checkedUserIdRef = useRef<string | null>(null);

  // Available steps for active role
  const steps = useMemo(() => MOBILE_TOUR_STEPS[role] || [], [role]);
  const currentStep = steps[currentStepIndex] || null;

  const tourActiveStateRef = useRef({ isActive, isMinimized, currentStep });
  useEffect(() => {
    tourActiveStateRef.current = { isActive, isMinimized, currentStep };
  }, [isActive, isMinimized, currentStep]);

  const isMeasuringRef = useRef<boolean>(false);
  const measureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimers = useCallback(() => {
    retryTimersRef.current.forEach((t) => clearTimeout(t));
    retryTimersRef.current = [];
    if (targetDebounceTimerRef.current) {
      clearTimeout(targetDebounceTimerRef.current);
      targetDebounceTimerRef.current = null;
    }
    if (measureTimeoutRef.current) {
      clearTimeout(measureTimeoutRef.current);
      measureTimeoutRef.current = null;
    }
    isMeasuringRef.current = false;
  }, []);

  const registerOverlayRoot = useCallback((ref: React.RefObject<View>) => {
    overlayRootRef.current = ref;
  }, []);

  // Measure a specific registered View ref in the exact coordinate space of overlayRoot
  const measureRef = useCallback(
    (refObj: React.RefObject<View> | undefined, onMeasured: (rect: TourTargetRect | null) => void) => {
      const node = refObj?.current as any;
      if (!node) {
        onMeasured(null);
        return;
      }

      // If a native bridge measurement is already in flight, drop concurrent spam
      if (isMeasuringRef.current) {
        return;
      }

      isMeasuringRef.current = true;
      if (measureTimeoutRef.current) clearTimeout(measureTimeoutRef.current);
      measureTimeoutRef.current = setTimeout(() => {
        isMeasuringRef.current = false;
      }, 500);

      const finalize = (left: number, top: number, width: number, height: number) => {
        isMeasuringRef.current = false;
        if (measureTimeoutRef.current) {
          clearTimeout(measureTimeoutRef.current);
          measureTimeoutRef.current = null;
        }

        if (
          typeof left === 'number' &&
          typeof top === 'number' &&
          width > 4 &&
          height > 4 &&
          !Number.isNaN(left) &&
          !Number.isNaN(top)
        ) {
          onMeasured({
            top,
            left,
            width,
            height,
            bottom: top + height,
            right: left + width,
          });
        } else {
          onMeasured(null);
        }
      };

      try {
        if (typeof node.measure === 'function') {
          node.measure(
            (_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
              const rootNode = overlayRootRef.current?.current as any;
              if (rootNode && typeof rootNode.measure === 'function') {
                rootNode.measure(
                  (
                    _rx: number,
                    _ry: number,
                    _rw: number,
                    _rh: number,
                    rootPageX: number,
                    rootPageY: number
                  ) => {
                    const offsetX = typeof rootPageX === 'number' && !Number.isNaN(rootPageX) ? rootPageX : 0;
                    const offsetY = typeof rootPageY === 'number' && !Number.isNaN(rootPageY) ? rootPageY : 0;
                    finalize(pageX - offsetX, pageY - offsetY, width, height);
                  }
                );
              } else {
                finalize(pageX, pageY, width, height);
              }
            }
          );
          return;
        }

        if (typeof node.measureInWindow === 'function') {
          node.measureInWindow((x: number, y: number, width: number, height: number) => {
            finalize(x, y, width, height);
          });
          return;
        }

        finalize(NaN, NaN, 0, 0);
      } catch {
        finalize(NaN, NaN, 0, 0);
      }
    },
    []
  );

  // Refresh the bounding box for the current step's targetId (or fallbackTargetId)
  const refreshTargetRect = useCallback(() => {
    if (!isActive || isMinimized || !currentStep) {
      return;
    }

    const primaryRef = targetRefsMap.current.get(currentStep.targetId);
    measureRef(primaryRef, (primaryRect) => {
      if (primaryRect) {
        setTargetRect((prev) => (areRectsEqual(prev, primaryRect) ? prev : primaryRect));
        return;
      }
      if (currentStep.fallbackTargetId) {
        const fallbackRef = targetRefsMap.current.get(currentStep.fallbackTargetId);
        measureRef(fallbackRef, (fallbackRect) => {
          setTargetRect((prev) => (areRectsEqual(prev, fallbackRect) ? prev : fallbackRect));
        });
      } else {
        setTargetRect((prev) => (prev === null ? prev : null));
      }
    });
  }, [isActive, isMinimized, currentStep, measureRef]);

  // Schedule multi-pass measurements after step/screen transitions
  const scheduleMeasurements = useCallback(() => {
    clearRetryTimers();
    const delays = [120, 360, 750];
    delays.forEach((ms) => {
      const timer = setTimeout(() => {
        refreshTargetRect();
      }, ms);
      retryTimersRef.current.push(timer);
    });
  }, [clearRetryTimers, refreshTargetRect]);

  const registerTarget = useCallback(
    (id: string, ref: React.RefObject<View>) => {
      targetRefsMap.current.set(id, ref);
      const state = tourActiveStateRef.current;
      if (
        state.isActive &&
        !state.isMinimized &&
        state.currentStep &&
        (state.currentStep.targetId === id || state.currentStep.fallbackTargetId === id)
      ) {
        if (targetDebounceTimerRef.current) {
          clearTimeout(targetDebounceTimerRef.current);
        }
        targetDebounceTimerRef.current = setTimeout(() => {
          targetDebounceTimerRef.current = null;
          refreshTargetRect();
        }, 100);
      }
    },
    [refreshTargetRect]
  );

  const unregisterTarget = useCallback((id: string) => {
    targetRefsMap.current.delete(id);
  }, []);

  const userId = user?.id || null;
  const userHasCompletedTour = Boolean(user?.hasCompletedTour);

  // Reset tour state when user logs out
  useEffect(() => {
    if (!userId) {
      checkedUserIdRef.current = null;
      clearRetryTimers();
      setIsActive(false);
      setIsMinimized(false);
      setCurrentStepIndex(0);
      setTargetRect(null);
    }
  }, [userId, clearRetryTimers]);

  // Helper: check if tour completed
  const isTourCompleted = useCallback(async () => {
    if (!userId) return true;
    if (userHasCompletedTour) return true;
    try {
      const val = await AsyncStorage.getItem(`${STORAGE_PREFIX}${userId}`);
      return val === 'true';
    } catch {
      return false;
    }
  }, [userId, userHasCompletedTour]);

  // Navigate to screen & measure target when step changes
  useEffect(() => {
    if (!isActive || isMinimized || !currentStep) return;
    if (navigateScreenRef.current && currentStep.screenKey) {
      navigateScreenRef.current(currentStep.screenKey);
    }
    scheduleMeasurements();
    return () => clearRetryTimers();
  }, [isActive, isMinimized, currentStepIndex, currentStep, scheduleMeasurements, clearRetryTimers]);

  // Re-measure on window dimension change
  useEffect(() => {
    if (!isActive || isMinimized) return;
    const sub = Dimensions.addEventListener('change', () => {
      scheduleMeasurements();
    });
    return () => sub?.remove();
  }, [isActive, isMinimized, scheduleMeasurements]);

  // Auto-launch check on initial login / new account signup
  useEffect(() => {
    if (isLoading || !isAuthenticated || !userId || steps.length === 0) return;
    if (checkedUserIdRef.current === userId) return;

    let cancelled = false;
    let launchTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const completed = await isTourCompleted();
      if (cancelled) return;
      if (completed) {
        checkedUserIdRef.current = userId;
        return;
      }

      launchTimer = setTimeout(() => {
        if (cancelled) return;
        checkedUserIdRef.current = userId;
        if (navigateScreenRef.current && steps[0]?.screenKey) {
          navigateScreenRef.current(steps[0].screenKey);
        }
        setCurrentStepIndex(0);
        setIsMinimized(false);
        setIsActive(true);
      }, 600);
    })();

    return () => {
      cancelled = true;
      if (launchTimer) clearTimeout(launchTimer);
    };
  }, [isLoading, isAuthenticated, userId, steps, isTourCompleted]);

  // Register screen navigation handler from RootNavigator
  const registerNavigate = useCallback(
    (fn: (screenKey: string) => void) => {
      navigateScreenRef.current = fn;
      if (isActive && !isMinimized && currentStep?.screenKey) {
        fn(currentStep.screenKey);
        scheduleMeasurements();
      }
    },
    [isActive, isMinimized, currentStep, scheduleMeasurements]
  );

  const markTourFinished = useCallback(async () => {
    clearRetryTimers();
    setIsActive(false);
    setIsMinimized(false);
    setTargetRect(null);
    if (user?.id) {
      try {
        await AsyncStorage.setItem(`${STORAGE_PREFIX}${user.id}`, 'true');
        await updateUserProfile({ hasCompletedTour: true } as any);
      } catch (err) {
        console.warn('Could not persist tour completion state:', err);
      }
    }
  }, [user?.id, updateUserProfile, clearRetryTimers]);

  // Actions
  const startTour = useCallback(
    (initialIndex: number = 0) => {
      const validIdx = Math.max(0, Math.min(initialIndex, steps.length - 1));
      setCurrentStepIndex(validIdx);
      setIsMinimized(false);
      setIsActive(true);
      if (navigateScreenRef.current && steps[validIdx]?.screenKey) {
        navigateScreenRef.current(steps[validIdx].screenKey);
      }
    },
    [steps]
  );

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      markTourFinished();
    }
  }, [currentStepIndex, steps.length, markTourFinished]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const jumpToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < steps.length) {
        setCurrentStepIndex(index);
      }
    },
    [steps.length]
  );

  const minimizeTour = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const resumeTour = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const skipTour = useCallback(async () => {
    await markTourFinished();
  }, [markTourFinished]);

  const finishTour = useCallback(async () => {
    await markTourFinished();
  }, [markTourFinished]);

  const value = useMemo(
    () => ({
      isActive,
      isMinimized,
      currentStepIndex,
      currentStep,
      steps,
      totalSteps: steps.length,
      targetRect,
      startTour,
      nextStep,
      prevStep,
      jumpToStep,
      minimizeTour,
      resumeTour,
      skipTour,
      finishTour,
      registerNavigate,
      registerOverlayRoot,
      registerTarget,
      unregisterTarget,
      refreshTargetRect,
    }),
    [
      isActive,
      isMinimized,
      currentStepIndex,
      currentStep,
      steps,
      targetRect,
      startTour,
      nextStep,
      prevStep,
      jumpToStep,
      minimizeTour,
      resumeTour,
      skipTour,
      finishTour,
      registerNavigate,
      registerOverlayRoot,
      registerTarget,
      unregisterTarget,
      refreshTargetRect,
    ]
  );

  return <MobileTourContext.Provider value={value}>{children}</MobileTourContext.Provider>;
};

export const useMobileTour = (): MobileTourContextType => {
  const context = useContext(MobileTourContext);
  if (!context) {
    throw new Error('useMobileTour must be used within a MobileTourProvider');
  }
  return context;
};

/**
 * Wrapper component that registers a UI region as a spotlight target for the interactive GameGuidedTour.
 */
export const TourTarget: React.FC<{
  id: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ id, style, children }) => {
  const viewRef = useRef<View>(null);
  const context = useContext(MobileTourContext);
  const registerTarget = context?.registerTarget;
  const unregisterTarget = context?.unregisterTarget;

  useEffect(() => {
    if (!registerTarget) return;
    registerTarget(id, viewRef);
    return () => {
      unregisterTarget?.(id);
    };
  }, [id, registerTarget, unregisterTarget]);

  return (
    <View
      ref={viewRef}
      collapsable={false}
      style={style}
      onLayout={() => {
        if (
          context?.isActive &&
          !context.isMinimized &&
          (context.currentStep?.targetId === id || context.currentStep?.fallbackTargetId === id)
        ) {
          context.refreshTargetRect();
        }
      }}
    >
      {children}
    </View>
  );
};
