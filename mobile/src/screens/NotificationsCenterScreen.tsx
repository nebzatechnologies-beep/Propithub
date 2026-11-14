import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileToast } from '../context/MobileToastContext';
import { useMobileTheme } from '../context/MobileThemeContext';

const resolveMobileScreenFromLink = (link: string, role?: string): string | null => {
  const clean = link.split('?')[0].toLowerCase();
  if (clean.includes('/tenant/payments')) return 'tenant_payments';
  if (clean.includes('/tenant/lease')) return 'tenant_lease';
  if (clean.includes('/tenant/support') || clean.includes('/tenant/maintenance')) return 'tenant_maintenance';
  if (clean.includes('/tenant/trust') || clean.includes('/tenant/reviews')) return 'tenant_landlord_reviews';
  if (clean.includes('/owner/payments')) return 'financial_ledger';
  if (clean.includes('/owner/leasing')) return 'leasing_hub';
  if (clean.includes('/owner/vacates')) return 'vacates_moveout';
  if (clean.includes('/owner/team')) return 'owner_team_managers';
  if (clean.includes('/owner/plan')) return 'owner_plan_subscription';
  if (clean.includes('/owner/maintenance') || clean.includes('/owner/support')) return 'owner_maintenance_dispatch';
  if (clean.includes('/owner/messages')) return 'owner_messages';
  if (clean.includes('/owner/disputes') || clean.includes('/owner/reviews')) return 'owner_disputes_reviews';
  if (clean.includes('/manager/leasing')) return 'manager_lease_documents';
  if (clean.includes('/manager/payments')) return 'financial_ledger';
  if (clean.includes('/manager/maintenance') || clean.includes('/manager/repairs')) return 'manager_repair_dispatch';
  if (clean.includes('/staff/queue')) return 'staff_job_queue';
  if (clean.includes('/staff/earnings') || clean.includes('/staff/payments')) return 'staff_earnings';
  if (clean.includes('/staff/ratings')) return 'staff_ratings';
  if (clean.includes('/account') || clean.includes('/settings')) return 'account_settings';
  if (role === 'tenant' && clean.includes('payment')) return 'tenant_payments';
  return null;
};

interface NotificationsCenterScreenProps {
  onBack?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const NotificationsCenterScreen: React.FC<NotificationsCenterScreenProps> = ({
  onBack,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const {
    state,
    markNotificationRead,
    markAllNotificationsRead,
    confirmCashClaim,
    rejectCashClaim,
  } = useMobileAppData();
  const { user, role } = useMobileAuth();
  const { showToast } = useMobileToast();
  const [filter, setFilter] = useState<'all' | 'bills' | 'repairs' | 'leases'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<{ notifId: string; claimId: string } | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [processingClaimId, setProcessingClaimId] = useState<string | null>(null);
  const userId = user?.id || '';

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const myNotifications = useMemo(() => {
    if (!userId) return [];
    return (state.notifications || []).filter(
      (n) =>
        n.userId === userId ||
        n.recipientId === userId ||
        (n as any).ownerId === userId
    );
  }, [state.notifications, userId]);

  const filteredNotifications = myNotifications.filter((n) => {
    if (filter === 'all') return true;
    return n.category === filter;
  });

  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  const handleConfirmClaim = async (notifId: string, cashClaimId: string) => {
    setProcessingClaimId(cashClaimId);
    try {
      await Promise.resolve(confirmCashClaim(cashClaimId));
      markNotificationRead(notifId);
      showToast('Cash handover confirmed ✓', 'success');
    } catch (err: any) {
      Alert.alert('Confirmation Error', err?.message || 'Could not confirm cash receipt.');
    } finally {
      setProcessingClaimId(null);
    }
  };

  const handleSubmitDecline = async () => {
    if (!declineTarget) return;
    const reason = declineReason.trim();
    if (!reason) {
      Alert.alert('Reason Required', 'Please state the reason for declining this cash claim.');
      return;
    }
    setProcessingClaimId(declineTarget.claimId);
    try {
      await Promise.resolve(rejectCashClaim(declineTarget.claimId, reason));
      markNotificationRead(declineTarget.notifId);
      setDeclineTarget(null);
      setDeclineReason('');
      showToast('Cash claim declined', 'info');
    } catch (err: any) {
      Alert.alert('Decline Error', err?.message || 'Could not decline cash claim.');
    } finally {
      setProcessingClaimId(null);
    }
  };

  const handleNotificationTap = (notif: any) => {
    markNotificationRead(notif.id);
    if (notif.link) {
      const targetScreen = resolveMobileScreenFromLink(String(notif.link), role);
      if (targetScreen && onNavigate) {
        onNavigate(targetScreen);
      }
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="bell" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.navy }]} numberOfLines={1}>Notifications</Text>
            <Text style={[styles.headerSub, { color: colors.inkSoft }]} numberOfLines={1}>
              {unreadCount > 0 ? `${unreadCount} Unread alerts` : 'All caught up'}
            </Text>
          </View>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}
            onPress={markAllNotificationsRead}
            activeOpacity={0.8}
          >
            <Text style={[styles.markAllBtnText, { color: colors.navy }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Category Filter Pills */}
        <View style={styles.filterRow}>
          {(['all', 'bills', 'repairs', 'leases'] as const).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterPill, { backgroundColor: colors.surface, borderColor: colors.line }, filter === cat && styles.filterPillActive]}
              onPress={() => setFilter(cat)}
            >
              <Text style={[styles.filterPillText, { color: colors.inkSoft }, filter === cat && styles.filterPillTextActive]}>
                {cat.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filteredNotifications.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Ionicons name="notifications-off-outline" size={44} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Notifications</Text>
            <Text style={[styles.emptySub, { color: colors.inkSoft }]}>You have no alerts in this category.</Text>
          </View>
        ) : (
          filteredNotifications.map((notif) => {
            const raw = notif as any;
            const showCashClaimActions =
              raw.type === 'cash_claim_confirmation_needed' &&
              Boolean(raw.cashClaimId) &&
              raw.actionable !== false;
            const isBusy = processingClaimId === raw.cashClaimId;

            return (
              <TouchableOpacity
                key={notif.id}
                style={[
                  styles.notifCard,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  !notif.isRead && [styles.notifCardUnread, isDark && { backgroundColor: '#10B98115' }],
                ]}
                onPress={() => handleNotificationTap(notif)}
                activeOpacity={0.85}
              >
                <View style={[styles.notifIconBox, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}>
                  <Ionicons
                    name={
                      notif.category === 'bills'
                        ? 'card-outline'
                        : notif.category === 'repairs'
                          ? 'construct-outline'
                          : notif.category === 'leases'
                            ? 'document-text-outline'
                            : 'information-circle-outline'
                    }
                    size={20}
                    color={!notif.isRead ? '#10B981' : colors.inkSoft}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                  <View style={styles.notifTop}>
                    <Text
                      style={[styles.notifTitle, { color: colors.navy, flex: 1, paddingRight: 8 }, !notif.isRead && styles.notifTitleBold]}
                      numberOfLines={2}
                    >
                      {notif.title}
                    </Text>
                    {!notif.isRead && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={[styles.notifBody, { color: colors.inkSoft }]}>{notif.body}</Text>

                  {showCashClaimActions && (
                    <View style={styles.claimActionsRow}>
                      <TouchableOpacity
                        style={[styles.confirmClaimBtn, isBusy && { opacity: 0.6 }]}
                        onPress={() => handleConfirmClaim(notif.id, raw.cashClaimId)}
                        disabled={isBusy}
                        activeOpacity={0.85}
                      >
                        <Feather name="check-circle" size={13} color="#FFFFFF" />
                        <Text style={styles.confirmClaimBtnText}>Confirm Receipt</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.declineClaimBtn, isBusy && { opacity: 0.6 }]}
                        onPress={() => {
                          setDeclineTarget({ notifId: notif.id, claimId: raw.cashClaimId });
                          setDeclineReason('');
                        }}
                        disabled={isBusy}
                        activeOpacity={0.85}
                      >
                        <Feather name="x-circle" size={13} color="#DC2626" />
                        <Text style={styles.declineClaimBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={[styles.notifTime, { color: colors.inkSoft }]}>{notif.createdAt.split('T')[0]}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Decline Cash Claim Reason Modal */}
      <Modal
        visible={Boolean(declineTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclineTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={Platform.OS !== 'web'}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.modalTitle, { color: colors.navy }]}>Decline Cash Receipt</Text>
            <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
              Please state the reason for declining this cash claim (e.g. cash not received or incorrect amount).
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.surfaceSunken,
                  borderColor: colors.line,
                  color: colors.navy,
                },
              ]}
              value={declineReason}
              onChangeText={setDeclineReason}
              placeholder="Enter reason..."
              placeholderTextColor={colors.inkMuted}
              multiline
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.line, backgroundColor: colors.surfaceSunken }]}
                onPress={() => setDeclineTarget(null)}
              >
                <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeclineBtn, processingClaimId ? { opacity: 0.6 } : null]}
                onPress={handleSubmitDecline}
                disabled={Boolean(processingClaimId)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Decline Claim</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      marginRight: 8,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    logoBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    headerSub: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    markAllBtn: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    markAllBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.navy,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    filterPillActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    filterPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    filterPillTextActive: {
      color: '#FFFFFF',
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 40,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      marginTop: 20,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 10,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 4,
    },
    notifCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 10,
    },
    notifCardUnread: {
      borderLeftWidth: 4,
      borderLeftColor: '#10B981',
      backgroundColor: '#FAFCFF',
    },
    notifIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    notifTitle: {
      fontSize: 13,
      color: colors.navy,
    },
    notifTitleBold: {
      fontWeight: '700',
      color: colors.navy,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#10B981',
    },
    notifBody: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
      lineHeight: 16,
    },
    notifTime: {
      fontSize: 10,
      color: colors.inkMuted,
      marginTop: 4,
    },
    claimActionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    confirmClaimBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#16A34A',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    confirmClaimBtnText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    declineClaimBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: '#DC2626',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    declineClaimBtnText: {
      color: '#DC2626',
      fontSize: 11.5,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 14,
      borderWidth: 1,
      padding: 18,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 6,
    },
    modalSub: {
      fontSize: 12.5,
      lineHeight: 18,
      marginBottom: 12,
    },
    modalInput: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      minHeight: 72,
      textAlignVertical: 'top',
      fontSize: 13,
      marginBottom: 14,
    },
    modalBtnRow: {
      flexDirection: 'row',
      gap: 10,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
    },
    modalDeclineBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: '#DC2626',
      alignItems: 'center',
    },
  });
