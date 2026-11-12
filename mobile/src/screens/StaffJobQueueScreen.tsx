import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { getStaffReminders } from '../lib/reminders';
import { MobileTicket } from '../types';

interface StaffJobQueueScreenProps {
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
}

export const StaffJobQueueScreen: React.FC<StaffJobQueueScreenProps> = ({
  onProfilePress,
  onNotificationsPress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, updateTicket, acknowledgeAnnouncement } = useMobileAppData();
  const { user } = useMobileAuth();

  // Filter chip state matching Web ('all' | 'active' | 'resolved')
  const [queueFilter, setQueueFilter] = useState<'all' | 'active' | 'resolved'>('all');

  // Bulletin acknowledgment & smooth dismissal state
  const [justAckedIds, setJustAckedIds] = useState<Set<string>>(new Set());
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(new Set());

  // Job Status Update / Completion Modal (1-to-1 with Web)
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MobileTicket | null>(null);
  const [statusInput, setStatusInput] = useState<'in_progress' | 'resolved'>('resolved');
  const [completionNotes, setCompletionNotes] = useState('');
  const [photoProofName, setPhotoProofName] = useState<string | null>(null);

  const currentStaff = useMemo(() => {
    return (
      state.staff.find((s) => s.id === user.id) ||
      (user.email
        ? state.staff.find((s) => s.email?.toLowerCase() === user.email?.toLowerCase())
        : undefined) ||
      (user.displayName
        ? state.staff.find((s) => s.name.toLowerCase() === user.displayName?.toLowerCase())
        : undefined)
    );
  }, [state.staff, user]);

  // Filter tickets assigned to current staff member (matching Web)
  const myTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      if (user.ownerId && t.ownerId && t.ownerId !== user.ownerId) return false;
      const isDirectlyAssigned =
        t.assignedStaffId === user.id ||
        (currentStaff?.id && t.assignedStaffId === currentStaff.id) ||
        (Boolean(user.displayName) &&
          Boolean(t.assignedStaffName) &&
          t.assignedStaffName!.toLowerCase().includes(user.displayName.toLowerCase()));
      const isAssignedProperty = Boolean(
        user.assignedProperties?.length && t.propertyId && user.assignedProperties.includes(t.propertyId)
      );
      return isDirectlyAssigned || isAssignedProperty;
    });
  }, [state.tickets, user, currentStaff?.id]);

  const activeJobs = useMemo(
    () => myTickets.filter((t) => t.status !== 'resolved'),
    [myTickets]
  );
  const resolvedJobs = useMemo(
    () => myTickets.filter((t) => t.status === 'resolved'),
    [myTickets]
  );

  const filteredQueue = useMemo(() => {
    if (queueFilter === 'active') return activeJobs;
    if (queueFilter === 'resolved') return resolvedJobs;
    return myTickets;
  }, [queueFilter, activeJobs, resolvedJobs, myTickets]);

  // Real-time Staff Reminders & Work Order Priority Dispatch
  const staffReminders = useMemo(() => {
    return getStaffReminders(state, user);
  }, [state, user]);

  // Operational Bulletins for staff with strict landlord isolation, property scoping, and acknowledgment filtering
  const staffBulletins = useMemo(() => {
    const staffOwnerIds = new Set<string>();
    if (currentStaff?.ownerId) staffOwnerIds.add(currentStaff.ownerId);
    if (user.ownerId) staffOwnerIds.add(user.ownerId);
    myTickets.forEach((t) => {
      if (t.ownerId) staffOwnerIds.add(t.ownerId);
    });

    const assignedPropertyIds = new Set<string>();
    myTickets.forEach((t) => {
      if (t.propertyId) assignedPropertyIds.add(t.propertyId);
    });
    if (user.assignedProperties && Array.isArray(user.assignedProperties)) {
      user.assignedProperties.forEach((pId: string) => assignedPropertyIds.add(pId));
    }

    return (state.announcements || []).filter((b) => {
      if (b.status !== 'published') return false;
      if (dismissedNoticeIds.has(b.id)) return false;

      const targetRoles = b.targetRoles || (b as any).targetScope?.targetRoles || [];
      if (targetRoles.length > 0 && !targetRoles.includes('staff') && !targetRoles.includes('manager')) return false;

      const isSystem =
        b.ownerId === 'system' || b.ownerId === 'superadmin' || ((b as any).category as string) === 'system';
      if (!isSystem && (staffOwnerIds.size === 0 || !staffOwnerIds.has(b.ownerId))) {
        return false;
      }

      const targetScope = (b as any).targetScope;
      if (
        targetScope &&
        !targetScope.allProperties &&
        targetScope.propertyIds &&
        targetScope.propertyIds.length > 0
      ) {
        if (
          assignedPropertyIds.size > 0 &&
          !targetScope.propertyIds.some((pId: string) => assignedPropertyIds.has(pId))
        ) {
          return false;
        }
      }

      if (
        targetScope?.mode === 'specific_people' ||
        (targetScope?.targetUserIds && targetScope.targetUserIds.length > 0)
      ) {
        const targets = targetScope.targetUserIds || [];
        if (!targets.includes(user.id)) return false;
      }

      const isAckedByArr = (b.acknowledgedBy || []).includes(user.id);
      const isAckedByObj = ((b as any).acknowledgments || []).some(
        (ack: any) =>
          ack.tenantId === user.id ||
          (user.email && ack.tenantEmail?.toLowerCase() === user.email.toLowerCase())
      );
      const hasAcked = isAckedByArr || isAckedByObj;
      if (hasAcked && !justAckedIds.has(b.id)) {
        return false;
      }

      return true;
    });
  }, [state.announcements, user, currentStaff?.ownerId, myTickets, dismissedNoticeIds, justAckedIds]);

  const unreadNotificationsCount = useMemo(() => {
    const unreadNotifs = (state.notifications || []).filter((n) => !n.read).length;
    return unreadNotifs + staffBulletins.length;
  }, [state.notifications, staffBulletins.length]);

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

  const handleAcknowledgeBulletin = (id: string, requireAck?: boolean) => {
    acknowledgeAnnouncement(id, user.id);
    setJustAckedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setDismissedNoticeIds((prev) => new Set(prev).add(id));
    }, 1500);
  };

  const handleDialPhone = (phone?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No contact phone number registered for this resident.');
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {
      Alert.alert('Calling', `Dialing ${phone}...`);
    });
  };

  const handleSendEmail = (email?: string) => {
    if (!email) {
      Alert.alert('No Email', 'No contact email registered for this resident.');
      return;
    }
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Email', `Opening mail client for ${email}...`);
    });
  };

  const handleOpenStatusModal = (ticket: MobileTicket) => {
    setSelectedTicket(ticket);
    setStatusInput(ticket.status === 'in_progress' ? 'in_progress' : 'resolved');
    setCompletionNotes(ticket.completionNotes || '');
    setPhotoProofName(null);
    setShowStatusModal(true);
  };

  const handlePickPhotoProof = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setPhotoProofName(asset.fileName || 'completion-proof.jpg');
      }
    } catch {
      Alert.alert('Photo Proof', 'Could not open image library.');
    }
  };

  const handleSaveStatus = () => {
    if (!selectedTicket) return;

    updateTicket(selectedTicket.id, {
      status: statusInput,
      completionNotes: completionNotes.trim() || undefined,
    });

    setShowStatusModal(false);
    Alert.alert(
      'Ticket Updated',
      `Ticket ${selectedTicket.id} updated. Tenant and owner notified.`
    );
    setSelectedTicket(null);
    setCompletionNotes('');
    setPhotoProofName(null);
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
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
          <Text style={[styles.topbarTitle, { color: colors.navy }]}>Work queue</Text>
        </View>

        <TourTarget id="staff-topbar-actions">
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
        </TourTarget>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Technician Action Center & Reminders (1-to-1 with Web) */}
        {staffReminders.map((rem) => {
          const isUrgent = rem.severity === 'urgent';
          return (
            <View
              key={rem.id}
              style={[
                styles.needCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                  borderLeftColor: isUrgent ? '#DC2626' : '#D97706',
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.needTitle, { color: colors.navy }]} numberOfLines={1}>
                  {rem.title}
                </Text>
                <Text style={[styles.needSub, { color: colors.inkSoft }]} numberOfLines={2}>
                  {rem.description}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.needBtn,
                  isUrgent && { backgroundColor: '#DC2626', borderColor: '#DC2626' },
                ]}
                onPress={() => {
                  const ticketId = rem.id.replace('staff_ticket_job_', '');
                  const matchedTicket = state.tickets.find((t) => t.id === ticketId);
                  if (matchedTicket) {
                    handleOpenStatusModal(matchedTicket);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.needBtnText, isUrgent && { color: '#FFFFFF' }]}>Inspect</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Staff & Operational Bulletins (1-to-1 with Web) */}
        {staffBulletins.map((b) => {
          const isAckedByArr = (b.acknowledgedBy || []).includes(user.id);
          const isAckedByObj = ((b as any).acknowledgments || []).some(
            (ack: any) =>
              ack.tenantId === user.id ||
              (user.email && ack.tenantEmail?.toLowerCase() === user.email.toLowerCase())
          );
          const hasAcked = isAckedByArr || isAckedByObj || justAckedIds.has(b.id);
          const requireAck = Boolean(
            b.requireAck || b.requireAcknowledgment || (b as any).requiresAcknowledgment
          );

          return (
            <View
              key={b.id}
              style={[
                styles.needCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                  borderLeftColor: requireAck ? '#D97706' : '#059669',
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.needTitle, { color: colors.navy }]}>{b.title}</Text>
                <Text style={[styles.needSub, { color: colors.inkSoft }]}>{b.body}</Text>
              </View>
              {hasAcked ? (
                <View style={styles.ackedPill}>
                  <Ionicons name="checkmark-circle" size={14} color="#059669" />
                  <Text style={styles.ackedPillText}>
                    {requireAck ? 'Acknowledged' : 'Read'}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.needBtn}
                  onPress={() => handleAcknowledgeBulletin(b.id, requireAck)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.needBtnText}>
                    {requireAck ? 'Read & Acknowledge' : 'Mark as Read'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Filter Chips (All / Active / Resolved — matching Web 1-to-1) */}
        <TourTarget id="staff-queue-subtabs">
          <View style={styles.chipsRow}>
            {[
              { key: 'all' as const, label: `All (${myTickets.length})` },
              { key: 'active' as const, label: `Active (${activeJobs.length})` },
              { key: 'resolved' as const, label: `Resolved (${resolvedJobs.length})` },
            ].map((c) => {
              const active = queueFilter === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? '#059669' : colors.surface,
                      borderColor: active ? '#059669' : colors.line,
                    },
                  ]}
                  onPress={() => setQueueFilter(c.key)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? '#FFFFFF' : colors.inkSoft },
                      active && { fontWeight: '700' },
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TourTarget>

        {/* Streamlined Job Cards (1-to-1 with Web Staff Mobile Cards) */}
        {myTickets.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
              No tickets currently assigned to you.
            </Text>
          </View>
        ) : filteredQueue.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
              No {queueFilter} tickets found.
            </Text>
          </View>
        ) : (
          filteredQueue.map((t) => {
            const isHigh = t.priority === 'High' || t.priority === 'Emergency';
            const isMedium = t.priority === 'Medium';
            const isDone = t.status === 'resolved';
            const isInProgress = t.status === 'in_progress';
            const phone = t.tenantPhone || (t as any).tenantContact?.phone;
            const email = t.tenantEmail || (t as any).tenantContact?.email;

            return (
              <View
                key={t.id}
                style={[styles.jobCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
              >
                {/* Header Row: Ticket ID + Priority Badge on left, Status Badge on right */}
                <View style={styles.jobHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0, flexWrap: 'wrap' }}>
                    <Text style={[styles.ticketIdText, { color: colors.navy }]}>{t.id}</Text>
                    <View
                      style={[
                        styles.priorityPill,
                        isHigh
                          ? { backgroundColor: isDark ? '#3A1818' : '#FCE8E6' }
                          : isMedium
                          ? { backgroundColor: isDark ? '#332510' : '#FEF3DC' }
                          : { backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityPillText,
                          {
                            color: isHigh
                              ? isDark
                                ? '#FCA5A5'
                                : '#B3261E'
                              : isMedium
                              ? isDark
                                ? '#F5B955'
                                : '#9A5B00'
                              : colors.inkSoft,
                          },
                        ]}
                      >
                        {t.priority}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { flexShrink: 0 },
                      isDone
                        ? { backgroundColor: isDark ? '#0F2E1D' : '#E6F4EA' }
                        : isInProgress
                        ? { backgroundColor: isDark ? '#0F2920' : '#E6F4EE' }
                        : { backgroundColor: isDark ? '#332510' : '#FEF3DC' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color: isDone
                            ? isDark
                              ? '#6DD58C'
                              : '#137333'
                            : isInProgress
                            ? isDark
                              ? '#34D399'
                              : '#059669'
                            : isDark
                            ? '#F5B955'
                            : '#9A5B00',
                        },
                      ]}
                    >
                      {t.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Issue Description */}
                <Text style={[styles.jobTitle, { color: colors.navy }]}>{t.issue}</Text>

                {/* 3-Step Progress Bar (.prog from Propithub Role Simulator.html) */}
                <View style={styles.progBar}>
                  <View style={[styles.progSeg, styles.progSegOn]} />
                  <View style={[styles.progSeg, (isInProgress || isDone) && styles.progSegOn]} />
                  <View style={[styles.progSeg, isDone && styles.progSegOn]} />
                </View>

                {/* Meta Row: Unit + Resident */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Feather name="map-pin" size={13} color={colors.inkSoft} />
                    <Text style={[styles.metaText, { color: colors.inkSoft }]}>
                      Unit <Text style={{ color: colors.navy, fontWeight: '700' }}>{t.unit}</Text>
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <Text style={[styles.metaText, { color: colors.inkSoft }]}>
                      Resident:{' '}
                      <Text style={{ color: colors.navy, fontWeight: '700' }}>
                        {t.tenant || 'Tenant'}
                      </Text>
                    </Text>
                  </View>
                </View>

                {/* Resident Contact Buttons (Phone & Email) */}
                {(phone || email) && (
                  <View style={styles.residentQuickBtns}>
                    {phone && (
                      <TouchableOpacity
                        style={[
                          styles.miniContactBtn,
                          { borderColor: colors.line, backgroundColor: colors.surface },
                        ]}
                        onPress={() => handleDialPhone(phone)}
                        activeOpacity={0.75}
                      >
                        <Feather name="phone" size={12} color="#059669" />
                        <Text style={[styles.miniContactBtnText, { color: colors.navy }]}>
                          {phone}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {email && (
                      <TouchableOpacity
                        style={[
                          styles.miniContactBtn,
                          { borderColor: colors.line, backgroundColor: colors.surface },
                        ]}
                        onPress={() => handleSendEmail(email)}
                        activeOpacity={0.75}
                      >
                        <Feather name="mail" size={12} color="#059669" />
                        <Text style={[styles.miniContactBtnText, { color: colors.navy }]}>
                          Email
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Action Footer (only for non-resolved tickets, matching Web) */}
                {!isDone && (
                  <View style={[styles.jobFooter, { borderTopColor: colors.line }]}>
                    <TouchableOpacity
                      style={[
                        styles.updateTicketBtn,
                        { borderColor: colors.line, backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC' },
                      ]}
                      onPress={() => handleOpenStatusModal(t)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.updateTicketBtnText, { color: colors.navy }]}>
                        Update Ticket Status
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Update Ticket Modal (1-to-1 with Web) */}
      <Modal visible={showStatusModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.line }]} />

            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>
                Update ticket {selectedTicket?.id}
              </Text>
              <TouchableOpacity
                style={[
                  styles.closeCircleBtn,
                  { backgroundColor: isDark ? colors.surfaceSunken : '#F4F6F5' },
                ]}
                onPress={() => setShowStatusModal(false)}
              >
                <Ionicons name="close" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Status</Text>
              <View style={styles.statusToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.statusToggleBtn,
                    { borderColor: colors.line },
                    statusInput === 'in_progress' && styles.statusToggleBtnActive,
                  ]}
                  onPress={() => setStatusInput('in_progress')}
                >
                  <Text
                    style={[
                      styles.statusToggleText,
                      { color: colors.inkSoft },
                      statusInput === 'in_progress' && styles.statusToggleTextActive,
                    ]}
                  >
                    In progress
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.statusToggleBtn,
                    { borderColor: colors.line },
                    statusInput === 'resolved' && styles.statusToggleBtnActive,
                  ]}
                  onPress={() => setStatusInput('resolved')}
                >
                  <Text
                    style={[
                      styles.statusToggleText,
                      { color: colors.inkSoft },
                      statusInput === 'resolved' && styles.statusToggleTextActive,
                    ]}
                  >
                    Completed
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Notes</Text>
              <TextInput
                style={[
                  styles.notesInput,
                  {
                    backgroundColor: isDark ? colors.card : '#FFFFFF',
                    borderColor: colors.line,
                    color: colors.navy,
                  },
                ]}
                multiline
                numberOfLines={3}
                value={completionNotes}
                onChangeText={setCompletionNotes}
                placeholder="What was done…"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Photo proof</Text>
              <TouchableOpacity
                style={[
                  styles.photoPickerBtn,
                  {
                    backgroundColor: isDark ? colors.card : '#FFFFFF',
                    borderColor: colors.line,
                  },
                ]}
                onPress={handlePickPhotoProof}
                activeOpacity={0.8}
              >
                <Feather name="image" size={16} color={colors.inkSoft} />
                <Text style={[styles.photoPickerText, { color: colors.navy }]} numberOfLines={1}>
                  {photoProofName || 'Choose image…'}
                </Text>
              </TouchableOpacity>

              <View style={styles.modalFooterActions}>
                <TouchableOpacity
                  style={[
                    styles.cancelModalBtn,
                    { borderColor: colors.line, backgroundColor: colors.surface },
                  ]}
                  onPress={() => setShowStatusModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cancelModalBtnText, { color: colors.navy }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveStatusBtn}
                  onPress={handleSaveStatus}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveStatusBtnText}>Save update</Text>
                </TouchableOpacity>
              </View>
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
    needCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderLeftWidth: 4,
    },
    needTitle: {
      fontSize: 13.5,
      fontWeight: '700',
    },
    needSub: {
      fontSize: 12.5,
      marginTop: 2,
      lineHeight: 17,
    },
    needBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    },
    needBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
    ackedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    ackedPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#059669',
    },
    chipsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chip: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
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
    jobCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      gap: 10,
    },
    jobHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    ticketIdText: {
      fontSize: 12.5,
      fontWeight: '700',
    },
    priorityPill: {
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: 999,
    },
    priorityPillText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    statusBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    jobTitle: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },
    progBar: {
      flexDirection: 'row',
      gap: 6,
      marginVertical: 2,
    },
    progSeg: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? '#25352E' : '#DCE4DF',
    },
    progSegOn: {
      backgroundColor: '#059669',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 16,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    metaText: {
      fontSize: 13,
    },
    residentQuickBtns: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    miniContactBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5.5,
      borderRadius: 8,
      borderWidth: 1,
    },
    miniContactBtnText: {
      fontSize: 12,
      fontWeight: '600',
    },
    jobFooter: {
      paddingTop: 10,
      marginTop: 2,
      borderTopWidth: 1,
    },
    updateTicketBtn: {
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    updateTicketBtnText: {
      fontSize: 13,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(11, 20, 16, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
    },
    sheetHandle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    closeCircleBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldLabel: {
      fontSize: 12.5,
      fontWeight: '600',
      marginBottom: 6,
      marginTop: 12,
    },
    statusToggleRow: {
      flexDirection: 'row',
      gap: 8,
    },
    statusToggleBtn: {
      flex: 1,
      minHeight: 42,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusToggleBtnActive: {
      backgroundColor: '#059669',
      borderColor: '#059669',
    },
    statusToggleText: {
      fontSize: 13.5,
      fontWeight: '600',
    },
    statusToggleTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    notesInput: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 11,
      fontSize: 14,
      minHeight: 76,
      textAlignVertical: 'top',
    },
    photoPickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    photoPickerText: {
      fontSize: 13.5,
      flex: 1,
    },
    modalFooterActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
    },
    cancelModalBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelModalBtnText: {
      fontSize: 14,
      fontWeight: '600',
    },
    saveStatusBtn: {
      flex: 1,
      backgroundColor: '#059669',
      borderRadius: 10,
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveStatusBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
