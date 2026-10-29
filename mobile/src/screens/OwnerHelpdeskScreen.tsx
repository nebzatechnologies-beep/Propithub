import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { MobilePlatformSupportTicket } from '../types';
import { useMobileTheme } from '../context/MobileThemeContext';

export const OwnerHelpdeskScreen: React.FC = () => {
  const { colors, isDark } = useMobileTheme();
  const { user } = useMobileAuth();
  const { state, createPlatformSupportTicket, resolvePlatformSupportTicket } = useMobileAppData();

  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MobilePlatformSupportTicket | null>(null);

  // Form State
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<MobilePlatformSupportTicket['category']>('technical');
  const [priority, setPriority] = useState<MobilePlatformSupportTicket['priority']>('medium');
  const [detail, setDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);

  const CATEGORY_CONFIG: Record<
    'technical' | 'billing' | 'subscription' | 'leasing' | 'general',
    { label: string; sub: string; icon: 'tool' | 'credit-card' | 'zap' | 'file-text' | 'help-circle'; color: string; bg: string }
  > = {
    technical: {
      label: 'Technical Support',
      sub: 'Platform bugs, errors & system issues',
      icon: 'tool',
      color: '#0284C7',
      bg: isDark ? 'rgba(2, 132, 199, 0.18)' : '#E0F2FE',
    },
    billing: {
      label: 'Billing & Escrow',
      sub: 'Invoices, rent payouts, escrow & fees',
      icon: 'credit-card',
      color: '#059669',
      bg: isDark ? 'rgba(5, 150, 105, 0.18)' : '#D1FAE5',
    },
    subscription: {
      label: 'Subscription & Plans',
      sub: 'Tier upgrades, limits & renewals',
      icon: 'zap',
      color: '#7C3AED',
      bg: isDark ? 'rgba(124, 58, 237, 0.18)' : '#EDE9FE',
    },
    leasing: {
      label: 'Leasing & Agreements',
      sub: 'Tenant contracts, e-signatures & docs',
      icon: 'file-text',
      color: '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7',
    },
    general: {
      label: 'General Inquiry',
      sub: 'Platform onboarding & miscellaneous',
      icon: 'help-circle',
      color: '#64748B',
      bg: isDark ? 'rgba(100, 116, 139, 0.18)' : '#F1F5F9',
    },
  };

  const PRIORITY_CONFIG: Record<
    'low' | 'medium' | 'high' | 'urgent',
    { label: string; sub: string; color: string; bg: string; icon: 'check-circle' | 'clock' | 'alert-circle' | 'alert-triangle' }
  > = {
    low: {
      label: 'Low',
      sub: 'Routine inquiry • Handled within 48h',
      color: '#3B82F6',
      bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
      icon: 'check-circle',
    },
    medium: {
      label: 'Medium',
      sub: 'Standard response • Handled within 24h',
      color: '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7',
      icon: 'clock',
    },
    high: {
      label: 'High',
      sub: 'Urgent issue • Escalated response',
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
      icon: 'alert-circle',
    },
    urgent: {
      label: 'Urgent',
      sub: 'Critical blocker • Immediate attention',
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
      icon: 'alert-triangle',
    },
  };

  // Tickets strictly scoped to this authenticated owner
  const myTickets = useMemo(() => {
    const ownerId = user?.id || '';
    const ownerEmail = (user?.email || '').toLowerCase();
    return (state.platformSupport || []).filter((sup) => {
      const matchOwnerId = ownerId && sup.ownerId === ownerId;
      const matchEmail = ownerEmail && sup.ownerEmail?.toLowerCase() === ownerEmail;
      return matchOwnerId || matchEmail || !sup.ownerId;
    });
  }, [state.platformSupport, user]);

  // Metrics Summary (1-to-1 Web Parity)
  const stats = useMemo(() => {
    return {
      total: myTickets.length,
      open: myTickets.filter((t) => t.status === 'open').length,
      replied: myTickets.filter((t) => t.status === 'waiting_on_us' || (t.reply && t.status !== 'resolved')).length,
      resolved: myTickets.filter((t) => t.status === 'resolved').length,
    };
  }, [myTickets]);

  const filteredTickets = useMemo(() => {
    return myTickets.filter((t) => {
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'open'
          ? t.status !== 'resolved'
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

  const handleResolveTicket = async (ticketId: string) => {
    try {
      await resolvePlatformSupportTicket(ticketId);
      setSelectedTicket(null);
      Alert.alert('Ticket Closed ✓', 'This support ticket has been marked as resolved.');
    } catch (err) {
      Alert.alert('Error', 'Failed to resolve ticket.');
    }
  };

  const currentCat = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.technical;
  const currentPri = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <PropithubIcon size={20} />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.navy }]} numberOfLines={1}>Helpdesk</Text>
          </View>
        </View>
        <View style={[styles.ownerBadge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.line }]}>
          <Text style={[styles.ownerBadgeText, { color: colors.navy }]}>OWNER</Text>
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Support Banner Card */}
        <View style={[styles.supportDarkCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.bannerHeading, { color: colors.navy }]}>Encountered an issue?</Text>
          <Text style={[styles.bannerSub, { color: colors.inkSoft }]}>
            Our engineering desk responds to premium owner issues within 24 hours.
          </Text>
          <TouchableOpacity
            style={styles.raiseTicketBtn}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.raiseTicketBtnText}>Raise Platform Ticket</Text>
          </TouchableOpacity>
        </View>

        {/* Real-Time Metrics Summary Strip (1-to-1 Web Parity) */}
        <View style={[styles.metricsSummaryRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Total</Text>
            <Text style={[styles.metricVal, { color: colors.navy }]}>{stats.total}</Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Open</Text>
            <Text style={[styles.metricVal, { color: '#2563EB' }]}>{stats.open}</Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Replied</Text>
            <Text style={[styles.metricVal, { color: '#D97706' }]}>{stats.replied}</Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.line }]} />
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Resolved</Text>
            <Text style={[styles.metricVal, { color: '#059669' }]}>{stats.resolved}</Text>
          </View>
        </View>

        {/* Search Bar (1-to-1 Web Parity) */}
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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

        {/* Status Filter Tabs */}
        <View style={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
          {(['all', 'open', 'resolved'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, statusFilter === tab && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
              onPress={() => setStatusFilter(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, statusFilter === tab && [styles.tabTextActive, { color: colors.navy }]]}>
                {tab === 'all'
                  ? `All (${myTickets.length})`
                  : tab === 'open'
                  ? `Active (${myTickets.filter((t) => t.status !== 'resolved').length})`
                  : `Resolved (${myTickets.filter((t) => t.status === 'resolved').length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tickets Section */}
        <Text style={[styles.sectionHeading, { color: colors.inkSoft }]}>
          Your Support Cases ({filteredTickets.length})
        </Text>

        {filteredTickets.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="inbox" size={44} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Support Tickets</Text>
            <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
              {statusFilter === 'all'
                ? 'You have not raised any platform support tickets yet.'
                : `No ${statusFilter} support tickets found.`}
            </Text>
          </View>
        ) : (
          filteredTickets.map((t) => {
            const isResolved = t.status === 'resolved';

            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.ticketCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
                onPress={() => setSelectedTicket(t)}
                activeOpacity={0.85}
              >
                <View style={styles.ticketTopRow}>
                  <Text style={styles.ticketId}>{t.id}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      isResolved ? styles.statusBadgeClosed : styles.statusBadgeOpen,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isResolved ? styles.statusBadgeTextClosed : styles.statusBadgeTextOpen,
                      ]}
                    >
                      {isResolved ? 'RESOLVED' : 'IN PROGRESS'}
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
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{t.category.toUpperCase()}</Text>
                  </View>
                  <View
                    style={[
                      styles.priorityBadge,
                      t.priority === 'urgent' || t.priority === 'high'
                        ? styles.priorityBadgeHigh
                        : styles.priorityBadgeNormal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.priorityBadgeText,
                        t.priority === 'urgent' || t.priority === 'high'
                          ? styles.priorityBadgeTextHigh
                          : styles.priorityBadgeTextNormal,
                      ]}
                    >
                      {t.priority.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {t.reply ? (
                  <View style={styles.replyBox}>
                    <Text style={styles.replyLabel}>SUPPORT RESPONSE:</Text>
                    <Text style={styles.replyText} numberOfLines={2}>
                      {t.reply}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.ticketFooter}>
                  <Text style={styles.ticketDate}>
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Recent'}
                  </Text>
                  <Text style={styles.openConversationLink}>View →</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Ticket Details & Resolution Modal */}
      <Modal
        visible={Boolean(selectedTicket)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedTicket(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Support Ticket #{selectedTicket?.id}</Text>
                <Text style={[styles.modalSubtitle, { color: colors.inkSoft }]}>{selectedTicket?.category.toUpperCase()}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTicket(null)} style={styles.modalCloseBtn}>
                <Feather name="x" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={[styles.detailLabel, { color: colors.inkSoft }]}>SUBJECT</Text>
              <Text style={[styles.detailSubject, { color: colors.navy }]}>{selectedTicket?.topic}</Text>

              <Text style={[styles.detailLabel, { color: colors.inkSoft }]}>DESCRIPTION</Text>
              <Text style={[styles.detailBody, { color: colors.inkSoft }]}>{selectedTicket?.detail}</Text>

              {selectedTicket?.reply ? (
                <View style={[styles.modalReplyBox, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderColor: isDark ? '#047857' : '#A7F3D0' }]}>
                  <Text style={[styles.modalReplyLabel, { color: isDark ? '#6EE7B7' : '#047857' }]}>OFFICIAL DESK RESPONSE</Text>
                  <Text style={[styles.modalReplyText, { color: isDark ? '#ECFDF5' : '#065F46' }]}>{selectedTicket.reply}</Text>
                </View>
              ) : (
                <View style={[styles.pendingReplyBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line }]}>
                  <Feather name="clock" size={14} color={colors.inkSoft} style={{ marginRight: 6 }} />
                  <Text style={[styles.pendingReplyText, { color: colors.inkSoft }]}>
                    Our engineering team is currently reviewing this case.
                  </Text>
                </View>
              )}

              {selectedTicket && selectedTicket.status !== 'resolved' && (
                <TouchableOpacity
                  style={styles.resolveTicketBtn}
                  onPress={() => handleResolveTicket(selectedTicket.id)}
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
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

            <ScrollView style={styles.modalScroll}>
              <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Subject / Issue Topic *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line, color: colors.navy }]}
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
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
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
                      <Text style={[styles.dropdownTriggerSub, { color: colors.inkSoft }]} numberOfLines={1}>
                        {currentCat.sub}
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
                      { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line },
                    ]}
                  >
                    {(['technical', 'billing', 'subscription', 'leasing', 'general'] as const).map((cat) => {
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
                              <Text style={[styles.dropdownItemSub, { color: colors.inkSoft }]} numberOfLines={1}>
                                {cfg.sub}
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
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
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
                      <Text style={[styles.dropdownTriggerSub, { color: colors.inkSoft }]} numberOfLines={1}>
                        {currentPri.sub}
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
                      { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line },
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
                              <Text style={[styles.dropdownItemSub, { color: colors.inkSoft }]} numberOfLines={1}>
                                {cfg.sub}
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
                style={[styles.input, styles.textArea, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line, color: colors.navy }]}
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
        </View>
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
    flex: 1,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
  ownerBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ownerBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.navy,
  },
  scroll: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  supportDarkCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bannerHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 18,
    marginBottom: 14,
  },
  raiseTicketBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  raiseTicketBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
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
  statusBadgeOpen: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeClosed: {
    backgroundColor: '#D1FAE5',
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusBadgeTextOpen: {
    color: '#B45309',
  },
  statusBadgeTextClosed: {
    color: '#047857',
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
    gap: 8,
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityBadgeHigh: {
    backgroundColor: '#FEE2E2',
  },
  priorityBadgeNormal: {
    backgroundColor: '#E0F2FE',
  },
  priorityBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  priorityBadgeTextHigh: {
    color: '#DC2626',
  },
  priorityBadgeTextNormal: {
    color: '#0284C7',
  },
  replyBox: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    padding: 10,
    borderRadius: 6,
    marginVertical: 6,
  },
  replyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 12,
    color: colors.navy,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
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
  openConversationLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
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
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  modalScroll: {
    paddingVertical: 14,
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
  modalReplyBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  modalReplyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
    marginBottom: 4,
  },
  modalReplyText: {
    fontSize: 13,
    color: colors.navy,
    lineHeight: 18,
  },
  pendingReplyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginTop: 14,
  },
  pendingReplyText: {
    fontSize: 12,
    color: colors.inkSoft,
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
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.navy,
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
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
    color: colors.navy,
  },
  dropdownTriggerSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  dropdownMenu: {
    marginTop: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
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
    borderBottomColor: colors.line,
  },
  dropdownItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  dropdownItemSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
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
  metricsSummaryRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
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
    color: colors.inkSoft,
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.navy,
  },
  metricDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#E2E8F0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.navy,
    padding: 0,
  },
  });
