import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { MobilePlatformSupportTicket } from '../types';
import { useMobileTheme } from '../context/MobileThemeContext';

type SupportTicketWithMeta = MobilePlatformSupportTicket & {
  repliedAt?: string;
  resolutionNotes?: string;
  resolvedBy?: string;
};

interface OwnerHelpdeskScreenProps {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const OwnerHelpdeskScreen: React.FC<OwnerHelpdeskScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { user } = useMobileAuth();
  const { state, createPlatformSupportTicket, resolvePlatformSupportTicket } = useMobileAppData();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'waiting_on_us' | 'resolved'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketWithMeta | null>(null);
  const [resolvingTicket, setResolvingTicket] = useState<SupportTicketWithMeta | null>(null);
  const [closingNotes, setClosingNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Form State
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<MobilePlatformSupportTicket['category']>('technical');
  const [priority, setPriority] = useState<MobilePlatformSupportTicket['priority']>('medium');
  const [detail, setDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const CATEGORY_CONFIG: Record<
    'technical' | 'billing' | 'subscription' | 'leasing' | 'feature_request' | 'general',
    {
      label: string;
      sub: string;
      icon: 'tool' | 'credit-card' | 'zap' | 'file-text' | 'star' | 'help-circle';
      color: string;
      bg: string;
    }
  > = {
    technical: {
      label: 'Technical Support',
      sub: 'Platform bugs, errors & system issues',
      icon: 'tool',
      color: isDark ? '#38BDF8' : '#0284C7',
      bg: isDark ? 'rgba(2, 132, 199, 0.18)' : '#E0F2FE',
    },
    billing: {
      label: 'Billing & Escrow',
      sub: 'Invoices, rent payouts, escrow & fees',
      icon: 'credit-card',
      color: isDark ? '#34D399' : '#059669',
      bg: isDark ? 'rgba(5, 150, 105, 0.18)' : '#D1FAE5',
    },
    subscription: {
      label: 'Subscription & Plans',
      sub: 'Tier upgrades, limits & renewals',
      icon: 'zap',
      color: isDark ? '#A78BFA' : '#7C3AED',
      bg: isDark ? 'rgba(124, 58, 237, 0.18)' : '#EDE9FE',
    },
    leasing: {
      label: 'Leasing & Agreements',
      sub: 'Tenant contracts, e-signatures & docs',
      icon: 'file-text',
      color: isDark ? '#FBBF24' : '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7',
    },
    feature_request: {
      label: 'Feature Request',
      sub: 'Product ideas & workflow suggestions',
      icon: 'star',
      color: isDark ? '#FB923C' : '#EA580C',
      bg: isDark ? 'rgba(234, 88, 12, 0.18)' : '#FFEDD5',
    },
    general: {
      label: 'General Inquiry',
      sub: 'Platform onboarding & miscellaneous',
      icon: 'help-circle',
      color: isDark ? '#94A3B8' : '#64748B',
      bg: isDark ? 'rgba(100, 116, 139, 0.18)' : '#F1F5F9',
    },
  };

  const PRIORITY_CONFIG: Record<
    'low' | 'medium' | 'high' | 'urgent',
    {
      label: string;
      sub: string;
      color: string;
      bg: string;
      icon: 'check-circle' | 'clock' | 'alert-circle' | 'alert-triangle';
    }
  > = {
    low: {
      label: 'Low',
      sub: 'Routine inquiry • Handled within 48h',
      color: isDark ? '#60A5FA' : '#3B82F6',
      bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
      icon: 'check-circle',
    },
    medium: {
      label: 'Medium',
      sub: 'Standard response • Handled within 24h',
      color: isDark ? '#FBBF24' : '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7',
      icon: 'clock',
    },
    high: {
      label: 'High',
      sub: 'Urgent issue • Escalated response',
      color: isDark ? '#FB923C' : '#C2410C',
      bg: isDark ? 'rgba(234, 88, 12, 0.18)' : '#FFEDD5',
      icon: 'alert-circle',
    },
    urgent: {
      label: 'Urgent',
      sub: 'Critical blocker • Immediate attention',
      color: isDark ? '#F87171' : '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
      icon: 'alert-triangle',
    },
  };

  // Tickets strictly scoped to this authenticated owner & sorted newest first
  const myTickets = useMemo<SupportTicketWithMeta[]>(() => {
    const ownerId = user?.id || '';
    const ownerEmail = (user?.email || '').toLowerCase();
    if (!ownerId && !ownerEmail) return [];

    return ((state.platformSupport || []) as SupportTicketWithMeta[])
      .filter((sup) => {
        const matchOwnerId = Boolean(ownerId && sup.ownerId === ownerId);
        const matchEmail = Boolean(ownerEmail && sup.ownerEmail?.toLowerCase() === ownerEmail);
        return matchOwnerId || matchEmail;
      })
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [state.platformSupport, user]);

  // Metrics Summary (1-to-1 Web Parity)
  const stats = useMemo(() => {
    return {
      total: myTickets.length,
      open: myTickets.filter((t) => t.status === 'open').length,
      replied: myTickets.filter((t) => t.status === 'waiting_on_us' || (Boolean(t.reply) && t.status !== 'resolved')).length,
      resolved: myTickets.filter((t) => t.status === 'resolved').length,
    };
  }, [myTickets]);

  const filteredTickets = useMemo(() => {
    return myTickets.filter((t) => {
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'open'
          ? t.status === 'open'
          : statusFilter === 'waiting_on_us'
          ? t.status === 'waiting_on_us' || (Boolean(t.reply) && t.status !== 'resolved')
          : t.status === 'resolved';

      if (!matchStatus) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          t.id.toLowerCase().includes(q) ||
          t.topic.toLowerCase().includes(q) ||
          (t.detail && t.detail.toLowerCase().includes(q)) ||
          (t.reply && t.reply.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [myTickets, statusFilter, searchTerm]);

  const handleCreateTicket = async () => {
    if (!topic.trim() || !detail.trim()) {
      Alert.alert('Required Fields', 'Please enter a ticket subject and details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createPlatformSupportTicket({
        owner: user?.displayName || 'Property Owner',
        ownerId: user?.id,
        ownerEmail: user?.email,
        topic: topic.trim(),
        detail: detail.trim(),
        category,
        priority,
      });

      setShowCreateModal(false);
      setIsCategoryDropdownOpen(false);
      setIsPriorityDropdownOpen(false);
      setTopic('');
      setDetail('');
      setCategory('technical');
      setPriority('medium');
      Alert.alert('Ticket Submitted ✓', 'Our engineering & billing desk has received your ticket.');
    } catch (err) {
      Alert.alert('Submission Error', 'Could not create support ticket. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResolveModal = (ticket: SupportTicketWithMeta) => {
    setSelectedTicket(null);
    setClosingNotes('');
    setResolvingTicket(ticket);
  };

  const handleConfirmResolveTicket = async () => {
    if (!resolvingTicket || isResolving) return;
    setIsResolving(true);
    try {
      const notes = closingNotes.trim();
      await resolvePlatformSupportTicket(resolvingTicket.id, notes || undefined);
      setResolvingTicket(null);
      setClosingNotes('');
      Alert.alert('Ticket Closed ✓', 'This support ticket has been marked as resolved.');
    } catch (err) {
      Alert.alert('Error', 'Failed to resolve ticket. Please try again.');
    } finally {
      setIsResolving(false);
    }
  };

  const getTicketStatusMeta = (t: SupportTicketWithMeta) => {
    if (t.status === 'resolved') {
      return {
        label: 'RESOLVED',
        bg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5',
        color: isDark ? '#34D399' : '#047857',
      };
    }
    if (t.status === 'waiting_on_us' || Boolean(t.reply)) {
      return {
        label: 'ADMIN REPLIED',
        bg: isDark ? 'rgba(37, 99, 235, 0.18)' : '#DBEAFE',
        color: isDark ? '#60A5FA' : '#1D4ED8',
      };
    }
    return {
      label: 'IN REVIEW',
      bg: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7',
      color: isDark ? '#FBBF24' : '#B45309',
    };
  };

  const currentCat = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.technical;
  const currentPri = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <ScreenContainer
      scrollable
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.content}
      header={
        <>
          <ScreenStatusBar />
          <Header
            title="Helpdesk"
            onNotificationPress={() => onNavigate?.('notifications_center')}
            onProfilePress={onProfilePress}
          />
        </>
      }
    >
      {/* Real-Time Metrics Summary Strip (1-to-1 Web Parity) */}
      <View style={[styles.metricsSummaryRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Total</Text>
          <Text style={[styles.metricVal, { color: colors.navy }]}>{stats.total}</Text>
        </View>
        <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Open</Text>
          <Text style={[styles.metricVal, { color: isDark ? '#60A5FA' : '#2563EB' }]}>{stats.open}</Text>
        </View>
        <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Replied</Text>
          <Text style={[styles.metricVal, { color: isDark ? '#FBBF24' : '#D97706' }]}>{stats.replied}</Text>
        </View>
        <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Resolved</Text>
          <Text style={[styles.metricVal, { color: isDark ? '#34D399' : '#059669' }]}>{stats.resolved}</Text>
        </View>
      </View>

      {/* Search Bar + Raise Ticket Action Row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <View style={[styles.searchBar, { flex: 1, marginBottom: 0, backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Feather name="search" size={16} color={colors.inkSoft} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.navy }]}
            placeholder="Search tickets or ID..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Feather name="x" size={16} color={colors.inkSoft} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.raiseActionBtn}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={15} color="#FFFFFF" />
          <Text style={styles.raiseActionBtnText}>Raise Ticket</Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
        style={{ marginBottom: 16 }}
      >
        {(['all', 'open', 'waiting_on_us', 'resolved'] as const).map((tab) => {
          const count =
            tab === 'all'
              ? stats.total
              : tab === 'open'
              ? stats.open
              : tab === 'waiting_on_us'
              ? stats.replied
              : stats.resolved;
          const label =
            tab === 'all'
              ? 'All'
              : tab === 'open'
              ? 'Open'
              : tab === 'waiting_on_us'
              ? 'Replied'
              : 'Resolved';
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                statusFilter === tab && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }],
              ]}
              onPress={() => setStatusFilter(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, statusFilter === tab && [styles.tabTextActive, { color: colors.navy }]]}>
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Tickets Section */}
      <Text style={[styles.sectionHeading, { color: colors.inkSoft }]}>
        Support Cases ({filteredTickets.length})
      </Text>

      {filteredTickets.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Feather name="inbox" size={32} color={colors.inkSoft} />
          <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Support Tickets</Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            {searchTerm || statusFilter !== 'all'
              ? 'No tickets match your active filter.'
              : 'Tap "+ Raise Ticket" above to reach Propithub Platform Admin.'}
          </Text>
        </View>
      ) : (
        filteredTickets.map((t) => {
          const statusMeta = getTicketStatusMeta(t);
          const priCfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
          const catCfg = CATEGORY_CONFIG[t.category] || CATEGORY_CONFIG.general;

          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.ticketCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
              onPress={() => setSelectedTicket(t)}
              activeOpacity={0.85}
            >
              <View style={styles.ticketTopRow}>
                <Text style={[styles.ticketId, { color: colors.inkSoft }]}>#{t.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                    {statusMeta.label}
                  </Text>
                </View>
              </View>

              <Text style={[styles.ticketSubject, { color: colors.navy }]}>{t.topic}</Text>
              {t.detail ? (
                <Text style={[styles.ticketDetail, { color: colors.inkSoft }]} numberOfLines={2}>
                  {t.detail}
                </Text>
              ) : null}

              <View style={styles.tagRow}>
                <View style={[styles.categoryBadge, { backgroundColor: catCfg.bg }]}>
                  <Text style={[styles.categoryBadgeText, { color: catCfg.color }]}>
                    {catCfg.label.toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.priorityBadge, { backgroundColor: priCfg.bg }]}>
                  <Text style={[styles.priorityBadgeText, { color: priCfg.color }]}>
                    {priCfg.label.toUpperCase()}
                  </Text>
                </View>
              </View>

              {t.reply ? (
                <View style={[styles.replyBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4' }]}>
                  <Text style={[styles.replyLabel, { color: isDark ? '#34D399' : '#047857' }]}>SUPPORT RESPONSE:</Text>
                  <Text style={[styles.replyText, { color: colors.navy }]} numberOfLines={2}>
                    {t.reply}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.divider, { backgroundColor: colors.line }]} />

              <View style={styles.ticketFooter}>
                <Text style={[styles.ticketDate, { color: colors.inkSoft }]}>
                  {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Recent'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {t.status !== 'resolved' && (
                    <TouchableOpacity
                      onPress={() => openResolveModal(t)}
                      style={[
                        styles.inlineResolvePill,
                        {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#DCFCE7',
                          borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#BBF7D0',
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Feather name="check" size={11} color={isDark ? '#34D399' : '#15803D'} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#34D399' : '#15803D' }}>
                        Resolve
                      </Text>
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.openConversationLink, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                    View →
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* Ticket Details Modal */}
      <Modal
        visible={Boolean(selectedTicket)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedTicket(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Support Ticket #{selectedTicket?.id}</Text>
                <Text style={[styles.modalSubtitle, { color: colors.inkSoft }]}>
                  {(CATEGORY_CONFIG[(selectedTicket?.category || 'general') as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.general).label}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTicket(null)} style={styles.modalCloseBtn}>
                <Feather name="x" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedTicket && (() => {
                const statusMeta = getTicketStatusMeta(selectedTicket);
                const priCfg = PRIORITY_CONFIG[selectedTicket.priority] || PRIORITY_CONFIG.medium;
                return (
                  <View style={[styles.metaStripBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
                    <View style={styles.metaStripItem}>
                      <Text style={[styles.metaStripLabel, { color: colors.inkSoft }]}>STATUS</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                      </View>
                    </View>
                    <View style={styles.metaStripItem}>
                      <Text style={[styles.metaStripLabel, { color: colors.inkSoft }]}>PRIORITY</Text>
                      <View style={[styles.priorityBadge, { backgroundColor: priCfg.bg }]}>
                        <Text style={[styles.priorityBadgeText, { color: priCfg.color }]}>{priCfg.label.toUpperCase()}</Text>
                      </View>
                    </View>
                    <View style={styles.metaStripItem}>
                      <Text style={[styles.metaStripLabel, { color: colors.inkSoft }]}>CREATED</Text>
                      <Text style={[styles.metaStripValue, { color: colors.navy }]}>
                        {selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleDateString() : '—'}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={[styles.detailLabel, { color: colors.inkSoft }]}>SUBJECT</Text>
              <Text style={[styles.detailSubject, { color: colors.navy }]}>{selectedTicket?.topic}</Text>

              <Text style={[styles.detailLabel, { color: colors.inkSoft }]}>DESCRIPTION</Text>
              <Text style={[styles.detailBody, { color: colors.ink }]}>{selectedTicket?.detail || selectedTicket?.topic}</Text>
              {selectedTicket?.createdAt ? (
                <Text style={[styles.detailTimestamp, { color: colors.inkSoft }]}>
                  Submitted on {new Date(selectedTicket.createdAt).toLocaleString()}
                </Text>
              ) : null}

              {selectedTicket?.reply ? (
                <View style={[styles.modalReplyBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5', borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0' }]}>
                  <Text style={[styles.modalReplyLabel, { color: isDark ? '#34D399' : '#047857' }]}>OFFICIAL DESK RESPONSE</Text>
                  <Text style={[styles.modalReplyText, { color: colors.navy }]}>{selectedTicket.reply}</Text>
                  {selectedTicket.repliedAt ? (
                    <Text style={[styles.detailTimestamp, { color: isDark ? '#6EE7B7' : '#047857', marginTop: 6 }]}>
                      Replied on {new Date(selectedTicket.repliedAt).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.pendingReplyBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
                  <Feather name="clock" size={14} color={colors.inkSoft} style={{ marginRight: 6 }} />
                  <Text style={[styles.pendingReplyText, { color: colors.inkSoft }]}>
                    Our engineering team is currently reviewing this case.
                  </Text>
                </View>
              )}

              {selectedTicket?.status === 'resolved' && (
                <View style={[styles.resolvedNotesBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#DCFCE7', borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0' }]}>
                  <Text style={[styles.modalReplyLabel, { color: isDark ? '#34D399' : '#15803D' }]}>✓ RESOLUTION SUMMARY</Text>
                  <Text style={[styles.modalReplyText, { color: colors.navy }]}>
                    {selectedTicket.resolutionNotes || 'This issue has been resolved by the property owner.'}
                  </Text>
                  {selectedTicket.resolvedAt ? (
                    <Text style={[styles.detailTimestamp, { color: isDark ? '#6EE7B7' : '#15803D', marginTop: 6 }]}>
                      Resolved on {new Date(selectedTicket.resolvedAt).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              )}

              {selectedTicket && selectedTicket.status !== 'resolved' && (
                <TouchableOpacity
                  style={styles.resolveTicketBtn}
                  onPress={() => openResolveModal(selectedTicket)}
                  activeOpacity={0.85}
                >
                  <Feather name="check-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.resolveTicketBtnText}>Mark as Resolved</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Resolution Confirmation Modal */}
      <Modal
        visible={Boolean(resolvingTicket)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!isResolving) setResolvingTicket(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={Platform.OS !== 'web'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.modalTitle, { color: isDark ? '#34D399' : '#15803D' }]}>
                  Resolve Ticket #{resolvingTicket?.id}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.inkSoft }]} numberOfLines={1}>
                  {resolvingTicket?.topic}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !isResolving && setResolvingTicket(null)}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.detailBody, { color: colors.ink }]}>
                Are you satisfied with the resolution for "{resolvingTicket?.topic}"? Marking this ticket resolved closes the thread.
              </Text>

              <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>
                Resolution Notes / Feedback (Optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.navy },
                ]}
                placeholder="e.g. Issue verified fixed. Thank you for the prompt assistance."
                value={closingNotes}
                onChangeText={setClosingNotes}
                placeholderTextColor={colors.inkSoft}
                multiline
                numberOfLines={3}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.secondaryModalBtn, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}
                  onPress={() => setResolvingTicket(null)}
                  disabled={isResolving}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryModalBtnText, { color: colors.navy }]}>Keep Open</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 1, marginTop: 0, marginBottom: 0 }]}
                  onPress={handleConfirmResolveTicket}
                  disabled={isResolving}
                  activeOpacity={0.85}
                >
                  {isResolving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.submitBtnText}>Confirm & Close</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Raise New Ticket Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCreateModal(false);
          setIsCategoryDropdownOpen(false);
          setIsPriorityDropdownOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={Platform.OS !== 'web'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Raise Platform Ticket</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowCreateModal(false);
                  setIsCategoryDropdownOpen(false);
                  setIsPriorityDropdownOpen(false);
                }}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Subject / Issue Topic *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.navy }]}
                placeholder="e.g. Settlement delay or tenant invite issue"
                value={topic}
                onChangeText={setTopic}
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Category</Text>
              <View style={{ marginBottom: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.dropdownTrigger,
                    {
                      backgroundColor: colors.surfaceSunken,
                      borderColor: isCategoryDropdownOpen ? colors.primary : colors.line,
                    },
                  ]}
                  onPress={() => {
                    setIsCategoryDropdownOpen((prev) => !prev);
                    setIsPriorityDropdownOpen(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={[styles.dropdownBadgeIcon, { backgroundColor: currentCat.bg }]}>
                      <Feather name={currentCat.icon} size={15} color={currentCat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dropdownTriggerText, { color: colors.navy }]}>
                        {currentCat.label}
                      </Text>
                    </View>
                  </View>
                  <Feather
                    name={isCategoryDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={isCategoryDropdownOpen ? colors.primary : colors.inkSoft}
                  />
                </TouchableOpacity>

                {isCategoryDropdownOpen && (
                  <View
                    style={[
                      styles.dropdownMenu,
                      { backgroundColor: colors.surfaceSunken, borderColor: colors.line },
                    ]}
                  >
                    {(['technical', 'billing', 'subscription', 'leasing', 'feature_request', 'general'] as const).map((cat) => {
                      const isSelected = category === cat;
                      const cfg = CATEGORY_CONFIG[cat];
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[
                            styles.dropdownItem,
                            { borderBottomColor: colors.line },
                            isSelected && {
                              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                            },
                          ]}
                          onPress={() => {
                            setCategory(cat);
                            setIsCategoryDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <View style={[styles.dropdownBadgeIcon, { backgroundColor: cfg.bg }]}>
                              <Feather name={cfg.icon} size={15} color={cfg.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.dropdownItemTitle,
                                  { color: colors.navy },
                                  isSelected && { color: isDark ? '#34D399' : '#059669', fontWeight: '700' },
                                ]}
                              >
                                {cfg.label}
                              </Text>
                            </View>
                          </View>
                          {isSelected && (
                            <Feather name="check" size={16} color={isDark ? '#34D399' : '#059669'} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Priority</Text>
              <View style={{ marginBottom: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.dropdownTrigger,
                    {
                      backgroundColor: colors.surfaceSunken,
                      borderColor: isPriorityDropdownOpen ? colors.primary : colors.line,
                    },
                  ]}
                  onPress={() => {
                    setIsPriorityDropdownOpen((prev) => !prev);
                    setIsCategoryDropdownOpen(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={[styles.dropdownBadgeIcon, { backgroundColor: currentPri.bg }]}>
                      <Feather name={currentPri.icon} size={15} color={currentPri.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dropdownTriggerText, { color: colors.navy }]}>
                        {currentPri.label} Priority
                      </Text>
                    </View>
                  </View>
                  <Feather
                    name={isPriorityDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={isPriorityDropdownOpen ? colors.primary : colors.inkSoft}
                  />
                </TouchableOpacity>

                {isPriorityDropdownOpen && (
                  <View
                    style={[
                      styles.dropdownMenu,
                      { backgroundColor: colors.surfaceSunken, borderColor: colors.line },
                    ]}
                  >
                    {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                      const isSelected = priority === p;
                      const cfg = PRIORITY_CONFIG[p];
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[
                            styles.dropdownItem,
                            { borderBottomColor: colors.line },
                            isSelected && {
                              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                            },
                          ]}
                          onPress={() => {
                            setPriority(p);
                            setIsPriorityDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <View style={[styles.dropdownBadgeIcon, { backgroundColor: cfg.bg }]}>
                              <Feather name={cfg.icon} size={15} color={cfg.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.dropdownItemTitle,
                                  { color: colors.navy },
                                  isSelected && { color: isDark ? '#34D399' : '#059669', fontWeight: '700' },
                                ]}
                              >
                                {cfg.label} Priority
                              </Text>
                            </View>
                          </View>
                          {isSelected && (
                            <Feather name="check" size={16} color={isDark ? '#34D399' : '#059669'} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Detailed Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.navy }]}
                placeholder="Explain what happened, relevant property/unit details, or steps to reproduce..."
                value={detail}
                onChangeText={setDetail}
                placeholderTextColor={colors.inkSoft}
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateTicket}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.submitBtnText}>Submit Platform Ticket</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    content: {
      padding: 18,
      paddingBottom: 40,
    },
    raiseActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#059669',
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
      gap: 5,
    },
    raiseActionBtnText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '800',
    },
    tabContainer: {
      flexDirection: 'row',
      borderRadius: 10,
      padding: 3,
      gap: 4,
    },
    tabButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    tabButtonActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    tabTextActive: {
      color: colors.navy,
      fontWeight: '700',
    },
    sectionHeading: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.ink,
      marginTop: 10,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 4,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    ticketCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.line,
    },
    ticketTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    ticketId: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    ticketSubject: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 4,
    },
    ticketDetail: {
      fontSize: 12.5,
      color: colors.inkSoft,
      lineHeight: 18,
      marginBottom: 8,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    categoryBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    categoryBadgeText: {
      fontSize: 10.5,
      fontWeight: '600',
    },
    priorityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    priorityBadgeText: {
      fontSize: 10.5,
      fontWeight: '600',
    },
    replyBox: {
      borderLeftWidth: 3,
      borderLeftColor: '#10B981',
      padding: 10,
      borderRadius: 6,
      marginVertical: 6,
    },
    replyLabel: {
      fontSize: 10,
      fontWeight: '700',
      marginBottom: 2,
    },
    replyText: {
      fontSize: 12,
      color: colors.navy,
      lineHeight: 16,
    },
    divider: {
      height: 1,
      marginVertical: 10,
    },
    ticketFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    ticketDate: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    inlineResolvePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
    },
    openConversationLink: {
      fontSize: 12,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      maxHeight: '85%',
      padding: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSubtitle: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    modalCloseBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
    },
    modalScroll: {
      paddingVertical: 14,
    },
    metaStripBox: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 8,
      gap: 8,
    },
    metaStripItem: {
      alignItems: 'flex-start',
      gap: 4,
    },
    metaStripLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    metaStripValue: {
      fontSize: 12,
      fontWeight: '700',
    },
    detailLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.inkSoft,
      marginTop: 10,
      marginBottom: 4,
    },
    detailSubject: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    detailBody: {
      fontSize: 13,
      color: colors.ink,
      lineHeight: 20,
    },
    detailTimestamp: {
      fontSize: 11,
      marginTop: 4,
    },
    modalReplyBox: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 14,
      marginTop: 14,
    },
    resolvedNotesBox: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 14,
      marginTop: 12,
    },
    modalReplyLabel: {
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 4,
    },
    modalReplyText: {
      fontSize: 13,
      lineHeight: 18,
    },
    pendingReplyBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginTop: 14,
    },
    pendingReplyText: {
      fontSize: 12,
      flex: 1,
    },
    resolveTicketBtn: {
      backgroundColor: '#10B981',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      marginTop: 20,
      marginBottom: 10,
    },
    resolveTicketBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13.5,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.ink,
      marginTop: 12,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    textArea: {
      height: 90,
      textAlignVertical: 'top',
    },
    dropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 2,
    },
    dropdownBadgeIcon: {
      width: 28,
      height: 28,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dropdownTriggerText: {
      fontSize: 13,
      fontWeight: '700',
    },
    dropdownMenu: {
      marginTop: 6,
      borderWidth: 1,
      borderRadius: 10,
      overflow: 'hidden',
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    dropdownItemTitle: {
      fontSize: 13,
      fontWeight: '600',
    },
    submitBtn: {
      backgroundColor: '#10B981',
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      marginTop: 20,
      marginBottom: 10,
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13.5,
    },
    secondaryModalBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    secondaryModalBtnText: {
      fontWeight: '700',
      fontSize: 13.5,
    },
    metricsSummaryRow: {
      flexDirection: 'row',
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      marginBottom: 12,
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    metricItem: {
      alignItems: 'center',
      flex: 1,
    },
    metricLabel: {
      fontSize: 11,
      marginBottom: 2,
    },
    metricVal: {
      fontSize: 16,
      fontWeight: '800',
    },
    metricDivider: {
      width: 1,
      height: 26,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      padding: 0,
    },
  });
