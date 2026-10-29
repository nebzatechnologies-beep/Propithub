import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface BadgeProps {
  label: string;
  variant?: 'green' | 'amber' | 'red' | 'blue' | 'brass' | 'grey';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'green' }) => {
  const getStyles = () => {
    switch (variant) {
      case 'green':
        return { bg: Colors.primaryLight, text: Colors.primaryDark };
      case 'amber':
        return { bg: Colors.amberBg, text: Colors.amber };
      case 'red':
        return { bg: Colors.crimsonBg, text: Colors.crimson };
      case 'blue':
        return { bg: Colors.blueBg, text: Colors.blue };
      case 'brass':
        return { bg: Colors.brassBg, text: Colors.brass };
      default:
        return { bg: Colors.surfaceMuted, text: Colors.inkSoft };
    }
  };

  const style = getStyles();

  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.text }]}>{label.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
