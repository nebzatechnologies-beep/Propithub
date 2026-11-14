import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import {
  DEFAULT_CURRENCY_SYMBOL,
  getCurrencySymbol,
  normalizeCurrencyCode,
} from '../lib/currencyService';
import { MobileTicket } from '../types';

interface StaffTaskPaymentsScreenProps {
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
}

export const StaffTaskPaymentsScreen: React.FC<StaffTaskPaymentsScreenProps> = ({
  onProfilePress,
  onNotificationsPress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, updateTicket, sendStaffPaymentReminder } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, convert, viewCurrency } = useMobileCurrency();
  const activeCurrencyCode = viewCurrency || 'USD';

  const [remindedTickets, setRemindedTickets] = useState<Record<string, boolean>>({});
  const [settlingTicketId, setSettlingTicketId] = useState<string | null>(null);
  const [remindingTicketId, setRemindingTicketId] = useState<string | null>(null);
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

  // Match tickets by assignedStaffId (UID) matching Web TaskPaymentsPage.tsx
  const myTickets = useMemo(
    () =>
      state.tickets.filter(
        (t) =>
          t.payment &&
          t.payment.status !== 'none' &&
          (t.assignedStaffId === user.id ||
            (currentStaff?.id && t.assignedStaffId === currentStaff.id))
      ),
    [state.tickets, user.id, currentStaff?.id]
  );

  const staffProperty = useMemo(
    () =>
      state.properties.find(
        (p) =>
          (currentStaff?.ownerId && p.ownerId === currentStaff.ownerId) ||
          myTickets.some((t) => t.propertyId === p.id)
      ),
    [state.properties, currentStaff?.ownerId, myTickets]
  );
  const staffRawCurrency = staffProperty?.currency || (myTickets[0] as any)?.currency || 'USD';
  const staffCurrency = getCurrencySymbol(staffRawCurrency) || DEFAULT_CURRENCY_SYMBOL;

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

  const handleMarkPaymentCompleted = (ticketId: string) => {
    const target = state.tickets.find((t) => t.id === ticketId);
    if (!target || !target.payment) return;

    setSettlingTicketId(ticketId);
    updateTicket(ticketId, {
      payment: {
        ...target.payment,
        status: 'confirmed',
      },
    });
    setSettlingTicketId(null);
    Alert.alert(
      'Payment Settled ✓',
      `Task fee for ticket ${ticketId} marked as completed & settled.`
    );
  };

  const handleSendPaymentReminder = (ticket: MobileTicket) => {
    setRemindingTicketId(ticket.id);
    sendStaffPaymentReminder(ticket.id);
    setRemindedTickets((prev) => ({ ...prev, [ticket.id]: true }));
    setRemindingTicketId(null);
    Alert.alert(
      'Reminder Sent',
      `Payment reminder sent to ${ticket.payment?.payer || 'payer'} for Ticket ${ticket.id}.`
    );
  };

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
          <Text style={[styles.topbarTitle, { color: colors.navy }]}>Task payments</Text>
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
        {/* Section Title (1-to-1 with Web TaskPaymentsPage.tsx) */}
        <TourTarget id="staff-earnings-grid">
          <Text style={[styles.sectionTitle, { color: colors.navy }]}>
            Task Payment Records ({myTickets.length})
          </Text>
        </TourTarget>

        {myTickets.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
              No task payments recorded yet.
            </Text>
          </View>
        ) : (
          myTickets.map((t) => {
            const isConfirmed = t.payment?.status === 'confirmed';
            const isPendingApproval = t.payment?.status === 'pending_approval';
            const isReminded = remindedTickets[t.id];

            const unitCurr =
              state.units.find((u) => u.unitNumber === t.unit || u.id === t.unit)?.currency ||
              (t as any).currency ||
              staffRawCurrency;
            const ticketDisplayCurr = getCurrencySymbol(unitCurr) || staffCurrency;
            const isDifferent =
              normalizeCurrencyCode(unitCurr) !== normalizeCurrencyCode(activeCurrencyCode);
            const convertedAmt = isDifferent
              ? convert(t.payment?.amount || 0, unitCurr, activeCurrencyCode)
              : null;

            return (
              <View
                key={t.id}
                style={[styles.feeCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
              >
                {/* Header Row: Ticket ID + Payer Badge on left, Status Badge on right */}
                <View style={styles.feeCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0, flexWrap: 'wrap' }}>
                    <Text style={[styles.feeTicketTitle, { color: colors.navy }]}>{t.id}</Text>
                    <View
                      style={[
                        styles.payerBadge,
                        { backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9' },
                      ]}
                    >
                      <Text style={[styles.payerBadgeText, { color: colors.inkSoft }]}>
                        Payer:{' '}
                        {t.payment?.payer
                          ? t.payment.payer.charAt(0).toUpperCase() + t.payment.payer.slice(1)
                          : 'Owner'}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      { flexShrink: 0 },
                      isConfirmed
                        ? { backgroundColor: isDark ? '#0F2E1D' : '#E6F4EA' }
                        : isPendingApproval
                        ? { backgroundColor: isDark ? '#0F2920' : '#E6F4EE' }
                        : { backgroundColor: isDark ? '#332510' : '#FEF3DC' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isConfirmed
                          ? { color: isDark ? '#6DD58C' : '#137333' }
                          : isPendingApproval
                          ? { color: isDark ? '#34D399' : '#059669' }
                          : { color: isDark ? '#F5B955' : '#9A5B00' },
                      ]}
                    >
                      {isConfirmed ? 'Settled' : isPendingApproval ? 'Action Needed' : 'Unpaid'}
                    </Text>
                  </View>
                </View>

                {/* Amount & Method Row (1-to-1 with Web Mobile Payment Cards) */}
                <View style={styles.amountMethodRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                    <Text
                      style={[
                        styles.amountText,
                        { color: isConfirmed ? '#059669' : colors.navy },
                      ]}
                    >
                      {ticketDisplayCurr}
                      {(t.payment?.amount || 0).toLocaleString()}
                    </Text>
                    {convertedAmt !== null && (
                      <Text style={[styles.convertedText, { color: colors.inkSoft }]}>
                        ({format(convertedAmt, activeCurrencyCode)})
                      </Text>
                    )}
                  </View>

                  <Text style={[styles.methodText, { color: colors.inkSoft }]}>
                    Method:{' '}
                    <Text style={{ color: colors.navy, fontWeight: '700' }}>
                      {t.payment?.method || 'Standard'}
                    </Text>
                  </Text>
                </View>

                {/* Action Footer (1-to-1 with Web) */}
                <View style={[styles.actionFooter, { borderTopColor: colors.line }]}>
                  {isConfirmed ? (
                    <View style={styles.settledInlineRow}>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                      <Text style={styles.settledInlineText}>Completed & Settled</Text>
                    </View>
                  ) : isPendingApproval ? (
                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={() => handleMarkPaymentCompleted(t.id)}
                      activeOpacity={0.85}
                      disabled={settlingTicketId === t.id}
                    >
                      <Text style={styles.confirmBtnText}>
                        {settlingTicketId === t.id ? 'Settling...' : '✓ Confirm receipt'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.remindBtn,
                        {
                          borderColor: colors.line,
                          backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
                        },
                        (isReminded || remindingTicketId === t.id) && { opacity: 0.55 },
                      ]}
                      onPress={() => handleSendPaymentReminder(t)}
                      activeOpacity={0.8}
                      disabled={isReminded || remindingTicketId === t.id}
                    >
                      <Text style={[styles.remindBtnText, { color: colors.navy }]}>
                        {remindingTicketId === t.id
                          ? 'Sending...'
                          : isReminded
                          ? 'Reminder sent'
                          : 'Send Payment Reminder'}
                      </Text>
                    </TouchableOpacity>
                  )}
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
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
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
    },
    feeCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      gap: 12,
    },
    feeCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    feeTicketTitle: {
      fontSize: 12.5,
      fontWeight: '700',
    },
    payerBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: 999,
    },
    payerBadgeText: {
      fontSize: 10.5,
      fontWeight: '600',
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    statusPillText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    amountMethodRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 6,
    },
    amountText: {
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    convertedText: {
      fontSize: 13,
      fontWeight: '500',
    },
    methodText: {
      fontSize: 12.5,
    },
    actionFooter: {
      paddingTop: 10,
      borderTopWidth: 1,
    },
    settledInlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    settledInlineText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#059669',
    },
    confirmBtn: {
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: '#059669',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    confirmBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    remindBtn: {
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    remindBtnText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
