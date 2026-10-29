import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileTicket, MobileStaffMember } from '../types';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';

interface OwnerMaintenanceDispatchScreenProps {
  onProfilePress?: () => void;
  onCreateTicketPress?: () => void;
}

export const OwnerMaintenanceDispatchScreen: React.FC<OwnerMaintenanceDispatchScreenProps> = ({
  onProfilePress,
  onCreateTicketPress,
}) => {
  const { state, updateTicket, addStaff } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, currencySymbol } = useMobileCurrency();
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [activeTab, setActiveTab] = useState<'orders' | 'techs'>('orders');

  const ownerId = user?.id || '';

  const tickets = useMemo(() => {
    if (!ownerId) return [];
    return state.tickets.filter((t) => t.ownerId === ownerId);
  }, [state.tickets, ownerId]);

  const staffTechs = useMemo(() => {
    if (!ownerId) return [];
    return state.staff.filter((s) => s.ownerId === ownerId);
  }, [state.staff, ownerId]);

  // Dispatch Assignment Modal State
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [ticketToAssign, setTicketToAssign] = useState<MobileTicket | null>(null);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [assignPayer, setAssignPayer] = useState<'owner' | 'tenant'>('owner');
  const [assignFee, setAssignFee] = useState<string>('650');

  // Technician Onboarding Modal State
  const [onboardModalVisible, setOnboardModalVisible] = useState(false);
  const [newTechName, setNewTechName] = useState('');
  const [newTechPhone, setNewTechPhone] = useState('');
  const [newTechEmail, setNewTechEmail] = useState('');
  const [newTechRole, setNewTechRole] = useState('');
  const [newTechPassword, setNewTechPassword] = useState('Staff@2026');

  // Credentials Generated Modal
  const [credentialsModalVisible, setCredentialsModalVisible] = useState(false);
  const [newCreds, setNewCreds] = useState<{ name: string; email: string; pass: string; role: string } | null>(null);

  const openAssignModal = (tck: MobileTicket) => {
    setTicketToAssign(tck);
    setSelectedTechId(staffTechs[0]?.id || '');
    setAssignPayer('owner');
    setAssignFee(String(tck.costEstimate || 650));
    setAssignModalVisible(true);
  };

  const handleConfirmAssignment = () => {
    if (!ticketToAssign) return;
    const targetTech = staffTechs.find((s) => s.id === selectedTechId) || staffTechs[0];
    const techName = targetTech ? targetTech.name : 'Assigned Technician';
    const amountNum = Number(assignFee) || 500;

    updateTicket(ticketToAssign.id, {
      status: 'assigned',
      assignedStaffId: selectedTechId || targetTech?.id,
      assignedStaffName: techName,
      costEstimate: amountNum,
      payment: {
        payer: assignPayer,
        amount: amountNum,
        method: null,
        status: 'awaiting_payment',
      },
    });

    setAssignModalVisible(false);
    Alert.alert(
      'Work Order Dispatched ✓',
      `${techName} dispatched to Ticket #${ticketToAssign.id}. Payer set to: ${assignPayer === 'owner' ? 'Landlord' : 'Tenant Reimbursement'} (${format(amountNum, viewCurrency)}).`
    );
  };

  const handleResolveTicket = (ticketId: string) => {
    updateTicket(ticketId, {
      status: 'resolved',
      completionNotes: 'Issue inspected and repaired on-site.',
    });
    Alert.alert('Work Order Resolved', `Ticket #${ticketId} marked as completed.`);
  };

  const handleOnboardTech = () => {
    if (!newTechName.trim() || !newTechPhone.trim()) {
      Alert.alert('Missing Info', 'Please enter technician name and phone number.');
      return;
    }

    const genEmail = newTechEmail.trim() || `${newTechName.toLowerCase().replace(/\s+/g, '')}@propithub.staff`;
    const genPass = newTechPassword.trim() || `Tech#${Math.floor(1000 + Math.random() * 9000)}`;
    const resolvedRole = newTechRole.trim() || 'General Maintenance';

    const newStaff: MobileStaffMember = {
      id: `STF-${Date.now().toString().slice(-4)}`,
      name: newTechName.trim(),
      email: genEmail,
      phone: newTechPhone.trim(),
      role: resolvedRole,
      assignedProperties: state.properties.find((p) => p.ownerId === ownerId) ? [state.properties.find((p) => p.ownerId === ownerId)!.id] : [],
      activeTickets: 0,
      status: 'on_duty',
      rating: 5,
      ownerId,
    };

    addStaff(newStaff, genPass);
    setOnboardModalVisible(false);
    setNewCreds({
      name: newStaff.name,
      email: genEmail,
      pass: genPass,
      role: resolvedRole,
    });
    setCredentialsModalVisible(true);

    setNewTechName('');
    setNewTechPhone('');
    setNewTechEmail('');
    setNewTechRole('');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Maintenance"
        onNotificationPress={() => {}}
        onProfilePress={onProfilePress}
      />

      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Segmented Capsule Tabs (1-to-1 Web MaintenancePage Parity) */}
          <TourTarget id="owner-maintenance-controls">
            <View style={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#E9EEF5' }]}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'orders' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
                onPress={() => setActiveTab('orders')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'orders' && [styles.tabTextActive, { color: colors.navy }]]}>
                  Tickets ({tickets.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'techs' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
                onPress={() => setActiveTab('techs')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'techs' && [styles.tabTextActive, { color: colors.navy }]]}>
                  Technicians ({staffTechs.length})
                </Text>
              </TouchableOpacity>
            </View>
          </TourTarget>

          {/* TAB 1: WORK ORDERS */}
          {activeTab === 'orders' && (
            <View>
              {tickets.map((tck) => {
                const isHigh = tck.priority === 'High' || tck.priority === 'Emergency';
                const isResolved = tck.status === 'resolved';

                return (
                  <View key={tck.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    {/* Header: Order Number + Priority Badge */}
                    <View style={styles.cardHeader}>
                      <Text style={styles.orderNumber}>TICKET #{tck.id}</Text>
                      <View style={isHigh ? styles.priorityBadgeHigh : styles.priorityBadge}>
                        <Text style={isHigh ? styles.priorityBadgeTextHigh : styles.priorityBadgeText}>
                          {tck.priority.toUpperCase()} PRIORITY
                        </Text>
                      </View>
                    </View>

                    {/* Issue Title & Unit */}
                    <Text style={[styles.issueTitle, { color: colors.navy }]}>{tck.issue}</Text>
                    <Text style={[styles.unitDetail, { color: colors.inkSoft }]}>
                      Unit {tck.unit} • {tck.propertyName} • Tenant: {tck.tenant} ({tck.tenantPhone})
                    </Text>

                    {tck.preferredTimeSlot && (
                      <Text style={styles.slotDetail}>
                        Preferred Time: {tck.preferredTimeSlot}
                      </Text>
                    )}

                    <View style={styles.divider} />

                    {/* Assignment & Status Control Row */}
                    <View style={styles.assignRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.assignLabel}>ASSIGNED TECHNICIAN</Text>
                        <Text style={styles.assignValue}>
                          {tck.assignedStaffName || 'Unassigned / Needs Dispatch'}
                        </Text>
                        {tck.costEstimate ? (
                          <Text style={styles.costSubText}>
                            Fee: {format(tck.costEstimate, tck.currency || viewCurrency)} • Payer: {tck.payment?.payer === 'tenant' ? 'Tenant Reimbursable' : 'Owner'}
                          </Text>
                        ) : null}
                      </View>

                      <View style={isResolved ? styles.resolvedBadge : styles.statusPill}>
                        <Text style={isResolved ? styles.resolvedBadgeText : styles.statusPillText}>
                          {tck.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Dispatch Action Buttons */}
                    <View style={styles.actionBtnRow}>
                      {!tck.assignedStaffId && (
                        <TouchableOpacity
                          style={styles.dispatchTechBtn}
                          onPress={() => openAssignModal(tck)}
                        >
                          <Feather name="user-check" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.dispatchTechBtnText}>
                            Dispatch
                          </Text>
                        </TouchableOpacity>
                      )}

                      {!isResolved && (
                        <TouchableOpacity
                          style={styles.resolveBtn}
                          onPress={() => handleResolveTicket(tck.id)}
                        >
                          <Text style={styles.resolveBtnText}>Resolve</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* TAB 2: TECHNICIANS ROSTER */}
          {activeTab === 'techs' && (
            <View>
              {/* Onboard Technician Action Card */}
              <TouchableOpacity
                style={[styles.onboardBannerCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
                onPress={() => setOnboardModalVisible(true)}
                activeOpacity={0.85}
              >
                <View style={styles.onboardBannerLeft}>
                  <View style={styles.onboardIconBox}>
                    <Feather name="user-plus" size={18} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={[styles.onboardBannerTitle, { color: colors.navy }]}>Onboard New Technician</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.inkSoft} />
              </TouchableOpacity>

              {staffTechs.map((st) => (
                <View key={st.id} style={[styles.techCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <View style={styles.techTop}>
                    <View style={styles.techAvatar}>
                      <Text style={styles.techAvatarText}>{(st.name || 'TC').slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.techName, { color: colors.navy }]}>{st.name || 'Technician'}</Text>
                      <Text style={[styles.techRole, { color: colors.inkSoft }]}>{(st.role || 'Staff')} • {(st.phone || 'N/A')}</Text>
                    </View>
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.ratingText}>{st.rating ?? 5.0}</Text>
                    </View>
                  </View>
                  <View style={[styles.techFooter, { borderTopColor: colors.line }]}>
                    <Text style={[styles.techStats, { color: colors.inkSoft }]}>Active Work: {st.activeTickets ?? 0} jobs</Text>
                    <View style={styles.onlineBadge}>
                      <Text style={styles.onlineBadgeText}>{(st.status || 'Active').toUpperCase()}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 90 }} />
        </ScrollView>

        {/* Floating Button: + New Ticket */}
        <TouchableOpacity
          style={styles.fabButton}
          onPress={onCreateTicketPress}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={13} color="#FFFFFF" />
          <Text style={styles.fabButtonText}>New Request</Text>
        </TouchableOpacity>
      </View>

      {/* DISPATCH ASSIGNMENT MODAL (1-to-1 Web Parity) */}
      <Modal visible={assignModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Dispatch Work Order</Text>
                <Text style={[styles.modalSubtitle, { color: colors.inkSoft }]}>Ticket #{ticketToAssign?.id} • Unit {ticketToAssign?.unit}</Text>
              </View>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Select Technician</Text>
              <View style={styles.techPillGrid}>
                {staffTechs.map((st) => (
                  <TouchableOpacity
                    key={st.id}
                    style={[styles.techSelectPill, selectedTechId === st.id && styles.techSelectPillActive]}
                    onPress={() => setSelectedTechId(st.id)}
                  >
                    <Text style={[styles.techSelectPillName, selectedTechId === st.id && styles.techSelectPillNameActive]}>
                      {st.name}
                    </Text>
                    <Text style={styles.techSelectPillRole}>{st.role}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Payer Responsibility (Who bears cost?)</Text>
              <View style={styles.payerToggleRow}>
                <TouchableOpacity
                  style={[styles.payerBtn, assignPayer === 'owner' && styles.payerBtnActive]}
                  onPress={() => setAssignPayer('owner')}
                >
                  <Text style={[styles.payerBtnText, assignPayer === 'owner' && styles.payerBtnTextActive]}>
                    Owner (Landlord Routine)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.payerBtn, assignPayer === 'tenant' && styles.payerBtnActive]}
                  onPress={() => setAssignPayer('tenant')}
                >
                  <Text style={[styles.payerBtnText, assignPayer === 'tenant' && styles.payerBtnTextActive]}>
                    Tenant (Misuse / Damage)
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Work Order Fee / Budget ({currencySymbol})</Text>
              <TextInput
                style={styles.input}
                value={assignFee}
                onChangeText={setAssignFee}
                keyboardType="numeric"
                placeholder="e.g. 650"
                placeholderTextColor={colors.inkSoft}
              />

              <TouchableOpacity
                style={styles.submitBtnGreen}
                onPress={handleConfirmAssignment}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Assign Tech</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* TECHNICIAN ONBOARDING MODAL (1-to-1 Web Parity) */}
      <Modal visible={onboardModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Onboard Technician</Text>
              </View>
              <TouchableOpacity onPress={() => setOnboardModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Technician Full Name *</Text>
              <TextInput
                style={styles.input}
                value={newTechName}
                onChangeText={setNewTechName}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={styles.fieldLabel}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={newTechPhone}
                onChangeText={setNewTechPhone}
                placeholder="+91 98765 43210"
                keyboardType="phone-pad"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={styles.fieldLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={newTechEmail}
                onChangeText={setNewTechEmail}
                placeholder="ramesh.tech@propithub.com"
                autoCapitalize="none"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={styles.fieldLabel}>Specialization</Text>
              <TextInput
                style={styles.input}
                value={newTechRole}
                onChangeText={setNewTechRole}
                placeholder="Electrician, Plumber, General..."
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={styles.fieldLabel}>Initial Login Password</Text>
              <TextInput
                style={styles.input}
                value={newTechPassword}
                onChangeText={setNewTechPassword}
                placeholder="Temporary login password"
                placeholderTextColor={colors.inkSoft}
              />

              <TouchableOpacity
                style={styles.submitBtnGreen}
                onPress={handleOnboardTech}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Create Tech</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CREDENTIALS CONFIRMATION MODAL */}
      <Modal visible={credentialsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: 360, backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>Technician Provisioned ✓</Text>
              <TouchableOpacity onPress={() => setCredentialsModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <View style={styles.credBox}>
              <Text style={styles.credTitle}>{newCreds?.name}</Text>
              <Text style={styles.credSub}>{newCreds?.role}</Text>

              <View style={styles.credRow}>
                <Text style={styles.credKey}>Email / Login:</Text>
                <Text style={styles.credVal}>{newCreds?.email}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credKey}>Password:</Text>
                <Text style={styles.credVal}>{newCreds?.pass}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.submitBtnGreen}
              onPress={() => {
                setCredentialsModalVisible(false);
                Alert.alert('Credentials Ready', 'Login credentials copied. Share them directly with the technician.');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>Done</Text>
            </TouchableOpacity>
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
    backgroundColor: '#FFFFFF',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E9EEF5',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  priorityBadgeHigh: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  priorityBadgeTextHigh: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  issueTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  unitDetail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  slotDetail: {
    fontSize: 11,
    color: '#059669',
    marginTop: 4,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  assignRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  assignValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  resolvedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
  },
  resolvedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  dispatchTechBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  dispatchTechBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  resolveBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  resolveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  techCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  techTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  techAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  techAvatarText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
  },
  techName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  techRole: {
    fontSize: 11,
    color: '#64748B',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  techFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  techStats: {
    fontSize: 11,
    color: '#64748B',
  },
  onlineBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#ECFDF5',
    borderRadius: 4,
  },
  onlineBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  fabButton: {
    position: 'absolute',
    bottom: 16,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    gap: 4,
  },
  fabButtonText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  costSubText: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  onboardBannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  onboardBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  onboardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  onboardBannerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  compensationSummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  compStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  compStatLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  compStatVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  compStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  paidBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  pendingPayoutBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  pendingPayoutBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  feeHighlight: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  compensateBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compensateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.navy,
    marginBottom: 10,
  },
  techPillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  techSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.line,
  },
  techSelectPillActive: {
    backgroundColor: isDark ? '#064E3B' : '#DCFCE7',
    borderColor: '#10B981',
  },
  techSelectPillName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.navy,
  },
  techSelectPillNameActive: {
    color: '#059669',
  },
  techSelectPillRole: {
    fontSize: 10,
    color: colors.inkSoft,
  },
  payerToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  payerBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
  },
  payerBtnActive: {
    backgroundColor: isDark ? '#064E3B' : '#DCFCE7',
    borderColor: '#10B981',
  },
  payerBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.ink,
  },
  payerBtnTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rolePillActive: {
    backgroundColor: isDark ? '#064E3B' : '#DCFCE7',
    borderColor: '#10B981',
  },
  rolePillText: {
    fontSize: 11,
    color: colors.ink,
  },
  rolePillTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  submitBtnGreen: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  credBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginVertical: 12,
  },
  credTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.navy,
  },
  credSub: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginBottom: 10,
  },
  credRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  credKey: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  credVal: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#059669',
  },
  payoutDetailBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  payoutDetailLabel: {
    fontSize: 11.5,
    color: colors.inkSoft,
  },
  payoutDetailVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 2,
  },
  payoutAmountGreen: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
  },
});
