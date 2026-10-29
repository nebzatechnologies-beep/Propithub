import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { PropithubLogo } from '../components/PropithubLogo';

export const AccountPendingDeletionScreen: React.FC = () => {
  const { user, cancelAccountDeletion, logout } = useMobileAuth();
  const { isDark, colors } = useMobileTheme();
  const [isRestoring, setIsRestoring] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number }>({ hours: 72, minutes: 0 });

  // Calculate live remaining time
  useEffect(() => {
    const calcTime = () => {
      const scheduledStr = user?.scheduledPermanentDeletionAt;
      if (!scheduledStr) {
        setTimeLeft({ hours: 72, minutes: 0 });
        return;
      }
      const target = new Date(scheduledStr).getTime();
      const now = Date.now();
      const diffMs = target - now;
      if (diffMs <= 0) {
        setTimeLeft({ hours: 0, minutes: 0 });
      } else {
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        setTimeLeft({ hours, minutes });
      }
    };

    calcTime();
    const interval = setInterval(calcTime, 60000);
    return () => clearInterval(interval);
  }, [user?.scheduledPermanentDeletionAt]);

  const handleRestoreAccount = async () => {
    setIsRestoring(true);
    try {
      const res = await cancelAccountDeletion();
      setIsRestoring(false);
      if (res.success) {
        Alert.alert(
          'Account Restored ✓',
          'Your account deletion request has been cancelled. Your portfolio, access, and data have been fully restored.'
        );
      } else {
        Alert.alert('Restoration Failed', res.error || 'Failed to cancel deletion request. Please try again.');
      }
    } catch (err: any) {
      setIsRestoring(false);
      Alert.alert('Error', err?.message || 'An unexpected error occurred while restoring account.');
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.warn('Sign out error:', err);
    }
  };

  const formattedRequestDate = user?.deletionRequestedAt
    ? new Date(user.deletionRequestedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'recently';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? colors.background : '#F8FAFC'} />
      <View style={styles.contentWrap}>
        {/* Brand Header */}
        <View style={styles.header}>
          <PropithubLogo size={36} showText={true} />
        </View>

        {/* Main Alert Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FCA5A5' }]}>
          {/* Warning Icon Badge */}
          <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
            <Feather name="clock" size={28} color="#EF4444" />
          </View>

          <Text style={[styles.title, { color: colors.ink }]}>
            Account Deletion Scheduled
          </Text>

          {/* Countdown timer banner */}
          <View
            style={[
              styles.countdownBox,
              {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
                justifyContent: 'center',
                paddingVertical: 10,
              },
            ]}
          >
            <Feather name="clock" size={15} color="#D97706" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FBBF24' : '#B45309' }}>
              {timeLeft.hours}h {timeLeft.minutes}m remaining
            </Text>
          </View>

          <Text style={[styles.subtitle, { color: colors.inkSoft, marginTop: 4, marginBottom: 20 }]}>
            Your account will be deleted when the timer ends. Tap below to cancel and keep your account.
          </Text>

          {/* Action Button: Restore Account */}
          <TouchableOpacity
            style={[styles.restoreBtn, isRestoring && { opacity: 0.7 }]}
            onPress={handleRestoreAccount}
            disabled={isRestoring}
            activeOpacity={0.85}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="rotate-ccw" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.restoreBtnText}>Restore Account</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Action Button: Sign Out */}
          <TouchableOpacity
            style={[styles.signOutBtn, { borderColor: colors.line }]}
            onPress={handleSignOut}
            disabled={isRestoring}
            activeOpacity={0.85}
          >
            <Feather name="log-out" size={14} color={colors.inkSoft} style={{ marginRight: 6 }} />
            <Text style={[styles.signOutBtnText, { color: colors.inkSoft }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Footer help note */}
        <Text style={[styles.helpText, { color: colors.inkSoft }]}>
          Need help? Contact support at <Text style={{ color: '#10B981' }}>support@propithub.com</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    marginBottom: 10,
  },
  badgeText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  countdownBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoList: {
    width: '100%',
    paddingTop: 12,
    borderTopWidth: 1,
    marginBottom: 20,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  restoreBtn: {
    width: '100%',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  restoreBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  signOutBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  helpText: {
    fontSize: 12,
    marginTop: 20,
    textAlign: 'center',
  },
});
