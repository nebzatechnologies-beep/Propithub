import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
}

interface MobileToastContextType {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  hideToast: () => void;
}

const MobileToastContext = createContext<MobileToastContextType | null>(null);

export const useMobileToast = (): MobileToastContextType => {
  const context = useContext(MobileToastContext);
  if (!context) {
    // Return safe fallback so it never crashes if used outside provider
    return {
      showToast: (msg: string) => console.log('[Toast fallback]', msg),
      hideToast: () => {},
    };
  }
  return context;
};

export const MobileToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentToast, setCurrentToast] = useState<ToastData | null>(null);
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hideToast = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentToast(null);
    });
  }, [translateY, opacity]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 3200) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      const id = Date.now().toString();
      setCurrentToast({ id, message, type, title, duration });

      // Animate in
      translateY.setValue(-100);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      hideTimerRef.current = setTimeout(() => {
        hideToast();
      }, duration);
    },
    [hideToast, translateY, opacity]
  );

  const getToastColors = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          bg: '#F0FDF4',
          border: '#BBF7D0',
          text: '#166534',
          subText: '#15803D',
          icon: '#16A34A',
          iconName: 'check-circle' as const,
        };
      case 'error':
        return {
          bg: '#FEF2F2',
          border: '#FECACA',
          text: '#991B1B',
          subText: '#B91C1C',
          icon: '#DC2626',
          iconName: 'alert-circle' as const,
        };
      case 'warning':
        return {
          bg: '#FFFBEB',
          border: '#FDE68A',
          text: '#92400E',
          subText: '#B45309',
          icon: '#D97706',
          iconName: 'alert-triangle' as const,
        };
      case 'info':
      default:
        return {
          bg: '#EFF6FF',
          border: '#BFDBFE',
          text: '#1E40AF',
          subText: '#2563EB',
          icon: '#3B82F6',
          iconName: 'info' as const,
        };
    }
  };

  return (
    <MobileToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {currentToast && (
        <SafeAreaView pointerEvents="box-none" style={styles.safeContainer}>
          <Animated.View
            style={[
              styles.toastWrapper,
              {
                transform: [{ translateY }],
                opacity,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={hideToast}
              style={[
                styles.toastCard,
                {
                  backgroundColor: getToastColors(currentToast.type).bg,
                  borderColor: getToastColors(currentToast.type).border,
                },
              ]}
            >
              <View style={styles.iconBox}>
                <Feather
                  name={getToastColors(currentToast.type).iconName}
                  size={20}
                  color={getToastColors(currentToast.type).icon}
                />
              </View>
              <View style={styles.textBox}>
                {currentToast.title ? (
                  <Text
                    style={[
                      styles.toastTitle,
                      { color: getToastColors(currentToast.type).text },
                    ]}
                  >
                    {currentToast.title}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.toastMessage,
                    { color: getToastColors(currentToast.type).subText },
                  ]}
                  numberOfLines={3}
                >
                  {currentToast.message}
                </Text>
              </View>
              <TouchableOpacity onPress={hideToast} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={14} color="#94A3B8" />
              </TouchableOpacity>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      )}
    </MobileToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 24 : 10,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toastWrapper: {
    width: '100%',
    maxWidth: 420,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconBox: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBox: {
    flex: 1,
    marginRight: 8,
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  toastMessage: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 17,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
  },
});
