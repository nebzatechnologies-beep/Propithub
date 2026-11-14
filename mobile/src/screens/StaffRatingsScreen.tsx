import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';

interface StaffRatingsScreenProps {
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
}

export const StaffRatingsScreen: React.FC<StaffRatingsScreenProps> = ({
  onProfilePress,
  onNotificationsPress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state } = useMobileAppData();
  const { user } = useMobileAuth();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const currentStaff = useMemo(
    () =>
      state.staff.find((s) => s.id === user.id) ||
      (user.email
        ? state.staff.find((s) => s.email?.toLowerCase() === user.email?.toLowerCase())
        : undefined) ||
      (user.displayName
        ? state.staff.find((s) => s.name.toLowerCase() === user.displayName?.toLowerCase())
        : undefined),
    [state.staff, user]
  );

  // Filter resolved tickets assigned to this staff member
  const resolvedTickets = useMemo(
    () =>
      state.tickets.filter(
        (t) =>
          t.status === 'resolved' &&
          (t.assignedStaffId === user.id ||
            (currentStaff?.id && t.assignedStaffId === currentStaff.id) ||
            (user.displayName &&
              t.assignedStaffName?.toLowerCase().includes(user.displayName.toLowerCase())))
      ),
    [state.tickets, user, currentStaff?.id]
  );

  const ratedTickets = useMemo(
    () => resolvedTickets.filter((t) => t.rating && t.rating > 0),
    [resolvedTickets]
  );

  const averageScore = useMemo(() => {
    if (ratedTickets.length > 0) {
      return (
        ratedTickets.reduce((acc, t) => acc + (t.rating || 5), 0) / ratedTickets.length
      ).toFixed(1);
    }
    if (currentStaff?.rating) {
      return currentStaff.rating.toFixed(1);
    }
    return resolvedTickets.length > 0 ? '5.0' : '—';
  }, [ratedTickets, currentStaff, resolvedTickets.length]);

  const unreadNotificationsCount = useMemo(
    () => (state.notifications || []).filter((n) => !n.isRead).length,
    [state.notifications]
  );

  const initials = useMemo(() => {
    if (user.displayName) {
      return user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    return user.email ? user.email.slice(0, 2).toUpperCase() : 'ST';
  }, [user.displayName, user.email]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScreenStatusBar />

      {/* Minimal Top App Bar (.topbar) */}
      <View style={[styles.topbar, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.topbarLeft}>
          <View
            style={[
              styles.brandMark,
              isDark && {
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderColor: 'rgba(16, 185, 129, 0.3)',
              },
            ]}
          >
            <PropithubIcon size={18} />
          </View>
          <Text style={[styles.topbarTitle, { color: colors.navy }]}>Ratings</Text>
        </View>

        <View style={styles.topbarRight}>
          <TouchableOpacity
            style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.surface }]}
            onPress={onNotificationsPress || onProfilePress}
            activeOpacity={0.75}
          >
            <Feather name="bell" size={18} color={colors.navy} />
            {unreadNotificationsCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.avatarBtn,
              {
                backgroundColor: isDark ? '#0F2920' : '#E6F4EE',
                borderColor: isDark ? '#065F46' : '#A7F3D0',
              },
            ]}
            onPress={onProfilePress}
            activeOpacity={0.8}
          >
            <Text style={[styles.avatarBtnText, { color: isDark ? '#34D399' : '#059669' }]}>
              {initials}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={Platform.OS !== 'web'}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* 2-Column KPI Row (.stats2 from Propithub Role Simulator.html) */}
        <TourTarget id="staff-ratings-hero">
          <View style={styles.stats2Row}>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={[styles.statLabel, { color: colors.inkSoft }]}>Average</Text>
              <Text style={[styles.statBigValue, { color: colors.navy }]}>
                {averageScore === '—' ? '—' : `${averageScore} / 5`}
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={[styles.statLabel, { color: colors.inkSoft }]}>Ratings</Text>
              <Text style={[styles.statBigValue, { color: colors.navy }]}>
                {resolvedTickets.length}
              </Text>
            </View>
          </View>
        </TourTarget>

        {/* Minimal Rating List Cards (.tblw tr style from Propithub Role Simulator.html) */}
        {resolvedTickets.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
              No ratings yet.
            </Text>
          </View>
        ) : (
          resolvedTickets.map((t) => {
            const starsCount = Math.min(5, Math.max(1, Math.round(t.rating || 5)));
            const starsStr = '★'.repeat(starsCount) + '☆'.repeat(5 - starsCount);

            return (
              <View
                key={t.id}
                style={[styles.ratingCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
              >
                {/* Header Row: Ticket + Unit on left, Stars on right */}
                <View style={[styles.ratingCardHeader, { borderBottomColor: colors.line }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.ticketIdText, { color: colors.navy }]}>
                      #{t.id} · Unit {t.unit}
                    </Text>
                    <Text style={[styles.ticketIssueSub, { color: colors.inkSoft }]} numberOfLines={1}>
                      {t.issue}
                    </Text>
                  </View>

                  <Text style={styles.starsText}>{starsStr}</Text>
                </View>

                {/* 2-Column Grid Cells (RATED BY | COMMENT) */}
                <View style={styles.gridRow}>
                  <View style={styles.gridCell}>
                    <Text style={[styles.cellLabel, { color: colors.inkSoft }]}>RATED BY</Text>
                    <Text style={[styles.cellValue, { color: colors.navy }]}>
                      {t.tenant || 'Resident'}
                    </Text>
                  </View>

                  <View style={[styles.gridCell, { flex: 1.4 }]}>
                    <Text style={[styles.cellLabel, { color: colors.inkSoft }]}>COMMENT</Text>
                    <Text style={[styles.cellValueSoft, { color: colors.inkSoft }]}>
                      {t.residentFeedback || t.completionNotes || 'Completed'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topbar: {
      height: 56,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      borderBottomWidth: 1,
    },
    topbarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    brandMark: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    topbarTitle: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    topbarRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellBadge: {
      position: 'absolute',
      top: -3,
      right: -3,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#EF4444',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    bellBadgeText: {
      color: '#FFFFFF',
      fontSize: 9.5,
      fontWeight: '700',
    },
    avatarBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarBtnText: {
      fontSize: 12,
      fontWeight: '800',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 36,
      gap: 12,
    },
    stats2Row: {
      flexDirection: 'row',
      gap: 10,
    },
    statCard: {
      flex: 1,
      minWidth: 0,
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
    },
    statLabel: {
      fontSize: 12.5,
      fontWeight: '600',
    },
    statBigValue: {
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.5,
      marginTop: 4,
    },
    emptyCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: 13.5,
      textAlign: 'center',
    },
    ratingCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 15,
      gap: 12,
    },
    ratingCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingBottom: 10,
      borderBottomWidth: 1,
    },
    ticketIdText: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    ticketIssueSub: {
      fontSize: 12.5,
      marginTop: 2,
    },
    starsText: {
      fontSize: 15,
      color: '#D97706',
      letterSpacing: 1,
    },
    gridRow: {
      flexDirection: 'row',
      gap: 12,
    },
    gridCell: {
      flex: 1,
      gap: 2,
    },
    cellLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    cellValue: {
      fontSize: 14,
      fontWeight: '600',
    },
    cellValueSoft: {
      fontSize: 13.5,
      lineHeight: 19,
    },
  });
