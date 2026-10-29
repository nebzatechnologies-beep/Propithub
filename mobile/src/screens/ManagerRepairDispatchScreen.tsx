import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { MobileTicket, MobileStaffMember } from '../types';

interface ManagerRepairDispatchScreenProps {
  onProfilePress?: () => void;
  onCreateTicketPress?: () => void;
}

export const ManagerRepairDispatchScreen: React.FC<ManagerRepairDispatchScreenProps> = ({
  onProfilePress,
  onCreateTicketPress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, updateTicket, addStaff } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, currencySymbol } = useMobileCurrency();

  const ownerId = user?.ownerId || '';

  const [activeSubTab, setActiveSubTab] = useState<'tickets' | 'staff'>('tickets');
  const [activePriority, setActivePriority] = useState<'all' | 'Emergency' | 'High' | 'Medium'>('all');

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

  // Scoped properties, tickets, and staff matching web
  const myProperties = useMemo(() => {
    if (!ownerId && !user?.assignedProperties?.length) return [];
    return state.properties.filter((p) => {
      if (ownerId && p.ownerId === ownerId) return true;
      if (user?.assignedProperties?.includes(p.id)) return true;
      return false;
    });
  }, [state.properties, ownerId, user?.assignedProperties]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myTickets = useMemo(() => {
    return state.tickets.filter((t) => t.propertyId && myPropertyIds.has(t.propertyId));
  }, [state.tickets, myPropertyIds]);

  const myStaff = useMemo(() => {
    if (!ownerId) return [];
    return state.staff.filter((s) => s.ownerId === ownerId);
  }, [state.staff, ownerId]);

  // Filtered tickets by priority
  const filteredTickets = useMemo(() => {
    return myTickets.filter((t) => {
      if (activePriority === 'all') return true;
      return t.priority === activePriority;
    });
  }, [myTickets, activePriority]);

  const handleOpenAssignModal = (ticket: MobileTicket) => {
    setAssigningTicket(ticket);
    setSelectedStaffId(myStaff[0]?.id || '');
    setAssignFee(String(ticket.costEstimate || 500));
    setAssignPayer(ticket.payment?.payer || 'owner');
  };

  const handleConfirmAssignment = () => {
    if (!assigningTicket || !selectedStaffId) return;

    const staffObj = myStaff.find((s) => s.id === selectedStaffId);
    const feeNum = Number(assignFee) || 0;

    updateTicket(assigningTicket.id, {
      status: 'assigned',
      assignedStaffId: staffObj?.id,
      assignedStaffName: staffObj?.name,
      payment: {
        payer: assignPayer,
        amount: feeNum,
        method: 'Standard',
        status: 'awaiting_payment',
      },
    });

    Alert.alert(
      'Technician Dispatched 🚀',
      `Ticket #${assigningTicket.id} assigned to ${staffObj?.name}. Payer designated: ${assignPayer.toUpperCase()} (${format(feeNum, viewCurrency)}).`
    );
    setAssigningTicket(null);
  };

  const handleResolveTicket = (ticketId: string) => {
    updateTicket(ticketId, {
      status: 'resolved',
    });
    Alert.alert('Ticket Resolved ✓', `Ticket #${ticketId} marked as completed & resolved.`);
  };

  const handleOnboardStaffSubmit = () => {
    if (!newStaffName.trim() || !newStaffEmail.trim()) {
      Alert.alert('Missing Fields', 'Please enter staff name and valid email.');
      return;
    }

    setIsOnboarding(true);
    const newMember: MobileStaffMember = {
      id: `staff-${Date.now()}`,
      name: newStaffName.trim(),
      role: newStaffRole.trim(),
      phone: newStaffPhone.trim(),
      email: newStaffEmail.trim().toLowerCase(),
      assignedProperties: myProperties[0]?.id ? [myProperties[0].id] : [],
      activeTickets: 0,
      rating: 5.0,
      status: 'available',
      ownerId: ownerId || user.id,
    };

    addStaff(newMember, newStaffPassword || 'Staff@123');
    setIsOnboarding(false);
    setShowOnboardModal(false);
    setNewStaffName('');
    setNewStaffPhone('');
    setNewStaffEmail('');
    setNewStaffPassword('');
    Alert.alert('Staff Onboarded ✓', `${newMember.name} added to maintenance staff roster.`);
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Repairs"
        onNotificationPress={() => { }}
        onProfilePress={onProfilePress}
      />

      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        {/* Subtabs matching Web (Tickets vs Staff Roster) */}
        <TourTarget id="manager-maintenance-subtabs">
        <View style={[styles.subTabContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
          <TouchableOpacity
            style={[styles.subTabButton, activeSubTab === 'tickets' && [styles.subTabButtonActive, { backgroundColor: colors.surface }]]}
            onPress={() => setActiveSubTab('tickets')}
            activeOpacity={0.8}
          >
            <Feather
              name="tool"
              size={14}
              color={activeSubTab === 'tickets' ? '#059669' : colors.inkSoft}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[styles.subTabText, { color: colors.inkSoft }, activeSubTab === 'tickets' && [styles.subTabTextActive, { color: colors.navy }]]}
            >
              Tickets ({myTickets.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabButton, activeSubTab === 'staff' && [styles.subTabButtonActive, { backgroundColor: colors.surface }]]}
            onPress={() => setActiveSubTab('staff')}
            activeOpacity={0.8}
          >
            <Feather
              name="users"
              size={14}
              color={activeSubTab === 'staff' ? '#059669' : colors.inkSoft}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[styles.subTabText, { color: colors.inkSoft }, activeSubTab === 'staff' && [styles.subTabTextActive, { color: colors.navy }]]}
            >
              Staff ({myStaff.length})
            </Text>
          </TouchableOpacity>
        </View>

        </TourTarget>

        <ScrollView
          style={[styles.scroll, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {activeSubTab === 'tickets' ? (
            <>
              {/* Priority Filter Bar */}
              <View style={styles.priorityFilterRow}>
                {(['all', 'Emergency', 'High', 'Medium'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityPill,
                      { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line },
                      activePriority === p && styles.priorityPillActive,
                    ]}
                    onPress={() => setActivePriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityPillText,
                        { color: colors.inkSoft },
                        activePriority === p && styles.priorityPillTextActive,
                      ]}
                    >
                      {p === 'all' ? 'All Priority' : p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tickets List */}
              {filteredTickets.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Ionicons name="checkmark-done-circle-outline" size={48} color="#10B981" />
                  <Text style={[styles.emptyTitle, { color: colors.navy }]}>Zero Work Orders</Text>
                  <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                    No maintenance tickets currently match the selected priority filter.
                  </Text>
                </View>
              ) : (
                filteredTickets.map((t) => {
                  const isResolved = t.status === 'resolved';
                  const isHigh = t.priority === 'High' || t.priority === 'Emergency';

                  return (
                    <View key={t.id} style={[styles.ticketCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      <View style={styles.ticketHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <Text style={styles.ticketId}>#{t.id}</Text>
                            <View style={[styles.priorityBadge, isHigh && styles.priorityBadgeHigh]}>
                              <Text style={[styles.priorityBadgeText, isHigh && styles.priorityBadgeTextHigh]}>
                                {t.priority}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.ticketIssue, { color: colors.navy }]}>{t.issue}</Text>
                          <Text style={[styles.ticketSubDetails, { color: colors.inkSoft }]}>
                            Unit {t.unit} • {t.tenant || 'Resident'} • {t.category || 'General'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.statusBadge,
                            isResolved ? styles.statusBadgeGreen : styles.statusBadgeAmber,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isResolved ? { color: '#059669' } : { color: '#B45309' },
                            ]}
                          >
                            {t.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      {/* Technician Info */}
                      <View style={[styles.technicianRow, { borderTopColor: colors.line }]}>
                        <Text style={[styles.technicianLabel, { color: colors.inkSoft }]}>Assigned Technician:</Text>
                        <Text style={[styles.technicianValue, { color: colors.navy }]}>
                          {t.assignedStaffName || 'Unassigned'}
                        </Text>
                      </View>

                      {/* Action Buttons */}
                      {!isResolved ? (
                        <View style={styles.ticketActionRow}>
                          <TouchableOpacity
                            style={styles.dispatchBtn}
                            onPress={() => handleOpenAssignModal(t)}
                            activeOpacity={0.8}
                          >
                            <Feather name="user-check" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                            <Text style={styles.dispatchBtnText}>
                              {t.assignedStaffId ? 'Reassign Tech' : 'Dispatch Technician'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.resolveBtn}
                            onPress={() => handleResolveTicket(t.id)}
                            activeOpacity={0.8}
                          >
                            <Feather name="check-circle" size={13} color="#059669" style={{ marginRight: 4 }} />
                            <Text style={styles.resolveBtnText}>Resolve</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.resolvedBadgeRow}>
                          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                          <Text style={styles.resolvedBadgeText}>Resolved</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </>
          ) : (
            <>
              {/* Staff Roster Tab with + Onboard Staff Button */}
              <View style={styles.staffHeaderRow}>
                <Text style={[styles.staffSectionHeading, { color: colors.navy }]}>
                  Team ({myStaff.length})
                </Text>
                <TouchableOpacity
                  style={styles.onboardBtn}
                  onPress={() => setShowOnboardModal(true)}
                  activeOpacity={0.8}
                >
                  <Feather name="user-plus" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.onboardBtnText}>Onboard Staff</Text>
                </TouchableOpacity>
              </View>

              {myStaff.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Feather name="users" size={48} color={colors.inkSoft} />
                  <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Technicians Onboarded</Text>
                  <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                    Onboard repair contractors and technicians to assign tickets.
                  </Text>
                </View>
              ) : (
                myStaff.map((s) => (
                  <View key={s.id} style={[styles.staffCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <View style={styles.staffCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.staffName, { color: colors.navy }]}>{s.name}</Text>
                        <Text style={[styles.staffRole, { color: colors.inkSoft }]}>{s.role}</Text>
                      </View>
                      <View style={[styles.staffWorkloadBadge, isDark && { backgroundColor: '#1E293B' }]}>
                        <Text style={[styles.staffWorkloadText, { color: colors.inkSoft }]}>
                          {s.activeTickets || 0} Active Tickets
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.staffContactRow, { borderTopColor: colors.line }]}>
                      <TouchableOpacity
                        style={[styles.callStaffBtn, isDark && { backgroundColor: '#1E293B' }]}
                        onPress={() => Linking.openURL(`tel:${s.phone}`)}
                        activeOpacity={0.8}
                      >
                        <Feather name="phone" size={13} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.callStaffBtnText}>{s.phone}</Text>
                      </TouchableOpacity>

                      <Text style={[styles.staffEmailText, { color: colors.inkSoft }]} numberOfLines={1}>
                        {s.email}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Dispatch Technician Modal */}
      <Modal visible={Boolean(assigningTicket)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Dispatch Technician</Text>
                <Text style={[styles.modalSubTitle, { color: colors.inkSoft }]}>
                  Assign work order #{assigningTicket?.id} (Unit {assigningTicket?.unit})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAssigningTicket(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Select Staff */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Select Contractor / Technician</Text>
                {myStaff.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.staffSelectOption,
                      { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line },
                      selectedStaffId === s.id && styles.staffSelectOptionActive,
                    ]}
                    onPress={() => setSelectedStaffId(s.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.staffSelectName, { color: colors.navy }]}>{s.name}</Text>
                      <Text style={[styles.staffSelectRole, { color: colors.inkSoft }]}>{s.role} • {s.phone}</Text>
                    </View>
                    {selectedStaffId === s.id && (
                      <Ionicons name="checkmark-circle" size={18} color="#059669" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Responsible Payer */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Responsible Payer</Text>
                <View style={[styles.payerToggleRow, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <TouchableOpacity
                    style={[
                      styles.payerOption,
                      assignPayer === 'owner' && [styles.payerOptionActive, { backgroundColor: colors.surface }],
                    ]}
                    onPress={() => setAssignPayer('owner')}
                  >
                    <Text
                      style={[
                        styles.payerOptionText,
                        { color: colors.inkSoft },
                        assignPayer === 'owner' && [styles.payerOptionTextActive, { color: colors.navy }],
                      ]}
                    >
                      Property Owner
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.payerOption,
                      assignPayer === 'tenant' && [styles.payerOptionActive, { backgroundColor: colors.surface }],
                    ]}
                    onPress={() => setAssignPayer('tenant')}
                  >
                    <Text
                      style={[
                        styles.payerOptionText,
                        { color: colors.inkSoft },
                        assignPayer === 'tenant' && [styles.payerOptionTextActive, { color: colors.navy }],
                      ]}
                    >
                      Resident Tenant
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Service Fee Amount */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Service Fee Amount ({currencySymbol})</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={assignFee}
                  onChangeText={setAssignFee}
                  keyboardType="numeric"
                  placeholder="500"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              {/* Confirm Dispatch Button */}
              <TouchableOpacity
                style={styles.confirmDispatchBtn}
                onPress={handleConfirmAssignment}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmDispatchBtnText}>Dispatch</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Onboard Staff Modal */}
      <Modal visible={showOnboardModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Onboard Maintenance Staff</Text>
              </View>
              <TouchableOpacity onPress={() => setShowOnboardModal(false)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Full Name</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={newStaffName}
                  onChangeText={setNewStaffName}
                  placeholder="e.g. Ramesh Kumar"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Trade / Role</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={newStaffRole}
                  onChangeText={setNewStaffRole}
                  placeholder="e.g. Master Plumber, Electrician, HVAC"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Email Address</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={newStaffEmail}
                  onChangeText={setNewStaffEmail}
                  keyboardType="email-address"
                  placeholder="staff@example.com"
                  placeholderTextColor={colors.inkSoft}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Phone Number</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={newStaffPhone}
                  onChangeText={setNewStaffPhone}
                  keyboardType="phone-pad"
                  placeholder="+91 98765 43210"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <TouchableOpacity
                style={styles.confirmDispatchBtn}
                onPress={handleOnboardStaffSubmit}
                activeOpacity={0.85}
                disabled={isOnboarding}
              >
                <Text style={styles.confirmDispatchBtnText}>
                  {isOnboarding ? 'Onboarding...' : 'Save & Onboard Technician'}
                </Text>
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
    mainContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    subTabContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 8,
    },
    subTabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    subTabButtonActive: {
      borderBottomColor: '#059669',
    },
    subTabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    subTabTextActive: {
      color: '#059669',
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
    },
    priorityFilterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    priorityPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    priorityPillActive: {
      backgroundColor: '#059669',
      borderColor: '#059669',
    },
    priorityPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    priorityPillTextActive: {
      color: '#FFFFFF',
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginTop: 10,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 10,
      marginBottom: 4,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    ticketCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    ticketHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    ticketId: {
      fontSize: 12,
      fontWeight: '800',
      color: '#059669',
    },
    priorityBadge: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    priorityBadgeHigh: {
      backgroundColor: '#FEE2E2',
    },
    priorityBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    priorityBadgeTextHigh: {
      color: '#DC2626',
    },
    ticketIssue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 2,
    },
    ticketSubDetails: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusBadgeGreen: {
      backgroundColor: '#DCFCE7',
    },
    statusBadgeAmber: {
      backgroundColor: '#FEF3C7',
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
    },
    technicianRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginVertical: 8,
    },
    technicianLabel: {
      fontSize: 11,
      color: colors.inkSoft,
      fontWeight: '500',
    },
    technicianValue: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.navy,
    },
    ticketActionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
    },
    dispatchBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#3B82F6',
      borderRadius: 6,
      paddingVertical: 8,
    },
    dispatchBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    resolveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#BBF7D0',
      borderRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    resolveBtnText: {
      color: '#166534',
      fontSize: 12,
      fontWeight: '700',
    },
    resolvedBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    resolvedBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#10B981',
    },
    staffHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    staffSectionHeading: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    onboardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#059669',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    onboardBtnText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    staffCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    staffCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    staffName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    staffRole: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 1,
    },
    staffWorkloadBadge: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    staffWorkloadText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    staffContactRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 8,
      marginTop: 4,
    },
    callStaffBtn: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    callStaffBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#059669',
    },
    staffEmailText: {
      fontSize: 11.5,
      color: colors.inkSoft,
      maxWidth: 160,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSubTitle: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    inputGroup: {
      marginBottom: 14,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink,
      marginBottom: 6,
    },
    textInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: colors.navy,
    },
    staffSelectOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 6,
      backgroundColor: colors.surface,
    },
    staffSelectOptionActive: {
      borderColor: '#059669',
      backgroundColor: '#ECFDF5',
    },
    staffSelectName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    staffSelectRole: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    payerToggleRow: {
      flexDirection: 'row',
      gap: 8,
    },
    payerOption: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    payerOptionActive: {
      borderColor: '#059669',
      backgroundColor: '#ECFDF5',
    },
    payerOptionText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    payerOptionTextActive: {
      color: '#059669',
      fontWeight: '700',
    },
    confirmDispatchBtn: {
      backgroundColor: '#059669',
      borderRadius: 8,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 20,
    },
    confirmDispatchBtnText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
  });
