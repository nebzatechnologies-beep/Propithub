import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { PropithubLogo, PropithubIcon } from './PropithubLogo';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  roleBadge?: string;
  userInitials?: string;
  onNotificationPress?: () => void;
  onProfilePress?: () => void;
  onCurrencyPress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Propithub',
  userInitials,
  onNotificationPress,
  onProfilePress,
}) => {
  const { user } = useMobileAuth();
  const { colors, isDark } = useMobileTheme();

  const dynamicInitials =
    userInitials ||
    (user?.displayName
      ? user.displayName
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'U');

  return (
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.line,
        },
      ]}
    >
      {/* Brand on Left */}
      <View style={styles.brandRow}>
        {title === 'Propithub' ? (
          <PropithubLogo size={26} showText={true} />
        ) : (
          <>
            <View
              style={[
                styles.brandBadge,
                isDark && {
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                },
              ]}
            >
              <PropithubIcon size={18} />
            </View>
            <Text style={[styles.brandTitle, { color: colors.ink }]} numberOfLines={1}>
              {title}
            </Text>
          </>
        )}
      </View>

      {/* Actions on Right: Bell & User Avatar */}
      <TourTarget id="topbar-actions" style={styles.rightActions}>
        <TouchableOpacity
          style={[styles.bellButton, { backgroundColor: colors.surfaceSunken }]}
          onPress={onNotificationPress}
          activeOpacity={0.7}
          accessibilityLabel="Notifications"
        >
          <Feather name="bell" size={17} color={colors.inkSoft} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.avatarButton}
          onPress={onProfilePress}
          activeOpacity={0.7}
          accessibilityLabel="User Profile"
        >
          <Text style={styles.avatarText}>{dynamicInitials}</Text>
        </TouchableOpacity>
      </TourTarget>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? 10 : 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  brandBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brandTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  bellButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
