import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useMobileTheme } from '../context/MobileThemeContext';

export interface ScreenContainerProps {
  children: React.ReactNode;
  /** Wrap children in a ScrollView with keyboardShouldPersistTaps="handled" */
  scrollable?: boolean;
  /** Pull-to-refresh loading state (used when onRefresh is provided) */
  refreshing?: boolean;
  /** Pull-to-refresh callback; attaches RefreshControl when scrollable is true */
  onRefresh?: () => void;
  /** Outer SafeAreaView style */
  style?: StyleProp<ViewStyle>;
  /** Inner container or ScrollView contentContainerStyle */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Safe area edges; defaults to top/left/right because RootNavigator owns the bottom tab bar */
  edges?: Edge[];
  /** Optional offset for KeyboardAvoidingView */
  keyboardVerticalOffset?: number;
  showsVerticalScrollIndicator?: boolean;
  /** Optional fixed header rendered above the scroll area */
  header?: React.ReactNode;
  /** Optional sticky footer rendered below the scroll area (inside KeyboardAvoidingView) */
  footer?: React.ReactNode;
  /** Override theme background color */
  backgroundColor?: string;
}

/**
 * Reusable screen shell combining SafeAreaView, KeyboardAvoidingView,
 * and optional ScrollView + RefreshControl with reactive dark-mode support.
 */
export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  scrollable = false,
  refreshing = false,
  onRefresh,
  style,
  contentContainerStyle,
  edges = ['top', 'left', 'right'],
  keyboardVerticalOffset = 0,
  showsVerticalScrollIndicator = false,
  header,
  footer,
  backgroundColor,
}) => {
  const { colors } = useMobileTheme();
  const resolvedBg = backgroundColor ?? colors.background;

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, { backgroundColor: resolvedBg }, style]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
        enabled={Platform.OS !== 'web'}
      >
        {header}
        {scrollable ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, contentContainerStyle]}>{children}</View>
        )}
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
