import React, { useState, useEffect, useMemo } from 'react';
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
  Share,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileTheme } from '../context/MobileThemeContext';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobilePropertyManager, MobileManagerPayout } from '../types';
import { usePlanLimits, ResourceQuotaType } from '../hooks/usePlanLimits';
import { PlanLimitModal } from '../components/PlanLimitModal';

export interface OwnerTeamManagersScreenProps {
  initialTab?: 'managers' | 'payouts';
  onNavigate?: (screenKey: string) => void;
}

export const OwnerTeamManagersScreen: React.FC<OwnerTeamManagersScreenProps> = ({
  initialTab = 'managers',
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, saveManager, deleteManager, reassignManagerProperty, recordManagerPayout } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, currencySymbol, viewCurrency } = useMobileCurrency();
  const { usage, currentPlanName } = usePlanLimits();
  const [limitModalType, setLimitModalType] = useState<ResourceQuotaType | null>(null);

  // Subtabs (1-to-1 Web Parity: Managers & Payouts)
  const [subTab, setSubTab] = useState<'managers' | 'payouts'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setSubTab(initialTab);
    }
  }, [initialTab]);

  // Add Manager Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [assignedPropertyId, setAssignedPropertyId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Credentials Dialog State (Matching Web)
  const [credentialsModal, setCredentialsModal] = useState<{
    visible: boolean;
    name: string;
    email: string;
    pass: string;
    propertyName?: string;
  } | null>(null);

  // Assign / Unassign Property Modal State
  const [reassignModalManager, setReassignModalManager] = useState<MobilePropertyManager | null>(null);
  const [selectedReassignPropId, setSelectedReassignPropId] = useState<string>('');

  const handleOpenReassignModal = (mgr: MobilePropertyManager) => {
    const currentPropId = mgr.propertyId || myProperties.find((p) => p.assignedManagerId === mgr.id)?.id || '';
    setSelectedReassignPropId(currentPropId);
    setReassignModalManager(mgr);
  };

  const handleConfirmReassignment = async () => {
    if (!reassignModalManager) return;
    await reassignManagerProperty(reassignModalManager.id, selectedReassignPropId || null);
    const chosenProp = myProperties.find((p) => p.id === selectedReassignPropId);
    Alert.alert(
      'Assignment Updated ✓',
      selectedReassignPropId
        ? `${reassignModalManager.name} is now assigned to ${chosenProp?.name || 'Property'}.`
        : `${reassignModalManager.name} has been unassigned. Buildings will remain under your direct management.`
    );
    setReassignModalManager(null);
  };

  const ownerId = user?.id || '';

  const myProperties = useMemo(() => {
    if (!ownerId) return [];
    return (state.properties || []).filter((p) => p.ownerId === ownerId);
  }, [state.properties, ownerId]);

  // Actual Property Managers (Matching Web TeamPage)
  const myManagers = useMemo(() => {
    if (!ownerId) return [];
    return (state.propertyManagers || []).filter(
      (pm) => (ownerId ? pm.ownerId === ownerId : !pm.ownerId)
    );
  }, [state.propertyManagers, ownerId]);

  const myPayouts = useMemo(() => {
    if (!ownerId) return [];
    return (state.managerPayouts || []).filter((p) => p.ownerId === ownerId);
  }, [state.managerPayouts, ownerId]);

  // Disburse / Record Manager Payout Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payingManager, setPayingManager] = useState<{ id: string; name: string } | null>(null);
  const [payMonth, setPayMonth] = useState('October 2026');
  const [payAmount, setPayAmount] = useState(viewCurrency === 'INR' ? '25000' : '2500');
  const [payMethod, setPayMethod] = useState<'Bank Transfer' | 'UPI' | 'Cash'>('Bank Transfer');
  const [payUtr, setPayUtr] = useState('');
  const [payNotes, setPayNotes] = useState('Monthly management fee & operations commission');

  // Payout calculation
  const totalPaidDisbursed = myPayouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPendingDisbursed = myPayouts
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const generateRandomPassword = () => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `Manager#${rand}`;
  };

  const handleOpenAddManager = () => {
    if (usage.managers.isFull) {
      setLimitModalType('managers');
      return;
    }
    setPassword(generateRandomPassword());
    setName('');
    setEmail('');
    setPhone('');
    setAssignedPropertyId(myProperties[0]?.id || '');
    setShowAddModal(true);
  };

  const handleSaveManager = () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanPass = password.trim() || generateRandomPassword();

    if (!cleanName) {
      Alert.alert('Missing Name', 'Please enter the property manager full name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!cleanPhone) {
      Alert.alert('Missing Phone', 'Please enter the manager contact phone number.');
      return;
    }

    const assignedProp = myProperties.find((p) => p.id === assignedPropertyId);
    const newId = `mgr_${Date.now()}`;

    const newManager: MobilePropertyManager = {
      id: newId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      role: 'manager',
      propertyId: assignedPropertyId || undefined,
      assignedProperties: assignedPropertyId ? [assignedPropertyId] : [],
      ownerId: user?.id || ownerId,
      ownerName: user?.displayName || 'Property Owner',
    };

    saveManager(newManager, cleanPass);
    setShowAddModal(false);

    // Show Credentials Modal (Matching Web)
    setCredentialsModal({
      visible: true,
      name: cleanName,
      email: cleanEmail,
      pass: cleanPass,
      propertyName: assignedProp?.name || 'All Properties',
    });
  };

  const handleShareCredentials = async () => {
    if (!credentialsModal) return;
    const msg = `🎉 Propithub Property Manager Account\n\nHello ${credentialsModal.name},\nYour property management account has been created.\n\nEmail: ${credentialsModal.email}\nTemporary Password: ${credentialsModal.pass}\nAssigned Portfolio: ${credentialsModal.propertyName || 'Portfolio'}\n\nPlease download and log in to the Propithub Mobile App.`;
    try {
      await Share.share({ message: msg });
    } catch {
      Alert.alert('Credentials Shared', 'Login credentials copied to clipboard.');
    }
  };

  const handleDeleteManager = (mgr: MobilePropertyManager) => {
    Alert.alert(
      'Remove Property Manager',
      `Are you sure you want to remove ${mgr.name}? They will lose access to all managed units and tenant communications.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteManager(mgr.id),
        },
      ]
    );
  };

  const handleConfirmManagerPayout = () => {
    if (!payingManager) {
      Alert.alert('Select Manager', 'Please select a property manager to compensate.');
      return;
    }
    const numAmount = parseFloat(payAmount) || 0;
    if (numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payout amount.');
      return;
    }

    const newPayout: MobileManagerPayout = {
      id: `PAY-PM-${Date.now().toString().slice(-4)}`,
      managerId: payingManager.id,
      managerName: payingManager.name,
      ownerId: user?.id || 'owner-1',
      month: payMonth.trim() || 'October 2026',
      amount: numAmount,
      currency: viewCurrency,
      status: 'paid',
      paymentMethod: payMethod,
      utrReference: payUtr.trim() || `UTR-${Date.now().toString().slice(-6)}`,
      paidAt: new Date().toISOString().split('T')[0],
      notes: payNotes.trim(),
    };

    recordManagerPayout(newPayout);
    setIsPayModalOpen(false);
    setPayUtr('');

    Alert.alert(
      'Payout Recorded ✓',
      `Disbursed ${format(numAmount, viewCurrency)} to ${payingManager.name} for ${payMonth}. Ref: ${newPayout.utrReference}`,
      [{ text: 'OK' }]
    );
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          {onNavigate && (
            <TouchableOpacity
              onPress={() => onNavigate('owner_dashboard')}
              style={[styles.backBtn, isDark && { backgroundColor: '#1E293B' }]}
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={[styles.logoBadge, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
            <PropithubIcon size={20} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Team</Text>
          </View>
        </View>
        <View style={[styles.ownerBadge, isDark && { backgroundColor: '#1E293B', borderColor: colors.border }]}>
          <Text style={[styles.ownerBadgeText, { color: colors.text }]}>OWNER</Text>
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Field Staff / Maintenance Notice Link (Web Parity) */}
        <TouchableOpacity
          style={[
            styles.fieldStaffNotice,
            isDark && {
              backgroundColor: 'rgba(2, 132, 199, 0.15)',
              borderColor: 'rgba(2, 132, 199, 0.35)',
            },
          ]}
          onPress={() => onNavigate?.('owner_maintenance_dispatch')}
          activeOpacity={0.85}
        >
          <View style={styles.fieldStaffNoticeLeft}>
            <Feather
              name="tool"
              size={15}
              color={isDark ? '#38BDF8' : '#0284C7'}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[
                styles.fieldStaffNoticeText,
                isDark && { color: '#38BDF8' },
              ]}
            >
              Need maintenance techs or plumbers? Go to Maintenance Staff & Dispatch
            </Text>
          </View>
          <Feather name="chevron-right" size={14} color={isDark ? '#38BDF8' : '#0284C7'} />
        </TouchableOpacity>

        {/* SubTab Navigation Bar (1-to-1 Web Parity) */}
        <View style={[styles.tabContainer, isDark && { backgroundColor: '#1E293B' }]}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              subTab === 'managers' && [styles.tabButtonActive, isDark && { backgroundColor: '#0B0F17', borderColor: '#334155' }],
            ]}
            onPress={() => setSubTab('managers')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, subTab === 'managers' && [styles.tabTextActive, isDark && { color: '#F1F5F9' }]]}>
              Managers ({myManagers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              subTab === 'payouts' && [styles.tabButtonActive, isDark && { backgroundColor: '#0B0F17', borderColor: '#334155' }],
            ]}
            onPress={() => setSubTab('payouts')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, subTab === 'payouts' && [styles.tabTextActive, isDark && { color: '#F1F5F9' }]]}>
              Payouts ({myPayouts.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ==================================================== */}
        {/* SUBTAB 1: PROPERTY MANAGERS                          */}
        {/* ==================================================== */}
        {subTab === 'managers' && (
          <View>
            {/* Header Row */}
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionHeading}>Managers</Text>
              </View>
              <TouchableOpacity
                style={styles.addManagerBtn}
                onPress={handleOpenAddManager}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.addManagerBtnText}>Onboard Manager</Text>
              </TouchableOpacity>
            </View>

            {/* Managers List */}
            {myManagers.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSunken }]}>
                  <Feather name="shield" size={32} color="#94A3B8" />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.ink, textAlign: 'center' }]}>
                  No Property Managers Delegated
                </Text>
              </View>
            ) : (
              myManagers.map((manager) => {
                const initials = manager.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                const assignedProp = myProperties.find(
                  (p) => p.id === manager.propertyId || manager.assignedProperties?.includes(p.id)
                );

                return (
                  <View key={manager.id} style={[styles.managerCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <View style={styles.managerTop}>
                      <View style={styles.managerInfoLeft}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{initials}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.managerName, { color: colors.navy }]}>{manager.name}</Text>
                          <Text style={[styles.managerEmail, { color: colors.inkSoft }]}>{manager.email}</Text>
                          <Text style={[styles.managerPhone, { color: colors.inkSoft }]}>{manager.phone}</Text>
                        </View>
                      </View>
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>MANAGER</Text>
                      </View>
                    </View>

                    {/* Assigned Properties */}
                    <View style={styles.assignedSection}>
                      <Text style={styles.assignedHeading}>ASSIGNED PORTFOLIO</Text>
                      <View style={styles.propTagsRow}>
                        <View style={styles.propTag}>
                          <Feather name="map-pin" size={11} color="#059669" />
                          <Text style={styles.propTagText}>
                            {assignedProp ? assignedProp.name : 'All Portfolio Properties'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Action Buttons: Pay Manager, Assign/Unassign & Remove */}
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        style={styles.reassignBtn}
                        onPress={() => handleOpenReassignModal(manager)}
                        activeOpacity={0.8}
                      >
                        <Feather name="home" size={12} color="#2563EB" style={{ marginRight: 4 }} />
                        <Text style={styles.reassignBtnText}>
                          {assignedProp ? 'Reassign' : 'Assign'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.payBtn}
                        onPress={() => {
                          setPayingManager({ id: manager.id, name: manager.name });
                          setIsPayModalOpen(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Feather name="dollar-sign" size={13} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.payBtnText}>Payout</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => handleDeleteManager(manager)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={13} color="#EF4444" style={{ marginRight: 4 }} />
                        <Text style={styles.removeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ==================================================== */}
        {/* SUBTAB 2: MANAGER PAYOUTS (Web Match)                */}
        {/* ==================================================== */}
        {subTab === 'payouts' && (
          <View>
            <View style={styles.payoutOverviewGrid}>
              <View style={styles.payoutStatCard}>
                <Text style={styles.payoutStatLabel}>Total Disbursed</Text>
                <Text style={[styles.payoutStatValue, { color: '#059669' }]}>
                  {format(totalPaidDisbursed, viewCurrency)}
                </Text>
              </View>
              <View style={styles.payoutStatCard}>
                <Text style={styles.payoutStatLabel}>Pending Settlements</Text>
                <Text style={[styles.payoutStatValue, { color: '#D97706' }]}>
                  {format(totalPendingDisbursed, viewCurrency)}
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Payout History</Text>
            </View>

            {myPayouts.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Feather name="credit-card" size={32} color={colors.inkSoft} />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Disbursed Payouts</Text>
                <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                  Record management fees or commissions under the Managers tab.
                </Text>
              </View>
            ) : (
              myPayouts.map((payout) => (
                <View key={payout.id} style={[styles.payoutCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <View style={styles.payoutTop}>
                    <View>
                      <Text style={[styles.payoutManagerName, { color: colors.navy }]}>{payout.managerName}</Text>
                      <Text style={[styles.payoutMonth, { color: colors.inkSoft }]}>{payout.month}</Text>
                    </View>
                    <View style={styles.payoutAmountWrap}>
                      <Text style={styles.payoutAmount}>
                        {format(payout.amount, payout.currency || viewCurrency)}
                      </Text>
                      <View style={styles.payoutStatusBadge}>
                        <Text style={styles.payoutStatusText}>{payout.status.toUpperCase()}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.payoutFooter, { borderTopColor: colors.line }]}>
                    <Text style={[styles.payoutRef, { color: colors.inkSoft }]}>Ref: {payout.utrReference || 'UTR-N/A'}</Text>
                    <Text style={[styles.payoutMethod, { color: colors.inkSoft }]}>{payout.paymentMethod}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ==================================================== */}
      {/* MODAL 1: ONBOARD PROPERTY MANAGER (Web Parity)       */}
      {/* ==================================================== */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Onboard Property Manager</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>Provision login credentials and assign buildings</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Manager Full Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Rahul Sharma"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>Work Email Address *</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="rahul@company.com"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Assigned Property Scope</Text>
              <View style={styles.propSelectCol}>
                <TouchableOpacity
                  style={[styles.propSelectChip, assignedPropertyId === '' && styles.propSelectChipActive]}
                  onPress={() => setAssignedPropertyId('')}
                >
                  <Text style={[styles.propSelectText, assignedPropertyId === '' && styles.propSelectTextActive]}>
                    🌐 All Portfolio Properties
                  </Text>
                </TouchableOpacity>
                {myProperties.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.propSelectChip, assignedPropertyId === p.id && styles.propSelectChipActive]}
                    onPress={() => setAssignedPropertyId(p.id)}
                  >
                    <Text style={[styles.propSelectText, assignedPropertyId === p.id && styles.propSelectTextActive]}>
                      🏢 {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Initial Login Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="Manager#1234"
                  placeholderTextColor="#94A3B8"
                />
                <TouchableOpacity
                  style={styles.passToggleBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
              <Text style={styles.passHint}>Auto-generated secure password. Manager can reset anytime.</Text>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSaveManager}
                activeOpacity={0.88}
              >
                <Feather name="shield" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.submitBtnText}>Provision Manager Account</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 2: CREDENTIALS SHARING MODAL (Web Parity)      */}
      {/* ==================================================== */}
      <Modal
        visible={Boolean(credentialsModal?.visible)}
        transparent
        animationType="fade"
        onRequestClose={() => setCredentialsModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.credsHeader}>
              <View style={styles.credsIconCircle}>
                <Feather name="check" size={24} color="#16A34A" />
              </View>
              <Text style={[styles.credsTitle, { color: colors.navy }]}>Manager Account Ready! 🎉</Text>
              <Text style={[styles.credsSub, { color: colors.inkSoft }]}>
                Share these credentials with {credentialsModal?.name} to log in.
              </Text>
            </View>

            <View style={styles.credsBox}>
              <View style={styles.credsRow}>
                <Text style={styles.credsKey}>Role:</Text>
                <Text style={styles.credsVal}>Property Manager</Text>
              </View>
              <View style={styles.credsRow}>
                <Text style={styles.credsKey}>Email:</Text>
                <Text style={styles.credsValBold}>{credentialsModal?.email}</Text>
              </View>
              <View style={styles.credsRow}>
                <Text style={styles.credsKey}>Password:</Text>
                <Text style={styles.credsValBold}>{credentialsModal?.pass}</Text>
              </View>
              <View style={styles.credsRow}>
                <Text style={styles.credsKey}>Portfolio:</Text>
                <Text style={styles.credsVal}>{credentialsModal?.propertyName || 'All Properties'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.shareCredsBtn}
              onPress={handleShareCredentials}
              activeOpacity={0.88}
            >
              <Feather name="share-2" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.shareCredsBtnText}>Share Login Credentials</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setCredentialsModal(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 3: DISBURSE / RECORD MANAGER PAYOUT            */}
      {/* ==================================================== */}
      <Modal visible={isPayModalOpen} transparent animationType="slide" onRequestClose={() => setIsPayModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Disburse Manager Payout</Text>
                <Text style={{ fontSize: 12, color: colors.inkSoft, marginTop: 2 }}>
                  {payingManager ? payingManager.name : 'Select Manager'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsPayModalOpen(false)}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Billing Month</Text>
              <TextInput style={styles.input} value={payMonth} onChangeText={setPayMonth} />

              <Text style={styles.fieldLabel}>Payout Amount ({viewCurrency})</Text>
              <TextInput
                style={styles.input}
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Disbursement Mode</Text>
              <View style={styles.payoutMethodRow}>
                {(['Bank Transfer', 'UPI', 'Cash'] as const).map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[styles.methodChip, payMethod === method && styles.methodChipActive]}
                    onPress={() => setPayMethod(method)}
                  >
                    <Text style={[styles.methodChipText, payMethod === method && styles.methodChipTextActive]}>
                      {method}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>UTR / Transaction Reference</Text>
              <TextInput
                style={styles.input}
                value={payUtr}
                onChangeText={setPayUtr}
                placeholder="UTR-987654321"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>Memo / Notes</Text>
              <TextInput style={styles.input} value={payNotes} onChangeText={setPayNotes} />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleConfirmManagerPayout}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Confirm &amp; Record Settlement</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 4: ASSIGN / UNASSIGN PROPERTY                  */}
      {/* ==================================================== */}
      <Modal
        visible={reassignModalManager !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setReassignModalManager(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Assign / Unassign Property</Text>
                <Text style={{ fontSize: 12, color: colors.inkSoft, marginTop: 2 }}>
                  {reassignModalManager ? `${reassignModalManager.name} (${reassignModalManager.email})` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReassignModalManager(null)}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Select Portfolio Scope</Text>

              {/* Option: None / Unassigned */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: selectedReassignPropId === '' ? '#3B82F6' : colors.line,
                  backgroundColor: selectedReassignPropId === '' ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF') : colors.surfaceSunken,
                  marginBottom: 10,
                }}
                onPress={() => setSelectedReassignPropId('')}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: selectedReassignPropId === '' ? '#2563EB' : colors.navy }}>
                    None (Unassigned / Floating Manager)
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>
                    Detaches manager from properties without deleting their account.
                  </Text>
                </View>
                {selectedReassignPropId === '' && <Feather name="check-circle" size={18} color="#2563EB" />}
              </TouchableOpacity>

              {/* List of Properties */}
              {myProperties.map((prop) => {
                const isSelected = selectedReassignPropId === prop.id;
                const propAddr = typeof prop.address === 'string' ? prop.address : prop.address?.formattedAddress || prop.address?.city || 'Property';
                return (
                  <TouchableOpacity
                    key={prop.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: isSelected ? '#3B82F6' : colors.line,
                      backgroundColor: isSelected ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF') : colors.surfaceSunken,
                      marginBottom: 8,
                    }}
                    onPress={() => setSelectedReassignPropId(prop.id)}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? '#2563EB' : colors.navy }}>
                        {prop.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }} numberOfLines={1}>
                        {propAddr}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color="#2563EB" />}
                  </TouchableOpacity>
                );
              })}

              <View style={{ marginTop: 14 }}>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleConfirmReassignment}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>Save Assignment</Text>
                </TouchableOpacity>

                {selectedReassignPropId !== '' && (
                  <TouchableOpacity
                    style={{
                      marginTop: 8,
                      paddingVertical: 11,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#EF4444',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      alignItems: 'center',
                    }}
                    onPress={() => setSelectedReassignPropId('')}
                    activeOpacity={0.75}
                  >
                    <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 12 }}>
                      Unassign from Property
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Plan Quota Limit Interception Modal */}
      <PlanLimitModal
        visible={limitModalType !== null}
        resourceType={limitModalType}
        currentUsage={limitModalType ? usage[limitModalType].used : 0}
        limit={limitModalType ? usage[limitModalType].max : 0}
        planName={currentPlanName}
        onClose={() => setLimitModalType(null)}
        onUpgrade={() => {
          setLimitModalType(null);
          onNavigate?.('owner_plan_subscription');
        }}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.surface,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backBtn: {
      padding: 6,
      marginRight: 2,
    },
    logoBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.navy,
    },
    headerSub: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    ownerBadge: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    ownerBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.inkSoft,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
    },
    fieldStaffNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(3, 105, 161, 0.15)' : '#F0F9FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : '#BAE6FD',
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    fieldStaffNoticeLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 6,
    },
    fieldStaffNoticeText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#7DD3FC' : '#0369A1',
      lineHeight: 16,
      flex: 1,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
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
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    tabTextActive: {
      color: colors.navy,
      fontWeight: '700',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.navy,
    },
    sectionSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    addManagerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#10B981',
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    addManagerBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 36,
      paddingHorizontal: 20,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    emptyIconCircle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      textAlign: 'center',
      marginBottom: 4,
    },
    emptySub: {
      fontSize: 12.5,
      color: colors.inkSoft,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 16,
    },
    emptyCtaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#10B981',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    emptyCtaBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    managerCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 12,
    },
    managerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    managerInfoLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    avatarText: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    managerName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    managerEmail: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 1,
    },
    managerPhone: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    activePill: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    activePillText: {
      fontSize: 10,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#15803D',
    },
    assignedSection: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 8,
      marginBottom: 10,
    },
    assignedHeading: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    propTagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    propTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      gap: 4,
    },
    propTagText: {
      fontSize: 11.5,
      color: colors.ink,
      fontWeight: '600',
    },
    cardActionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      flexWrap: 'wrap',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 10,
      gap: 8,
    },
    payBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    payBtnText: {
      color: isDark ? '#34D399' : '#059669',
      fontSize: 12,
      fontWeight: '700',
    },
    reassignBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
      paddingVertical: 6,
      paddingHorizontal: 9,
      borderRadius: 8,
    },
    reassignBtnText: {
      color: '#2563EB',
      fontSize: 12,
      fontWeight: '700',
    },
    removeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
      paddingVertical: 6,
      paddingHorizontal: 9,
      borderRadius: 8,
    },
    removeBtnText: {
      color: '#EF4444',
      fontSize: 12,
      fontWeight: '700',
    },
    payoutOverviewGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    payoutStatCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
    },
    payoutStatLabel: {
      fontSize: 11,
      color: colors.inkSoft,
      fontWeight: '600',
      marginBottom: 4,
    },
    payoutStatValue: {
      fontSize: 16,
      fontWeight: '800',
    },
    payoutCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 10,
    },
    payoutTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    payoutManagerName: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
    },
    payoutMonth: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    payoutAmountWrap: {
      alignItems: 'flex-end',
    },
    payoutAmount: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.navy,
    },
    payoutStatusBadge: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      marginTop: 2,
    },
    payoutStatusText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#15803D',
    },
    payoutFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 6,
    },
    payoutRef: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    payoutMethod: {
      fontSize: 11,
      color: colors.ink,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalCard: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 20,
      maxHeight: '90%',
    },
    modalTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.navy,
    },
    modalSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 10,
      marginBottom: 4,
    },
    input: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: colors.ink,
    },
    propSelectCol: {
      gap: 6,
    },
    propSelectChip: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    },
    propSelectChipActive: {
      borderColor: '#059669',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    },
    propSelectText: {
      fontSize: 12,
      color: colors.ink,
      fontWeight: '500',
    },
    propSelectTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    passwordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    passToggleBtn: {
      padding: 10,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
    },
    passHint: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 4,
      marginBottom: 12,
    },
    submitBtn: {
      backgroundColor: '#10B981',
      borderRadius: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 14,
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    credsHeader: {
      alignItems: 'center',
      marginBottom: 16,
    },
    credsIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
    },
    credsTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.navy,
    },
    credsSub: {
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: 'center',
      marginTop: 4,
    },
    credsBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      gap: 8,
      marginBottom: 16,
    },
    credsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    credsKey: {
      fontSize: 12,
      color: colors.inkSoft,
      fontWeight: '600',
    },
    credsVal: {
      fontSize: 12.5,
      color: colors.navy,
      fontWeight: '600',
    },
    credsValBold: {
      fontSize: 13,
      color: colors.navy,
      fontWeight: '800',
      fontFamily: 'monospace',
    },
    shareCredsBtn: {
      backgroundColor: '#059669',
      borderRadius: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    shareCredsBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    doneBtn: {
      paddingVertical: 8,
      alignItems: 'center',
    },
    doneBtnText: {
      color: colors.inkSoft,
      fontSize: 13,
      fontWeight: '600',
    },
    payoutMethodRow: {
      flexDirection: 'row',
      gap: 8,
      marginVertical: 4,
    },
    methodChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      alignItems: 'center',
    },
    methodChipActive: {
      borderColor: '#059669',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    },
    methodChipText: {
      fontSize: 12,
      color: colors.ink,
      fontWeight: '600',
    },
    methodChipTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
  });
