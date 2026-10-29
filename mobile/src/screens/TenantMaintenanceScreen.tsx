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
} from 'react-native';
import { Ionicons, Feather, FontAwesome } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useTenantActiveUnit } from '../hooks/useTenantActiveUnit';
import { TenantMultiPropertySwitcher } from '../components/TenantMultiPropertySwitcher';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { MobileTicket } from '../types';

interface TenantMaintenanceScreenProps {
  onCreateTicketPress?: () => void;
  onPayChargePress?: (amount: number) => void;
}

export const TenantMaintenanceScreen: React.FC<TenantMaintenanceScreenProps> = ({
  onCreateTicketPress,
  onPayChargePress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, saveTicket, updateTicket } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();

  const {
    myUnits,
    isMultiUnit,
    activeUnit,
    activeAgreement,
    activeProperty,
    activeCurrency,
    selectedTenantUnitId,
    setSelectedTenantUnitId,
  } = useTenantActiveUnit();

  const hasActiveTenancy = Boolean(activeUnit || (myUnits && myUnits.length > 0) || activeAgreement);

  // Create Ticket Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ticketIssue, setTicketIssue] = useState('');
  const [ticketCategory, setTicketCategory] = useState<'Plumbing' | 'Electrical' | 'HVAC' | 'Carpentry' | 'Appliance' | 'Other'>('Plumbing');
  const [ticketPriority, setTicketPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [ticketNotes, setTicketNotes] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  // Pay Repair Charge Modal State
  const [showPayChargeModal, setShowPayChargeModal] = useState(false);
  const [payingTicket, setPayingTicket] = useState<MobileTicket | null>(null);
  const [chargePayMethod, setChargePayMethod] = useState<'UPI' | 'Card' | 'Cash'>('UPI');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  // Rate Technician State
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [ratedTicketId, setRatedTicketId] = useState<string | null>(null);

  const tenantName = user.displayName || 'Resident';
  const tenantEmail = (user.email || '').toLowerCase();

  // Active tickets scoped to tenant & active unit
  const activeTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      const isOpen = t.status === 'open' || t.status === 'in_progress';
      if (!isOpen) return false;

      const isMyTicket =
        (user?.id && t.tenantId === user.id) ||
        (tenantEmail && (t as any).tenantEmail?.toLowerCase() === tenantEmail) ||
        t.tenant.toLowerCase() === tenantName.toLowerCase();
      if (!isMyTicket) return false;

      if (activeUnit && t.unit) {
        return (
          t.unit.toLowerCase() === activeUnit.unitNumber.toLowerCase() ||
          t.unit.toLowerCase() === activeUnit.id.toLowerCase()
        );
      }
      return true;
    });
  }, [state.tickets, user, tenantEmail, tenantName, activeUnit]);

  // Resolved tickets
  const resolvedTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      if (t.status !== 'resolved') return false;

      const isMyTicket =
        (user?.id && t.tenantId === user.id) ||
        (tenantEmail && (t as any).tenantEmail?.toLowerCase() === tenantEmail) ||
        t.tenant.toLowerCase() === tenantName.toLowerCase();
      if (!isMyTicket) return false;

      if (activeUnit && t.unit) {
        return (
          t.unit.toLowerCase() === activeUnit.unitNumber.toLowerCase() ||
          t.unit.toLowerCase() === activeUnit.id.toLowerCase()
        );
      }
      return true;
    });
  }, [state.tickets, user, tenantEmail, tenantName, activeUnit]);

  const handleOpenCreateModal = () => {
    if (!hasActiveTenancy) {
      Alert.alert(
        'No Active Unit Assigned',
        'Maintenance requests can only be dispatched for an active rented unit. Once you are onboarded to an active property, you can submit repair tickets here.'
      );
      return;
    }
    if (onCreateTicketPress) {
      onCreateTicketPress();
    } else {
      setShowCreateModal(true);
    }
  };

  const handleCreateTicket = () => {
    if (!ticketIssue.trim()) {
      Alert.alert('Issue Required', 'Please enter a brief title describing the repair issue.');
      return;
    }

    setIsSubmittingTicket(true);
    setTimeout(() => {
      const newTicket: MobileTicket = {
        id: `TCK-${Math.floor(100 + Math.random() * 900)}`,
        ownerId: activeAgreement?.ownerId || activeUnit?.ownerId || activeProperty?.ownerId || '',
        propertyId: activeUnit?.propertyId || activeAgreement?.propertyId || activeProperty?.id || '',
        propertyName: activeUnit?.propertyName || activeAgreement?.propertyName || activeProperty?.name || '',
        unit: activeUnit?.unitNumber || activeAgreement?.unit || '',
        tenant: tenantName,
        tenantId: user.id,
        tenantPhone: user.phone || '',
        tenantEmail: user.email,
        issue: ticketIssue.trim(),
        category: ticketCategory,
        priority: ticketPriority,
        status: 'open',
        created: new Date().toISOString().split('T')[0],
      };

      saveTicket(newTicket);
      setIsSubmittingTicket(false);
      setShowCreateModal(false);
      setTicketIssue('');
      setTicketNotes('');
      Alert.alert('Ticket Dispatched ✓', 'Your repair request has been submitted to your property landlord.');
    }, 500);
  };

  const handleOpenPayCharge = (ticket: MobileTicket) => {
    setPayingTicket(ticket);
    setShowPayChargeModal(true);
  };

  const handleConfirmPayCharge = () => {
    if (!payingTicket) return;
    setIsSubmittingPay(true);
    setTimeout(() => {
      updateTicket(payingTicket.id, {
        status: 'in_progress',
      });
      setIsSubmittingPay(false);
      setShowPayChargeModal(false);
      setPayingTicket(null);
      Alert.alert('Repair Charge Paid ✓', `Payment via ${chargePayMethod} recorded. Technician work order updated.`);
    }, 500);
  };

  const handleSubmitRating = (ticketId: string) => {
    setRatedTicketId(ticketId);
    updateTicket(ticketId, {
      rating,
      residentFeedback: feedback,
    });
    Alert.alert(
      'Feedback Recorded ⭐',
      `Thank you! Your ${rating}-star review and feedback for technician service has been recorded on the job work order.`
    );
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}

      {/* Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="tool" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Maintenance</Text>
          </View>
        </View>
        {hasActiveTenancy && (
          <TouchableOpacity
            style={styles.newTicketHeaderBtn}
            onPress={handleOpenCreateModal}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.newTicketHeaderBtnText}>New Ticket</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Multi-Property Switcher for Tenants */}
        {hasActiveTenancy && (
          <TenantMultiPropertySwitcher
            myUnits={myUnits}
            selectedUnitId={selectedTenantUnitId}
            onSelectUnit={(unitId) => setSelectedTenantUnitId(unitId)}
          />
        )}

        {!hasActiveTenancy ? (
          <TourTarget id="tenant-maintenance-hero">
          <View style={[styles.emptyCard, { marginTop: 16 }]}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Feather name="tool" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
            </View>
            <Text style={styles.emptyTitle}>No Active Rented Unit</Text>
            <Text style={styles.emptySub}>
              Maintenance and repair requests are linked to your assigned unit. Once you are onboarded to an active property, you can submit repair tickets here.
            </Text>
          </View>
          </TourTarget>
        ) : (
          <>
            {/* Raise New Repair Banner */}
            <TourTarget id="tenant-maintenance-hero">
            <TouchableOpacity
              style={styles.raiseBanner}
              onPress={handleOpenCreateModal}
              activeOpacity={0.85}
            >
              <View style={styles.raiseBannerLeft}>
                <View style={styles.raiseIconBox}>
                  <Feather name="plus-circle" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.raiseBannerTitle}>Request Repair</Text>
                  <Text style={styles.raiseBannerSub}>
                    Plumbing, Electrical, Air Conditioning, Carpentry, Painting
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>

            </TourTarget>

        {/* Section: Active Tickets */}
        <Text style={styles.sectionHeading}>
          Active Requests ({activeTickets.length})
        </Text>

        {activeTickets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="check-circle" size={32} color="#10B981" />
            <Text style={styles.emptyTitle}>Zero Open Tickets</Text>
            <Text style={styles.emptySub}>Everything in your unit is operating smoothly.</Text>
          </View>
        ) : (
          activeTickets.map((t) => {
            const hasBillableCharge =
              t.category.toLowerCase().includes('plumb') || t.priority === 'High';

            return (
              <View key={t.id} style={styles.ticketCard}>
                <View style={styles.ticketTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketTitle}>{t.issue}</Text>
                    <Text style={styles.ticketSub}>
                      ID: #{t.id} • Category: {t.category} • Unit {t.unit}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      t.status === 'in_progress' ? styles.inProgressPill : styles.openPill,
                    ]}
                  >
                    <Text
                      style={
                        t.status === 'in_progress' ? styles.inProgressPillText : styles.openPillText
                      }
                    >
                      {t.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Assigned Technician */}
                <View style={styles.assignedRow}>
                  <Feather name="user-check" size={14} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.assignedLabel}>
                    Assigned Technician:{' '}
                    <Text style={styles.assignedName}>
                      {t.assignedStaffName || 'Ramesh Kumar (Certified Staff)'}
                    </Text>
                  </Text>
                </View>

                {/* Billable Charge Box */}
                {hasBillableCharge && (
                  <View style={styles.chargeBox}>
                    <View style={styles.chargeLeft}>
                      <Text style={styles.chargeTitle}>Tenant Billable Charge</Text>
                      <Text style={styles.chargeSub}>Repair fee classified as tenant-fault</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.payChargeBtn}
                      onPress={() => handleOpenPayCharge(t)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.payChargeText}>Pay {format(850, activeCurrency)}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Section: Rate Completed Jobs */}
        <Text style={[styles.sectionHeading, { marginTop: 18 }]}>Rate Completed Repairs</Text>

        {resolvedTickets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="award" size={28} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Resolved Work Orders to Rate</Text>
            <Text style={styles.emptySub}>Completed maintenance jobs will appear here for feedback.</Text>
          </View>
        ) : (
          resolvedTickets.map((rt) => {
            const isRated = ratedTicketId === rt.id;

            return (
              <View key={rt.id} style={styles.ticketCard}>
                <View style={styles.ticketTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketTitle}>{rt.issue}</Text>
                    <Text style={styles.ticketSub}>
                      Serviced by {rt.assignedStaffName || 'Ramesh Kumar'} • Unit {rt.unit}
                    </Text>
                  </View>
                  <View style={styles.resolvedPill}>
                    <Text style={styles.resolvedPillText}>RESOLVED</Text>
                  </View>
                </View>

                {!isRated ? (
                  <>
                    <Text style={styles.rateLabel}>Rate Technician Service Quality</Text>
                    <View style={styles.starRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <TouchableOpacity
                          key={star}
                          onPress={() => setRating(star)}
                          activeOpacity={0.7}
                          style={{ marginRight: 8 }}
                        >
                          <FontAwesome
                            name={star <= rating ? 'star' : 'star-o'}
                            size={22}
                            color="#D97706"
                          />
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TextInput
                      style={styles.feedbackInput}
                      value={feedback}
                      onChangeText={setFeedback}
                      placeholder="Write feedback regarding technician conduct & repair quality..."
                      multiline
                    />

                    <TouchableOpacity
                      style={styles.submitReviewBtn}
                      onPress={() => handleSubmitRating(rt.id)}
                      activeOpacity={0.85}
                    >
                      <Feather name="check" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.submitReviewText}>Submit Verified Review</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.ratedDoneBox}>
                    <Feather name="check-circle" size={15} color="#15803D" />
                    <Text style={styles.ratedDoneText}>Rating & Feedback Submitted (5/5 Stars)</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* =============================================================== */}
      {/* MODAL 1: RAISE REPAIR REQUEST MODAL                             */}
      {/* =============================================================== */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Raise Repair Request</Text>
                <Text style={styles.modalSub}>
                  Unit {activeUnit?.unitNumber || activeAgreement?.unit || 'Assigned Unit'} • Technician Dispatch
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalInputLabel}>Issue Title / Summary</Text>
              <TextInput
                style={styles.modalInput}
                value={ticketIssue}
                onChangeText={setTicketIssue}
                placeholder="e.g. Bathroom sink water leakage"
              />

              <Text style={styles.modalInputLabel}>Category</Text>
              <View style={styles.categoriesRow}>
                {(['Plumbing', 'Electrical', 'Carpentry', 'HVAC', 'Appliance', 'Other'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryPill,
                      ticketCategory === cat && styles.categoryPillActive,
                    ]}
                    onPress={() => setTicketCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        ticketCategory === cat && styles.categoryPillTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalInputLabel}>Priority</Text>
              <View style={styles.priorityRow}>
                {(['Low', 'Medium', 'High'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityPill,
                      ticketPriority === p && styles.priorityPillActive,
                    ]}
                    onPress={() => setTicketPriority(p)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.priorityPillText,
                        ticketPriority === p && styles.priorityPillTextActive,
                      ]}
                    >
                      {p} Priority
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalInputLabel}>Detailed Notes / Location in Unit</Text>
              <TextInput
                style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]}
                value={ticketNotes}
                onChangeText={setTicketNotes}
                placeholder="Describe exact location or issue symptoms..."
                multiline
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, isSubmittingTicket && { opacity: 0.7 }]}
                onPress={handleCreateTicket}
                disabled={isSubmittingTicket}
                activeOpacity={0.85}
              >
                <Feather name="send" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSubmitBtnText}>
                  {isSubmittingTicket ? 'Dispatching Ticket...' : 'Submit Repair Request'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL 2: PAY REPAIR CHARGE MODAL                                */}
      {/* =============================================================== */}
      <Modal visible={showPayChargeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Settle Repair Charge</Text>
                <Text style={styles.modalSub}>
                  Ticket #{payingTicket?.id} • {format(payingTicket?.payment?.amount || payingTicket?.costEstimate || 0, activeCurrency)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPayChargeModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalInputLabel}>Payment Mode</Text>
              <View style={styles.payMethodsRow}>
                {(['UPI', 'Card', 'Cash'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.payMethodBtn,
                      chargePayMethod === m && styles.payMethodBtnActive,
                    ]}
                    onPress={() => setChargePayMethod(m)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.payMethodBtnText,
                        chargePayMethod === m && styles.payMethodBtnTextActive,
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, isSubmittingPay && { opacity: 0.7 }]}
                onPress={handleConfirmPayCharge}
                disabled={isSubmittingPay}
                activeOpacity={0.85}
              >
                <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSubmitBtnText}>
                  {isSubmittingPay ? 'Processing...' : `Pay ${format(payingTicket?.payment?.amount || payingTicket?.costEstimate || 0, activeCurrency)} via ${chargePayMethod}`}
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
    },
    logoBadge: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: '#10B981',
      justifyContent: 'center',
      alignItems: 'center',
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
    newTicketHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#10B981',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    newTicketHeaderBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
    },
    raiseBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    raiseBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    raiseIconBox: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    raiseBannerTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#065F46',
    },
    raiseBannerSub: {
      fontSize: 11,
      color: isDark ? '#A7F3D0' : '#047857',
      marginTop: 2,
    },
    sectionHeading: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 10,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 30,
      alignItems: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: 'center',
      marginTop: 3,
    },
    ticketCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 12,
    },
    ticketTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    ticketTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    ticketSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    statusPill: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
    },
    openPill: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
    },
    openPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: isDark ? '#60A5FA' : '#1D4ED8',
    },
    inProgressPill: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    },
    inProgressPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    resolvedPill: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
    },
    resolvedPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#15803D',
    },
    assignedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginVertical: 6,
    },
    assignedLabel: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    assignedName: {
      fontWeight: '700',
      color: colors.navy,
    },
    chargeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
      borderRadius: 8,
      padding: 10,
      marginTop: 8,
    },
    chargeLeft: {
      flex: 1,
    },
    chargeTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: '#DC2626',
    },
    chargeSub: {
      fontSize: 10.5,
      color: isDark ? '#FCA5A5' : '#B91C1C',
      marginTop: 1,
    },
    payChargeBtn: {
      backgroundColor: '#DC2626',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    payChargeText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    rateLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink,
      marginTop: 8,
      marginBottom: 6,
    },
    starRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    feedbackInput: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 12,
      color: colors.ink,
      height: 60,
      textAlignVertical: 'top',
      marginBottom: 8,
    },
    submitReviewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 7,
      paddingVertical: 9,
    },
    submitReviewText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    ratedDoneBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
      borderRadius: 6,
      padding: 8,
      marginTop: 6,
    },
    ratedDoneText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: isDark ? '#34D399' : '#15803D',
      marginLeft: 6,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      padding: 20,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 16.5,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    modalBody: {
      paddingVertical: 4,
    },
    modalInputLabel: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
      marginBottom: 6,
      marginTop: 8,
    },
    modalInput: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: colors.ink,
    },
    categoriesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    categoryPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    },
    categoryPillActive: {
      backgroundColor: '#10B981',
    },
    categoryPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    categoryPillTextActive: {
      color: '#FFFFFF',
    },
    priorityRow: {
      flexDirection: 'row',
      gap: 6,
    },
    priorityPill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    },
    priorityPillActive: {
      backgroundColor: '#10B981',
    },
    priorityPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    priorityPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    modalSubmitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 8,
      paddingVertical: 12,
      marginTop: 14,
    },
    modalSubmitBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    payMethodsRow: {
      flexDirection: 'row',
      gap: 8,
      marginVertical: 10,
    },
    payMethodBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 12,
    },
    payMethodBtnActive: {
      backgroundColor: '#059669',
      borderColor: '#059669',
    },
    payMethodBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    payMethodBtnTextActive: {
      color: '#FFFFFF',
    },
  });
