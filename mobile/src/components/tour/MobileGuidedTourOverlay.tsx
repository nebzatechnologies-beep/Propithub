import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMobileTour } from '../../context/MobileTourContext';
import { useMobileTheme } from '../../context/MobileThemeContext';
import { MobileTourStep } from './mobileTourConfig';

export const MobileGuidedTourOverlay: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isDark } = useMobileTheme();
  const {
    isActive,
    isMinimized,
    currentStepIndex,
    currentStep,
    steps,
    totalSteps,
    targetRect,
    nextStep,
    prevStep,
    jumpToStep,
    minimizeTour,
    resumeTour,
    skipTour,
    registerOverlayRoot,
    refreshTargetRect,
  } = useMobileTour();

  const overlayRootRef = useRef<View>(null);
  const [chapterMenuOpen, setChapterMenuOpen] = useState<boolean>(false);
  const [windowDims, setWindowDims] = useState(() => Dimensions.get('window'));

  // Animations matching Web keyframes (tourHaloPulse, tourCardSlide, tourPulseFloat)
  const haloPulseAnim = useRef(new Animated.Value(0)).current;
  const cardSlideAnim = useRef(new Animated.Value(1)).current;
  const floatOrbAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    registerOverlayRoot(overlayRootRef);
  }, [registerOverlayRoot]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowDims(window);
    });
    return () => sub?.remove();
  }, []);

  // Close chapter dropdown when step changes or tour minimizes
  useEffect(() => {
    setChapterMenuOpen(false);
  }, [currentStepIndex, isMinimized, isActive]);

  // Continuous Halo Pulse Animation
  useEffect(() => {
    if (!isActive || isMinimized) return;
    haloPulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(haloPulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(haloPulseAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, isMinimized, haloPulseAnim]);

  // Card entrance slide animation on step change
  useEffect(() => {
    if (!isActive || isMinimized) return;
    cardSlideAnim.setValue(0.88);
    Animated.timing(cardSlideAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [currentStepIndex, isActive, isMinimized, cardSlideAnim]);

  // Floating orb pulse when minimized
  useEffect(() => {
    if (!isActive || !isMinimized) return;
    floatOrbAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatOrbAnim, {
          toValue: 1,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(floatOrbAnim, {
          toValue: 0,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, isMinimized, floatOrbAnim]);

  if (!isActive || !currentStep) return null;

  const SCREEN_WIDTH = windowDims.width;
  const SCREEN_HEIGHT = windowDims.height;

  // ── 1. Minimized Floating Orb (Web Parity: Resume Guide (X/Y)) ─────────────
  if (isMinimized) {
    const floatTranslateY = floatOrbAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -5],
    });
    return (
      <Animated.View
        style={[
          styles.minimizedPillWrap,
          {
            bottom: Math.max(84, insets.bottom + 68),
            transform: [{ translateY: floatTranslateY }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.minimizedPill}
          onPress={resumeTour}
          activeOpacity={0.88}
        >
          <Feather name="compass" size={16} color="#FFFFFF" />
          <Text style={styles.minimizedPillText}>
            Resume Guide ({currentStepIndex + 1}/{totalSteps})
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const isLastStep = currentStepIndex === totalSteps - 1;
  const scrimColor = isDark ? 'rgba(5, 9, 16, 0.78)' : 'rgba(15, 23, 42, 0.46)';
  const spotlightPad = 6;

  // Compute safe spotlight box coordinates
  const hasSpotlight =
    targetRect !== null &&
    targetRect.width > 8 &&
    targetRect.height > 8 &&
    targetRect.bottom > 0 &&
    targetRect.top < SCREEN_HEIGHT;

  const spotLeft = hasSpotlight ? Math.max(4, targetRect!.left - spotlightPad) : 0;
  const spotTop = hasSpotlight ? Math.max(4, targetRect!.top - spotlightPad) : 0;
  const spotRight = hasSpotlight ? Math.min(SCREEN_WIDTH - 4, targetRect!.right + spotlightPad) : 0;
  const spotBottom = hasSpotlight ? Math.min(SCREEN_HEIGHT - 4, targetRect!.bottom + spotlightPad) : 0;
  const spotWidth = Math.max(0, spotRight - spotLeft);
  const spotHeight = Math.max(0, spotBottom - spotTop);

  // ── 2. Dynamic Bubble Position & Pointer Calculator ────────────────────────
  const computeCardPlacement = () => {
    const safeTopEdge = Math.max(12, insets.top + 6);
    const safeBottomEdge = Math.max(12, insets.bottom + 10);
    const gap = 12;

    if (!hasSpotlight) {
      return {
        placement: 'bottom' as const,
        cardPositionStyle: { bottom: safeBottomEdge },
        maxCardHeight: Math.min(480, SCREEN_HEIGHT - safeTopEdge - safeBottomEdge - 16),
        arrowX: SCREEN_WIDTH / 2 - 12,
        showArrow: false,
      };
    }

    const spaceBelow = SCREEN_HEIGHT - spotBottom - safeBottomEdge - gap;
    const spaceAbove = spotTop - safeTopEdge - gap;

    // Decide whether card sits below or above the spotlight
    const preferTop =
      currentStep.preferredPlacement === 'top' ||
      (spaceBelow < 280 && spaceAbove > spaceBelow);

    const targetCenterX = spotLeft + spotWidth / 2;
    const clampedArrowX = Math.max(32, Math.min(SCREEN_WIDTH - 48, targetCenterX - 12));

    if (preferTop && spaceAbove >= 200) {
      const bottomOffset = SCREEN_HEIGHT - spotTop + gap;
      const availableAbove = SCREEN_HEIGHT - bottomOffset - safeTopEdge;
      const maxH = Math.min(470, Math.max(290, availableAbove));
      const fitsAboveWithoutOverlap = availableAbove >= 290;
      return {
        placement: 'top' as const,
        cardPositionStyle: fitsAboveWithoutOverlap
          ? { bottom: bottomOffset }
          : { top: safeTopEdge },
        maxCardHeight: maxH,
        arrowX: clampedArrowX,
        showArrow: fitsAboveWithoutOverlap,
      };
    }

    // Place below spotlight
    const topPos = Math.min(spotBottom + gap, SCREEN_HEIGHT - safeBottomEdge - 290);
    const clampedTop = Math.max(safeTopEdge, topPos);
    const availableBelow = SCREEN_HEIGHT - clampedTop - safeBottomEdge;
    const maxH = Math.min(470, Math.max(290, availableBelow));

    return {
      placement: 'bottom' as const,
      cardPositionStyle: {
        top: clampedTop,
      },
      maxCardHeight: maxH,
      arrowX: clampedArrowX,
      showArrow: clampedTop >= spotBottom + gap - 4,
    };
  };

  const { placement, cardPositionStyle, maxCardHeight, arrowX, showArrow } = computeCardPlacement();

  // Render Step Icon
  const renderStepIcon = () => {
    if (currentStep.iconLib === 'mci') {
      return <MaterialCommunityIcons name={currentStep.icon as any} size={18} color="#10B981" />;
    }
    return <Feather name={currentStep.icon as any} size={18} color="#10B981" />;
  };

  const haloScale = haloPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.022],
  });

  const haloGlowOpacity = haloPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  const cardTranslateY = cardSlideAnim.interpolate({
    inputRange: [0.88, 1],
    outputRange: [placement === 'top' ? -8 : 8, 0],
  });

  const handleBackdropPress = () => {
    if (chapterMenuOpen) {
      setChapterMenuOpen(false);
    } else {
      minimizeTour();
    }
  };

  return (
    <View
      ref={overlayRootRef}
      collapsable={false}
      onLayout={() => refreshTargetRect()}
      style={styles.overlayRoot}
      pointerEvents="box-none"
    >
      {/* ── 1. Dimmed Scrim with Spotlight Cutout Hole ──────────────────────── */}
      {hasSpotlight ? (
        <>
          {/* Top Scrim Panel */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBackdropPress}
            style={[
              styles.scrimPiece,
              {
                top: 0,
                left: 0,
                right: 0,
                height: spotTop,
                backgroundColor: scrimColor,
              },
            ]}
          />
          {/* Bottom Scrim Panel */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBackdropPress}
            style={[
              styles.scrimPiece,
              {
                top: spotBottom,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: scrimColor,
              },
            ]}
          />
          {/* Left Scrim Panel */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBackdropPress}
            style={[
              styles.scrimPiece,
              {
                top: spotTop,
                left: 0,
                width: spotLeft,
                height: spotHeight,
                backgroundColor: scrimColor,
              },
            ]}
          />
          {/* Right Scrim Panel */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBackdropPress}
            style={[
              styles.scrimPiece,
              {
                top: spotTop,
                left: spotRight,
                right: 0,
                height: spotHeight,
                backgroundColor: scrimColor,
              },
            ]}
          />

          {/* ── 2. Glowing Animated Emerald Halo Box Over Target ────────────── */}
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.haloOuterGlow,
              {
                top: spotTop - 4,
                left: spotLeft - 4,
                width: spotWidth + 8,
                height: spotHeight + 8,
                opacity: haloGlowOpacity,
                transform: [{ scale: haloScale }],
              },
            ]}
          />
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={nextStep}
            style={[
              styles.haloBox,
              {
                top: spotTop,
                left: spotLeft,
                width: spotWidth,
                height: spotHeight,
              },
            ]}
          >
            {/* Corner Target Reticle Accents */}
            <View style={[styles.cornerBracket, styles.cornerTL]} />
            <View style={[styles.cornerBracket, styles.cornerTR]} />
            <View style={[styles.cornerBracket, styles.cornerBL]} />
            <View style={[styles.cornerBracket, styles.cornerBR]} />
          </TouchableOpacity>
        </>
      ) : (
        /* Full-Screen Fallback Scrim if Target is Not Mounted */
        <TouchableOpacity
          style={[StyleSheet.absoluteFillObject, { backgroundColor: scrimColor }]}
          activeOpacity={1}
          onPress={handleBackdropPress}
        />
      )}

      {/* ── 3. Floating Game Dialogue Card ──────────────────────────────────── */}
      <Animated.View
        style={[
          styles.cardContainer,
          cardPositionStyle,
          {
            maxHeight: maxCardHeight,
            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            borderColor: isDark ? 'rgba(16, 185, 129, 0.42)' : 'rgba(16, 185, 129, 0.35)',
            shadowColor: isDark ? '#000000' : '#0F172A',
            opacity: cardSlideAnim,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
      >
        {/* Top Pointer Arrow (when card sits below spotlight) */}
        {showArrow && placement === 'bottom' && (
          <View
            style={[
              styles.pointerArrowUp,
              {
                left: arrowX,
                borderBottomColor: isDark ? '#10B981' : '#10B981',
              },
            ]}
          />
        )}

        {/* Bottom Pointer Arrow (when card sits above spotlight) */}
        {showArrow && placement === 'top' && (
          <View
            style={[
              styles.pointerArrowDown,
              {
                left: arrowX,
                borderTopColor: isDark ? '#10B981' : '#10B981',
              },
            ]}
          />
        )}

        {/* ── Header: Icon, Chapter, Badge, "Quests" Selector & Controls ──── */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                  borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.25)',
                },
              ]}
            >
              {renderStepIcon()}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.chapterText} numberOfLines={1}>
                {currentStep.chapter}
              </Text>
              <Text
                style={[styles.badgeSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}
                numberOfLines={1}
              >
                {currentStep.badge} ·{' '}
                <Text style={{ color: isDark ? '#F1F5F9' : '#0F172A', fontWeight: '800' }}>
                  {currentStepIndex + 1}/{totalSteps}
                </Text>
              </Text>
            </View>
          </View>

          {/* Right Controls: Quests Dropdown Button, Minimize, Skip */}
          <View style={styles.headerRightControls}>
            <TouchableOpacity
              style={[
                styles.questsBtn,
                {
                  backgroundColor: chapterMenuOpen
                    ? 'rgba(16, 185, 129, 0.22)'
                    : isDark
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(16, 185, 129, 0.08)',
                  borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.24)',
                },
              ]}
              onPress={() => setChapterMenuOpen((prev) => !prev)}
              activeOpacity={0.75}
            >
              <Feather name="map-pin" size={11} color={isDark ? '#10B981' : '#059669'} />
              <Text style={[styles.questsBtnText, { color: isDark ? '#10B981' : '#059669' }]}>
                Quests
              </Text>
              <Feather
                name={chapterMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={11}
                color={isDark ? '#10B981' : '#059669'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.headerActionBtn,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
              ]}
              onPress={minimizeTour}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Feather name="minus" size={14} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.headerActionBtn,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
              ]}
              onPress={skipTour}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Feather name="x" size={14} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Chapter Dropdown Popover ("Jump to Mission" — Web Parity) ────── */}
        {chapterMenuOpen ? (
          <View
            style={[
              styles.questsDropdownBox,
              {
                backgroundColor: isDark ? '#0B0F19' : '#F8FAFC',
                borderColor: isDark ? 'rgba(16, 185, 129, 0.32)' : 'rgba(16, 185, 129, 0.25)',
              },
            ]}
          >
            <View style={styles.questsDropdownHeaderRow}>
              <Text style={[styles.questsDropdownHeader, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                JUMP TO MISSION ({totalSteps} STATIONS)
              </Text>
              <TouchableOpacity onPress={() => setChapterMenuOpen(false)}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ maxHeight: Math.min(210, maxCardHeight - 130) }}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {steps.map((s: MobileTourStep, idx: number) => {
                const isSelected = idx === currentStepIndex;
                const isCompleted = idx < currentStepIndex;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.questMenuItem,
                      isSelected && {
                        backgroundColor: isDark
                          ? 'rgba(16, 185, 129, 0.16)'
                          : 'rgba(16, 185, 129, 0.1)',
                      },
                    ]}
                    onPress={() => {
                      jumpToStep(idx);
                      setChapterMenuOpen(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text
                        style={[
                          styles.questMenuItemTitle,
                          {
                            color: isSelected
                              ? isDark
                                ? '#10B981'
                                : '#059669'
                              : isDark
                              ? '#CBD5E1'
                              : '#334155',
                            fontWeight: isSelected ? '800' : '600',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {idx + 1}. {s.title}
                      </Text>
                      <Text
                        style={[
                          styles.questMenuItemSub,
                          { color: isDark ? '#64748B' : '#94A3B8' },
                        ]}
                        numberOfLines={1}
                      >
                        {s.chapter} · {s.badge}
                      </Text>
                    </View>
                    {isCompleted ? (
                      <Text style={styles.questCheckmark}>✓</Text>
                    ) : isSelected ? (
                      <View style={styles.questActiveDot} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          /* ── Scrollable Mission Content ──────────────────────────────────── */
          <ScrollView
            style={[styles.cardScrollContent, { maxHeight: Math.max(185, maxCardHeight - 115) }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled={true}
          >
            {/* Mission Title */}
            <Text style={[styles.titleText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
              {currentStep.title}
            </Text>

            {/* Dialogue Body */}
            <Text style={[styles.dialogueText, { color: isDark ? '#94A3B8' : '#475569' }]}>
              {currentStep.dialogue}
            </Text>

            {/* Key Operational Capabilities Box (Web Parity) */}
            {currentStep.capabilities && currentStep.capabilities.length > 0 && (
              <View
                style={[
                  styles.capabilitiesBox,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.03)'
                      : 'rgba(16, 185, 129, 0.04)',
                    borderColor: isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(16, 185, 129, 0.18)',
                  },
                ]}
              >
                <Text style={styles.capabilitiesHeader}>Key Operational Capabilities</Text>
                {currentStep.capabilities.map((cap, i) => (
                  <View key={i} style={styles.capItemRow}>
                    <Text style={styles.capBullet}>✦</Text>
                    <Text style={[styles.capText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                      {cap}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Pro-Tip Box (Web Parity) */}
            {currentStep.proTip && (
              <View
                style={[
                  styles.proTipBox,
                  {
                    backgroundColor: isDark ? 'rgba(217, 119, 6, 0.1)' : '#FFFBEB',
                    borderColor: isDark ? 'rgba(217, 119, 6, 0.28)' : 'rgba(245, 158, 11, 0.35)',
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="creation"
                  size={15}
                  color="#F59E0B"
                  style={{ marginTop: 1, marginRight: 6 }}
                />
                <Text style={[styles.proTipText, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                  <Text style={{ fontWeight: '800' }}>Pro-Tip: </Text>
                  {currentStep.proTip}
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Progress Energy Dots ────────────────────────────────────────── */}
        <View style={styles.progressDotsRow}>
          {steps.map((s: MobileTourStep, idx: number) => {
            const isCurrent = idx === currentStepIndex;
            const isPast = idx < currentStepIndex;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => jumpToStep(idx)}
                style={[
                  styles.dot,
                  {
                    flex: isCurrent ? 1.8 : 1,
                    backgroundColor: isCurrent
                      ? '#10B981'
                      : isPast
                      ? isDark
                        ? 'rgba(16, 185, 129, 0.45)'
                        : 'rgba(16, 185, 129, 0.35)'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              />
            );
          })}
        </View>

        {/* ── Navigation Action Buttons ───────────────────────────────────── */}
        <View style={styles.actionsRow}>
          {currentStepIndex > 0 ? (
            <TouchableOpacity
              style={[
                styles.prevBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
              onPress={prevStep}
              activeOpacity={0.7}
            >
              <Feather name="chevron-left" size={15} color={isDark ? '#CBD5E1' : '#334155'} />
              <Text style={[styles.prevBtnText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                Back
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.skipBtn} onPress={skipTour} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Skip Guide</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.nextBtn} onPress={nextStep} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>
              {isLastStep ? 'Finish Tour 🚀' : 'Next Mission'}
            </Text>
            {!isLastStep && <Feather name="chevron-right" size={15} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999990,
  },
  scrimPiece: {
    position: 'absolute',
    zIndex: 999991,
  },
  haloOuterGlow: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'transparent',
    zIndex: 999992,
  },
  haloBox: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: 'transparent',
    zIndex: 999993,
  },
  cornerBracket: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderColor: '#34D399',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  cardContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    zIndex: 999995,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.42,
        shadowRadius: 22,
      },
      android: {
        elevation: 20,
      },
      default: {
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.42,
        shadowRadius: 22,
      },
    }),
  },
  pointerArrowUp: {
    position: 'absolute',
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  pointerArrowDown: {
    position: 'absolute',
    bottom: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
    gap: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chapterText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  badgeSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 0.5,
  },
  headerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  questsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  questsBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  headerActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questsDropdownBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    marginBottom: 10,
  },
  questsDropdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  questsDropdownHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  questMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  questMenuItemTitle: {
    fontSize: 12,
  },
  questMenuItemSub: {
    fontSize: 10,
    marginTop: 1,
  },
  questCheckmark: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  questActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  cardScrollContent: {
    marginBottom: 9,
  },
  titleText: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 20.5,
    marginBottom: 4,
  },
  dialogueText: {
    fontSize: 12,
    lineHeight: 17.5,
    marginBottom: 9,
  },
  capabilitiesBox: {
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  capabilitiesHeader: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  capItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 2.5,
  },
  capBullet: {
    color: '#10B981',
    fontSize: 10.5,
    marginTop: 1,
  },
  capText: {
    fontSize: 11,
    lineHeight: 15.5,
    flex: 1,
  },
  proTipBox: {
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  proTipText: {
    fontSize: 11,
    lineHeight: 15.5,
    flex: 1,
  },
  progressDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
  },
  prevBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  skipBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  minimizedPillWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 999999,
  },
  minimizedPill: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  minimizedPillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
