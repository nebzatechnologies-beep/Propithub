import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useMobileTheme } from '../context/MobileThemeContext';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style: customStyle,
  textStyle,
}) => {
  const { colors, isDark } = useMobileTheme();

  const getButtonStyles = () => {
    switch (variant) {
      case 'secondary':
        return { bg: colors.surfaceSunken, border: colors.line, text: colors.navy };
      case 'danger':
        return { bg: colors.crimson, border: colors.crimson, text: '#FFFFFF' };
      case 'outline':
        return {
          bg: 'transparent',
          border: colors.primary,
          text: isDark ? colors.primaryText : colors.primaryDark,
        };
      default:
        return { bg: colors.primary, border: colors.primary, text: '#FFFFFF' };
    }
  };

  const paletteStyle = getButtonStyles();

  const sizeStyle =
    size === 'sm'
      ? { minHeight: 34, paddingHorizontal: 12, paddingVertical: 6 }
      : size === 'lg'
      ? { minHeight: 50, paddingHorizontal: 20, paddingVertical: 10 }
      : { minHeight: 44, paddingHorizontal: 16, paddingVertical: 8 };

  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 15 : 13.5;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        sizeStyle,
        { backgroundColor: paletteStyle.bg, borderColor: paletteStyle.border },
        disabled && styles.disabled,
        customStyle,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={paletteStyle.text} size="small" />
      ) : (
        <Text
          style={[styles.text, { color: paletteStyle.text, fontSize }, textStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
