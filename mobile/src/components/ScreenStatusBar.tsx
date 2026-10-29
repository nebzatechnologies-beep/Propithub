import React from 'react';
import { View, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMobileTheme } from '../context/MobileThemeContext';

interface ScreenStatusBarProps {
  color?: string;
  backgroundColor?: string;
}

export const ScreenStatusBar: React.FC<ScreenStatusBarProps> = ({ backgroundColor: customBg }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useMobileTheme();

  const isDefaultLightBg =
    !customBg ||
    customBg.toLowerCase() === '#ffffff' ||
    customBg.toLowerCase() === '#fff' ||
    customBg.toLowerCase() === '#f8fafc' ||
    customBg.toLowerCase() === '#f1f5f9';

  const backgroundColor = isDark
    ? isDefaultLightBg
      ? colors.surface
      : customBg
    : customBg || colors.surface;

  const topInset =
    Platform.OS === 'android'
      ? Math.max(insets.top, StatusBar.currentHeight || 24)
      : insets.top;

  if (topInset <= 0) {
    return null;
  }

  return <View style={{ height: topInset, backgroundColor, width: '100%' }} />;
};



