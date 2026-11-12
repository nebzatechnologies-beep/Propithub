import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useMobileTheme } from '../context/MobileThemeContext';

interface ScreenStatusBarProps {
  color?: string;
  backgroundColor?: string;
}

export const ScreenStatusBar: React.FC<ScreenStatusBarProps> = ({ backgroundColor: customBg }) => {
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

  return (
    <StatusBar
      style={isDark ? 'light' : 'dark'}
      backgroundColor={backgroundColor}
      translucent={false}
    />
  );
};
