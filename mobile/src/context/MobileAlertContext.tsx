import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  Alert,
} from 'react-native';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useMobileTheme } from './MobileThemeContext';

export type MobileAlertType = 'success' | 'warning' | 'error' | 'info' | 'payment';

export interface MobileAlertDetailItem {
  label: string;
  value: string;
  icon?: keyof typeof Feather.glyphMap;
  isAmount?: boolean;
  isMonospace?: boolean;
}

export interface MobileAlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  isPreferred?: boolean;
}

export interface MobileAlertOptions {
  type?: MobileAlertType;
  badge?: string;
  title: string;
  subtitle?: string;
  message?: string;
  details?: MobileAlertDetailItem[];
  footerNote?: string;
  buttons?: MobileAlertButton[];
  cancelable?: boolean;
  onDismiss?: () => void;

  // Backward compatibility with previous MobileAlertOptions:
  primaryButtonText?: string;
  primaryButtonDestructive?: boolean;
  onPrimaryPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
}

interface MobileAlertContextType {
  showAlert: (options: MobileAlertOptions) => void;
  hideAlert: () => void;
}

const MobileAlertContext = createContext<MobileAlertContextType | null>(null);

// Global bridge for React Native Alert.alert interception
type GlobalAlertHandler = (options: MobileAlertOptions) => void;
let globalAlertHandler: GlobalAlertHandler | null = null;
let globalHideHandler: (() => void) | null = null;
const originalNativeAlert = Alert.alert;

/**
 * Intelligent message and button parser that converts raw Alert.alert parameters
 * into a rich, structured mobile modal payload.
 */
export const parseAlertContent = (
  rawTitle?: string,
  rawMessage?: string,
  rawButtons?: any[],
  rawOptions?: { cancelable?: boolean; onDismiss?: () => void }
): MobileAlertOptions => {
  const title = (rawTitle || '').trim();
  const message = (rawMessage || '').trim();
  const combined = `${title} ${message}`.toLowerCase();

  // 1. Detect Alert Type & Badge
  let detectedType: MobileAlertType = 'info';
  let badgeText: string | undefined = undefined;

  const titleLower = title.toLowerCase();

  const isError =
    titleLower.includes('error') ||
    titleLower.includes('failed') ||
    titleLower.includes('rejected') ||
    titleLower.includes('denied') ||
    titleLower.includes('invalid') ||
    titleLower.includes('cannot') ||
    titleLower.includes('required') ||
    title.includes('❌');

  const isWarning =
    titleLower.includes('warning') ||
    titleLower.includes('caution') ||
    titleLower.includes('are you sure') ||
    titleLower.includes('delete') ||
    titleLower.includes('remove') ||
    titleLower.includes('terminate') ||
    titleLower.includes('archive') ||
    title.includes('⚠️');

  const isPayment =
    titleLower.includes('sandbox') ||
    titleLower.includes('payment') ||
    titleLower.includes('checkout') ||
    combined.includes('simulate instant payment') ||
    combined.includes('propithub mock sandbox') ||
    combined.includes('test card:') ||
    title.includes('💳') ||
    (title.includes('🏠') && combined.includes('payment'));

  const isSuccess =
    titleLower.includes('approved') ||
    titleLower.includes('success') ||
    titleLower.includes('finalized') ||
    titleLower.includes('completed') ||
    titleLower.includes('active') ||
    titleLower.includes('paid') ||
    titleLower.includes('saved') ||
    titleLower.includes('created') ||
    title.includes('✓') ||
    title.includes('✅') ||
    combined.includes('has been approved') ||
    combined.includes('successfully updated') ||
    combined.includes('saved successfully');

  if (isError) {
    detectedType = 'error';
    badgeText = 'ACTION REQUIRED';
  } else if (isWarning) {
    detectedType = 'warning';
    badgeText = 'CONFIRMATION';
  } else if (isPayment) {
    detectedType = 'payment';
    badgeText = combined.includes('sandbox') ? 'SANDBOX SIMULATOR' : 'PAYMENT CHECKOUT';
  } else if (isSuccess) {
    detectedType = 'success';
    badgeText = titleLower.includes('lease') ? 'LEASE APPROVED' : 'VERIFIED & COMPLETE';
  }

  // 2. Clean Title
  const cleanTitle = title
    .replace(/[🏠✓✅⚠️❌💳💰]/g, '')
    .trim();

  // 3. Parse Message for Structured Key-Value Pairs
  let subtitle: string | undefined = undefined;
  let bodyMessage: string | undefined = undefined;
  const details: MobileAlertDetailItem[] = [];
  let footerNote: string | undefined = undefined;

  if (message) {
    const rawLines = message.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const kvRegex = /^([^:\n]{2,28})\s*:\s*(.+)$/;

    const parsedLines: Array<{ type: 'kv' | 'text'; key?: string; val?: string; text?: string }> = [];
    for (const line of rawLines) {
      const match = line.match(kvRegex);
      if (match && !match[1].includes('http') && !match[1].includes('//') && match[1].length < 24) {
        parsedLines.push({ type: 'kv', key: match[1].trim(), val: match[2].trim() });
      } else {
        parsedLines.push({ type: 'text', text: line });
      }
    }

    const hasKv = parsedLines.some((p) => p.type === 'kv');

    if (hasKv) {
      let idx = 0;
      if (parsedLines[0]?.type === 'text') {
        subtitle = parsedLines[0].text;
        idx = 1;
      }

      for (; idx < parsedLines.length; idx++) {
        const item = parsedLines[idx];
        if (item.type === 'kv' && item.key && item.val) {
          const lowerKey = item.key.toLowerCase();
          let icon: keyof typeof Feather.glyphMap = 'info';
          let isAmount = false;
          let isMonospace = false;

          if (
            lowerKey.includes('amount') ||
            lowerKey.includes('price') ||
            lowerKey.includes('rent') ||
            lowerKey.includes('fee') ||
            lowerKey.includes('deposit') ||
            item.val.includes('$') ||
            item.val.includes('₹') ||
            item.val.includes('€') ||
            item.val.includes('£')
          ) {
            icon = 'dollar-sign';
            isAmount = true;
          } else if (lowerKey.includes('card') || lowerKey.includes('bank')) {
            icon = 'credit-card';
          } else if (lowerKey.includes('ref') || lowerKey.includes('id') || lowerKey.includes('code') || lowerKey.includes('tx')) {
            icon = 'hash';
            isMonospace = true;
          } else if (lowerKey.includes('date') || lowerKey.includes('exp') || lowerKey.includes('due')) {
            icon = 'calendar';
          } else if (lowerKey.includes('unit') || lowerKey.includes('prop')) {
            icon = 'home';
          } else if (lowerKey.includes('tenant') || lowerKey.includes('owner') || lowerKey.includes('user')) {
            icon = 'user';
          }

          details.push({
            label: item.key,
            value: item.val,
            icon,
            isAmount,
            isMonospace,
          });
        } else if (item.type === 'text' && item.text) {
          if (!footerNote) {
            footerNote = item.text;
          } else {
            footerNote += ' ' + item.text;
          }
        }
      }
    } else {
      bodyMessage = message;
    }
  }

  // 4. Parse Buttons
  let formattedButtons: MobileAlertButton[] = [];
  if (!rawButtons || rawButtons.length === 0) {
    formattedButtons = [{ text: 'OK', style: 'default' }];
  } else {
    formattedButtons = rawButtons.map((btn) => ({
      text: btn.text || 'OK',
      onPress: btn.onPress,
      style: btn.style,
      isPreferred: btn.isPreferred,
    }));
  }

  return {
    type: detectedType,
    badge: badgeText,
    title: cleanTitle || 'Notification',
    subtitle,
    message: bodyMessage,
    details: details.length > 0 ? details : undefined,
    footerNote,
    buttons: formattedButtons,
    cancelable: rawOptions?.cancelable !== false,
    onDismiss: rawOptions?.onDismiss,
  };
};

// Patch React Native's Alert.alert globally so that EVERY call in the app routes to our custom modal
let isPatched = false;
export const patchReactNativeAlert = () => {
  if (isPatched) return;
  isPatched = true;

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: any[],
    options?: any
  ): void => {
    if (globalAlertHandler) {
      const parsed = parseAlertContent(title, message, buttons, options);
      globalAlertHandler(parsed);
    } else {
      originalNativeAlert(title, message, buttons, options);
    }
  };
};

// Directly trigger patch so it is active immediately on import
patchReactNativeAlert();

export const showGlobalAlert = (options: MobileAlertOptions) => {
  if (globalAlertHandler) {
    globalAlertHandler(options);
  } else {
    originalNativeAlert(options.title, options.message);
  }
};

export const hideGlobalAlert = () => {
  if (globalHideHandler) {
    globalHideHandler();
  }
};

export const useMobileAlert = (): MobileAlertContextType => {
  const context = useContext(MobileAlertContext);
  if (!context) {
    return {
      showAlert: (opts: MobileAlertOptions) => {
        showGlobalAlert(opts);
      },
      hideAlert: () => {
        hideGlobalAlert();
      },
    };
  }
  return context;
};

export const MobileAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors, isDark } = useMobileTheme();
  const [currentAlert, setCurrentAlert] = useState<MobileAlertOptions | null>(null);

  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const hideAlert = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      const onDismiss = currentAlert?.onDismiss;
      setCurrentAlert(null);
      if (onDismiss) {
        try {
          onDismiss();
        } catch (e) {
          console.error('[MobileAlert onDismiss error]', e);
        }
      }
    });
  }, [scaleAnim, opacityAnim, currentAlert]);

  const showAlert = useCallback(
    (options: MobileAlertOptions) => {
      // Normalize options to support backward-compatibility fields
      let normalizedButtons: MobileAlertButton[] = options.buttons ? [...options.buttons] : [];

      if (normalizedButtons.length === 0) {
        if (options.primaryButtonText) {
          normalizedButtons.push({
            text: options.primaryButtonText,
            style: options.primaryButtonDestructive ? 'destructive' : 'default',
            onPress: options.onPrimaryPress,
          });
        }
        if (options.secondaryButtonText) {
          normalizedButtons.push({
            text: options.secondaryButtonText,
            style: 'cancel',
            onPress: options.onSecondaryPress,
          });
        }
      }

      if (normalizedButtons.length === 0) {
        normalizedButtons = [{ text: 'OK', style: 'default' }];
      }

      const mergedOptions: MobileAlertOptions = {
        ...options,
        buttons: normalizedButtons,
      };

      setCurrentAlert(mergedOptions);
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7.5,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [scaleAnim, opacityAnim]
  );

  // Register global handlers for Alert.alert bridge
  useEffect(() => {
    globalAlertHandler = showAlert;
    globalHideHandler = hideAlert;
    patchReactNativeAlert();

    return () => {
      globalAlertHandler = null;
      globalHideHandler = null;
    };
  }, [showAlert, hideAlert]);

  const alertType = currentAlert?.type || 'info';

  const typeConfig = {
    success: {
      outerBg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#DCFCE7',
      innerBg: '#10B981',
      icon: 'check' as const,
      btnBg: '#10B981',
      borderColor: isDark ? 'rgba(16, 185, 129, 0.32)' : '#86EFAC',
      badgeBg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5',
      badgeBorder: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
      badgeColor: isDark ? '#34D399' : '#059669',
      defaultBadge: 'VERIFIED & ACTIVE',
    },
    payment: {
      outerBg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FEF3C7',
      innerBg: '#F59E0B',
      icon: 'credit-card' as const,
      btnBg: '#059669', // Emerald button for instant checkout
      borderColor: isDark ? 'rgba(245, 158, 11, 0.32)' : '#FDE68A',
      badgeBg: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FFFBEB',
      badgeBorder: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FCD34D',
      badgeColor: isDark ? '#FBBF24' : '#B45309',
      defaultBadge: 'SANDBOX SIMULATOR',
    },
    warning: {
      outerBg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FEF3C7',
      innerBg: '#F59E0B',
      icon: 'alert-triangle' as const,
      btnBg: '#D97706',
      borderColor: isDark ? 'rgba(245, 158, 11, 0.32)' : '#FDE68A',
      badgeBg: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
      badgeBorder: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FCD34D',
      badgeColor: isDark ? '#FBBF24' : '#B45309',
      defaultBadge: 'ATTENTION',
    },
    error: {
      outerBg: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
      innerBg: '#EF4444',
      icon: 'alert-circle' as const,
      btnBg: '#DC2626',
      borderColor: isDark ? 'rgba(239, 68, 68, 0.32)' : '#FECACA',
      badgeBg: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEF2F2',
      badgeBorder: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
      badgeColor: isDark ? '#F87171' : '#B91C1C',
      defaultBadge: 'ACTION REQUIRED',
    },
    info: {
      outerBg: isDark ? 'rgba(37, 99, 235, 0.16)' : '#DBEAFE',
      innerBg: '#2563EB',
      icon: 'info' as const,
      btnBg: isDark ? '#3B82F6' : '#0F172A',
      borderColor: isDark ? 'rgba(37, 99, 235, 0.32)' : '#BFDBFE',
      badgeBg: isDark ? 'rgba(37, 99, 235, 0.18)' : '#EFF6FF',
      badgeBorder: isDark ? 'rgba(37, 99, 235, 0.35)' : '#BFDBFE',
      badgeColor: isDark ? '#60A5FA' : '#1D4ED8',
      defaultBadge: 'NOTICE',
    },
  }[alertType];

  const handleBackdropPress = () => {
    if (currentAlert?.cancelable === false) return;

    // If there is a cancel button, trigger its onPress
    const cancelBtn = currentAlert?.buttons?.find((b) => b.style === 'cancel');
    hideAlert();
    if (cancelBtn?.onPress) {
      cancelBtn.onPress();
    }
  };

  const handleButtonPress = (btn: MobileAlertButton) => {
    hideAlert();
    if (btn.onPress) {
      setTimeout(() => {
        try {
          btn.onPress!();
        } catch (err) {
          console.error('[MobileAlert button callback error]', err);
        }
      }, 50);
    }
  };

  // Determine button layout: horizontal side-by-side or stacked
  const buttons = currentAlert?.buttons || [];
  const isTwoButtons = buttons.length === 2;
  const bothButtonsShort =
    isTwoButtons &&
    (buttons[0]?.text?.length || 0) <= 8 &&
    (buttons[1]?.text?.length || 0) <= 8;

  // For 2 buttons, find cancel and primary
  let cancelBtn: MobileAlertButton | null = null;
  let primaryBtn: MobileAlertButton | null = null;

  if (isTwoButtons) {
    const cancelIdx = buttons.findIndex(
      (b) =>
        b.style === 'cancel' ||
        ['cancel', 'no', 'close', 'dismiss', 'back', 'skip', 'later'].includes(
          (b.text || '').trim().toLowerCase()
        )
    );

    if (cancelIdx !== -1) {
      cancelBtn = buttons[cancelIdx];
      primaryBtn = buttons[cancelIdx === 0 ? 1 : 0];
    } else {
      cancelBtn = buttons[0];
      primaryBtn = buttons[1];
    }
  }

  return (
    <MobileAlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}

      <Modal
        visible={Boolean(currentAlert)}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleBackdropPress}
      >
        <TouchableWithoutFeedback onPress={handleBackdropPress}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.line,
                    opacity: opacityAnim,
                    transform: [{ scale: scaleAnim }],
                  },
                ]}
              >
                {/* 1. Top Pill Badge */}
                <View
                  style={[
                    styles.badgePill,
                    {
                      backgroundColor: typeConfig.badgeBg,
                      borderColor: typeConfig.badgeBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: typeConfig.badgeColor },
                    ]}
                  >
                    {currentAlert?.badge || typeConfig.defaultBadge}
                  </Text>
                </View>

                {/* 2. Concentric Glow Ring Icon Header */}
                <View style={styles.iconContainer}>
                  <View
                    style={[
                      styles.iconOuterRing,
                      {
                        backgroundColor: typeConfig.outerBg,
                        borderColor: typeConfig.borderColor,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconInnerCircle,
                        { backgroundColor: typeConfig.innerBg },
                      ]}
                    >
                      {alertType === 'payment' ? (
                        <MaterialIcons name="credit-card" size={24} color="#FFFFFF" />
                      ) : (
                        <Feather name={typeConfig.icon} size={22} color="#FFFFFF" />
                      )}
                    </View>
                  </View>
                </View>

                {/* 3. Title */}
                <Text style={[styles.title, { color: colors.navy }]}>
                  {currentAlert?.title}
                </Text>

                {/* 4. Subtitle (if available) */}
                {currentAlert?.subtitle ? (
                  <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
                    {currentAlert.subtitle}
                  </Text>
                ) : null}

                {/* 5. Body Message (if standard text) */}
                {currentAlert?.message ? (
                  <Text style={[styles.message, { color: colors.inkSoft }]}>
                    {currentAlert.message}
                  </Text>
                ) : null}

                {/* 6. Structured Details / Receipt Breakdown Card */}
                {currentAlert?.details && currentAlert.details.length > 0 ? (
                  <View
                    style={[
                      styles.detailsBox,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                      },
                    ]}
                  >
                    {currentAlert.details.map((item, index) => (
                      <View
                        key={index}
                        style={[
                          styles.detailRow,
                          index < currentAlert.details!.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: isDark
                              ? 'rgba(255,255,255,0.06)'
                              : '#EDF2F7',
                          },
                        ]}
                      >
                        <View style={styles.detailLabelContainer}>
                          {item.icon ? (
                            <Feather
                              name={item.icon}
                              size={13}
                              color={item.isAmount ? colors.primaryDark : colors.inkSoft}
                              style={{ marginRight: 6 }}
                            />
                          ) : null}
                          <Text
                            style={[
                              styles.detailLabel,
                              { color: colors.inkSoft },
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.detailValue,
                            item.isAmount
                              ? [styles.detailAmountValue, { color: isDark ? '#34D399' : '#059669' }]
                              : item.isMonospace
                              ? [styles.detailMonospaceValue, { color: colors.navy }]
                              : { color: colors.navy },
                          ]}
                          numberOfLines={1}
                        >
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* 7. Footer Note / Prompt Banner */}
                {currentAlert?.footerNote ? (
                  <View
                    style={[
                      styles.footerNoteBox,
                      {
                        backgroundColor:
                          alertType === 'payment'
                            ? isDark
                              ? 'rgba(245, 158, 11, 0.12)'
                              : '#FEF3C7'
                            : isDark
                            ? 'rgba(255,255,255,0.04)'
                            : '#F1F5F9',
                        borderColor:
                          alertType === 'payment'
                            ? isDark
                              ? 'rgba(245, 158, 11, 0.28)'
                              : '#FDE68A'
                            : isDark
                            ? 'rgba(255,255,255,0.08)'
                            : '#E2E8F0',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.footerNoteText,
                        {
                          color:
                            alertType === 'payment'
                              ? isDark
                                ? '#FBBF24'
                                : '#92400E'
                              : colors.inkSoft,
                        },
                      ]}
                    >
                      {currentAlert.footerNote}
                    </Text>
                  </View>
                ) : null}

                {/* 8. Action Buttons */}
                <View style={styles.actionsContainer}>
                  {isTwoButtons && bothButtonsShort ? (
                    // Short buttons: Side-by-side
                    <View style={styles.sideBySideRow}>
                      {cancelBtn && (
                        <TouchableOpacity
                          style={[
                            styles.secondaryBtn,
                            styles.flexBtn,
                            {
                              backgroundColor: isDark
                                ? 'rgba(255,255,255,0.06)'
                                : '#F1F5F9',
                              borderColor: colors.line,
                            },
                          ]}
                          onPress={() => handleButtonPress(cancelBtn!)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.secondaryBtnText,
                              { color: colors.inkSoft },
                            ]}
                          >
                            {cancelBtn.text || 'Cancel'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {primaryBtn && (
                        <TouchableOpacity
                          style={[
                            styles.primaryBtn,
                            styles.flexBtn,
                            {
                              backgroundColor:
                                primaryBtn.style === 'destructive'
                                  ? '#DC2626'
                                  : typeConfig.btnBg,
                            },
                          ]}
                          onPress={() => handleButtonPress(primaryBtn!)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.primaryBtnText}>
                            {primaryBtn.text || 'OK'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : isTwoButtons ? (
                    // 2 Buttons with at least one longer label: Stacked Primary on top, Cancel below
                    <View style={styles.stackedColumn}>
                      {primaryBtn && (
                        <TouchableOpacity
                          style={[
                            styles.primaryBtn,
                            {
                              backgroundColor:
                                primaryBtn.style === 'destructive'
                                  ? '#DC2626'
                                  : typeConfig.btnBg,
                            },
                          ]}
                          onPress={() => handleButtonPress(primaryBtn!)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.primaryBtnText}>
                            {primaryBtn.text || 'Continue'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {cancelBtn && (
                        <TouchableOpacity
                          style={[
                            styles.secondaryBtn,
                            {
                              backgroundColor: isDark
                                ? 'rgba(255,255,255,0.05)'
                                : '#F8FAFC',
                              borderColor: colors.line,
                            },
                          ]}
                          onPress={() => handleButtonPress(cancelBtn!)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.secondaryBtnText,
                              { color: colors.inkSoft },
                            ]}
                          >
                            {cancelBtn.text || 'Cancel'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    // Single or 3+ buttons: Vertical list
                    <View style={styles.stackedColumn}>
                      {buttons.map((btn, bIdx) => {
                        const isDestructive = btn.style === 'destructive';
                        const isCancel = btn.style === 'cancel';

                        if (isCancel) {
                          return (
                            <TouchableOpacity
                              key={bIdx}
                              style={[
                                styles.secondaryBtn,
                                {
                                  backgroundColor: isDark
                                    ? 'rgba(255,255,255,0.05)'
                                    : '#F8FAFC',
                                  borderColor: colors.line,
                                },
                              ]}
                              onPress={() => handleButtonPress(btn)}
                              activeOpacity={0.75}
                            >
                              <Text
                                style={[
                                  styles.secondaryBtnText,
                                  { color: colors.inkSoft },
                                ]}
                              >
                                {btn.text || 'Cancel'}
                              </Text>
                            </TouchableOpacity>
                          );
                        }

                        return (
                          <TouchableOpacity
                            key={bIdx}
                            style={[
                              styles.primaryBtn,
                              {
                                backgroundColor: isDestructive
                                  ? '#DC2626'
                                  : bIdx === 0
                                  ? typeConfig.btnBg
                                  : colors.primaryDark,
                              },
                            ]}
                            onPress={() => handleButtonPress(btn)}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.primaryBtnText}>
                              {btn.text || 'OK'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </MobileAlertContext.Provider>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 19, 38, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
      },
    }),
  },
  card: {
    width: '100%',
    maxWidth: 375,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.28,
        shadowRadius: 28,
      },
      android: {
        elevation: 16,
      },
      web: {
        boxShadow:
          '0 24px 48px -12px rgba(15, 23, 42, 0.38), 0 0 0 1px rgba(0, 0, 0, 0.06)',
      },
    }),
  },
  badgePill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  iconContainer: {
    marginBottom: 14,
  },
  iconOuterRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconInnerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18.5,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.4,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  detailsBox: {
    width: '100%',
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  detailLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  detailAmountValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  detailMonospaceValue: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11.5,
    letterSpacing: 0.2,
  },
  footerNoteBox: {
    width: '100%',
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  footerNoteText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  actionsContainer: {
    width: '100%',
    marginTop: 14,
  },
  sideBySideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  stackedColumn: {
    width: '100%',
    gap: 9,
  },
  flexBtn: {
    flex: 1,
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
