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
  Image,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { usePlanLimits, ResourceQuotaType } from '../hooks/usePlanLimits';
import { PlanLimitModal } from '../components/PlanLimitModal';
import { MobileTicket, MobileStaffMember } from '../types';

interface ManagerRepairDispatchScreenProps {
  onProfilePress?: () => void;
  onCreateTicketPress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const ManagerRepairDispatchScreen: React.FC<ManagerRepairDispatchScreenProps> = ({
  onProfilePress,
  onCreateTicketPress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, updateTicket, addStaff } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, currencySymbol } = useMobileCurrency();

  const managerRecord = (state.propertyManagers || []).find(
    (m) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase().trim() === user.email.toLowerCase().trim())
  );
  const assignedPropertyId =
    (user as any)?.propertyId ||
    (user as any)?.assignedPropertyId ||
    managerRecord?.propertyId ||
    '';
  const effectiveOwnerId =
    user?.ownerId && user.ownerId !== user.id
      ? user.ownerId
      : managerRecord?.ownerId || '';
  const assignedProps = [
    ...(user?.assignedProperties || []),
    ...(managerRecord?.assignedProperties || []),
    ...(assignedPropertyId ? [assignedPropertyId] : []),
  ];
  const ownerId = effectiveOwnerId;
  const { usage, currentPlanName } = usePlanLimits(ownerId);
  const [limitModalType, setLimitModalType] = useState<ResourceQuotaType | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'tickets' | 'staff'>('tickets');
  const [activeFilter, setActiveFilter] = useState<'all' | 'Emergency' | 'High' | 'Medium' | 'resolved'>('all');

  // Assign Contractor Modal State
  const [assigningTicket, setAssigningTicket] = useState<MobileTicket | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [assignPayer, setAssignPayer] = useState<'owner' | 'tenant'>('owner');
  const [assignFee, setAssignFee] = useState('500');

  // Onboard Staff Modal State
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Plumbing & HVAC');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Lightbox for ticket photo proof
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Scoped properties, tickets, and staff
  const myProperties = useMemo(() => {
    return (state.properties || []).filter((p) => {
      if (p.assignedManagerId === user?.id || (p as any).managerId === user?.id) return true;
      if (assignedProps.includes(p.id)) return true;
      if (assignedPropertyId && p.id === assignedPropertyId) return true;
      if (effectiveOwnerId && p.ownerId === effectiveOwnerId) {
        if (assignedProps.length === 0 && !assignedPropertyId) return true;
        if (assignedProps.includes(p.id)) return true;
      }
      return false;
    });
  }, [state.properties, effectiveOwnerId, assignedPropertyId, assignedProps, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      if (t.propertyId && myPropertyIds.has(t.propertyId)) return true;
      if (ownerId && t.ownerId === ownerId) return true;
      return false;
    });
  }, [state.tickets, myPropertyIds, ownerId]);

  const myStaff = useMemo(() => {
    if (!ownerId) return [];
    return state.staff.filter((s) => s.ownerId === ownerId);
  }, [state.staff, ownerId]);

  const hasOpenTickets = myTickets.some((t) => t.status === 'open');

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return myTickets.filter((t) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'resolved') return t.status === 'resolved';
      return t.priority === activeFilter && t.status !== 'resolved';
    });
  }, [myTickets, activeFilter]);

  const handleOpenAssignModal = (ticket: MobileTicket) => {
    setAssigningTicket(ticket);
    setSelectedStaffId(ticket.assignedStaffId || myStaff[0]?.id || '');
    setAssignFee(
      String(
        typeof ticket.payment?.amount === 'number'
          ? ticket.payment.amount
          : ticket.costEstimate || 500
      )
    );
    setAssignPayer(ticket.payment?.payer || 'owner');
  };

  const handleConfirmAssignment = () => {
    if (!assigningTicket || !selectedStaffId) {
      Alert.alert('Required', 'Please select a technician first.');
      return;
    }

    const staffObj = myStaff.find((s) => s.id === selectedStaffId);
    const feeNum = Number(assignFee) || 0;

    updateTicket(assigningTicket.id, {
      status: 'assigned',
      assignedStaffId: staffObj?.id,
      assignedStaffName: staffObj?.name,
      assignedTo: staffObj?.name,
      payment: {
        payer: assignPayer,
        amount: feeNum,
        method: assigningTicket.payment?.method || 'Standard',
        status: feeNum > 0 ? 'awaiting_payment' : 'none',
      },
    } as Partial<MobileTicket>);

    setAssigningTicket(null);
  };

  const handleResolveTicket = (ticketId: string) => {
    updateTicket(ticketId, {
      status: 'resolved',
    });
  };

  const handleOpenOnboardModal = () => {
    if (usage.staff.isFull) {
      setLimitModalType('staff');
      return;
    }
    setShowOnboardModal(true);
  };

  const handleOnboardStaffSubmit = async () => {
    if (!newStaffName.trim() || !newStaffEmail.trim()) {
      Alert.alert('Required', 'Please enter technician name and email.');
      return;
    }
    if (newStaffPassword && newStaffPassword.length < 6) {
      Alert.alert('Invalid Password', 'Temporary password must be at least 6 characters.');
      return;
    }

    setIsOnboarding(true);
    try {
      const newMember: MobileStaffMember = {
        id: `staff-${Date.now()}`,
        name: newStaffName.trim(),
        role: newStaffRole.trim() || 'Technician',
        phone: newStaffPhone.trim(),
        email: newStaffEmail.trim().toLowerCase(),
        assignedProperties: myProperties.map((p) => p.id),
        activeTickets: 0,
        rating: 5.0,
        status: 'available',
        ownerId: ownerId || user.id,
      };

      await addStaff(newMember, newStaffPassword.trim() || 'Staff@123');
      setShowOnboardModal(false);
      setNewStaffName('');
      setNewStaffPhone('');
      setNewStaffEmail('');
      setNewStaffPassword('');
    } finally {
      setIsOnboarding(false);
    }
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      <Header
        title="Repairs"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      {/* Top Navigation & Primary CTA Bar */}
      <TourTarget id="manager-maintenance-subtabs" style={styles.topSubBar}>
        <View style={styles.subTabsLeft}>
          <TouchableOpacity
            style={[styles.subTabPill, activeSubTab === 'tickets' && styles.subTabPillActive]}
            onPress={() => setActiveSubTab('tickets')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.subTabPillText,
                activeSubTab === 'tickets' && styles.subTabPillTextActive,
              ]}
            >
              Tickets ({myTickets.length})
            </Text>
            {hasOpenTickets && <View style={styles.unreadDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabPill, activeSubTab === 'staff' && styles.subTabPillActive]}
            onPress={() => setActiveSubTab('staff')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.subTabPillText,
                activeSubTab === 'staff' && styles.subTabPillTextActive,
              ]}
            >
              Technicians ({myStaff.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeSubTab === 'tickets' ? (
          <TouchableOpacity
            style={styles.primaryCtaBtn}
            onPress={onCreateTicketPress}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={13} color="#FFFFFF" />
            <Text style={styles.primaryCtaBtnText}>Raise Ticket</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.primaryCtaBtn}
            onPress={handleOpenOnboardModal}
            activeOpacity={0.85}
          >
            <Feather name="user-plus" size={13} color="#FFFFFF" />
            <Text style={styles.primaryCtaBtnText}>Onboard</Text>
          </TouchableOpacity>
        )}
      </TourTarget>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeSubTab === 'tickets' ? (
          <>
            {/* Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'Emergency', label: 'Emergency' },
                  { key: 'High', label: 'High' },
                  { key: 'Medium', label: 'Medium' },
                  { key: 'resolved', label: 'Resolved' },
                ] as const
              ).map((chip) => {
                const active = activeFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setActiveFilter(chip.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredTickets.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="checkmark-done-circle-outline" size={32} color="#10B981" />
                <Text style={styles.emptyTitle}>No tickets found</Text>
              </View>
            ) : (
              filteredTickets.map((t) => {
                const isResolved = t.status === 'resolved';
                const isHigh = t.priority === 'High' || t.priority === 'Emergency';
                const techName = t.assignedStaffName || (t as any).assignedTo || 'Unassigned';
                const ticketPhoto = (t as any).completionPhoto || (t as any).images?.[0];

                return (
                  <View key={t.id} style={styles.card}>
                    {/* Card Top Row */}
                    <View style={styles.cardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={styles.ticketIdText}>
                          #{t.id} · Unit {t.unit}
                        </Text>
                        <View
                          style={[
                            styles.priorityPill,
                            isHigh ? styles.priorityPillHigh : styles.priorityPillNormal,
                          ]}
                        >
                          <Text
                            style={[
                              styles.priorityPillText,
                              { color: isHigh ? '#DC2626' : colors.inkSoft },
                            ]}
                          >
                            {t.priority}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.statusPill,
                          isResolved ? styles.statusPillGreen : styles.statusPillAmber,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: isResolved ? '#059669' : '#D97706' },
                          ]}
                        >
                          {t.status.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Issue + Optional Photo Thumbnail */}
                    <View style={styles.issueRow}>
                      <Text style={styles.issueText}>{t.issue}</Text>
                      {Boolean(ticketPhoto) && (
                        <TouchableOpacity onPress={() => setLightboxImage(ticketPhoto)}>
                          <Image source={{ uri: ticketPhoto }} style={styles.proofThumb} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* 2-Column Details Grid */}
                    <View style={styles.gridRow}>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>RESIDENT</Text>
                        <Text style={styles.gridValue} numberOfLines={1}>
                          {t.tenant || 'Resident'}
                        </Text>
                      </View>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>TECHNICIAN</Text>
                        <Text style={styles.gridValue} numberOfLines={1}>
                          {techName}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.gridRow, { marginTop: 6, paddingTop: 0, borderTopWidth: 0 }]}>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>WHO PAYS / COST</Text>
                        <Text style={styles.gridSubValue} numberOfLines={1}>
                          {t.payment?.payer
                            ? `${t.payment.payer === 'owner' ? 'Owner' : 'Tenant'}${
                                t.payment.amount
                                  ? ` · ${format(t.payment.amount, (t as any).currency || viewCurrency)}`
                                  : ''
                              }`
                            : '—'}
                        </Text>
                      </View>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>CATEGORY</Text>
                        <Text style={styles.gridSubValue} numberOfLines={1}>
                          {t.category || 'General'}
                        </Text>
                      </View>
                    </View>

                    {/* Clean Footer Actions */}
                    {!isResolved && (
                      <View style={styles.cardFooter}>
                        <TouchableOpacity
                          style={styles.footerBtnPrimary}
                          onPress={() => handleOpenAssignModal(t)}
                        >
                          <Text style={styles.footerBtnPrimaryText}>
                            {t.assignedStaffId || (t as any).assignedTo
                              ? 'Reassign Tech'
                              : 'Dispatch Tech'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.footerBtn}
                          onPress={() => handleResolveTicket(t.id)}
                        >
                          <Text style={styles.footerBtnText}>Mark Resolved</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* Quota Row */}
            <View style={styles.quotaBar}>
              <Text style={styles.quotaText}>
                Technicians Quota: {usage.staff.used} of {usage.staff.max ?? '∞'} ({currentPlanName})
              </Text>
              {usage.staff.isFull && (
                <TouchableOpacity onPress={() => setLimitModalType('staff')}>
                  <Text style={[styles.quotaText, { color: '#EA580C', fontWeight: '700' }]}>
                    Limit Reached
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {myStaff.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="users" size={30} color={colors.inkSoft} />
                <Text style={styles.emptyTitle}>No technicians onboarded</Text>
              </View>
            ) : (
              myStaff.map((s) => {
                const openCount = myTickets.filter(
                  (t) =>
                    t.status !== 'resolved' &&
                    (t.assignedStaffId === s.id ||
                      t.assignedStaffName === s.name ||
                      (t as any).assignedTo === s.name)
                ).length;

                return (
                  <View key={s.id} style={styles.card}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarText}>
                            {s.name.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.issueText} numberOfLines={1}>
                            {s.name}
                          </Text>
                          <Text style={styles.quotaText}>{s.role}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusPill, styles.statusPillGreen]}>
                        <Text style={[styles.statusPillText, { color: '#059669' }]}>
                          ★ {(s.rating || 5.0).toFixed(1)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.gridRow}>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>OPEN TICKETS</Text>
                        <Text style={styles.gridValue}>{openCount}</Text>
                      </View>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>COMPLETED</Text>
                        <Text style={styles.gridValue}>{(s as any).completed || 0}</Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      {Boolean(s.phone) && (
                        <TouchableOpacity
                          style={styles.footerBtn}
                          onPress={() => Linking.openURL(`tel:${s.phone}`)}
                        >
                          <Feather name="phone" size={12} color={colors.navy} />
                          <Text style={styles.footerBtnText}>Call</Text>
                        </TouchableOpacity>
                      )}
                      {Boolean(s.email) && (
                        <TouchableOpacity
                          style={styles.footerBtn}
                          onPress={() => Linking.openURL(`mailto:${s.email}`)}
                        >
                          <Feather name="mail" size={12} color={colors.navy} />
                          <Text style={styles.footerBtnText}>Email</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ================================================================== */}
      {/* DISPATCH TECHNICIAN BOTTOM SHEET                                   */}
      {/* ================================================================== */}
      <Modal visible={Boolean(assigningTicket)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Dispatch · #{assigningTicket?.id} (Unit {assigningTicket?.unit})
              </Text>
              <TouchableOpacity onPress={() => setAssigningTicket(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Technician *</Text>
                {myStaff.length === 0 ? (
                  <Text style={styles.quotaText}>
                    No technicians onboarded yet. Switch to Technicians tab to onboard one.
                  </Text>
                ) : (
                  myStaff.map((s) => {
                    const selected = selectedStaffId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.staffOption, selected && styles.staffOptionSelected]}
                        onPress={() => setSelectedStaffId(s.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.gridValue}>{s.name}</Text>
                          <Text style={styles.quotaText}>
                            {s.role} · {s.phone || s.email}
                          </Text>
                        </View>
                        {selected && (
                          <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Who Pays *</Text>
                <View style={styles.row2}>
                  {(
                    [
                      { key: 'owner', label: 'Owner Pays' },
                      { key: 'tenant', label: 'Tenant Pays' },
                    ] as const
                  ).map((opt) => {
                    const active = assignPayer === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.payerPill, active && styles.payerPillActive]}
                        onPress={() => setAssignPayer(opt.key)}
                      >
                        <Text style={[styles.payerPillText, active && styles.payerPillTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Estimated Cost ({currencySymbol})</Text>
                <TextInput
                  style={styles.textInput}
                  value={assignFee}
                  onChangeText={setAssignFee}
                  keyboardType="numeric"
                  placeholder="500"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirmAssignment}>
                <Text style={styles.primaryBtnText}>Assign Technician</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* ONBOARD TECHNICIAN BOTTOM SHEET                                    */}
      {/* ================================================================== */}
      <Modal visible={showOnboardModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Onboard Technician</Text>
              <TouchableOpacity onPress={() => setShowOnboardModal(false)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.textInput}
                  value={newStaffName}
                  onChangeText={setNewStaffName}
                  placeholder="e.g. Ramesh Kumar"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Specialty / Trade *</Text>
                <TextInput
                  style={styles.textInput}
                  value={newStaffRole}
                  onChangeText={setNewStaffRole}
                  placeholder="Plumber, Electrician, HVAC..."
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Email (Login) *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newStaffEmail}
                    onChangeText={setNewStaffEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="staff@example.com"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Phone</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newStaffPhone}
                    onChangeText={setNewStaffPhone}
                    keyboardType="phone-pad"
                    placeholder="+91 98765 43210"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Temporary Password</Text>
                <TextInput
                  style={styles.textInput}
                  value={newStaffPassword}
                  onChangeText={setNewStaffPassword}
                  secureTextEntry
                  placeholder="Min. 6 characters (default: Staff@123)"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleOnboardStaffSubmit}
                disabled={isOnboarding}
              >
                <Text style={styles.primaryBtnText}>
                  {isOnboarding ? 'Onboarding...' : 'Add to Team'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Photo Proof Lightbox */}
      <Modal visible={Boolean(lightboxImage)} transparent animationType="fade">
        <TouchableOpacity
          style={styles.lightboxOverlay}
          activeOpacity={1}
          onPress={() => setLightboxImage(null)}
        >
          {lightboxImage && (
            <Image
              source={{ uri: lightboxImage }}
              style={{ width: '90%', height: '65%', borderRadius: 12 }}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>

      {/* Plan Quota Modal */}
      <PlanLimitModal
        visible={Boolean(limitModalType)}
        resourceType={limitModalType}
        onClose={() => setLimitModalType(null)}
        onUpgrade={() => setLimitModalType(null)}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topSubBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    subTabsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    subTabPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
    },
    subTabPillActive: {
      backgroundColor: '#10B981',
    },
    subTabPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    subTabPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#EF4444',
    },
    primaryCtaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#10B981',
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 8,
    },
    primaryCtaBtnText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 24,
    },
    chipsRow: {
      gap: 6,
      paddingBottom: 10,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    chipActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    chipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    chipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    emptyCard: {
      paddingVertical: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    ticketIdText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#10B981',
    },
    priorityPill: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
    },
    priorityPillHigh: {
      backgroundColor: 'rgba(239, 68, 68, 0.14)',
    },
    priorityPillNormal: {
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
    },
    priorityPillText: {
      fontSize: 10,
      fontWeight: '700',
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2.5,
      borderRadius: 999,
    },
    statusPillGreen: {
      backgroundColor: 'rgba(16, 185, 129, 0.14)',
    },
    statusPillAmber: {
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: '700',
    },
    issueRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6,
      gap: 8,
    },
    issueText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
      flex: 1,
    },
    proofThumb: {
      width: 34,
      height: 34,
      borderRadius: 6,
    },
    gridRow: {
      flexDirection: 'row',
      marginTop: 9,
      paddingTop: 9,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      gap: 10,
    },
    gridCol: {
      flex: 1,
    },
    gridLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.3,
    },
    gridValue: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 2,
    },
    gridSubValue: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
      marginTop: 2,
    },
    cardFooter: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    footerBtn: {
      flex: 1,
      flexDirection: 'row',
      gap: 5,
      paddingVertical: 6,
      borderRadius: 7,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    footerBtnPrimary: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: 7,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerBtnPrimaryText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    quotaBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    quotaText: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    avatarCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(16, 185, 129, 0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#10B981',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 24,
      maxHeight: '85%',
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: colors.navy,
    },
    row2: {
      flexDirection: 'row',
      gap: 10,
    },
    inputGroup: {
      marginBottom: 12,
    },
    inputLabel: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
      marginBottom: 5,
    },
    textInput: {
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.navy,
    },
    staffOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      marginBottom: 6,
    },
    staffOptionSelected: {
      borderColor: '#10B981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    payerPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      alignItems: 'center',
    },
    payerPillActive: {
      borderColor: '#10B981',
      backgroundColor: 'rgba(16, 185, 129, 0.14)',
    },
    payerPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    payerPillTextActive: {
      color: '#10B981',
      fontWeight: '700',
    },
    primaryBtn: {
      backgroundColor: '#10B981',
      borderRadius: 9,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontWeight: '700',
    },
    lightboxOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.88)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
