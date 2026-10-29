import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
}) => {
  const getButtonStyles = () => {
    switch (variant) {
      case 'secondary':
        return { bg: Colors.surfaceSunken, border: Colors.line, text: Colors.navy };
      case 'danger':
        return { bg: Colors.crimson, border: Colors.crimson, text: '#FFFFFF' };
      case 'outline':
        return { bg: 'transparent', border: Colors.primary, text: Colors.primaryDark };
      default:
        return { bg: Colors.primary, border: Colors.primary, text: '#FFFFFF' };
    }
  };

  const style = getButtonStyles();

  const sizeStyle =
    size === 'sm'
      ? { height: 34, paddingHorizontal: 12 }
      : size === 'lg'
      ? { height: 50, paddingHorizontal: 20 }
      : { height: 44, paddingHorizontal: 16 };

  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 15 : 13.5;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        sizeStyle,
        { backgroundColor: style.bg, borderColor: style.border },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={style.text} size="small" />
      ) : (
        <Text style={[styles.text, { color: style.text, fontSize }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 44,
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
  },
  disabled: {
    opacity: 0.5,
  },
});
