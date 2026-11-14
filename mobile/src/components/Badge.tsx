import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useMobileTheme } from '../context/MobileThemeContext';

interface BadgeProps {
  label: string;
  variant?: 'green' | 'amber' | 'red' | 'blue' | 'brass' | 'grey';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'green' }) => {
  const { colors, isDark } = useMobileTheme();

  const getStyles = () => {
    switch (variant) {
      case 'green':
        return {
          bg: colors.primaryLight,
          text: isDark ? colors.primaryText : colors.primaryDark,
        };
      case 'amber':
        return { bg: colors.amberBg, text: colors.amber };
      case 'red':
        return { bg: colors.crimsonBg, text: colors.crimson };
      case 'blue':
        return { bg: colors.blueBg, text: colors.blue };
      case 'brass':
        return {
          bg: colors.brassBg,
          text: isDark ? colors.primaryText : colors.brass,
        };
      default:
        return { bg: colors.surfaceMuted, text: colors.inkSoft };
    }
  };

  const badgeStyle = getStyles();

  return (
    <View style={[styles.badge, { backgroundColor: badgeStyle.bg }]}>
      <Text
        style={[styles.text, { color: badgeStyle.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  text: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
