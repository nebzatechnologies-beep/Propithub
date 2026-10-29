import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { MobileTicket } from '../types';

export const StaffTaskPaymentsScreen: React.FC = () => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, updateTicket, sendStaffPaymentReminder } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();

  const [remindedTickets, setRemindedTickets] = useState<Record<string, boolean>>({});
  const [settlingTicketId, setSettlingTicketId] = useState<string | null>(null);

  // Match tickets by assignedStaffId (UID)
  const myTickets = state.tickets.filter(
    (t) =>
      t.payment &&
      t.payment.status !== 'none' &&
      (t.assignedStaffId === user.id ||
        (user.displayName && t.assignedStaffName?.toLowerCase().includes(user.displayName.toLowerCase())))
  );

  const confirmedEarnings = myTickets
    .filter((t) => t.payment?.status === 'confirmed')
    .reduce((sum, t) => sum + (t.payment?.amount || 0), 0);

  const pendingConfirmAmount = myTickets
    .filter((t) => t.payment?.status === 'pending_approval')
    .reduce((sum, t) => sum + (t.payment?.amount || 0), 0);

  const awaitingPaymentAmount = myTickets
    .filter((t) => t.payment?.status === 'awaiting_payment')
    .reduce((sum, t) => sum + (t.payment?.amount || 0), 0);

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
    Alert.alert('Payment Settled ✓', `Task fee for ticket #${ticketId} marked as completed & settled.`);
  };

  const handleSendPaymentReminder = (ticket: MobileTicket) => {
    sendStaffPaymentReminder(ticket.id);
    setRemindedTickets((prev) => ({ ...prev, [ticket.id]: true }));
    Alert.alert('Reminder Sent 📨', `Payment reminder sent to ${ticket.payment?.payer || 'payer'} for Ticket #${ticket.id}.`);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="credit-card" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Earnings</Text>
          </View>
        </View>
        <View style={styles.earnedBadge}>
          <Text style={styles.earnedBadgeText}>
            {format(confirmedEarnings, viewCurrency)} Settled
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Web Metric Cards Grid (3 Cards) */}
        <TourTarget id="staff-earnings-grid">
        <View style={styles.metricsContainer}>
          {/* Card 1: Settled Fees */}
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line, borderLeftColor: '#10B981' }]}>
            <Text style={[styles.statNum, { color: '#047857' }]}>
              {format(confirmedEarnings, viewCurrency)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.navy }]}>Settled Fees</Text>
            <Text style={[styles.statDelta, { color: colors.inkSoft }]}>Received & verified</Text>
          </View>

          {/* Card 2: Awaiting My Confirmation */}
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line, borderLeftColor: '#F59E0B' }]}>
            <Text style={[styles.statNum, { color: '#B45309' }]}>
              {format(pendingConfirmAmount, viewCurrency)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.navy }]}>Pending Confirmation</Text>
            <Text style={[styles.statDelta, { color: colors.inkSoft }]}>Payer submitted payment</Text>
          </View>

          {/* Card 3: Awaiting Payment */}
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line, borderLeftColor: '#64748B' }]}>
            <Text style={[styles.statNum, { color: colors.navy }]}>
              {format(awaitingPaymentAmount, viewCurrency)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.navy }]}>Pending Payment</Text>
            <Text style={[styles.statDelta, { color: colors.inkSoft }]}>Work completed, invoice open</Text>
          </View>
        </View>

        </TourTarget>

        {/* Section Heading: Task Payment Records */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.navy }]}>
            Payment Records ({myTickets.length})
          </Text>
        </View>

        {myTickets.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Ionicons name="receipt-outline" size={48} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Task Payments</Text>
            <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
              Completed repair tickets with assigned fee charges will appear here.
            </Text>
          </View>
        ) : (
          myTickets.map((t) => {
            const isConfirmed = t.payment?.status === 'confirmed';
            const isPendingApproval = t.payment?.status === 'pending_approval';
            const isAwaiting = t.payment?.status === 'awaiting_payment';
            const isReminded = remindedTickets[t.id];

            return (
              <View key={t.id} style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.ticketIdText, { color: colors.navy }]}>#{t.id}</Text>
                    <View style={[styles.payerBadge, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}>
                      <Text style={[styles.payerBadgeText, { color: colors.inkSoft }]}>
                        Payer: {t.payment?.payer || 'Owner'}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      isConfirmed && styles.statusBadgeGreen,
                      isPendingApproval && styles.statusBadgeBrass,
                      isAwaiting && styles.statusBadgeAmber,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isConfirmed && styles.statusBadgeTextGreen,
                        isPendingApproval && styles.statusBadgeTextBrass,
                        isAwaiting && styles.statusBadgeTextAmber,
                      ]}
                    >
                      {isConfirmed
                        ? 'Settled'
                        : isPendingApproval
                        ? 'Action Needed'
                        : 'Unpaid'}
                    </Text>
                  </View>
                </View>

                {/* Amount & Method Row */}
                <View style={[styles.amountRow, { borderColor: colors.line }]}>
                  <View>
                    <Text style={[styles.feeLabel, { color: colors.inkSoft }]}>TASK FEE</Text>
                    <Text
                      style={[
                        styles.feeAmount,
                        { color: colors.navy },
                        isConfirmed && { color: '#059669' },
                      ]}
                    >
                      {format(t.payment?.amount || 0, viewCurrency)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.methodLabel, { color: colors.inkSoft }]}>METHOD</Text>
                    <Text style={[styles.methodValue, { color: colors.navy }]}>
                      {t.payment?.method || 'Standard'}
                    </Text>
                  </View>
                </View>

                <View style={styles.ticketDetailRow}>
                  <Text style={[styles.ticketIssueText, { color: colors.inkSoft }]} numberOfLines={1}>
                    Unit {t.unit} • {t.issue}
                  </Text>
                </View>

                {/* Card Action Footer */}
                <View style={[styles.cardFooter, { borderTopColor: colors.line }]}>
                  {isConfirmed ? (
                    <View style={styles.confirmedRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                      <Text style={styles.confirmedText}>Completed & Settled</Text>
                    </View>
                  ) : (
                    <View style={styles.actionButtonsCol}>
                      <TouchableOpacity
                        style={styles.markCompletedBtn}
                        onPress={() => handleMarkPaymentCompleted(t.id)}
                        activeOpacity={0.85}
                        disabled={settlingTicketId === t.id}
                      >
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.markCompletedBtnText}>
                          {settlingTicketId === t.id ? 'Settling...' : '✓ Mark as Completed & Settled'}
                        </Text>
                      </TouchableOpacity>

                      {isAwaiting && (
                        <TouchableOpacity
                          style={[
                            styles.reminderBtn,
                            isReminded && styles.reminderBtnDisabled,
                          ]}
                          onPress={() => handleSendPaymentReminder(t)}
                          activeOpacity={0.85}
                          disabled={isReminded}
                        >
                          <Ionicons
                            name="mail-outline"
                            size={15}
                            color={isReminded ? '#94A3B8' : '#B45309'}
                            style={{ marginRight: 6 }}
                          />
                          <Text
                            style={[
                              styles.reminderBtnText,
                              isReminded && styles.reminderBtnTextDisabled,
                            ]}
                          >
                            {isReminded ? 'Reminder Sent' : 'Send Reminder'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  statusTime: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
  },
  headerSub: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  earnedBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  earnedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  metricsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
  },
  statNum: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
    marginTop: 4,
  },
  statDelta: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketIdText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  payerBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  payerBadgeText: {
    fontSize: 11,
    color: colors.inkSoft,
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgeBrass: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeAmber: {
    backgroundColor: '#FFFBEB',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextGreen: {
    color: '#059669',
  },
  statusBadgeTextBrass: {
    color: '#D97706',
  },
  statusBadgeTextAmber: {
    color: '#B45309',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginVertical: 4,
  },
  feeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkMuted,
    letterSpacing: 0.5,
  },
  feeAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 2,
  },
  methodLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkMuted,
    letterSpacing: 0.5,
  },
  methodValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
    marginTop: 2,
  },
  ticketDetailRow: {
    paddingVertical: 8,
  },
  ticketIssueText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  cardFooter: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  confirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  actionButtonsCol: {
    gap: 8,
  },
  markCompletedBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  markCompletedBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reminderBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  reminderBtnDisabled: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderColor: colors.line,
  },
  reminderBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
  },
  reminderBtnTextDisabled: {
    color: colors.inkMuted,
  },
});

export const StaffEarningsScreen = StaffTaskPaymentsScreen;
