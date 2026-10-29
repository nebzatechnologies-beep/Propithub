import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useMobileTheme } from '../context/MobileThemeContext';

interface KPICardProps {
  label: string;
  value: string;
  subtext?: string;
  accent?: 'primary' | 'amber' | 'blue' | 'crimson' | 'navy';
}

export const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  subtext,
  accent = 'primary',
}) => {
  const { colors } = useMobileTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.inkSoft }]}>{label.toUpperCase()}</Text>
      <Text
        style={[
          styles.value,
          {
            color: accent === 'primary' ? colors.navy : (colors as any)[accent] || colors.navy,
          },
        ]}
      >
        {value}
      </Text>
      {subtext && <Text style={[styles.subtext, { color: colors.inkSoft }]}>{subtext}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    flex: 1,
  },
  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  subtext: {
    fontSize: 10,
    marginTop: 4,
  },
});
