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
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MobileMoveOut } from '../types';
import { useMobileTheme } from '../context/MobileThemeContext';

interface VacatesMoveoutScreenProps {
  onProfilePress?: () => void;
  onInspectPress?: (moveOutId?: string) => void;
  onFileDisputePress?: () => void;
}

export const VacatesMoveoutScreen: React.FC<VacatesMoveoutScreenProps> = ({
  onProfilePress,
  onInspectPress,
  onFileDisputePress,
}) => {
  const { state, updateMoveOut, addMoveOut, createDepositSettlement } = useMobileAppData();
  const { format, viewCurrency, currencySymbol } = useMobileCurrency();
  const { colors, isDark } = useMobileTheme();

  const [activeTab, setActiveTab] = useState<'active' | 'settled'>('active');

  // Initiate Vacate Modal State
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [vacateDate, setVacateDate] = useState('2024-11-30');
  const [vacateReason, setVacateReason] = useState('Lease expired');
  const [forwardingAddress, setForwardingAddress] = useState('Flat 501, Horizon Towers, Bangalore');

  // Schedule Inspection Modal State (1-to-1 Web Parity)
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingMoveOut, setSchedulingMoveOut] = useState<MobileMoveOut | null>(null);
  const [scheduleInspectDate, setScheduleInspectDate] = useState('2024-11-20');
  const [scheduleRefundDate, setScheduleRefundDate] = useState('2024-11-25');

  // Payout Settlement Modal State
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [selectedMoveOut, setSelectedMoveOut] = useState<MobileMoveOut | null>(null);
  const [payoutRail, setPayoutRail] = useState<'bank' | 'cheque' | 'cash'>('bank');
  const [payoutRef, setPayoutRef] = useState('UTR-982187391');
  const [tenantRating, setTenantRating] = useState(5);
  const [tenantReview, setTenantReview] = useState('Tenant maintained property well and coordinated move-out promptly.');

  // Recalculate Settlement Modal State
  const [showRecalculateModal, setShowRecalculateModal] = useState(false);
  const [recalculatingMoveOut, setRecalculatingMoveOut] = useState<MobileMoveOut | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [revisedDeductionAmount, setRevisedDeductionAmount] = useState('');

  // Clearance Voucher Modal State (1-to-1 Web Parity)
  const [showClearanceModal, setShowClearanceModal] = useState(false);
  const [voucherMoveOut, setVoucherMoveOut] = useState<MobileMoveOut | null>(null);

  const { user } = useMobileAuth();
  const ownerId = user?.id || '';
  const ownerEmail = (user?.email || '').toLowerCase();
  const ownerName = (user?.displayName || '').toLowerCase();

  const isGenericName = (n?: string) => {
    if (!n) return true;
    const s = n.trim().toLowerCase();
    return s === 'property owner' || s === 'landlord' || s === 'owner' || s === 'admin' || s === 'manager';
  };

  const myProperties = useMemo(() => {
    if (!ownerId) return [];
    return state.properties.filter(
      (p) =>
        p.ownerId === ownerId ||
        (ownerEmail && (p as any).ownerEmail?.toLowerCase() === ownerEmail)
    );
  }, [state.properties, ownerId, ownerEmail]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    if (!ownerId) return [];
    return state.units.filter(
      (u) => u.ownerId === ownerId || (u.propertyId && myPropertyIds.has(u.propertyId))
    );
  }, [state.units, ownerId, myPropertyIds]);

  const myMoveOuts = useMemo(() => {
    if (!ownerId) return [];
    return state.moveOuts.filter((m) => {
      if (m.ownerId === ownerId) return true;
      if (m.propertyId && myPropertyIds.has(m.propertyId)) return true;
      return false;
    });
  }, [state.moveOuts, ownerId, myPropertyIds]);

  // Filtered moveouts
  const displayedMoveOuts = useMemo(() => {
    return myMoveOuts.filter((m) => {
      const isSettled = m.status === 'settled' || m.status === 'refund_completed';
      if (activeTab === 'active') {
        return !isSettled;
      }
      return isSettled;
    });
  }, [myMoveOuts, activeTab]);

  const handleInitiateVacate = () => {
    const unit = myUnits.find((u) => u.id === selectedUnitId) || myUnits[0];
    const tenant = state.tenants.find(
      (t) =>
        (unit?.currentTenantId && t.id === unit.currentTenantId) ||
        (t.unit === (unit ? unit.unitNumber : '') && (!t.propertyId || !unit?.propertyId || t.propertyId === unit.propertyId))
    ) || {
      name: unit?.tenant || 'Resident',
      id: unit?.currentTenantId || `TEN-${Date.now()}`,
    };

    const relatedAg = (state.agreements || []).find(
      (a) =>
        a.status === 'active' &&
        (a.unit === (unit ? unit.unitNumber : '') || a.unit === unit?.id) &&
        (!a.propertyId || !unit?.propertyId || a.propertyId === unit.propertyId)
    );

    const newMoveOut: MobileMoveOut = {
      id: `VAC-${Date.now().toString().slice(-4)}`,
      ownerId: ownerId,
      tenantId: tenant.id,
      tenantName: tenant.name,
      propertyId: unit ? unit.propertyId : '',
      propertyName: unit ? unit.propertyName : 'Residence',
      unit: unit ? unit.unitNumber : '',
      agreementId: relatedAg?.id,
      moveOutDate: vacateDate,
      depositHeld: unit?.deposit || 0,
      currency: unit?.currency || viewCurrency || 'USD',
      status: 'notice_filed',
      inspectionChecklist: [],
      totalDeductions: 0,
      unpaidBills: 0,
      netRefundAmount: unit?.deposit || 0,
    };

    addMoveOut(newMoveOut);
    setShowInitiateModal(false);
    Alert.alert(
      'Vacate Notice Registered',
      `Move-out notice scheduled for Unit ${newMoveOut.unit} on ${vacateDate}. Inspection checklist is queued.`,
      [{ text: 'OK' }]
    );
  };

  const openScheduleModal = (m: MobileMoveOut) => {
    setSchedulingMoveOut(m);
    const today = new Date();
    const d5 = new Date(today);
    d5.setDate(d5.getDate() + 5);
    const d10 = new Date(today);
    d10.setDate(d10.getDate() + 10);
    setScheduleInspectDate(m.inspectionDate || d5.toISOString().split('T')[0]);
    setScheduleRefundDate(m.refundDate || d10.toISOString().split('T')[0]);
    setShowScheduleModal(true);
  };

  const handleConfirmScheduleInspection = () => {
    if (!schedulingMoveOut) return;
    updateMoveOut(schedulingMoveOut.id, {
      status: 'inspection_scheduled',
      inspectionDate: scheduleInspectDate,
      refundDate: scheduleRefundDate,
    });
    setShowScheduleModal(false);
    Alert.alert(
      'Inspection Scheduled ✓',
      `Walkthrough inspection for Unit ${schedulingMoveOut.unit} scheduled for ${scheduleInspectDate}. Resident notified to prepare the premises.`,
      [{ text: 'OK' }]
    );
    setSchedulingMoveOut(null);
  };

  const handleConfirmPayout = () => {
    if (!selectedMoveOut) return;
    createDepositSettlement({
      id: selectedMoveOut.id,
      propertyId: selectedMoveOut.propertyId,
      unit: selectedMoveOut.unit,
      tenantId: selectedMoveOut.tenantId,
      tenantName: selectedMoveOut.tenantName,
      totalDeductions: selectedMoveOut.totalDeductions,
      netRefundAmount: selectedMoveOut.netRefundAmount,
      status: 'refund_completed',
    });
    setShowPayoutModal(false);
    Alert.alert(
      'Deposit Refund Disbursed',
      `Payment of ${format(selectedMoveOut.netRefundAmount, selectedMoveOut.currency || viewCurrency)} marked as settled via ${payoutRail.toUpperCase()} (Ref: ${payoutRef}). Departure rating of ★ ${tenantRating} recorded. Unit ${selectedMoveOut.unit} freed back to vacant.`,
      [{ text: 'OK' }]
    );
    setSelectedMoveOut(null);
  };

  const handleOpenRecalculate = (m: MobileMoveOut) => {
    setRecalculatingMoveOut(m);
    setRevisedDeductionAmount(String(m.totalDeductions));
    setRevisionNotes('Revised deductions following tenant review and dispute clarification.');
    setShowRecalculateModal(true);
  };

  const handleSaveRecalculatedSettlement = () => {
    if (!recalculatingMoveOut) return;
    const newDed = Number(revisedDeductionAmount) || 0;
    const newNet = Math.max(0, recalculatingMoveOut.depositHeld - newDed - recalculatingMoveOut.unpaidBills);
    updateMoveOut(recalculatingMoveOut.id, {
      totalDeductions: newDed,
      netRefundAmount: newNet,
      status: 'settlement_pending',
      tenantDisputeRaised: false,
    });
    setShowRecalculateModal(false);
    Alert.alert(
      'Settlement Recalculated',
      `Deductions updated to ${format(newDed, recalculatingMoveOut.currency || viewCurrency)}. New net refund: ${format(newNet, recalculatingMoveOut.currency || viewCurrency)}. Revised offer dispatched to resident.`,
      [{ text: 'OK' }]
    );
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Move-Outs"
        onNotificationPress={() => {}}
        onProfilePress={onProfilePress}
      />

      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Segmented Capsule Tabs */}
          <View style={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#E9EEF5' }]}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'active' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
              onPress={() => setActiveTab('active')}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.tabText, activeTab === 'active' && [styles.tabTextActive, { color: colors.navy }]]}
              >
                Active Vacates ({myMoveOuts.filter((m) => m.status !== 'settled').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'settled' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
              onPress={() => setActiveTab('settled')}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.tabText, activeTab === 'settled' && [styles.tabTextActive, { color: colors.navy }]]}
              >
                Settled
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Action Strip */}
          <View style={styles.actionStrip}>
            <TouchableOpacity
              style={styles.initiateBtn}
              onPress={() => setShowInitiateModal(true)}
              activeOpacity={0.85}
            >
              <Feather name="plus-circle" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.initiateBtnText}>Initiate Vacate Notice</Text>
            </TouchableOpacity>
          </View>

          {/* Move-out List */}
          {displayedMoveOuts.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Feather name="check-circle" size={32} color="#10B981" />
              <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Vacate Notices in this View</Text>
              <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                All leases are active and in good standing.
              </Text>
            </View>
          ) : (
            displayedMoveOuts.map((item) => {
              const settleMatch = state.depositSettlements.find(
                (s) =>
                  s.id === item.id ||
                  s.id === `DEP-SETTLE-${item.id}` ||
                  (s.unit === item.unit && (!item.tenantId || s.tenantId === item.tenantId))
              );
              const isSettled = item.status === 'settled' || item.status === 'refund_completed' || settleMatch?.status === 'refunded';
              const isInspected =
                item.status === 'inspected' ||
                item.status === 'settlement_pending' ||
                item.status === 'refund_scheduled';
              const isInspectionScheduled = item.status === 'inspection_scheduled';
              const isNoticeFiled = item.status === 'notice_filed' || item.status === 'requested';

              const isContested =
                settleMatch?.status === 'rejected' ||
                settleMatch?.status === 'contested' ||
                item.status === 'disputed' ||
                item.tenantDisputeRaised;
              const isTenantApproved = settleMatch?.status === 'approved' || !!item.chosenPayoutDetails;

              return (
                <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={[styles.unitTitle, { color: colors.navy }]} numberOfLines={2}>
                        Unit {item.unit} • Move Out
                      </Text>
                      <Text style={[styles.tenantSubtitle, { color: colors.inkSoft }]} numberOfLines={1}>
                        {item.tenantName} • Dep Held: {format(item.depositHeld ?? item.deposit ?? 0, item.currency || viewCurrency)}
                      </Text>
                      <Text style={[styles.vacateDateText, { color: colors.inkSoft }]}>
                        Move Out: {item.moveOutDate}
                      </Text>
                      {item.inspectionDate ? (
                        <Text style={{ fontSize: 11, color: '#D97706', marginTop: 2, fontWeight: '600' }}>
                          Walkthrough: {item.inspectionDate}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        isSettled && styles.settledBadge,
                        isInspected && styles.inspectedBadge,
                        isContested && { backgroundColor: '#FEE2E2' },
                        isTenantApproved && !isSettled && { backgroundColor: '#FEF3C7' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isSettled && styles.settledBadgeText,
                          isInspected && styles.inspectedBadgeText,
                          isContested && { color: '#DC2626' },
                          isTenantApproved && !isSettled && { color: '#B45309' },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {isSettled
                          ? 'SETTLED'
                          : isContested
                          ? 'CONTESTED'
                          : isTenantApproved
                          ? 'TENANT ACCEPTED'
                          : settleMatch?.status === 'awaiting_tenant_approval'
                          ? 'AWAITING TENANT'
                          : item.status.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressTextRow}>
                      <Text style={styles.stepText}>
                        {isSettled
                          ? 'Step 5 of 5: Deposit Settled'
                          : isInspected
                          ? 'Step 4 of 5: Refund Scheduled'
                          : isInspectionScheduled
                          ? 'Step 2 of 5: Inspection Scheduled'
                          : 'Step 1 of 5: Notice Served'}
                      </Text>
                      <Text style={styles.percentText}>
                        {isSettled ? '100%' : isInspected ? '80%' : isInspectionScheduled ? '40%' : '20%'}
                      </Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: isSettled ? '100%' : isInspected ? '80%' : isInspectionScheduled ? '40%' : '20%' },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Deductions Breakdown & Inspection Status */}
                  <View style={styles.deductionsBox}>
                    {isInspected || isSettled ? (
                      <>
                        <Text style={styles.deductionsHeader}>Inspection Assessment & Deductions</Text>
                        {item.inspectionChecklist && item.inspectionChecklist.filter((c) => c.deduction > 0).length > 0 ? (
                          item.inspectionChecklist
                            .filter((c) => c.deduction > 0)
                            .map((d, idx) => (
                              <View key={idx} style={styles.deductionRow}>
                                <Text style={styles.deductionLabel} numberOfLines={2} ellipsizeMode="tail">
                                  {d.room ? `${d.room} • ` : ''}{d.item || d.amenity || 'Repair'}
                                </Text>
                                <Text style={styles.deductionAmount}>
                                  - {format(d.deduction, item.currency || viewCurrency)}
                                </Text>
                              </View>
                            ))
                        ) : item.deductions && item.deductions.length > 0 ? (
                          item.deductions.map((d, idx) => (
                            <View key={idx} style={styles.deductionRow}>
                              <Text style={styles.deductionLabel} numberOfLines={2} ellipsizeMode="tail">
                                {d.reason || d.amenity}
                              </Text>
                              <Text style={styles.deductionAmount}>
                                - {format(d.amount, item.currency || viewCurrency)}
                              </Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.pendingInspectionHint}>
                            ✓ Zero deductions assessed. Premises inspected in good condition.
                          </Text>
                        )}
                        <View style={styles.divider} />
                        <View style={styles.refundRow}>
                          <Text style={styles.refundLabel}>Net Deposit Refund:</Text>
                          <Text style={styles.refundAmount}>
                            {format(item.netRefundAmount ?? item.depositHeld ?? item.deposit ?? 0, item.currency || viewCurrency)}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Feather name="clock" size={13} color="#D97706" style={{ marginRight: 6 }} />
                          <Text style={[styles.deductionsHeader, { marginBottom: 0, color: '#B45309' }]}>
                            Inspection Walkthrough Pending
                          </Text>
                        </View>
                        <Text style={styles.pendingInspectionHint}>
                          {item.inspectionDate
                            ? `Walkthrough scheduled for ${item.inspectionDate}. Damage deductions will be assessed on-site.`
                            : 'Walkthrough not yet scheduled. Deductions will be assessed once inspection is conducted.'}
                        </Text>
                        <View style={styles.divider} />
                        <View style={styles.refundRow}>
                          <Text style={styles.refundLabel}>Gross Deposit Held:</Text>
                          <Text style={styles.refundAmount}>
                            {format(item.depositHeld || item.deposit || 0, item.currency || viewCurrency)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.btnRow}>
                    {/* Stage 1: Notice Served -> Schedule Inspection */}
                    {isNoticeFiled && (
                      <TouchableOpacity
                        style={styles.scheduleInspectionBtn}
                        onPress={() => openScheduleModal(item)}
                        activeOpacity={0.85}
                      >
                        <Feather name="calendar" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.scheduleInspectionBtnText}>Schedule Inspection</Text>
                      </TouchableOpacity>
                    )}

                    {/* Stage 2: Inspection Scheduled -> Conduct Inspection */}
                    {isInspectionScheduled && (
                      <TouchableOpacity
                        style={styles.conductInspectionBtn}
                        onPress={() => onInspectPress?.(item.id)}
                        activeOpacity={0.85}
                      >
                        <Feather name="clipboard" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.conductInspectionBtnText}>Conduct Inspection</Text>
                      </TouchableOpacity>
                    )}

                    {/* Stage 3 & 4: Inspection Done / Refund Scheduled */}
                    {isInspected && !isSettled && (
                      <>
                        {isContested && (
                          <TouchableOpacity
                            style={styles.recalcBtn}
                            onPress={() => handleOpenRecalculate(item)}
                            activeOpacity={0.8}
                          >
                            <Feather name="refresh-cw" size={13} color="#D97706" />
                            <Text style={styles.recalcBtnText}>Recalculate</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[styles.payoutBtn, isTenantApproved && styles.payoutApprovedBtn]}
                          onPress={() => {
                            setSelectedMoveOut(item);
                            if (item.chosenPayoutDetails) {
                              const m = item.chosenPayoutDetails.method;
                              if (m === 'bank_in') setPayoutRail('bank');
                              else if (m === 'cash') setPayoutRail('cash');
                              else setPayoutRail('bank');
                            }
                            setShowPayoutModal(true);
                          }}
                          activeOpacity={0.85}
                        >
                          <Feather name="check" size={14} color="#FFFFFF" />
                          <Text style={styles.payoutBtnText}>Disburse</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {/* Stage 5: Settled */}
                    {isSettled && (
                      <View style={{ flexDirection: 'row', gap: 6, flex: 2 }}>
                        <View style={styles.disbursedTag}>
                          <Feather name="check-circle" size={13} color="#15803D" />
                          <Text style={styles.disbursedTagText}>Settled</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.clearanceVoucherBtn}
                          onPress={() => {
                            setVoucherMoveOut(item);
                            setShowClearanceModal(true);
                          }}
                          activeOpacity={0.85}
                        >
                          <Feather name="file-text" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.clearanceVoucherBtnText}>Voucher PDF</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>

      {/* Initiate Vacate Modal */}
      <Modal visible={showInitiateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>Initiate Vacate Notice</Text>
              <TouchableOpacity onPress={() => setShowInitiateModal(false)}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Select Unit to Vacate</Text>
              <View style={styles.unitPickGrid}>
                {myUnits.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={[
                      styles.unitPickChip,
                      selectedUnitId === u.id && styles.unitPickChipActive,
                    ]}
                    onPress={() => setSelectedUnitId(u.id)}
                  >
                    <Text
                      style={[
                        styles.unitPickText,
                        selectedUnitId === u.id && styles.unitPickTextActive,
                      ]}
                    >
                      Unit {u.unitNumber}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Target Move-Out Date</Text>
              <TextInput
                style={styles.input}
                value={vacateDate}
                onChangeText={setVacateDate}
                placeholder="YYYY-MM-DD"
              />

              <Text style={styles.fieldLabel}>Reason for Leaving</Text>
              <TextInput
                style={styles.input}
                value={vacateReason}
                onChangeText={setVacateReason}
                placeholder="e.g. Job transfer, Purchased new house"
              />

              <Text style={styles.fieldLabel}>Forwarding Address for Communications</Text>
              <TextInput
                style={styles.input}
                value={forwardingAddress}
                onChangeText={setForwardingAddress}
                placeholder="New address"
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleInitiateVacate}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Confirm Vacate Schedule</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Schedule Walkthrough Inspection Modal (1-to-1 Web Parity) */}
      <Modal visible={showScheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Schedule Walkthrough Inspection</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
                  {schedulingMoveOut?.tenantName} • Unit {schedulingMoveOut?.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Walkthrough Inspection Date</Text>
              <TextInput
                style={styles.input}
                value={scheduleInspectDate}
                onChangeText={setScheduleInspectDate}
                placeholder="YYYY-MM-DD"
              />

              <Text style={styles.fieldLabel}>Estimated Deposit Refund Target Date</Text>
              <TextInput
                style={styles.input}
                value={scheduleRefundDate}
                onChangeText={setScheduleRefundDate}
                placeholder="YYYY-MM-DD"
              />

              <View style={styles.scheduleTipBox}>
                <Feather name="info" size={14} color="#0284C7" style={{ marginRight: 6 }} />
                <Text style={styles.scheduleTipText}>
                  Scheduling an inspection notifies the resident to prepare the unit for walkthrough and queues the damage checklist.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleConfirmScheduleInspection}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Confirm Inspection Schedule</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Record Settlement Payout Modal */}
      <Modal visible={showPayoutModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Record Deposit Refund</Text>
                <Text style={styles.modalSub}>
                  {selectedMoveOut?.tenantName} • Unit {selectedMoveOut?.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPayoutModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.payoutHighlightBox}>
                <Text style={styles.payoutHighlightLabel}>Final Refund Payable</Text>
                <Text style={styles.payoutHighlightVal}>
                  {format(selectedMoveOut?.netRefundAmount || 0, selectedMoveOut?.currency || viewCurrency)}
                </Text>
              </View>

              {selectedMoveOut?.chosenPayoutDetails && (
                <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8', textTransform: 'uppercase' }}>
                    Resident's Preferred Destination
                  </Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#0F172A', marginTop: 2 }}>
                    Method: {selectedMoveOut.chosenPayoutDetails.method.toUpperCase()}
                  </Text>
                  {selectedMoveOut.chosenPayoutDetails.upiId ? (
                    <Text style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                      UPI ID: {selectedMoveOut.chosenPayoutDetails.upiId}
                    </Text>
                  ) : null}
                  {selectedMoveOut.chosenPayoutDetails.accountNumber ? (
                    <Text style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                      A/C: {selectedMoveOut.chosenPayoutDetails.accountNumber} • IFSC: {selectedMoveOut.chosenPayoutDetails.ifscCode}
                    </Text>
                  ) : null}
                </View>
              )}

              <Text style={styles.fieldLabel}>Payment Rail / Method</Text>
              <View style={styles.railRow}>
                {(['bank', 'cheque', 'cash'] as const).map((rail) => (
                  <TouchableOpacity
                    key={rail}
                    style={[styles.railBtn, payoutRail === rail && styles.railBtnActive]}
                    onPress={() => setPayoutRail(rail)}
                  >
                    <Text
                      style={[styles.railBtnText, payoutRail === rail && styles.railBtnTextActive]}
                    >
                      {rail === 'bank' ? 'Bank IMPS' : rail === 'cheque' ? 'Cheque' : 'Cash'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Transaction / Reference Number</Text>
              <TextInput
                style={styles.input}
                value={payoutRef}
                onChangeText={setPayoutRef}
                placeholder="e.g. UTR-982187391"
              />

              <Text style={styles.fieldLabel}>Tenant Departure Rating</Text>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setTenantRating(star)}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name={star <= tenantRating ? 'star' : 'star-outline'}
                      size={24}
                      color="#F59E0B"
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Departure Tenant Review</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                value={tenantReview}
                onChangeText={setTenantReview}
                multiline
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleConfirmPayout}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Confirm Refund Disbursement</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Recalculate Contested Settlement Modal */}
      <Modal visible={showRecalculateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Recalculate Contested Settlement</Text>
                <Text style={styles.modalSub}>
                  {recalculatingMoveOut?.tenantName} • Unit {recalculatingMoveOut?.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowRecalculateModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.fieldLabel}>Revised Total Deductions ({currencySymbol})</Text>
              <TextInput
                style={styles.input}
                value={revisedDeductionAmount}
                onChangeText={setRevisedDeductionAmount}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Owner Explanation & Notes to Tenant</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                value={revisionNotes}
                onChangeText={setRevisionNotes}
                placeholder="Clarify waived or reduced repair items..."
                multiline
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSaveRecalculatedSettlement}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Save Settlement</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 1-to-1 Web Parity Move-Out Settlement Clearance Voucher Modal */}
      <Modal visible={showClearanceModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%', backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Settlement & Clearance Voucher</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
                  Official Tenancy Refund Receipt • Unit {voucherMoveOut?.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowClearanceModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Official Voucher Preview Card */}
              <View style={styles.voucherContainer}>
                <View style={styles.voucherHeader}>
                  <View style={{ flex: 1.2, paddingRight: 8, minWidth: 0 }}>
                    <Text style={styles.voucherCompany} numberOfLines={1}>PROPITHUB ESTATES</Text>
                    <Text style={styles.voucherSub} numberOfLines={2}>Official Move-Out Settlement Receipt</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end', minWidth: 0 }}>
                    <Text style={styles.voucherRef} numberOfLines={1}>#CLR-{voucherMoveOut?.id.replace('VAC-', '') || '2026-9042'}</Text>
                    <Text style={styles.voucherDate} numberOfLines={1}>Date: {voucherMoveOut?.moveOutDate || '30 Nov 2024'}</Text>
                  </View>
                </View>

                <View style={styles.voucherTenancyDetails}>
                  <View style={styles.voucherCol}>
                    <Text style={styles.voucherLabel}>Resident Name</Text>
                    <Text style={styles.voucherVal}>{voucherMoveOut?.tenantName}</Text>
                  </View>
                  <View style={styles.voucherCol}>
                    <Text style={styles.voucherLabel}>Premises</Text>
                    <Text style={styles.voucherVal}>{voucherMoveOut?.propertyName}, Unit {voucherMoveOut?.unit}</Text>
                  </View>
                </View>

                {/* Itemized Deductions Table */}
                <View style={styles.voucherTable}>
                  <View style={styles.voucherTableHead}>
                    <Text style={[styles.voucherTableHeadText, { flex: 2 }]}>Item Description</Text>
                    <Text style={[styles.voucherTableHeadText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
                  </View>

                  <View style={styles.voucherTableRow}>
                    <Text style={[styles.voucherTableCell, { flex: 2, fontWeight: '600' }]}>Gross Security Deposit Held</Text>
                    <Text style={[styles.voucherTableCell, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>
                      {format(voucherMoveOut?.depositHeld || 0, voucherMoveOut?.currency || viewCurrency)}
                    </Text>
                  </View>

                  {/* Individual Inspection Checklist Deductions */}
                  {voucherMoveOut?.inspectionChecklist && voucherMoveOut.inspectionChecklist.filter((c) => (c.deduction || 0) > 0).length > 0 ? (
                    voucherMoveOut.inspectionChecklist.filter((c) => (c.deduction || 0) > 0).map((c, i) => (
                      <View key={i} style={styles.voucherTableRow}>
                        <Text style={[styles.voucherTableCell, { flex: 2, color: '#DC2626' }]}>
                          Less: {c.room ? `${c.room} - ` : ''}{c.item || c.amenity || 'Repair'} ({c.condition || 'Repair'})
                        </Text>
                        <Text style={[styles.voucherTableCell, { flex: 1, textAlign: 'right', color: '#DC2626', fontWeight: '600' }]}>
                          - {format(c.deduction, voucherMoveOut?.currency || viewCurrency)}
                        </Text>
                      </View>
                    ))
                  ) : voucherMoveOut?.deductions && voucherMoveOut.deductions.length > 0 ? (
                    voucherMoveOut.deductions.map((d, i) => (
                      <View key={i} style={styles.voucherTableRow}>
                        <Text style={[styles.voucherTableCell, { flex: 2, color: '#DC2626' }]}>
                          Less: {d.reason || d.amenity || 'Repairs & Maintenance'}
                        </Text>
                        <Text style={[styles.voucherTableCell, { flex: 1, textAlign: 'right', color: '#DC2626', fontWeight: '600' }]}>
                          - {format(d.amount, voucherMoveOut?.currency || viewCurrency)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.voucherTableRow}>
                      <Text style={[styles.voucherTableCell, { flex: 2, color: '#DC2626' }]}>
                        Less: Repairs, Paint & Maintenance Deductions
                      </Text>
                      <Text style={[styles.voucherTableCell, { flex: 1, textAlign: 'right', color: '#DC2626', fontWeight: '600' }]}>
                        - {format(voucherMoveOut?.totalDeductions || 0, voucherMoveOut?.currency || viewCurrency)}
                      </Text>
                    </View>
                  )}

                  {Boolean(voucherMoveOut?.unpaidBills) && (
                    <View style={styles.voucherTableRow}>
                      <Text style={[styles.voucherTableCell, { flex: 2, color: '#DC2626' }]}>
                        Less: Unpaid Utility & Electricity Dues
                      </Text>
                      <Text style={[styles.voucherTableCell, { flex: 1, textAlign: 'right', color: '#DC2626', fontWeight: '600' }]}>
                        - {format(voucherMoveOut?.unpaidBills || 0, voucherMoveOut?.currency || viewCurrency)}
                      </Text>
                    </View>
                  )}

                  {/* Net Disbursed Total Row */}
                  <View style={[styles.voucherTableRow, styles.voucherTableTotal]}>
                    <Text style={[styles.voucherTableTotalText, { flex: 2 }]}>NET REFUND DISBURSED</Text>
                    <Text style={[styles.voucherTableTotalText, { flex: 1, textAlign: 'right', color: '#059669' }]}>
                      {format(voucherMoveOut?.netRefundAmount || 0, voucherMoveOut?.currency || viewCurrency)}
                    </Text>
                  </View>
                </View>

                {/* Payment Rail & UTR Reference */}
                <View style={styles.voucherRailBox}>
                  <Text style={styles.voucherRailTitle}>PAYMENT REMITTANCE CONFIRMATION:</Text>
                  <Text style={styles.voucherRailText}>Disbursement Rail: NEFT / IMPS Bank Transfer</Text>
                  <Text style={styles.voucherRailText}>Reference / UTR: UTR-982187391 • Status: Confirmed Settled</Text>
                  <Text style={styles.voucherRailText}>Beneficiary: {voucherMoveOut?.tenantName}</Text>
                </View>

                {/* Clearance Declaration & Stamp */}
                <View style={styles.voucherLegalBox}>
                  <Text style={styles.voucherLegalText}>
                    Declaration: All physical keys have been surrendered. Final meter readings verified. Tenancy accounts reconciled with full and final satisfaction.
                  </Text>
                  <View style={styles.voucherStampRow}>
                    <View style={styles.voucherStampBadge}>
                      <Text style={styles.voucherStampText}>PROPITHUB CLEARED</Text>
                    </View>
                    <Text style={styles.voucherAuthorized}>Authorized Landlord Office</Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={styles.shareVoucherBtn}
                  onPress={async () => {
                    try {
                      const html = `
                        <html>
                          <body style="font-family: sans-serif; padding: 24px; color: #0F172A;">
                            <h2>MOVE-OUT CLEARANCE CERTIFICATE</h2>
                            <p><b>Tenant:</b> ${voucherMoveOut?.tenantName}</p>
                            <p><b>Unit:</b> ${voucherMoveOut?.unit}</p>
                            <p><b>Net Refund Amount:</b> ${voucherMoveOut?.netRefundAmount || 0}</p>
                            <p><b>Disbursement Status:</b> Confirmed Settled</p>
                          </body>
                        </html>
                      `;
                      const { uri } = await Print.printToFileAsync({ html });
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
                      } else {
                        Alert.alert('Share Receipt', 'Settlement receipt link copied to clipboard.');
                      }
                    } catch (e) {
                      Alert.alert('Error', 'Could not share document.');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="share-2" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                  <Text style={styles.shareVoucherBtnText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.downloadVoucherBtn}
                  onPress={async () => {
                    try {
                      const html = `
                        <html>
                          <body style="font-family: sans-serif; padding: 24px; color: #0F172A;">
                            <h2>MOVE-OUT CLEARANCE CERTIFICATE</h2>
                            <p><b>Tenant:</b> ${voucherMoveOut?.tenantName}</p>
                            <p><b>Unit:</b> ${voucherMoveOut?.unit}</p>
                            <p><b>Net Refund Amount:</b> ${voucherMoveOut?.netRefundAmount || 0}</p>
                            <p><b>Disbursement Status:</b> Confirmed Settled</p>
                          </body>
                        </html>
                      `;
                      const { uri } = await Print.printToFileAsync({ html });
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
                      } else {
                        Alert.alert('PDF Saved', `Saved to ${uri}`);
                      }
                    } catch (e) {
                      Alert.alert('Error', 'Could not download PDF.');
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="download" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.downloadVoucherBtnText}>Download PDF Clearance</Text>
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
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
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
    marginBottom: 12,
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
    fontWeight: '500',
    color: colors.inkSoft,
  },
  tabTextActive: {
    color: colors.navy,
    fontWeight: '700',
  },
  actionStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  initiateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 9,
    gap: 6,
  },
  initiateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  disputeDeskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  disputeDeskText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
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
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  unitTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.navy,
    lineHeight: 19,
  },
  tenantSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  vacateDateText: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    flexShrink: 0,
    alignSelf: 'flex-start',
    maxWidth: '46%',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  inspectedBadge: {
    backgroundColor: '#DCFCE7',
  },
  inspectedBadgeText: {
    color: '#15803D',
  },
  settledBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  settledBadgeText: {
    color: colors.inkSoft,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stepText: {
    fontSize: 11,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  percentText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  deductionsBox: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  deductionsHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.inkSoft,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pendingInspectionHint: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginVertical: 4,
    lineHeight: 16,
  },
  deductionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
    gap: 8,
  },
  deductionLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 16,
  },
  deductionAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    flexShrink: 0,
    textAlign: 'right',
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },
  refundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  refundLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  refundAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
    flexShrink: 0,
    textAlign: 'right',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inspectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingVertical: 8,
  },
  inspectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  payoutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 8,
  },
  payoutApprovedBtn: {
    backgroundColor: '#059669',
  },
  scheduleInspectionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C59A45',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  scheduleInspectionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  conductInspectionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  conductInspectionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scheduleTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
  },
  scheduleTipText: {
    flex: 1,
    fontSize: 11.5,
    color: '#0369A1',
    lineHeight: 16,
  },
  payoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  recalcBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingVertical: 8,
  },
  recalcBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 6,
  },
  disbursedTag: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 8,
  },
  disbursedTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
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
  modalSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.navy,
    marginBottom: 10,
  },
  unitPickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  unitPickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  unitPickChipActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  unitPickText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  unitPickTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  payoutHighlightBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  payoutHighlightLabel: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  payoutHighlightVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#047857',
    marginTop: 2,
  },
  railRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  railBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  railBtnActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  railBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  railBtnTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  clearanceVoucherBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  clearanceVoucherBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  voucherContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  voucherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  voucherCompany: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.navy,
  },
  voucherSub: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 1,
  },
  voucherRef: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
    textAlign: 'right',
  },
  voucherDate: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 1,
    textAlign: 'right',
  },
  voucherTenancyDetails: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  voucherCol: {
    flex: 1,
  },
  voucherLabel: {
    fontSize: 9.5,
    color: colors.inkSoft,
    marginBottom: 1,
  },
  voucherVal: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.navy,
  },
  voucherTable: {
    marginVertical: 10,
  },
  voucherTableHead: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  voucherTableHeadText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  voucherTableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  voucherTableCell: {
    fontSize: 11,
    color: colors.ink,
  },
  voucherTableTotal: {
    borderTopWidth: 1.5,
    borderTopColor: colors.line,
    borderBottomWidth: 0,
    paddingTop: 8,
    marginTop: 4,
  },
  voucherTableTotalText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.navy,
  },
  voucherRailBox: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  voucherRailTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.inkSoft,
    marginBottom: 2,
  },
  voucherRailText: {
    fontSize: 10,
    color: colors.inkSoft,
    lineHeight: 14,
  },
  voucherLegalBox: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  voucherLegalText: {
    fontSize: 9.5,
    color: colors.inkSoft,
    lineHeight: 13,
  },
  voucherStampRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  voucherStampBadge: {
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  voucherStampText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  voucherAuthorized: {
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  shareVoucherBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 10,
  },
  shareVoucherBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.navy,
  },
  downloadVoucherBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
  },
  downloadVoucherBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  });
