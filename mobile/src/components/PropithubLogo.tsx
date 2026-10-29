import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ImageStyle,
  Platform,
} from 'react-native';
import { useMobileTheme } from '../context/MobileThemeContext';

interface PropithubIconProps {
  size?: number;
  color?: string;
  style?: ImageStyle | ViewStyle | any;
}

interface PropithubLogoProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
  showText?: boolean;
  textColor?: string;
  accentColor?: string;
  textStyle?: TextStyle;
  badge?: boolean;
  badgeBg?: string;
  badgeBorder?: string;
}

// Crisp official web logo asset (512x512 transparent PNG for in-app logo rendering)
const LOGO_SOURCE = require('../../assets/logo512.png');

// Web exact vector SVG path (1-to-1 Web Parity from src/components/common/PropithubLogo.tsx)
const WebSvgIcon: React.FC<{ size: number; color: string; style?: any }> = ({ size, color, style }) => (
  <svg
    width={size}
    height={Math.round((size * 138) / 116)}
    viewBox="0 0 116 138"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'inline-block', flexShrink: 0, ...style }}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="
        M 58 0
        L 116 50
        V 137.5
        H 31.5
        V 111.5
        H 0
        V 50
        Z

        M 58 21.5
        L 15.5 58
        V 96
        H 31.5
        A 27.5 27.5 0 1 1 59 111
        H 47.5
        V 122
        H 100.5
        V 58
        Z

        M 59 71.5
        A 12 12 0 1 0 59 95.5
        A 12 12 0 1 0 59 71.5
        Z
      "
      fill={color}
    />
  </svg>
);

export const PropithubIcon: React.FC<PropithubIconProps> = ({
  size = 28,
  color = '#10B981',
  style,
}) => {
  const height = Math.round((size * 138) / 116);

  if (Platform.OS === 'web') {
    return <WebSvgIcon size={size} color={color} style={style} />;
  }

  return (
    <Image
      source={LOGO_SOURCE}
      style={[
        {
          width: size,
          height: height,
          resizeMode: 'contain',
        },
        color ? { tintColor: color } : null,
        style as ImageStyle,
      ]}
    />
  );
};

export const PropithubLogo: React.FC<PropithubLogoProps> = ({
  size = 28,
  color = '#10B981',
  style,
  showText = false,
  textColor,
  accentColor = '#10B981',
  textStyle,
  badge = false,
  badgeBg,
  badgeBorder,
}) => {
  const { colors, isDark } = useMobileTheme();

  // Dark/Light aware defaults matching Web 1-to-1: crisp slate-white in dark mode
  const finalTextColor = textColor || (isDark ? '#F1F5F9' : '#0F172A');
  const finalBadgeBg = badgeBg || (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5');
  const finalBadgeBorder = badgeBorder || (isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0');

  const iconSize = badge ? Math.round(size * 0.65) : size;

  const iconElement = badge ? (
    <View
      style={[
        styles.badgeContainer,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: finalBadgeBg,
          borderColor: finalBadgeBorder,
          borderWidth: 1,
        },
      ]}
    >
      <PropithubIcon size={iconSize} color={color} />
    </View>
  ) : (
    <PropithubIcon size={iconSize} color={color} />
  );

  if (!showText) {
    return (
      <View style={[styles.standaloneWrapper, style]}>
        {iconElement}
      </View>
    );
  }

  const fontSize = Math.max(16, Math.round(size * 0.72));

  return (
    <View style={[styles.container, style]}>
      {iconElement}
      <Text style={[styles.brandText, { fontSize }, textStyle]}>
        <Text style={{ color: finalTextColor }}>propit</Text>
        <Text style={{ color: accentColor }}>hub</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  standaloneWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandText: {
    fontWeight: '800',
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
});

export default PropithubLogo;
