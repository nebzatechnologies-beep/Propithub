import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useMobileTheme } from '../context/MobileThemeContext';

interface FreeTrialFloatingWidgetProps {
  onNavigateToPlans: () => void;
  currentScreenKey?: string;
}

export const FreeTrialFloatingWidget: React.FC<FreeTrialFloatingWidgetProps> = ({
  onNavigateToPlans,
  currentScreenKey,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { isTrial, daysLeft, isExpired, trialEnds, currentPlan, usage } = usePlanLimits();
  const [isExpanded, setIsExpanded] = useState(false);

  // Dragging support across the entire screen
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentPos = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
        },
        onPanResponderGrant: () => {
          isDraggingRef.current = false;
          pan.setOffset({
            x: currentPos.current.x,
            y: currentPos.current.y,
          });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, gestureState) => {
          if (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4) {
            isDraggingRef.current = true;
          }
          pan.setValue({ x: gestureState.dx, y: gestureState.dy });
        },
        onPanResponderRelease: (_, gestureState) => {
          pan.flattenOffset();
          currentPos.current = {
            x: currentPos.current.x + gestureState.dx,
            y: currentPos.current.y + gestureState.dy,
          };
          setTimeout(() => {
            isDraggingRef.current = false;
          }, 100);
        },
        onPanResponderTerminate: () => {
          pan.flattenOffset();
          isDraggingRef.current = false;
        },
      }),
    [pan]
  );

  const handlePillPress = () => {
    if (!isDraggingRef.current) {
      setIsExpanded(true);
    }
  };

  // Suppress on subscription screen, owner dashboard (has top banner), settings, and workflow screens
  const suppressedScreens = [
    'owner_dashboard',
    'owner_plan_subscription',
    'account_settings',
    'moveout_inspection_checklist',
    'rental_invoice_studio',
    'property_create_wizard',
    'lease_drafting_builder',
  ];
  if (currentScreenKey && suppressedScreens.includes(currentScreenKey)) {
    return null;
  }

  // Only show when on active trial with remaining days
  if (!isTrial || daysLeft <= 0) {
    return null;
  }

  const isUrgent = daysLeft <= 3 || isExpired;

  return (
    <>
      {/* Draggable Floating Pill Trigger */}
      <Animated.View
        style={[
          styles.floatingContainer,
          {
            transform: pan.getTranslateTransform(),
          },
        ]}
        {...panResponder.panHandlers}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={[styles.pill, isUrgent ? styles.pillUrgent : styles.pillNormal]}
          onPress={handlePillPress}
          activeOpacity={0.88}
        >
          <View style={[styles.pillIconWrap, isUrgent ? styles.pillIconWrapUrgent : styles.pillIconWrapNormal]}>
            <Feather
              name={isUrgent ? 'alert-triangle' : 'zap'}
              size={13}
              color={isUrgent ? (isDark ? '#F87171' : '#DC2626') : (isDark ? '#FBBF24' : '#D97706')}
            />
          </View>
          <Text style={[styles.pillText, isUrgent ? styles.pillTextUrgent : styles.pillTextNormal]}>
            {daysLeft === 1 ? '1d left' : `${daysLeft}d left`}
          </Text>
          <Feather
            name="chevron-up"
            size={14}
            color={isUrgent ? (isDark ? '#F87171' : '#DC2626') : (isDark ? '#FBBF24' : '#78350F')}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Expanded Sheet Modal */}
      <Modal
        visible={isExpanded}
        transparent
        animationType="slide"
        onRequestClose={() => setIsExpanded(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsExpanded(false)}
        >
          <TouchableOpacity
            style={styles.sheetCard}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <SafeAreaView>
              {/* Grab Handle */}
              <View style={styles.handleBar} />

              {/* Header */}
              <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleGroup}>
                  <View style={[styles.headerIconCircle, isUrgent ? styles.headerIconUrgent : styles.headerIconNormal]}>
                    <Feather
                      name={isUrgent ? 'alert-triangle' : 'gift'}
                      size={20}
                      color={isUrgent ? '#DC2626' : '#D97706'}
                    />
                  </View>
                  <View>
                    <Text style={styles.sheetTitle}>
                      {isExpired ? 'Trial Expired' : 'Free Trial Active'}
                    </Text>
                    <Text style={styles.sheetSub}>
                      {currentPlan?.name || 'Free Trial Plan'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setIsExpanded(false)}
                  style={styles.closeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={18} color={colors.inkSoft} />
                </TouchableOpacity>
              </View>

              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                {/* Expiry Banner */}
                <View style={[styles.expiryBanner, isUrgent ? styles.expiryUrgent : styles.expiryNormal]}>
                  <View style={styles.expiryLeft}>
                    <Feather
                      name="clock"
                      size={16}
                      color={isUrgent ? (isDark ? '#F87171' : '#DC2626') : (isDark ? '#FBBF24' : '#D97706')}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={[styles.expiryText, isUrgent ? styles.expiryTextUrgent : styles.expiryTextNormal]}>
                      {daysLeft === 1 ? '1 day remaining' : `${daysLeft} days remaining`}
                    </Text>
                  </View>
                  {trialEnds && (
                    <Text style={styles.expiryDate}>
                      Ends {new Date(trialEnds).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                  )}
                </View>

                {/* Resource Quotas */}
                <Text style={styles.quotasTitle}>Trial Quota Usage</Text>
                <View style={styles.quotasCard}>
                  {/* Properties */}
                  <View style={styles.quotaRow}>
                    <Text style={styles.quotaLabel}>Properties</Text>
                    <Text style={[styles.quotaVal, usage.properties.isFull && styles.quotaValFull]}>
                      {usage.properties.used} / {usage.properties.max}
                    </Text>
                  </View>
                  <View style={styles.quotaBarBg}>
                    <View
                      style={[
                        styles.quotaBarFill,
                        { width: `${Math.min(100, (usage.properties.used / (usage.properties.max || 1)) * 100)}%` },
                        usage.properties.isFull && styles.quotaBarFull,
                      ]}
                    />
                  </View>

                  {/* Units */}
                  <View style={styles.quotaRow}>
                    <Text style={styles.quotaLabel}>Units</Text>
                    <Text style={[styles.quotaVal, usage.units.isFull && styles.quotaValFull]}>
                      {usage.units.used} / {usage.units.max}
                    </Text>
                  </View>
                  <View style={styles.quotaBarBg}>
                    <View
                      style={[
                        styles.quotaBarFill,
                        { width: `${Math.min(100, (usage.units.used / (usage.units.max || 1)) * 100)}%` },
                        usage.units.isFull && styles.quotaBarFull,
                      ]}
                    />
                  </View>

                  {/* Tenants */}
                  <View style={styles.quotaRow}>
                    <Text style={styles.quotaLabel}>Tenants</Text>
                    <Text style={[styles.quotaVal, usage.tenants.isFull && styles.quotaValFull]}>
                      {usage.tenants.used} / {usage.tenants.max}
                    </Text>
                  </View>
                  <View style={styles.quotaBarBg}>
                    <View
                      style={[
                        styles.quotaBarFill,
                        { width: `${Math.min(100, (usage.tenants.used / (usage.tenants.max || 1)) * 100)}%` },
                        usage.tenants.isFull && styles.quotaBarFull,
                      ]}
                    />
                  </View>

                  {/* Managers / Staff */}
                  <View style={styles.quotaRow}>
                    <Text style={styles.quotaLabel}>Managers / Staff</Text>
                    <Text style={[styles.quotaVal, usage.managers.isFull && styles.quotaValFull]}>
                      {usage.managers.used + usage.staff.used} / {(usage.managers.max || 0) + (usage.staff.max || 0)}
                    </Text>
                  </View>
                  <View style={styles.quotaBarBg}>
                    <View
                      style={[
                        styles.quotaBarFill,
                        {
                          width: `${Math.min(
                            100,
                            ((usage.managers.used + usage.staff.used) /
                              Math.max(1, (usage.managers.max || 0) + (usage.staff.max || 0))) *
                              100
                          )}%`,
                        },
                        usage.managers.isFull && styles.quotaBarFull,
                      ]}
                    />
                  </View>
                </View>

                {/* Upgrade Button */}
                <TouchableOpacity
                  style={[styles.upgradeBtn, isUrgent && styles.upgradeBtnUrgent]}
                  onPress={() => {
                    setIsExpanded(false);
                    onNavigateToPlans();
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="sparkles" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.upgradeBtnText}>Upgrade to Full Plan</Text>
                  <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    floatingContainer: {
      position: 'absolute',
      bottom: 84, // Sits comfortably above bottom tab navigator
      right: 16,
      zIndex: 999,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 999,
      borderWidth: 1,
    },
    pillNormal: {
      backgroundColor: isDark ? '#2D1B06' : '#FFFBEB',
      borderColor: isDark ? '#78350F' : '#FCD34D',
    },
    pillUrgent: {
      backgroundColor: isDark ? '#3B1212' : '#FEF2F2',
      borderColor: isDark ? '#991B1B' : '#FCA5A5',
    },
    pillIconWrap: {
      width: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 6,
    },
    pillIconWrapNormal: {
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
    },
    pillIconWrapUrgent: {
      backgroundColor: isDark ? '#450A0A' : '#FEE2E2',
    },
    pillText: {
      fontSize: 12,
      fontWeight: '700',
      marginRight: 4,
    },
    pillTextNormal: {
      color: isDark ? '#FBBF24' : '#92400E',
    },
    pillTextUrgent: {
      color: isDark ? '#F87171' : '#DC2626',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'flex-end',
    },
    sheetCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: 28,
      paddingTop: 8,
      maxHeight: '80%',
      borderWidth: 1,
      borderColor: colors.line,
    },
    handleBar: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? '#475569' : '#CBD5E1',
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sheetTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    headerIconNormal: {
      backgroundColor: isDark ? '#2D1B06' : '#FEF3C7',
    },
    headerIconUrgent: {
      backgroundColor: isDark ? '#3B1212' : '#FEE2E2',
    },
    sheetTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.navy,
    },
    sheetSub: {
      fontSize: 12,
      color: colors.inkSoft,
      fontWeight: '500',
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
    },
    expiryBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 16,
    },
    expiryNormal: {
      backgroundColor: isDark ? '#2D1B06' : '#FFFBEB',
      borderColor: isDark ? '#78350F' : '#FDE68A',
    },
    expiryUrgent: {
      backgroundColor: isDark ? '#3B1212' : '#FEF2F2',
      borderColor: isDark ? '#991B1B' : '#FECACA',
    },
    expiryLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    expiryText: {
      fontSize: 13,
      fontWeight: '700',
    },
    expiryTextNormal: {
      color: isDark ? '#FBBF24' : '#B45309',
    },
    expiryTextUrgent: {
      color: isDark ? '#F87171' : '#DC2626',
    },
    expiryDate: {
      fontSize: 11,
      color: colors.inkSoft,
      fontWeight: '500',
    },
    quotasTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.inkSoft,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    quotasCard: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 20,
      gap: 10,
    },
    quotaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    quotaLabel: {
      fontSize: 13,
      color: colors.ink,
      fontWeight: '600',
    },
    quotaVal: {
      fontSize: 13,
      color: colors.navy,
      fontWeight: '700',
    },
    quotaValFull: {
      color: '#DC2626',
    },
    quotaBarBg: {
      height: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      borderRadius: 999,
      overflow: 'hidden',
    },
    quotaBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 999,
    },
    quotaBarFull: {
      backgroundColor: '#DC2626',
    },
    upgradeBtn: {
      backgroundColor: '#D97706',
      borderRadius: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    upgradeBtnUrgent: {
      backgroundColor: '#DC2626',
    },
    upgradeBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
  });
