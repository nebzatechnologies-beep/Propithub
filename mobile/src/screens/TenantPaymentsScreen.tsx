import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  RefreshControl,
  Linking,
} from 'react-native';
import { Ionicons, Feather, FontAwesome5 } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileToast } from '../context/MobileToastContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { useTenantActiveUnit, resolveInvoiceCurrency } from '../hooks/useTenantActiveUnit';
import { TenantMultiPropertySwitcher } from '../components/TenantMultiPropertySwitcher';
import { getTenantReminders } from '../lib/reminders';
import { MobileInvoice, MobilePaymentTransaction, MobileAgreement } from '../types';
import { buildRentSchedule, RentCycleItem, RentScheduleResult } from '../lib/rentScheduleUtils';
import { dispatchRentPaymentReceiptEmail } from '../lib/receiptMailer';
import { calculateMobileInvoiceLateFee } from '../lib/lateFeeService';
import { downloadDocument } from '../lib/documentService';
import { MobileRentalInvoiceDocument } from '../components/MobileRentalInvoiceDocument';
import {
  launchRazorpayPayment,
  launchStripePayment,
  launchPayPalPayment,
  launchEasebuzzPayment,
} from '../lib/payments';

interface TenantPaymentsScreenProps {
  onPayInvoicePress?: (invoiceId?: string) => void;
}

export const TenantPaymentsScreen: React.FC<TenantPaymentsScreenProps> = ({
  onPayInvoicePress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const {
    state,
    recordPayment,
    markInvoicePaid,
    saveInvoice,
    updateMoveOut,
    confirmCashClaim,
    rejectCashClaim,
    submitCashClaim,
    logCommunication,
    respondToDepositSettlement,
    confirmRefundReceipt,
    updateAgreementAutopay,
    cancelAgreementAutopay,
  } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();
  const { showToast } = useMobileToast();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      showToast('Payment records synchronized ✓', 'info');
    }, 700);
  }, [showToast]);

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

  // Contextual top payment reminders (rent overdue countdown, due soon, deposit pending)
  const contextualPaymentReminders = useMemo(() => {
    const all = getTenantReminders(state, user);
    return all.filter((r) => r.category === 'rent' || r.category === 'deposit');
  }, [state, user]);

  // 4 Web-Parity Subtabs: rent_due, invoices, ledger, deposit
  const [subTab, setSubTab] = useState<'rent_due' | 'invoices' | 'ledger' | 'deposit'>('rent_due');
  const [rentDueView, setRentDueView] = useState<'upcoming' | 'history'>('upcoming');

  // Pay Now Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [targetInvoiceForPay, setTargetInvoiceForPay] = useState<MobileInvoice | null>(null);
  const [payMethod, setPayMethod] = useState<string>('razorpay');
  const [offlineUtr, setOfflineUtr] = useState('');
  const [cashRecipientName, setCashRecipientName] = useState(activeAgreement?.ownerName || 'Property Landlord');
  const [cashHandoverDate, setCashHandoverDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Official Universal Document Modal State (Invoice / Voucher / Receipt)
  const [showInvoiceDocModal, setShowInvoiceDocModal] = useState(false);
  const [selectedInvoiceForDoc, setSelectedInvoiceForDoc] = useState<MobileInvoice | null>(null);

  // Security Deposit Settlement Review Modal State
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementDecision, setSettlementDecision] = useState<'accept' | 'contest'>('accept');
  const [payoutRail, setPayoutRail] = useState<'upi' | 'bank' | 'paypal' | 'cash'>('upi');
  const [accountHolder, setAccountHolder] = useState(user.displayName || 'Resident');
  const [upiId, setUpiId] = useState('');
  const [bankAccNumber, setBankAccNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [paypalEmail, setPaypalEmail] = useState(user.email || '');
  const [contestReason, setContestReason] = useState('');
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);
  const [showAutopayModal, setShowAutopayModal] = useState(false);
  const [selectedMobileGateway, setSelectedMobileGateway] = useState<'stripe' | 'razorpay' | 'easebuzz' | 'paypal'>('razorpay');
  const [isPayMethodDropdownOpen, setIsPayMethodDropdownOpen] = useState(false);
  const [isAutopayGatewayDropdownOpen, setIsAutopayGatewayDropdownOpen] = useState(false);
  const [isUpdatingAutopay, setIsUpdatingAutopay] = useState(false);
  const [mandateCardName, setMandateCardName] = useState(user.displayName || 'Resident');
  const [mandateCardNumber, setMandateCardNumber] = useState('');
  const [mandateCardExpiry, setMandateCardExpiry] = useState('');
  const [mandateCardCvv, setMandateCardCvv] = useState('');
  const [mandateRzpSubMode, setMandateRzpSubMode] = useState<'upi' | 'card'>('upi');
  const [mandateUpiId, setMandateUpiId] = useState('');
  const [mandateBankName, setMandateBankName] = useState('HDFC Bank');
  const [mandateAccountNum, setMandateAccountNum] = useState('');
  const [mandatePaypalEmail, setMandatePaypalEmail] = useState(user.email || '');
  const [mandateConsentChecked, setMandateConsentChecked] = useState(true);

  const availableTenantGateways = useMemo(() => {
    const list: Array<{
      key: 'stripe' | 'razorpay' | 'paypal' | 'easebuzz';
      name: string;
      shortTitle: string;
      icon: any;
      description: string;
    }> = [];
    const g = state.platformGateways;
    if (g?.razorpay?.enabled !== false) {
      list.push({
        key: 'razorpay',
        name: 'Razorpay',
        shortTitle: 'Razorpay',
        icon: 'card-outline',
        description: 'Instant automated recurring debits via UPI or Cards',
      });
    }
    if (g?.stripe?.enabled !== false) {
      list.push({
        key: 'stripe',
        name: 'Credit / Debit Card',
        shortTitle: 'Credit / Debit Card',
        icon: 'card-outline',
        description: 'Visa / MasterCard / Amex recurring auto-debit',
      });
    }
    if (g?.easebuzz?.enabled !== false) {
      list.push({
        key: 'easebuzz',
        name: 'Easebuzz',
        shortTitle: 'Easebuzz',
        icon: 'business-outline',
        description: 'Domestic recurring settlement via e-Mandate',
      });
    }
    if (g?.paypal?.enabled !== false) {
      list.push({
        key: 'paypal',
        name: 'PayPal',
        shortTitle: 'PayPal',
        icon: 'logo-paypal',
        description: 'Automated recurring billing via PayPal',
      });
    }
    return list;
  }, [state.platformGateways]);

  const handleToggleMobileTenantAutopay = async () => {
    if (!activeAgreement) return;
    const isCurrentlyActive = Boolean(activeAgreement.autopay?.status === 'active');
    if (isCurrentlyActive) {
      await cancelAgreementAutopay(activeAgreement.id);
      showToast('Rent Autopay disabled. Pay manually each month.', 'info');
    } else {
      const activeGw = (activeAgreement.autopay?.activeGateway || (availableTenantGateways[0]?.key || 'razorpay')) as any;
      const rentAmount = Number(activeAgreement.rent) || 0;
      const dueDay = activeAgreement.rentDueDay || 1;
      const nextDate = new Date();
      nextDate.setDate(dueDay);
      if (nextDate.getTime() <= Date.now()) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      await updateAgreementAutopay(activeAgreement.id, {
        activeGateway: activeGw,
        mandateId: activeAgreement.autopay?.mandateId || `mandate_rent_${activeAgreement.id.slice(-6)}_${Date.now()}`,
        status: 'active',
        optedInAt: new Date().toISOString(),
        paymentMethodDisplay: `${activeGw.toUpperCase()} AutoPay`,
        rentAmount,
        currency: activeAgreement.currency || 'INR',
        rentDueDay: dueDay,
        nextDebitDate: nextDate.toISOString().split('T')[0],
        advanceNoticeSent: false,
        failureCount: 0,
        updatedAt: new Date().toISOString(),
      });
      showToast(`✓ Rent Autopay activated via ${activeGw.toUpperCase()}! 48h advance notice enabled.`, 'success');
    }
  };

  const handleSwitchMobileTenantGateway = async (newGateway: 'stripe' | 'razorpay' | 'easebuzz' | 'paypal') => {
    if (!activeAgreement) return;

    if (!mandateConsentChecked) {
      showToast('Please check the e-Mandate authorization box to proceed.', 'error');
      return;
    }

    let displayDetails = `${newGateway.toUpperCase()} AutoPay`;
    let token = `mandate_${newGateway}_${Date.now()}`;
    const cleanCard = mandateCardNumber.replace(/\s+/g, '');

    if (newGateway === 'stripe') {
      if (!cleanCard || cleanCard.length < 15) {
        showToast('Please enter a valid 16-digit card number.', 'error');
        return;
      }
      if (!mandateCardExpiry || !mandateCardExpiry.includes('/')) {
        showToast('Please enter card expiry (MM/YY).', 'error');
        return;
      }
      if (!mandateCardCvv || mandateCardCvv.length < 3) {
        showToast('Please enter a valid 3-digit CVV.', 'error');
        return;
      }
      const last4 = cleanCard.slice(-4);
      const brand = cleanCard.startsWith('4') ? 'Visa' : cleanCard.startsWith('5') ? 'Mastercard' : 'Card';
      displayDetails = `${brand} ending in •••• ${last4}`;
      token = `pm_stripe_${last4}_${Date.now()}`;
    } else if (newGateway === 'razorpay') {
      if (mandateRzpSubMode === 'upi') {
        if (!mandateUpiId || !mandateUpiId.includes('@')) {
          showToast('Please enter a valid UPI ID (e.g. mobile@okhdfcbank).', 'error');
          return;
        }
        displayDetails = `UPI AutoPay (${mandateUpiId.trim()})`;
        token = `rzp_upi_${Date.now()}`;
      } else {
        if (!cleanCard || cleanCard.length < 15) {
          showToast('Please enter a valid card number.', 'error');
          return;
        }
        const last4 = cleanCard.slice(-4);
        displayDetails = `Card ending in •••• ${last4}`;
        token = `rzp_card_${last4}_${Date.now()}`;
      }
    } else if (newGateway === 'easebuzz') {
      if (!mandateAccountNum || mandateAccountNum.length < 6) {
        showToast('Please enter your valid bank account number.', 'error');
        return;
      }
      const last4 = mandateAccountNum.slice(-4);
      displayDetails = `e-NACH (${mandateBankName} •••• ${last4})`;
      token = `eb_nach_${last4}_${Date.now()}`;
    } else if (newGateway === 'paypal') {
      if (!mandatePaypalEmail || !mandatePaypalEmail.includes('@')) {
        showToast('Please enter your PayPal billing email.', 'error');
        return;
      }
      displayDetails = `PayPal (${mandatePaypalEmail.trim()})`;
      token = `B-${Date.now().toString(36).toUpperCase()}`;
    }

    setIsUpdatingAutopay(true);
    try {
      const rentAmount = Number(activeAgreement.rent) || 0;
      const dueDay = activeAgreement.rentDueDay || 1;
      const nextDate = new Date();
      nextDate.setDate(dueDay);
      if (nextDate.getTime() <= Date.now()) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      await updateAgreementAutopay(activeAgreement.id, {
        activeGateway: newGateway,
        mandateId: token,
        mandateToken: token,
        status: 'active',
        paymentMethodDisplay: displayDetails,
        displayDetails,
        rentAmount,
        currency: activeAgreement.currency || 'INR',
        rentDueDay: dueDay,
        nextDebitDate: nextDate.toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      });
      showToast(`✓ Payment method switched to ${displayDetails}!`, 'success');
      setShowAutopayModal(false);
    } catch (err: any) {
      showToast(`Failed to update autopay: ${err.message || err}`, 'error');
    } finally {
      setIsUpdatingAutopay(false);
    }
  };

  const tenantName = user.displayName || 'Resident';
  const tenantEmail = (user.email || '').toLowerCase();

  // Tenant Record from state
  const tenantRecord = useMemo(() => {
    return state.tenants.find(
      (t) =>
        (user?.id && t.id === user.id) ||
        (tenantEmail && t.email?.toLowerCase().trim() === tenantEmail)
    );
  }, [state.tenants, user?.id, tenantEmail]);

  // Scoped invoices (Strictly by unique IDs)
  const tenantInvoices = useMemo(() => {
    return state.invoices.filter((inv) => {
      // Direct tenant identity checks strictly by unique ID
      const matchesAuthId = Boolean(user?.id && inv.tenantId === user.id);
      const matchesRecordId = Boolean(tenantRecord?.id && inv.tenantId === tenantRecord.id);
      const matchesAgreementTenantId = Boolean(activeAgreement?.tenantId && inv.tenantId === activeAgreement.tenantId);
      const matchesEmail = Boolean(
        tenantEmail && (inv.tenantEmail?.toLowerCase().trim() === tenantEmail || inv.tenant?.toLowerCase().trim() === tenantEmail)
      );

      // Verified agreement link
      const isAgreementMatch = Boolean(
        activeAgreement && (
          inv.leaseAgreementId === activeAgreement.id ||
          (inv.id && inv.id === activeAgreement.depositInvoiceId)
        )
      );

      // Negative Guard: Reject if invoice belongs to a different tenant ID or different email
      if (inv.tenantId && user?.id && inv.tenantId !== user.id && (!tenantRecord || inv.tenantId !== tenantRecord.id) && (!activeAgreement || inv.tenantId !== activeAgreement.tenantId)) {
        return false;
      }
      if (inv.tenantEmail && tenantEmail && inv.tenantEmail.toLowerCase().trim() !== tenantEmail) {
        return false;
      }

      const isMyInv = matchesAuthId || matchesRecordId || matchesAgreementTenantId || matchesEmail || isAgreementMatch;
      if (!isMyInv) return false;

      // Only filter by unit if user explicitly selected a single unit (not 'all')
      if (selectedTenantUnitId && selectedTenantUnitId !== 'all' && activeUnit) {
        const uNum = activeUnit.unitNumber.toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const invUnit = (inv.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        return (
          inv.unit.toLowerCase() === activeUnit.unitNumber.toLowerCase() ||
          inv.unit.toLowerCase() === activeUnit.id.toLowerCase() ||
          invUnit === uNum ||
          inv.leaseAgreementId === activeAgreement?.id
        );
      }
      return true;
    });
  }, [state.invoices, user?.id, tenantRecord, tenantEmail, selectedTenantUnitId, activeUnit, activeAgreement]);

  // Unpaid invoices - excludes voided/cancelled/refunded and vacated units
  const unpaidInvoices = useMemo(() => {
    return tenantInvoices.filter((i) => {
      if (i.status === 'paid' || i.status === 'cancelled' || (i as any).status === 'void' || (i as any).status === 'refunded') {
        return false;
      }

      // Exclude past invoices belonging to a vacated tenancy
      const isPastVacatedInvoice = (state.moveOuts || []).some((m) => {
        const isCompleted =
          m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt);
        if (!isCompleted) return false;

        const invAgId = i.leaseAgreementId || i.agreementId;
        // Strict match by agreement ID if available
        if (m.agreementId && invAgId && m.agreementId === invAgId) {
          return true;
        }

        const matchesProp = Boolean(m.propertyId && i.propertyId && m.propertyId === i.propertyId);
        const matchesUnit =
          (m.unitId && i.unitId && m.unitId === i.unitId) ||
          (m.unit && i.unit && m.unit.toLowerCase().trim() === i.unit.toLowerCase().trim());

        if (!matchesProp || !matchesUnit) return false;

        // If invoice is tied to an old lease agreement different from current active lease
        if (invAgId && activeAgreement && invAgId !== activeAgreement.id) {
          return true;
        }

        const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const invDueTime = new Date(i.due || i.createdAt || 0).getTime();
        const agStartTime = activeAgreement ? new Date(activeAgreement.start || 0).getTime() : 0;

        if (moTime > 0 && invDueTime <= moTime) return true;
        if (agStartTime > 0 && invDueTime < agStartTime) return true;

        return false;
      });
      if (isPastVacatedInvoice) return false;

      const hasActiveTenancyForInv = Boolean(
        activeAgreement &&
        activeAgreement.status !== 'terminated' &&
        activeAgreement.status !== 'cancelled' &&
        (i.leaseAgreementId === activeAgreement.id ||
          (activeUnit && (i.unit === activeUnit.unitNumber || i.unit === activeUnit.id)) ||
          i.unit === activeAgreement.unit)
      );
      if (hasActiveTenancyForInv) return true;

      const isUnitVacated = (state.moveOuts || []).some(
        (m) =>
          (!m.propertyId || !i.propertyId || m.propertyId === i.propertyId) &&
          (m.unit === i.unit || (activeUnit && m.unit === activeUnit.unitNumber)) &&
          (m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt))
      );
      if (isUnitVacated) return false;
      return true;
    });
  }, [tenantInvoices, state.moveOuts, activeUnit, activeAgreement]);

  const totalOutstanding = unpaidInvoices.reduce((sum, i) => sum + i.total, 0);

  // Active Tenancy State Guard
  const hasPendingInviteForMe = useMemo(() => {
    return (state.tenancyRequests || []).some(
      (r) =>
        (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase().trim() === tenantEmail)) &&
        r.status === 'pending'
    );
  }, [state.tenancyRequests, user?.id, tenantEmail]);

  const hasActiveTenancy = useMemo(() => {
    if (hasPendingInviteForMe) return false;
    return Boolean(
      activeAgreement &&
      activeAgreement.status === 'active' &&
      activeAgreement.depositStatus === 'paid'
    );
  }, [activeAgreement, hasPendingInviteForMe]);

  // Tenant Move-Out
  const activeMoveOut = useMemo(() => {
    // Strict Guard: If resident has NO active tenancy or assigned units, do NOT bind unrelated mock move-outs
    if (!hasActiveTenancy && myUnits.length === 0) {
      return null;
    }

    const matchesTenant = (m: any) =>
      m.tenantId === user.id ||
      (tenantEmail && ((m.tenantEmail?.toLowerCase() === tenantEmail) || (m.tenant?.toLowerCase() === tenantEmail))) ||
      (m.tenantName && m.tenantName.toLowerCase() === tenantName.toLowerCase()) ||
      (m.tenant && m.tenant.toLowerCase() === tenantName.toLowerCase());

    const isCompleted = (m: any) =>
      m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt);

    // 1. Look for an in-progress move-out matching activeUnit first
    const inProgressForUnit = state.moveOuts.find(
      (m) => matchesTenant(m) && (!activeUnit || m.unit === activeUnit.unitNumber || m.unit === activeUnit.id) && !isCompleted(m)
    );
    if (inProgressForUnit) return inProgressForUnit;

    // 2. Look for any in-progress move-out for this tenant
    const anyInProgress = state.moveOuts.find(
      (m) => matchesTenant(m) && !isCompleted(m)
    );
    if (anyInProgress) return anyInProgress;

    // 3. Fallback to completed move-out only if the tenant does NOT have an active lease
    if (!hasActiveTenancy) {
      return (
        state.moveOuts.find(
          (m) => matchesTenant(m) && (!activeUnit || m.unit === activeUnit.unitNumber || m.unit === activeUnit.id)
        ) ||
        null
      );
    }

    return null;
  }, [state.moveOuts, user.id, tenantName, tenantEmail, activeUnit, activeAgreement, hasActiveTenancy, myUnits.length]);

  // Scoped payments - strictly isolated to current tenant
  const tenantPayments = useMemo(() => {
    const rawList = state.payments.filter((p) => {
      // 1. Direct tenant identity checks strictly by unique IDs
      const matchesAuthId = Boolean(user?.id && p.tenantId === user.id);
      const matchesRecordId = Boolean(tenantRecord?.id && p.tenantId === tenantRecord.id);
      const matchesAgreementTenantId = Boolean(activeAgreement?.tenantId && p.tenantId === activeAgreement.tenantId);
      const matchesEmail = Boolean(
        tenantEmail &&
        (((p as any).tenantEmail?.toLowerCase().trim() === tenantEmail) || (p.tenant && p.tenant.toLowerCase().trim() === tenantEmail))
      );

      // 2. Agreement / Lease match (if payment references active agreement or invoice belonging to this tenancy)
      const matchesAgreement = Boolean(
        activeAgreement && (
          (p as any).leaseAgreementId === activeAgreement.id ||
          (p.invoiceId && state.invoices.some((inv) => inv.id === p.invoiceId && (inv.leaseAgreementId === activeAgreement.id || inv.tenantId === user?.id || inv.tenantId === tenantRecord?.id || inv.tenantId === activeAgreement.tenantId)))
        )
      );

      // Negative Guard: Reject any payment with a foreign tenantId or foreign tenantEmail
      if (p.tenantId && user?.id && p.tenantId !== user.id && (!tenantRecord || p.tenantId !== tenantRecord.id) && (!activeAgreement || p.tenantId !== activeAgreement.tenantId)) {
        return false;
      }
      if ((p as any).tenantEmail && tenantEmail && (p as any).tenantEmail.toLowerCase().trim() !== tenantEmail) {
        return false;
      }

      // Unit match ONLY IF no foreign tenantId and unit matches active unit for this tenant
      const matchesAssignedUnit = Boolean(
        activeUnit &&
        p.unit &&
        (p.unit.toLowerCase() === activeUnit.unitNumber.toLowerCase() || p.unit.toLowerCase() === activeUnit.id.toLowerCase()) &&
        (!p.propertyId || !activeUnit.propertyId || p.propertyId === activeUnit.propertyId) &&
        (!p.tenantId || p.tenantId === user?.id || p.tenantId === tenantRecord?.id)
      );

      const isMyPay = matchesAuthId || matchesRecordId || matchesAgreementTenantId || matchesEmail || matchesAgreement || matchesAssignedUnit;
      if (!isMyPay) return false;

      if (selectedTenantUnitId && selectedTenantUnitId !== 'all' && activeUnit) {
        const uNum = activeUnit.unitNumber.toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const pUnit = (p.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        return (
          p.unit.toLowerCase() === activeUnit.unitNumber.toLowerCase() ||
          p.unit.toLowerCase() === activeUnit.id.toLowerCase() ||
          pUnit === uNum
        );
      }
      return true;
    });

    const seen = new Set<string>();
    const deduped = rawList.filter((p) => {
      const dedupKey = p.invoiceId || p.id;
      if (seen.has(dedupKey)) return false;
      seen.add(dedupKey);
      return true;
    });

    // Chronological order: newest transactions first
    return deduped.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateB.localeCompare(dateA);
    });
  }, [state.payments, state.invoices, user, tenantRecord, tenantName, tenantEmail, selectedTenantUnitId, activeUnit, activeAgreement]);

  // Matching Deposit Settlement
  const activeSettlement = useMemo(() => {
    if (!activeMoveOut) return null;
    return (
      (state.depositSettlements || []).find(
        (s) =>
          s.id === activeMoveOut.settlementId ||
          s.id === activeMoveOut.id ||
          s.id === `DEP-SETTLE-${activeMoveOut.id}` ||
          (s.unit && s.unit.toLowerCase().trim() === activeMoveOut.unit?.toLowerCase().trim())
      ) || null
    );
  }, [state.depositSettlements, activeMoveOut]);

  // Landlord disbursement and tenant receipt confirmation flags
  const isDisbursed = useMemo(() => {
    return (
      activeMoveOut?.status === 'refund_completed' ||
      activeMoveOut?.status === 'settled' ||
      activeSettlement?.status === 'refunded' ||
      Boolean(activeSettlement?.disbursedAt)
    );
  }, [activeMoveOut, activeSettlement]);

  const hasConfirmedReceipt = useMemo(() => {
    return (
      Boolean(activeMoveOut?.tenantConfirmedReceipt) ||
      Boolean(activeSettlement?.tenantConfirmedReceipt)
    );
  }, [activeMoveOut, activeSettlement]);

  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState(false);

  const handleConfirmRefundReceipt = () => {
    if (!activeMoveOut) return;
    const settleId = activeSettlement?.id || activeMoveOut.id;
    const refundAmt = format(
      activeSettlement?.finalRefundAmount ?? activeMoveOut.netRefundAmount,
      activeMoveOut.currency || activeCurrency
    );

    Alert.alert(
      'Confirm Refund Received',
      `Have you received the deposit refund of ${refundAmt} in your account?\n\nConfirming receipt will formally conclude your tenancy, release this residence, and clear any outstanding dues for Unit ${activeMoveOut.unit}.`,
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: '✓ Yes, Confirm Receipt',
          onPress: async () => {
            setIsConfirmingReceipt(true);
            try {
              await confirmRefundReceipt(settleId);
              setShowSettlementModal(false);
              Alert.alert(
                'Tenancy Concluded ✓',
                `Deposit refund receipt confirmed for Unit ${activeMoveOut.unit}. All tenancy obligations have concluded.`
              );
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to confirm refund receipt.');
            } finally {
              setIsConfirmingReceipt(false);
            }
          },
        },
      ]
    );
  };

  // Pending Cash Refund Claims for Tenant (Refunds initiated by owner awaiting tenant confirmation)
  const pendingCashClaims = useMemo(() => {
    return (state as any).cashClaims?.filter(
      (c: any) =>
        c.status === 'pending_confirmation' &&
        c.claimedByRole === 'owner' &&
        ((user?.id && c.tenantId === user.id) ||
          (tenantRecord?.id && c.tenantId === tenantRecord.id) ||
          (tenantEmail && c.tenantEmail?.toLowerCase() === tenantEmail))
    ) || [];
  }, [state, user, tenantRecord, tenantEmail]);

  // Pending Cash / Offline Inflow Claims submitted by tenant awaiting landlord confirmation
  const pendingInflowClaimsSubmittedByMe = useMemo(() => {
    return ((state as any).cashClaims || []).filter(
      (c: any) =>
        c.status === 'pending_confirmation' &&
        c.claimedByRole === 'tenant' &&
        ((user?.id && c.tenantId === user.id) ||
          (tenantRecord?.id && c.tenantId === tenantRecord.id) ||
          (tenantEmail && ((c.tenantEmail?.toLowerCase() === tenantEmail) || (c.tenant?.toLowerCase() === tenantEmail))))
    );
  }, [state, user, tenantRecord, tenantEmail]);

  // Comprehensive Agreements for Tenant (Strictly Unique ID & Email)
  const myAgreements = useMemo(() => {
    return (state.agreements || []).filter((a) => {
      if (user?.id && a.tenantId === user.id) return true;
      if (tenantRecord?.id && a.tenantId === tenantRecord.id) return true;
      if (tenantEmail) {
        if (a.tenantEmail && a.tenantEmail.toLowerCase().trim() === tenantEmail) return true;
        if (a.tenant && a.tenant.toLowerCase().trim() === tenantEmail) return true;
      }
      return false;
    });
  }, [state.agreements, user?.id, tenantRecord, tenantEmail]);

  const activeAgreements = useMemo(() => {
    return myAgreements.filter((a) => {
      if (a.status !== 'active') return false;

      // Guard: Cannot be active if tenancy request is still pending acceptance
      const hasPendingInvite = (state.tenancyRequests || []).some(
        (r) =>
          r.status === 'pending' &&
          (((r as any).agreementId && (r as any).agreementId === a.id) ||
            (r.unit && a.unit && r.unit.toLowerCase().trim() === a.unit.toLowerCase().trim())) &&
          (!r.propertyId || !a.propertyId || r.propertyId === a.propertyId)
      );
      if (hasPendingInvite) return false;

      // Guard: Cannot be active if deposit is unpaid and no deposit payment transaction exists
      if (a.depositStatus !== 'paid' && a.depositStatus !== undefined && !a.offlineDepositCollected) {
        const hasPaidDep = tenantPayments.some(
          (p) =>
            (p.type === 'deposit' || p.invoiceId?.startsWith('INV-DEP') || p.notes?.toLowerCase().includes('security deposit')) &&
            p.status === 'paid'
        );
        if (!hasPaidDep) return false;
      }

      const isAgVacated = (state.moveOuts || []).some((m) => {
        const matchesUnit =
          (m.unit && a.unit && m.unit.toLowerCase().trim() === a.unit.toLowerCase().trim()) ||
          (activeUnit && m.unit && m.unit.toLowerCase().trim() === activeUnit.unitNumber.toLowerCase().trim());
        const matchesProp = !m.propertyId || !a.propertyId || m.propertyId === a.propertyId;
        const isCompleted =
          m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt);
        if (!matchesUnit || !matchesProp || !isCompleted) return false;
        if (m.agreementId || (m as any).leaseAgreementId) {
          return m.agreementId === a.id || (m as any).leaseAgreementId === a.id;
        }
        const agTime = new Date(a.createdAt || a.start || 0).getTime();
        const moTime = new Date((m as any).updatedAt || (m as any).settledAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
        if (agTime >= moTime && agTime > 0) return false;
        return false;
      });
      return !isAgVacated;
    });
  }, [myAgreements, state.moveOuts, state.tenancyRequests, activeUnit, tenantPayments]);

  const isResidentFullyVacated = useMemo(() => {
    const hasSettledMoveout = (state.moveOuts || []).some(
      (m) =>
        (m.tenantId === user.id || (tenantEmail && (m.tenantName?.toLowerCase() === tenantEmail.toLowerCase() || (m as any).tenantEmail?.toLowerCase() === tenantEmail.toLowerCase()))) &&
        (m.status === 'refund_completed' || m.status === 'settled' || Boolean(m.tenantConfirmedReceipt))
    ) || (state.depositSettlements || []).some(
      (s) =>
        (s.tenantId === user.id || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail.toLowerCase())) &&
        ((s.status as any) === 'refunded' || (s.status as any) === 'settled' || (s.status as any) === 'refund_completed' || Boolean(s.tenantConfirmedReceipt))
    );
    if (hasSettledMoveout && activeAgreements.length === 0) {
      return true;
    }
    return false;
  }, [state.moveOuts, state.depositSettlements, activeAgreements, user.id, tenantEmail]);

  const effectiveAgreements: MobileAgreement[] = useMemo(() => {
    if (isResidentFullyVacated) return [];
    if (hasPendingInviteForMe) return [];
    if (activeAgreements.length > 0) return activeAgreements;
    if (activeAgreement && activeAgreement.status === 'active' && activeAgreement.depositStatus === 'paid') {
      const hasPendingInvite = (state.tenancyRequests || []).some(
        (r) =>
          r.status === 'pending' &&
          (((r as any).agreementId && (r as any).agreementId === activeAgreement.id) ||
            (r.unit && activeAgreement.unit && r.unit.toLowerCase().trim() === activeAgreement.unit.toLowerCase().trim()))
      );
      if (!hasPendingInvite) return [activeAgreement];
    }
    return [];
  }, [isResidentFullyVacated, hasPendingInviteForMe, activeAgreements, activeAgreement, state.tenancyRequests]);

  const targetAgreement = useMemo(() => {
    if (selectedTenantUnitId && selectedTenantUnitId !== 'all') {
      return (
        effectiveAgreements.find((a) => {
          if (activeUnit) {
            const unitMatch =
              a.unit === activeUnit.unitNumber ||
              a.unit === activeUnit.id ||
              (a.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() ===
              (activeUnit.unitNumber || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
            const propMatch =
              !a.propertyId || !activeUnit.propertyId || a.propertyId === activeUnit.propertyId;
            if (unitMatch && propMatch) return true;
          }
          return (
            a.id === selectedTenantUnitId ||
            `${a.propertyId || ''}_${a.unit}` === selectedTenantUnitId ||
            Boolean(activeUnit && (!a.propertyId || !activeUnit.propertyId || a.propertyId === activeUnit.propertyId) && a.unit === selectedTenantUnitId)
          );
        }) || null
      );
    }
    return null;
  }, [selectedTenantUnitId, effectiveAgreements, activeUnit]);

  // Rent Schedule Generator (1-to-1 Web Parity — full portfolio & multi-agreement aggregation)
  const rentSchedule: RentScheduleResult = useMemo(() => {
    if (isResidentFullyVacated && effectiveAgreements.length === 0) {
      return buildRentSchedule(
        null,
        state.properties,
        state.invoices,
        tenantPayments,
        null,
        state.ownerSettings,
        true
      );
    }

    if (targetAgreement) {
      return buildRentSchedule(
        targetAgreement,
        state.properties,
        state.invoices,
        tenantPayments,
        undefined,
        state.ownerSettings,
        false
      );
    }

    if (effectiveAgreements.length === 0) {
      return buildRentSchedule(
        null,
        state.properties,
        state.invoices,
        tenantPayments,
        null,
        state.ownerSettings,
        false
      );
    }

    if (effectiveAgreements.length === 1) {
      return buildRentSchedule(
        effectiveAgreements[0],
        state.properties,
        state.invoices,
        tenantPayments,
        tenantRecord,
        state.ownerSettings,
        false
      );
    }

    // Multi-property aggregation: compile all cycles across all active residences
    const combinedUpcoming: RentCycleItem[] = [];
    const combinedHistory: RentCycleItem[] = [];
    let totalCycles = 0;
    let paidCycles = 0;
    let pendingCycles = 0;

    effectiveAgreements.forEach((ag) => {
      const res = buildRentSchedule(
        ag,
        state.properties,
        state.invoices,
        tenantPayments,
        undefined,
        state.ownerSettings,
        false
      );
      combinedUpcoming.push(...res.upcomingDues);
      combinedHistory.push(...res.historyDues);
      totalCycles += res.totalCyclesCount;
      paidCycles += res.paidCyclesCount;
      pendingCycles += res.pendingCyclesCount;
    });

    const statusPriority = (s: string) => {
      if (s === 'overdue') return 1;
      if (s === 'due_now') return 2;
      if (s === 'due_soon') return 3;
      if (s === 'pending_confirmation' || s === 'pending_verification') return 4;
      return 5;
    };

    combinedUpcoming.sort((a, b) => {
      const pDiff = statusPriority(a.status) - statusPriority(b.status);
      if (pDiff !== 0) return pDiff;
      return a.dueDate.localeCompare(b.dueDate);
    });

    combinedHistory.sort((a, b) => (b.paidAt || b.dueDate).localeCompare(a.paidAt || a.dueDate));

    const currentDue = combinedUpcoming.length > 0 ? combinedUpcoming[0] : null;

    return {
      currentDueItem: currentDue,
      upcomingDues: combinedUpcoming,
      historyDues: combinedHistory,
      totalCyclesCount: totalCycles,
      paidCyclesCount: paidCycles,
      pendingCyclesCount: pendingCycles,
    };
  }, [targetAgreement, effectiveAgreements, state.properties, state.invoices, tenantPayments, tenantRecord, state.ownerSettings]);

  const { currentDueItem, upcomingDues, historyDues, totalCyclesCount, paidCyclesCount, pendingCyclesCount } = rentSchedule;

  // ── Pending Security Deposit Detector (Strict 1-to-1 Web Parity) ─────────
  const pendingDepositRecord = useMemo(() => {
    // Web parity check: Has the tenant ALREADY paid a deposit invoice/transaction?
    const hasPaidDepositTxn =
      tenantPayments.some(
        (p) =>
          (p.type === 'deposit' || p.invoiceId?.startsWith('INV-DEP') || p.notes?.toLowerCase().includes('security deposit')) &&
          p.status === 'paid'
      ) ||
      tenantInvoices.some(
        (i) =>
          (i.type === 'deposit' || (i as any).invoiceType === 'deposit' || i.id.startsWith('INV-DEP')) &&
          i.status === 'paid'
      );

    // 1. Identify the current tenant's target agreement
    const targetAg =
      (activeAgreement && (activeAgreement.depositStatus !== 'paid' || activeAgreement.status === 'pending_deposit') ? activeAgreement : null) ||
      myAgreements.find(
        (a) =>
          (a.status === 'pending_deposit' || a.depositStatus === 'unpaid' || (!a.depositStatus && (a.deposit || 0) > 0)) &&
          a.status !== 'terminated' &&
          a.status !== 'cancelled'
      ) ||
      activeAgreement;

    // Web Parity Rule: If a paid deposit transaction or paid deposit invoice exists for this tenant, suppress pending deposit record
    if (hasPaidDepositTxn && (!targetAg || targetAg.depositStatus === 'paid' || targetAg.status === 'active' || (targetAg as any).depositStatus !== 'unpaid')) {
      return null;
    }

    // 2. Look for the explicit deposit invoice strictly matching this agreement and tenant
    let depInv: MobileInvoice | null = null;

    if (targetAg?.depositInvoiceId) {
      depInv =
        state.invoices.find(
          (i) =>
            i.id === targetAg.depositInvoiceId &&
            i.status !== 'paid' &&
            i.status !== 'void' &&
            i.status !== 'cancelled' &&
            (i as any).status !== 'refunded'
        ) || null;
    }

    if (!depInv && targetAg?.id) {
      depInv =
        state.invoices.find(
          (i) =>
            i.leaseAgreementId === targetAg.id &&
            (i.type === 'deposit' || (i as any).invoiceType === 'deposit' || i.id.startsWith('INV-DEP')) &&
            i.status !== 'paid' &&
            i.status !== 'void' &&
            i.status !== 'cancelled' &&
            (i as any).status !== 'refunded'
        ) || null;
    }

    if (!depInv) {
      // Strictly scoped to tenantInvoices (never global invoices from other tenants/properties)
      depInv =
        tenantInvoices.find((inv) => {
          const isDep = inv.type === 'deposit' || (inv as any).invoiceType === 'deposit' || inv.id.startsWith('INV-DEP');
          if (!isDep) return false;
          if (inv.status === 'paid' || inv.status === 'void' || inv.status === 'cancelled' || (inv as any).status === 'refunded') {
            return false;
          }
          if (targetAg) {
            const matchProp = !inv.propertyId || !targetAg.propertyId || inv.propertyId === targetAg.propertyId;
            const matchUnit = inv.unit === targetAg.unit || inv.unit === targetAg.id;
            const matchAg = !inv.leaseAgreementId || inv.leaseAgreementId === targetAg.id;
            return matchProp && matchUnit && matchAg;
          }
          return true;
        }) || null;
    }

    // 3. Or agreement in pending_deposit or depositStatus !== 'paid'
    const agWithPendingDep =
      targetAg &&
        (targetAg.status === 'pending_deposit' || targetAg.depositStatus === 'unpaid' || (!targetAg.depositStatus && (targetAg.deposit || 0) > 0)) &&
        targetAg.status !== 'terminated' &&
        targetAg.status !== 'cancelled'
        ? targetAg
        : null;

    // If a completed deposit payment exists, ignore pending flags unless an explicit unpaid invoice exists
    if (hasPaidDepositTxn && !depInv) {
      return null;
    }

    if (depInv || agWithPendingDep) {
      const effAg = agWithPendingDep || targetAg;
      const targetUnitObj =
        (effAg?.unit
          ? state.units.find(
            (u) =>
              (u.unitNumber === effAg.unit || u.id === effAg.unit) &&
              (!effAg.propertyId || u.propertyId === effAg.propertyId)
          )
          : null) || activeUnit;
      const targetProp =
        (effAg?.propertyId ? state.properties.find((p) => p.id === effAg.propertyId) : null) ||
        (targetUnitObj?.propertyId ? state.properties.find((p) => p.id === targetUnitObj.propertyId) : null) ||
        activeProperty;

      const amount = depInv?.total || effAg?.deposit || targetUnitObj?.deposit || 0;
      const ref = depInv?.id
        ? `#${depInv.id}`
        : effAg?.depositInvoiceId
          ? `#${effAg.depositInvoiceId}`
          : `#INV-DEP-${effAg?.unit || targetUnitObj?.unitNumber || 'SEC'}`;
      const unit = depInv?.unit || effAg?.unit || targetUnitObj?.unitNumber || 'Residence';
      const propName = depInv?.propertyName || effAg?.propertyName || targetProp?.name || 'Residence';
      const depCurrency = depInv?.currency || effAg?.currency || targetUnitObj?.currency || targetProp?.currency || activeCurrency;

      return {
        invoice: depInv || null,
        agreement: effAg || null,
        amount,
        reference: ref,
        unit,
        propertyName: propName,
        currency: depCurrency,
        dueDate: depInv?.due || effAg?.start || new Date().toISOString().split('T')[0],
      };
    }
    return null;
  }, [
    state.invoices,
    tenantInvoices,
    tenantPayments,
    state.units,
    state.properties,
    myAgreements,
    activeAgreement,
    activeUnit,
    activeProperty,
    user.id,
    tenantEmail,
    tenantName,
    activeCurrency,
  ]);

  const isDepositPaid = Boolean(
    !hasPendingInviteForMe &&
    (
      (activeAgreement?.depositStatus === 'paid' && !pendingDepositRecord) ||
      activeAgreement?.offlineDepositCollected ||
      tenantPayments.some(
        (p) =>
          (p.type === 'deposit' || p.invoiceId?.startsWith('INV-DEP') || p.notes?.toLowerCase().includes('security deposit')) &&
          p.status === 'paid'
      ) ||
      tenantInvoices.some(
        (i) =>
          (i.type === 'deposit' || (i as any).invoiceType === 'deposit' || (activeAgreement?.depositInvoiceId && i.id === activeAgreement.depositInvoiceId) || i.id.startsWith('INV-DEP')) &&
          i.status === 'paid'
      )
    )
  );

  const handlePayDeposit = () => {
    if (pendingDepositRecord?.invoice) {
      handleOpenPayModal(pendingDepositRecord.invoice);
      return;
    }
    const targetAg = pendingDepositRecord?.agreement || activeAgreement;
    const targetProp = (targetAg?.propertyId ? state.properties.find((p) => p.id === targetAg.propertyId) : null) || activeProperty;
    const depCurrency = pendingDepositRecord?.currency || targetAg?.currency || targetProp?.currency || activeCurrency;
    const depositInvId = (pendingDepositRecord?.reference || `INV-DEP-${targetAg?.id || 'SEC'}`).replace(/^#/, '');
    const depositAmount = pendingDepositRecord?.amount || targetAg?.deposit || activeUnit?.deposit || 0;
    const fallbackInv: MobileInvoice = {
      id: depositInvId,
      ownerId: targetAg?.ownerId || activeAgreement?.ownerId || '',
      tenant: tenantName,
      tenantId: user.id,
      unit: pendingDepositRecord?.unit || targetAg?.unit || activeAgreement?.unit || 'Residence',
      propertyName: pendingDepositRecord?.propertyName || targetProp?.name || 'Residence',
      propertyId: targetAg?.propertyId || activeAgreement?.propertyId,
      amount: depositAmount,
      tax: 0,
      total: depositAmount,
      due: pendingDepositRecord?.dueDate || new Date().toISOString().split('T')[0],
      status: 'sent',
      currency: depCurrency,
      type: 'deposit',
      invoiceType: 'deposit',
      leaseAgreementId: targetAg?.id || activeAgreement?.id,
      items: [
        {
          description: `Refundable Security Deposit - Unit ${pendingDepositRecord?.unit || targetAg?.unit || activeAgreement?.unit || 'Residence'}`,
          amount: depositAmount,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    saveInvoice(fallbackInv);
    handleOpenPayModal(fallbackInv);
  };

  // ── Dynamic Owner Payment Gateway Resolution (Web Parity) ──────────────────
  // Resolve owner from active invoice → agreement → property → activeAgreement
  const resolvedOwnerId = useMemo(() => {
    return (
      targetInvoiceForPay?.ownerId ||
      effectiveAgreements.find(
        (a) =>
          (targetInvoiceForPay?.leaseAgreementId && a.id === targetInvoiceForPay.leaseAgreementId) ||
          ((!targetInvoiceForPay?.propertyId || a.propertyId === targetInvoiceForPay.propertyId) &&
            Boolean(targetInvoiceForPay?.unit && (a.unit === targetInvoiceForPay.unit || a.id === targetInvoiceForPay.unit)))
      )?.ownerId ||
      activeAgreement?.ownerId ||
      (activeProperty?.id ? state.properties.find((p) => p.id === activeProperty.id)?.ownerId : undefined) ||
      ''
    );
  }, [targetInvoiceForPay, effectiveAgreements, activeAgreement, activeProperty, state.properties]);

  // Read owner's configured payment methods from Firestore-synced ownerSettings
  const ownerMethods = useMemo(() => {
    return (
      (resolvedOwnerId && state.ownerSettings[resolvedOwnerId]?.paymentMethods) ||
      state.paymentMethods ||
      {}
    );
  }, [resolvedOwnerId, state.ownerSettings, state.paymentMethods]);

  // Build available gateways — exact 1:1 match with Web PaymentsHistoryPage.tsx logic
  const availableGateways = useMemo(() => {
    const m = ownerMethods;
    const list: Array<{ key: string; label: string; icon: string; subtitle: string }> = [];

    // 0. Easebuzz — owner key OR platform key
    const ebOwner = m.easebuzz?.enabled !== false && m.easebuzz?.merchantKey;
    const ebPlatform = state.platformGateways.easebuzz?.enabled !== false && state.platformGateways.easebuzz?.merchantKey;
    if (ebOwner || ebPlatform || m.easebuzz?.enabled) {
      list.push({ key: 'easebuzz', label: 'Easebuzz', icon: '⚡', subtitle: 'UPI • Cards • Netbanking' });
    }

    // 1. UPI Direct — show unless explicitly disabled (matches web: m.upi?.enabled !== false)
    if (m.upi?.enabled !== false) {
      list.push({ key: 'upi', label: 'UPI / QR', icon: '📱', subtitle: m.upi?.upiId || 'GPay • PhonePe • QR' });
    }

    // 2. Razorpay — needs explicit enable flag (or platform)
    if (m.razorpay?.enabled !== false && (m.razorpay?.enabled || state.platformGateways.razorpay?.enabled)) {
      list.push({ key: 'razorpay', label: 'Razorpay', icon: '⚡', subtitle: 'Cards • Netbanking • UPI' });
    }

    // 3. Stripe — needs explicit enable flag (or platform)
    if (m.stripe?.enabled !== false && (m.stripe?.enabled || state.platformGateways.stripe?.enabled)) {
      list.push({ key: 'stripe', label: 'Stripe', icon: '💳', subtitle: 'Visa • Mastercard • Amex' });
    }

    // 4. PayPal — needs explicit enable flag (or platform)
    if (m.paypal?.enabled !== false && (m.paypal?.enabled || state.platformGateways.paypal?.enabled)) {
      list.push({ key: 'paypal', label: 'PayPal', icon: '🅿️', subtitle: m.paypal?.email || 'International' });
    }

    // 5. Bank Wire — show unless explicitly disabled (matches web: m.bank?.enabled !== false)
    if (m.bank?.enabled !== false) {
      list.push({
        key: 'bank',
        label: 'Bank Wire',
        icon: '🏦',
        subtitle: m.bank?.accountNumber
          ? `${m.bank.bankName ? m.bank.bankName + ' · ' : ''}${m.bank.accountNumber}`
          : 'NEFT · IMPS · RTGS',
      });
    }

    // 6. Cash — show unless explicitly disabled (matches web: m.cash?.enabled !== false)
    if (m.cash?.enabled !== false) {
      list.push({ key: 'cash', label: 'Cash', icon: '💵', subtitle: 'In-person handover' });
    }

    return list;
  }, [ownerMethods, state.platformGateways]);


  // Auto-select first available gateway when modal opens or gateways change
  useEffect(() => {
    if (showPayModal && availableGateways.length > 0 && !availableGateways.some((g) => g.key === payMethod)) {
      setPayMethod(availableGateways[0].key);
    }
  }, [showPayModal, availableGateways]);
  // ────────────────────────────────────────────────────────────────────────────

  const prepareInvoiceForPayment = (inv?: MobileInvoice): MobileInvoice | null => {
    if (!inv) return null;
    if (inv.lateFeeWaived) {
      return {
        ...inv,
        lateFeeApplied: 0,
        total: (inv.amount || 0) + (inv.tax || 0),
      };
    }
    const ownerSettings = inv.ownerId ? state.ownerSettings[inv.ownerId] : undefined;
    const effectiveLateFeeSettings = ownerSettings?.lateFeeConfig || state.lateFeeSettings;
    const lateFeeRes = calculateMobileInvoiceLateFee(inv, effectiveLateFeeSettings);
    if (lateFeeRes.accruedLateFee > 0) {
      return {
        ...inv,
        lateFeeApplied: lateFeeRes.accruedLateFee,
        lateFeeCalculation: lateFeeRes.ruleDescription,
        total: (inv.amount || 0) + (inv.tax || 0) + lateFeeRes.accruedLateFee,
      };
    }
    return inv;
  };

  const handleOpenPayModal = (inv?: MobileInvoice) => {
    const rawTarget = inv || unpaidInvoices[0] || tenantInvoices[0];
    const target = prepareInvoiceForPayment(rawTarget);
    if (!target) {
      Alert.alert('No Dues Available', 'You do not have any pending invoices or active rent due at this time.');
      return;
    }
    setTargetInvoiceForPay(target);
    setOfflineUtr('');
    if (availableGateways.length > 0 && !availableGateways.some((g) => g.key === payMethod)) {
      setPayMethod(availableGateways[0].key);
    }
    setShowPayModal(true);
  };


  const handlePayCycleItem = (item: RentCycleItem) => {
    if (pendingDepositRecord || item.isDepositPending) {
      Alert.alert(
        'Security Deposit Required',
        'As per lease terms, the refundable security deposit must be paid first before monthly rent payments can be initiated.',
        [
          { text: 'Pay Security Deposit', onPress: handlePayDeposit },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    let matchedInv = state.invoices.find(
      (i) => i.id === item.invoiceId || (i.due === item.dueDate && i.unit === item.unitNumber && i.status !== 'paid')
    );
    if (!matchedInv) {
      const cycleInv: MobileInvoice = {
        id: item.invoiceId || `INV-${item.id.replace(/[^0-9a-zA-Z]/g, '').slice(-8).toUpperCase()}`,
        ownerId: activeAgreement?.ownerId || '',
        tenant: tenantName,
        tenantId: user.id,
        unit: item.unitNumber,
        propertyName: item.propertyName,
        propertyId: item.propertyId,
        amount: item.amount,
        tax: 0,
        total: item.amount,
        due: item.dueDate,
        status: 'sent',
        currency: item.currency || activeCurrency,
        type: 'rent',
        invoiceType: 'rent',
        leaseAgreementId: activeAgreement?.id,
        items: [{ description: `Monthly Rent — ${item.cycleLabel} (${item.monthName})`, amount: item.amount }],
        createdAt: new Date().toISOString(),
      };
      saveInvoice(cycleInv);
      matchedInv = cycleInv;
    }
    handleOpenPayModal(matchedInv);
  };

  const handleViewCycleReceipt = (item: RentCycleItem) => {
    const matchedPayment = tenantPayments.find(
      (p) => p.id === item.transactionRef || (p.date && p.date.startsWith(item.dueDate.slice(0, 7)))
    );
    const matchedInv = state.invoices.find(
      (i) => i.id === item.invoiceId || (i.due === item.dueDate && i.unit === item.unitNumber)
    );
    const cycleInv: MobileInvoice = matchedInv || {
      id: item.invoiceId || matchedPayment?.invoiceId || `INV-${item.id.replace(/[^0-9a-zA-Z]/g, '').slice(-8).toUpperCase()}`,
      ownerId: activeAgreement?.ownerId || matchedPayment?.ownerId || '',
      tenant: tenantName,
      tenantId: user.id,
      unit: item.unitNumber,
      propertyName: item.propertyName,
      propertyId: item.propertyId,
      amount: item.amount,
      tax: 0,
      total: item.amount,
      due: item.dueDate,
      issueDate: item.dueDate,
      paidAt: item.paidAt || matchedPayment?.date || item.dueDate,
      paymentMethodUsed: item.paymentMethod || matchedPayment?.method || 'Direct Bank Settlement',
      receiptNumber: item.transactionRef || matchedPayment?.referenceNo || matchedPayment?.id || 'REC-CONFIRMED',
      status: 'paid',
      currency: item.currency || activeCurrency,
      type: 'rent',
      invoiceType: 'rent',
      leaseAgreementId: activeAgreement?.id,
      items: [{ description: `Monthly Rent — ${item.cycleLabel} (${item.monthName})`, amount: item.amount }],
      createdAt: item.paidAt || item.dueDate,
    };
    setSelectedInvoiceForDoc(cycleInv);
    setShowInvoiceDocModal(true);
  };

  const handleViewPaymentReceipt = (p: MobilePaymentTransaction) => {
    const matchedInv = state.invoices.find(
      (inv) =>
        (p.invoiceId && inv.id === p.invoiceId) ||
        (p.id && (inv.receiptNumber === p.id || p.id === `PAY-${inv.id}`)) ||
        (inv.unit === p.unit && inv.total === p.amount)
    );

    const isDepositType = p.type === 'deposit' || p.type === 'deposit_refund';
    const resolvedInv: MobileInvoice = matchedInv || {
      id: p.invoiceId || `INV-${p.id.replace(/[^0-9a-zA-Z]/g, '').slice(-6) || 'RCP'}`,
      ownerId: p.ownerId || activeAgreement?.ownerId || '',
      tenant: p.tenant || tenantName,
      tenantId: p.tenantId || user?.id || '',
      unit: p.unit || activeUnit?.unitNumber || '',
      propertyName: p.propertyName || activeProperty?.name || 'Propithub Residential',
      propertyId: p.propertyId || activeProperty?.id || '',
      type: isDepositType ? 'deposit' : p.type === 'late_fee' ? 'late_fee' : p.type === 'utility' ? 'utility' : 'rent',
      invoiceType: isDepositType ? 'deposit' : p.type === 'late_fee' ? 'late_fee' : p.type === 'utility' ? 'utility' : 'rent',
      amount: p.amount,
      tax: 0,
      total: p.amount,
      due: p.dueDate || p.date,
      issueDate: p.date,
      paidAt: p.status === 'paid' ? p.date : undefined,
      paymentMethodUsed: p.method,
      receiptNumber: p.referenceNo || p.id,
      status: p.status === 'paid' ? 'paid' : p.status === 'pending_confirmation' ? 'pending_confirmation' : p.status === 'overdue' ? 'overdue' : 'sent',
      currency: p.currency || activeCurrency,
      leaseAgreementId: (p as any).leaseAgreementId || activeAgreement?.id,
      items: [
        {
          description: isDepositType
            ? `Security Deposit Custody — Unit ${p.unit}`
            : p.type === 'utility'
              ? `Utility Charges — Unit ${p.unit}`
              : p.type === 'late_fee'
                ? `Late Payment Surcharge — Unit ${p.unit}`
                : `Monthly Rental Settlement — Unit ${p.unit}`,
          amount: p.amount,
        },
      ],
      createdAt: p.date,
    };

    setSelectedInvoiceForDoc(resolvedInv);
    setShowInvoiceDocModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!targetInvoiceForPay) return;

    if (payMethod === 'bank' && !offlineUtr.trim()) {
      Alert.alert('Reference Required', 'Please enter your bank UTR or IMPS reference number.');
      return;
    }

    if (payMethod === 'upi' && !offlineUtr.trim()) {
      Alert.alert('UPI Reference Required', 'Please complete the transfer in your UPI app and enter the 12-digit UTR / reference number.');
      return;
    }

    setIsSubmittingPayment(true);

    const isDepositInv =
      targetInvoiceForPay.type === 'deposit' ||
      (targetInvoiceForPay as any).invoiceType === 'deposit' ||
      targetInvoiceForPay.id.startsWith('INV-DEP');

    // Helper: Finalize verified online gateway payment
    const finalizeSuccessfulOnlinePayment = (txnId: string, resolvedMethodLabel: string) => {
      const paymentRecord: MobilePaymentTransaction = {
        id: txnId,
        invoiceId: targetInvoiceForPay.id,
        ownerId: targetInvoiceForPay.ownerId || activeAgreement?.ownerId || '',
        tenant: targetInvoiceForPay.tenant || tenantName,
        tenantId: targetInvoiceForPay.tenantId || user.id,
        unit: targetInvoiceForPay.unit || activeUnit?.unitNumber || '',
        propertyName: targetInvoiceForPay.propertyName || activeProperty?.name || 'Residence',
        amount: targetInvoiceForPay.total,
        currency: targetInvoiceForPay.currency || activeCurrency,
        date: new Date().toISOString().split('T')[0],
        dueDate: targetInvoiceForPay.due,
        method: resolvedMethodLabel,
        type: isDepositInv ? 'deposit' : 'rent',
        status: 'paid',
        referenceNo: txnId,
      };

      recordPayment(paymentRecord);
      markInvoicePaid(targetInvoiceForPay.id, resolvedMethodLabel.toUpperCase(), txnId, {
        lateFeeApplied: targetInvoiceForPay.lateFeeApplied,
        lateFeeCalculation: targetInvoiceForPay.lateFeeCalculation,
        finalTotal: targetInvoiceForPay.total,
      });

      // Automated Receipt Dispatch
      dispatchRentPaymentReceiptEmail({
        invoice: targetInvoiceForPay,
        payment: paymentRecord,
        tenantEmail: user.email,
        tenantName: targetInvoiceForPay.tenant || tenantName,
        tenantId: user.id,
        ownerId: targetInvoiceForPay.ownerId,
        propertyName: targetInvoiceForPay.propertyName || activeProperty?.name,
        unit: targetInvoiceForPay.unit || activeUnit?.unitNumber,
        currencySymbol: targetInvoiceForPay.currency || activeCurrency,
      }).catch(console.warn);

      // Multi-channel Communication Log & In-App Notification
      logCommunication({
        type: 'PAYMENT_RECEIVED',
        category: 'rent',
        title: `Rent Payment Settled: Unit ${targetInvoiceForPay.unit}`,
        body: `Payment of ${targetInvoiceForPay.currency || activeCurrency}${targetInvoiceForPay.total.toLocaleString()} settled via ${resolvedMethodLabel}. Transaction Ref: ${txnId}.`,
        channels: ['in_app', 'email', 'sms'],
        recipientId: user.id,
        recipientName: tenantName,
        recipientRole: 'tenant',
        recipientContact: { email: user.email, phone: user.phone },
        senderId: targetInvoiceForPay.ownerId || 'system',
        senderName: 'Property Owner',
        senderRole: 'owner',
        ownerId: targetInvoiceForPay.ownerId,
        unitNumber: targetInvoiceForPay.unit,
        propertyName: targetInvoiceForPay.propertyName || activeProperty?.name,
        relatedEntityId: txnId,
        deliveryStatus: { inApp: 'delivered', email: user.email ? 'delivered' : 'skipped', sms: user.phone ? 'delivered' : 'skipped' },
      }).catch(console.warn);

      setIsSubmittingPayment(false);
      setShowPayModal(false);
      setTargetInvoiceForPay(null);

      Alert.alert(
        'Payment Settled ✓',
        `Settlement successful! Receipt #${txnId} generated and registered on your inflow ledger.`
      );
    };

    // Helper: Finalize offline proof (Bank / Cash / Direct UPI)
    const finalizeOfflinePayment = (resolvedMethodLabel: string) => {
      const txnId = `TXN-${Date.now().toString().slice(-6)}`;
      const paymentRecord: MobilePaymentTransaction = {
        id: txnId,
        invoiceId: targetInvoiceForPay.id,
        ownerId: targetInvoiceForPay.ownerId || activeAgreement?.ownerId || '',
        tenant: targetInvoiceForPay.tenant || tenantName,
        tenantId: targetInvoiceForPay.tenantId || user.id,
        unit: targetInvoiceForPay.unit || activeUnit?.unitNumber || '',
        propertyName: targetInvoiceForPay.propertyName || activeProperty?.name || 'Residence',
        amount: targetInvoiceForPay.total,
        currency: targetInvoiceForPay.currency || activeCurrency,
        date: new Date().toISOString().split('T')[0],
        dueDate: targetInvoiceForPay.due,
        method: resolvedMethodLabel,
        type: isDepositInv ? 'deposit' : 'rent',
        status: 'pending_confirmation',
        referenceNo: (payMethod === 'bank' || payMethod === 'upi') ? offlineUtr.trim() : txnId,
      };

      recordPayment(paymentRecord);
      saveInvoice({
        ...targetInvoiceForPay,
        status: 'pending_confirmation' as any,
        paymentMethodUsed: payMethod === 'bank' ? 'NEFT/IMPS' : payMethod === 'upi' ? 'UPI' : 'CASH',
      });

      logCommunication({
        type: 'PAYMENT_PROOF_SUBMITTED',
        category: 'rent',
        title: `Payment Proof Submitted: Unit ${targetInvoiceForPay.unit}`,
        body: `${tenantName} submitted ${payMethod === 'bank' ? `Bank UTR (${offlineUtr.trim()})` : payMethod === 'upi' ? `UPI Reference (${offlineUtr.trim()})` : 'Cash handover voucher'} for Unit ${targetInvoiceForPay.unit}. Please review and verify.`,
        channels: ['in_app', 'email'],
        recipientId: targetInvoiceForPay.ownerId || '',
        recipientName: 'Property Owner',
        recipientRole: 'owner',
        recipientContact: {},
        senderId: user.id,
        senderName: tenantName,
        senderRole: 'system',
        ownerId: targetInvoiceForPay.ownerId,
        unitNumber: targetInvoiceForPay.unit,
        propertyName: targetInvoiceForPay.propertyName,
        relatedEntityId: txnId,
        deliveryStatus: { inApp: 'delivered', email: 'delivered' },
      }).catch(console.warn);

      setIsSubmittingPayment(false);
      setShowPayModal(false);
      setTargetInvoiceForPay(null);

      Alert.alert(
        'Payment Submitted for Verification ⚡',
        `${payMethod === 'cash' ? 'Cash handover voucher' : (payMethod === 'upi' ? 'UPI payment reference (' : 'Bank UTR transfer (') + offlineUtr.trim() + ')'} submitted. Landlord will verify and confirm.`
      );
    };

    // ── Route by Gateway / Method ──────────────────────────────────────────

    // 1. Offline Manual: Bank Wire
    if (payMethod === 'bank') {
      finalizeOfflinePayment('NEFT/IMPS');
      return;
    }

    // 2. Offline Manual: Cash Handover
    if (payMethod === 'cash') {
      finalizeOfflinePayment('Cash Handover');
      return;
    }

    // 3. Direct UPI Transfer
    if (payMethod === 'upi') {
      finalizeOfflinePayment('UPI Direct');
      return;
    }

    // 4. Stripe Live Checkout (Real Gateway)
    if (payMethod === 'stripe') {
      const stripePub = ownerMethods.stripe?.pubKey || (ownerMethods.stripe as any)?.publishableKey || state.platformGateways.stripe?.pubKey || '';
      if (!stripePub || stripePub === 'pk_test_sample' || stripePub === 'pk_live_sample') {
        setIsSubmittingPayment(false);
        Alert.alert(
          'Stripe Key Missing',
          'Please configure a live Stripe Publishable Key in Gateway Settings to process card payments.'
        );
        return;
      }
      await launchStripePayment({
        publishableKey: stripePub,
        amount: targetInvoiceForPay.total,
        currency: targetInvoiceForPay.currency || activeCurrency,
        paymentRecordId: targetInvoiceForPay.id,
        customerName: tenantName,
        customerEmail: user.email,
        ownerId: resolvedOwnerId,
        role: 'tenant',
        onSuccess: (res) => {
          finalizeSuccessfulOnlinePayment(res.paymentIntentId, 'Stripe Card');
        },
        onError: (err) => {
          setIsSubmittingPayment(false);
          Alert.alert('Stripe Notice', err);
        },
      });
      return;
    }

    // 6. Razorpay Live Checkout (Real Gateway)
    if (payMethod === 'razorpay') {
      const rzpKey = ownerMethods.razorpay?.keyId || state.platformGateways.razorpay?.keyId || '';
      if (!rzpKey || rzpKey === 'rzp_live_sample' || rzpKey === 'rzp_test_sample') {
        setIsSubmittingPayment(false);
        Alert.alert(
          'Razorpay Key Missing',
          'Please configure a live Razorpay Key ID in Gateway Settings to process payments.'
        );
        return;
      }
      await launchRazorpayPayment({
        keyId: rzpKey,
        amount: targetInvoiceForPay.total,
        currency: targetInvoiceForPay.currency || activeCurrency,
        name: `Propithub Rent: Unit ${targetInvoiceForPay.unit}`,
        description: `Invoice ${targetInvoiceForPay.id}`,
        paymentRecordId: targetInvoiceForPay.id,
        customerName: tenantName,
        customerEmail: user.email,
        customerPhone: user.phone,
        ownerId: resolvedOwnerId,
        onSuccess: (res) => {
          finalizeSuccessfulOnlinePayment(res.paymentId, 'Razorpay Online');
        },
        onError: (err) => {
          setIsSubmittingPayment(false);
          Alert.alert('Razorpay Notice', err);
        },
      });
      return;
    }

    // 7. Easebuzz Live Checkout (Real Gateway)
    if (payMethod === 'easebuzz') {
      const ebKey = ownerMethods.easebuzz?.merchantKey || state.platformGateways.easebuzz?.merchantKey || '';
      const ebSalt = ownerMethods.easebuzz?.salt || state.platformGateways.easebuzz?.salt || '';
      if (!ebKey || ebKey === 'LIVE_EBZ_PROD') {
        setIsSubmittingPayment(false);
        Alert.alert(
          'Easebuzz Key Missing',
          'Easebuzz merchant credentials are not configured for this property. Please configure live credentials in settings.'
        );
        return;
      }
      await launchEasebuzzPayment({
        merchantKey: ebKey,
        salt: ebSalt,
        amount: targetInvoiceForPay.total,
        currency: targetInvoiceForPay.currency || activeCurrency,
        name: `Propithub Rent: Unit ${targetInvoiceForPay.unit}`,
        description: `Invoice ${targetInvoiceForPay.id}`,
        paymentRecordId: targetInvoiceForPay.id,
        customerName: tenantName,
        customerEmail: user.email,
        customerPhone: user.phone,
        ownerId: resolvedOwnerId,
        onSuccess: (res) => {
          finalizeSuccessfulOnlinePayment(res.paymentId || res.txnid, 'Easebuzz (Live)');
        },
        onError: (err) => {
          setIsSubmittingPayment(false);
          Alert.alert('Easebuzz Notice', err);
        },
      });
      return;
    }

    // 8. PayPal Live Checkout (Real Gateway)
    if (payMethod === 'paypal') {
      const ppClientId = ownerMethods.paypal?.clientId || state.platformGateways.paypal?.clientId || '';
      if (!ppClientId || ppClientId === 'paypal_live_sample') {
        setIsSubmittingPayment(false);
        Alert.alert(
          'PayPal Client ID Missing',
          'PayPal credentials are not configured for this property. Please configure live credentials in settings.'
        );
        return;
      }
      await launchPayPalPayment({
        clientId: ppClientId,
        amount: targetInvoiceForPay.total,
        currency: targetInvoiceForPay.currency || 'USD',
        name: `Propithub Rent: Unit ${targetInvoiceForPay.unit}`,
        description: `Invoice ${targetInvoiceForPay.id}`,
        paymentRecordId: targetInvoiceForPay.id,
        customerEmail: user.email,
        ownerId: resolvedOwnerId,
        onSuccess: (res) => {
          finalizeSuccessfulOnlinePayment(res.paymentId, 'PayPal');
        },
        onError: (err) => {
          setIsSubmittingPayment(false);
          Alert.alert('PayPal Notice', err);
        },
      });
      return;
    }
  };

  const handleConfirmSettlement = () => {
    if (settlementDecision === 'contest' && !contestReason.trim()) {
      Alert.alert('Contest Reason Required', 'Please provide notes explaining your deduction dispute.');
      return;
    }
    if (settlementDecision === 'accept') {
      if (payoutRail === 'upi' && !upiId.trim()) {
        Alert.alert('UPI Required', 'Please enter your UPI VPA handle.');
        return;
      }
      if (payoutRail === 'bank' && (!bankAccNumber.trim() || !bankIfsc.trim())) {
        Alert.alert('Bank Details Required', 'Please enter your Bank Account Number and IFSC Code.');
        return;
      }
    }

    setIsSubmittingSettlement(true);
    setTimeout(async () => {
      if (activeMoveOut) {
        const payoutDetails = {
          method: payoutRail === 'bank' ? ('bank_in' as const) : (payoutRail as any),
          accountHolderName: accountHolder,
          upiId: payoutRail === 'upi' ? upiId : undefined,
          accountNumber: payoutRail === 'bank' ? bankAccNumber : undefined,
          ifscCode: payoutRail === 'bank' ? bankIfsc : undefined,
          paypalEmail: payoutRail === 'paypal' ? paypalEmail : undefined,
        };

        try {
          await respondToDepositSettlement(
            activeMoveOut.id,
            settlementDecision === 'accept' ? 'approved' : 'rejected',
            settlementDecision === 'contest' ? contestReason : undefined,
            payoutDetails
          );
        } catch (err) {
          console.warn('respondToDepositSettlement error in TenantPaymentsScreen:', err);
          updateMoveOut(activeMoveOut.id, {
            status: settlementDecision === 'accept' ? 'refund_scheduled' : 'disputed',
            chosenPayoutDetails: payoutDetails,
            tenantDisputeRaised: settlementDecision === 'contest',
          });
        }
      }
      setIsSubmittingSettlement(false);
      setShowSettlementModal(false);
      Alert.alert(
        settlementDecision === 'accept' ? 'Settlement Accepted ✓' : 'Settlement Contested',
        settlementDecision === 'accept'
          ? `Payout destination (${payoutRail.toUpperCase()}) confirmed. Landlord has been notified to disburse refund.`
          : 'Your dispute notes have been submitted to landlord for final recalculation.'
      );
    }, 600);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="credit-card" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Payments</Text>
          </View>
        </View>
        {(hasActiveTenancy || myUnits.length > 0 || unpaidInvoices.length > 0) && (
          <TouchableOpacity
            style={styles.payNowHeaderBtn}
            onPress={() => handleOpenPayModal()}
            activeOpacity={0.85}
          >
            <Feather name="zap" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.payNowHeaderBtnText}>Pay Rent</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#10B981']}
            tintColor="#10B981"
          />
        }
      >
        {/* Multi-Property Switcher for Tenants */}
        <TenantMultiPropertySwitcher
          myUnits={myUnits}
          selectedUnitId={selectedTenantUnitId}
          onSelectUnit={(unitId) => setSelectedTenantUnitId(unitId)}
        />

        {/* Contextual Top Payment Reminders & Due Date Countdowns (1-to-1 Web Parity) */}
        {contextualPaymentReminders.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            {contextualPaymentReminders.map((reminder) => {
              const isUrgent = reminder.severity === 'urgent';
              const isPositive = reminder.severity === 'positive';
              const borderCol = isUrgent ? '#EF4444' : isPositive ? '#10B981' : '#F59E0B';
              const iconCol = isUrgent ? '#EF4444' : isPositive ? '#10B981' : '#D97706';
              const bgCol = isUrgent
                ? isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2'
                : isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB';

              return (
                <View
                  key={reminder.id}
                  style={{
                    backgroundColor: bgCol,
                    borderWidth: 1,
                    borderColor: borderCol,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Feather
                      name={reminder.icon === 'alert-triangle' ? 'alert-triangle' : 'clock'}
                      size={15}
                      color={iconCol}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: isUrgent ? (isDark ? '#FCA5A5' : '#B91C1C') : (isDark ? '#FDE68A' : '#92400E'),
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {reminder.title}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: isDark ? '#E2E8F0' : '#475569',
                      lineHeight: 17,
                      marginBottom: 10,
                    }}
                  >
                    {reminder.description}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: isUrgent ? '#EF4444' : '#10B981',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        const invId = reminder.id.replace('tenant_overdue_', '').replace('tenant_due_soon_', '');
                        const found = state.invoices.find((i) => i.id === invId);
                        handleOpenPayModal(found);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                        {reminder.actionLabel || 'Pay Now'}
                      </Text>
                      <Feather name="arrow-right" size={12} color="#FFFFFF" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Actionable Cash Refund Handover Claim Banner */}
        {pendingCashClaims.map((claim: any) => (
          <View key={claim.id} style={styles.cashClaimBanner}>
            <View style={styles.cashClaimTop}>
              <View style={styles.cashClaimIconBox}>
                <Feather name="dollar-sign" size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cashClaimTitle}>Cash Refund Claim</Text>
                <Text style={styles.cashClaimSub}>
                  Landlord {claim.claimedByName || 'Property Landlord'} recorded a physical cash refund handover of{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {format(claim.amount, claim.currency || activeCurrency)}
                  </Text>
                  . Did you receive this cash refund?
                </Text>
              </View>
            </View>
            <View style={styles.cashClaimBtnsRow}>
              <TouchableOpacity
                style={styles.declineClaimBtn}
                onPress={() => {
                  rejectCashClaim(claim.id, 'Resident reported cash was not received');
                  Alert.alert('Claim Declined', 'You have marked this cash handover as not received.');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.declineClaimBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmClaimBtn}
                onPress={() => {
                  confirmCashClaim(claim.id);
                  Alert.alert('Cash Refund Confirmed ✓', 'You confirmed receipt of your security deposit cash refund.');
                }}
                activeOpacity={0.85}
              >
                <Feather name="check" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.confirmClaimBtnText}>Confirm Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Outstanding Balance Hero Card */}
        <TourTarget id="tenant-payments-hero">
        <View style={styles.balanceHeroCard}>
          <View style={styles.balanceHeroLeft}>
            <Text style={styles.balanceHeroLabel}>Total Due Now</Text>
            <Text style={styles.balanceHeroAmount}>
              {format(totalOutstanding, activeCurrency)}
            </Text>
            <Text style={[styles.balanceHeroSub, totalOutstanding === 0 && { color: '#059669', fontWeight: '600' }]}>
              {unpaidInvoices.length > 0
                ? `${unpaidInvoices.length} Pending Invoice${unpaidInvoices.length > 1 ? 's' : ''}`
                : 'All Rental Dues Settled ✓'}
            </Text>
          </View>
          {totalOutstanding > 0 && (
            <TouchableOpacity
              style={styles.heroPayBtn}
              onPress={() => handleOpenPayModal(unpaidInvoices[0])}
              activeOpacity={0.85}
            >
              <Feather name="arrow-up-right" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.heroPayBtnText}>Pay Now</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 4 Tabs Matching Web Exactly: rent_due, invoices, ledger, deposit */}
        <View style={styles.tabsCapsule}>
          <TouchableOpacity
            style={[styles.tabBtn, subTab === 'rent_due' && styles.tabBtnActive]}
            onPress={() => setSubTab('rent_due')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, subTab === 'rent_due' && styles.tabBtnTextActive]}>
              Rent Due
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, subTab === 'invoices' && styles.tabBtnActive]}
            onPress={() => setSubTab('invoices')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, subTab === 'invoices' && styles.tabBtnTextActive]}>
              Invoices ({tenantInvoices.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, subTab === 'ledger' && styles.tabBtnActive]}
            onPress={() => setSubTab('ledger')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, subTab === 'ledger' && styles.tabBtnTextActive]}>
              Ledger
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, subTab === 'deposit' && styles.tabBtnActive]}
            onPress={() => setSubTab('deposit')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, subTab === 'deposit' && styles.tabBtnTextActive]}>
              Deposit
            </Text>
          </TouchableOpacity>
        </View>

        {/* =============================================================== */}
        </TourTarget>
        {/* =============================================================== */}
        {/* SUBTAB 1: RENT DUE & SCHEDULE (1-to-1 Web Parity)              */}
        {/* =============================================================== */}
        {subTab === 'rent_due' && (
          <View>
            {/* Step 1 Prerequisite Banner: Mandatory Security Deposit */}
            {pendingDepositRecord && (
              <View style={styles.depositRequiredHero}>
                <View style={styles.depositRequiredTop}>
                  <View style={styles.depositRequiredBadge}>
                    <Feather name="shield" size={12} color="#059669" />
                    <Text style={styles.depositRequiredBadgeText}>PREREQUISITE</Text>
                  </View>
                  <Text style={styles.depositRequiredStatusTag}>DEPOSIT DUE</Text>
                </View>
                <Text style={styles.depositRequiredTitle}>Refundable Security Deposit</Text>
                <Text style={styles.depositRequiredSub}>
                  Required before monthly rent begins.
                </Text>
                <View style={styles.depositRequiredAmountRow}>
                  <View style={styles.depositRequiredAmountInfo}>
                    <Text style={styles.depositRequiredAmountLabel}>Deposit Amount</Text>
                    <Text style={styles.depositRequiredAmount}>
                      {format(pendingDepositRecord.amount, pendingDepositRecord.currency || activeCurrency)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.depositRequiredPayBtn}
                    onPress={handlePayDeposit}
                    activeOpacity={0.85}
                  >
                    <Feather name="zap" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.depositRequiredPayBtnText}>Pay</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 1. Hero Card: Current / Immediate Payable Rent Cycle */}
            {currentDueItem ? (
              <View
                style={[
                  styles.rentDueHeroCard,
                  (pendingDepositRecord || currentDueItem.isDepositPending)
                    ? styles.rentDueHeroStandard
                    : currentDueItem.status === 'overdue'
                      ? styles.rentDueHeroOverdue
                      : currentDueItem.status === 'due_now'
                        ? styles.rentDueHeroDueNow
                        : styles.rentDueHeroStandard,
                ]}
              >
                <View style={styles.rentDueHeroBadgeRow}>
                  <View
                    style={[
                      styles.rentDueHeroStatusBadge,
                      (pendingDepositRecord || currentDueItem.isDepositPending)
                        ? styles.badgeAmber
                        : currentDueItem.status === 'overdue'
                          ? styles.badgeRed
                          : currentDueItem.status === 'due_now'
                            ? styles.badgeAmber
                            : currentDueItem.status === 'due_soon'
                              ? styles.badgeAmber
                              : currentDueItem.status === 'pending_confirmation'
                                ? styles.badgeBlue
                                : styles.badgeGrey,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rentDueHeroStatusBadgeText,
                        (pendingDepositRecord || currentDueItem.isDepositPending)
                          ? styles.badgeAmberText
                          : currentDueItem.status === 'overdue'
                            ? styles.badgeRedText
                            : currentDueItem.status === 'due_now'
                              ? styles.badgeAmberText
                              : currentDueItem.status === 'due_soon'
                                ? styles.badgeAmberText
                                : currentDueItem.status === 'pending_confirmation'
                                  ? styles.badgeBlueText
                                  : styles.badgeGreyText,
                      ]}
                    >
                      {(pendingDepositRecord || currentDueItem.isDepositPending)
                        ? 'RENT (PENDING DEPOSIT)'
                        : currentDueItem.status === 'overdue'
                          ? 'OVERDUE RENT'
                          : currentDueItem.status === 'due_now'
                            ? 'RENT DUE NOW'
                            : currentDueItem.status === 'due_soon'
                              ? 'RENT DUE SOON'
                              : currentDueItem.status === 'pending_confirmation'
                                ? 'AWAITING CONFIRMATION'
                                : 'NEXT RENT DUE'}
                    </Text>
                  </View>
                  {currentDueItem.isMoveInMonth && (
                    <View style={styles.moveInBadge}>
                      <Text style={styles.moveInBadgeText}>First Month Rent (Move-in)</Text>
                    </View>
                  )}
                </View>

                <View style={styles.rentDueHeroAmountRow}>
                  <Text style={styles.rentDueHeroAmount}>
                    {format(currentDueItem.amount, currentDueItem.currency || activeCurrency)}
                  </Text>
                </View>

                <View style={styles.rentDueHeroMetaBox}>
                  <Text style={styles.rentDueHeroMetaText}>
                    <Text style={{ fontWeight: '700' }}>Property:</Text> {currentDueItem.propertyName} • <Text style={{ fontWeight: '700' }}>Unit:</Text> {currentDueItem.unitNumber}
                  </Text>
                  <Text style={styles.rentDueHeroMetaText}>
                    <Text style={{ fontWeight: '700' }}>Due Date:</Text> {currentDueItem.dueDate} • <Text style={{ fontWeight: '700' }}>Cycle:</Text> {currentDueItem.cycleLabel} ({currentDueItem.monthName})
                  </Text>
                </View>

                <View style={styles.rentDueHeroActionRow}>
                  {currentDueItem.status === 'pending_confirmation' ? (
                    <View style={styles.verificationPendingBox}>
                      <Feather name="clock" size={14} color="#D97706" style={{ marginRight: 6 }} />
                      <Text style={styles.verificationPendingText}>Verification Pending with Landlord</Text>
                    </View>
                  ) : (pendingDepositRecord || currentDueItem.isDepositPending) ? (
                    <TouchableOpacity
                      style={[styles.heroPayNowBtn, styles.heroPayNowBtnLocked]}
                      onPress={handlePayDeposit}
                      activeOpacity={0.85}
                    >
                      <Feather name="lock" size={15} color="#475569" style={{ marginRight: 6 }} />
                      <Text style={styles.heroPayNowBtnLockedText}>
                        Pay Security Deposit First ({format(
                          pendingDepositRecord?.amount || currentDueItem.depositAmount || currentDueItem.amount,
                          pendingDepositRecord?.currency || currentDueItem.currency || activeCurrency
                        )})
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.heroPayNowBtn}
                      onPress={() => handlePayCycleItem(currentDueItem)}
                      activeOpacity={0.85}
                    >
                      <Feather name="credit-card" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.heroPayNowBtnText}>
                        Pay Rent Now ({format(currentDueItem.amount, currentDueItem.currency || activeCurrency)})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.trustNoteStrip}>
                  <Feather name="shield" size={13} color="#10B981" style={{ marginRight: 6 }} />
                  <Text style={styles.trustNoteText}>
                    <Text style={{ fontWeight: '700' }}>Security Deposit Separation: </Text>
                    Refundable deposit is held securely in trust custody and is not applied towards recurring monthly rent.
                  </Text>
                </View>
              </View>
            ) : historyDues.length > 0 ? (
              <View style={styles.allSettledCard}>
                <Feather name="check-circle" size={24} color="#16A34A" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.allSettledTitle}>All Rent Dues Settled</Text>
                  <Text style={styles.allSettledSub}>
                    There are no pending or overdue rent cycles for your active lease. Review all completed payments in Rent Due History below.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.noScheduleCard}>
                <Feather name="calendar" size={26} color="#94A3B8" style={{ marginBottom: 6 }} />
                <Text style={styles.noScheduleTitle}>No Active Rent Schedule Found</Text>
                <Text style={styles.noScheduleSub}>
                  Once your tenancy agreement is active, your real monthly rent schedule will automatically appear here with all upcoming due dates and amounts.
                </Text>
              </View>
            )}

            {/* Rent Autopay Card */}
            {activeAgreement && (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.line,
                  marginBottom: 16,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 14,
                    backgroundColor: colors.surfaceSunken,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="repeat" size={16} color={colors.brass} />
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>Rent Autopay</Text>
                      <Text style={{ fontSize: 11, color: colors.inkSoft }}>Single active mandate • Zero double-debit</Text>
                    </View>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: activeAgreement.autopay?.status === 'active' ? '#DCFCE7' : '#FEF3C7',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: activeAgreement.autopay?.status === 'active' ? '#166534' : '#92400E',
                      }}
                    >
                      {activeAgreement.autopay?.status === 'active' ? 'Autopay Active' : 'Autopay Inactive'}
                    </Text>
                  </View>
                </View>

                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1, marginRight: 8, backgroundColor: colors.surfaceSunken, padding: 10, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase' }}>
                        Active Method
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 2 }}>
                        {(activeAgreement.autopay?.activeGateway || 'razorpay').toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.inkSoft, marginTop: 1 }}>
                        {activeAgreement.autopay?.mandateId ? `Ref: ${activeAgreement.autopay.mandateId.slice(-8)}` : 'Manual'}
                      </Text>
                    </View>

                    <View style={{ flex: 1, backgroundColor: colors.surfaceSunken, padding: 10, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase' }}>
                        Scheduled Debit
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 2 }}>
                        {format(activeAgreement.rent || 0, activeAgreement.currency || activeCurrency)}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.inkSoft, marginTop: 1 }}>
                        Due day {activeAgreement.rentDueDay || 1}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: colors.surfaceSunken,
                        borderWidth: 1,
                        borderColor: colors.line,
                        paddingVertical: 9,
                        borderRadius: 8,
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        setSelectedMobileGateway((activeAgreement.autopay?.activeGateway || 'razorpay') as any);
                        setShowAutopayModal(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>Change Method</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: activeAgreement.autopay?.status === 'active' ? '#FEE2E2' : colors.brass,
                        paddingVertical: 9,
                        borderRadius: 8,
                        alignItems: 'center',
                      }}
                      onPress={handleToggleMobileTenantAutopay}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: activeAgreement.autopay?.status === 'active' ? '#991B1B' : '#FFFFFF',
                        }}
                      >
                        {activeAgreement.autopay?.status === 'active' ? 'Pause Autopay' : 'Enable Autopay'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.inkSoft, lineHeight: 16 }}>
                      🛡️ Auto-skips if paid early or in cash • 💬 48h advance notice sent via WhatsApp &amp; Email.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* 2. Sub-Navigation Switcher: Upcoming vs History */}
            <View style={styles.rentDueSwitcherRow}>
              <View style={styles.rentDueCapsule}>
                <TouchableOpacity
                  style={[styles.rentDueCapsuleBtn, rentDueView === 'upcoming' && styles.rentDueCapsuleBtnActive]}
                  onPress={() => setRentDueView('upcoming')}
                  activeOpacity={0.8}
                >
                  <Feather name="calendar" size={12} color={rentDueView === 'upcoming' ? '#FFFFFF' : colors.inkSoft} style={{ marginRight: 5 }} />
                  <Text style={[styles.rentDueCapsuleText, rentDueView === 'upcoming' && styles.rentDueCapsuleTextActive]}>
                    Upcoming ({upcomingDues.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.rentDueCapsuleBtn, rentDueView === 'history' && styles.rentDueCapsuleBtnActive]}
                  onPress={() => setRentDueView('history')}
                  activeOpacity={0.8}
                >
                  <Feather name="clock" size={12} color={rentDueView === 'history' ? '#FFFFFF' : colors.inkSoft} style={{ marginRight: 5 }} />
                  <Text style={[styles.rentDueCapsuleText, rentDueView === 'history' && styles.rentDueCapsuleTextActive]}>
                    History ({historyDues.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.cycleSummaryStrip}>
              <Text style={styles.cycleSummaryText}>
                Lease Term Cycles: <Text style={{ fontWeight: '700', color: colors.navy }}>{totalCyclesCount}</Text> • Settled:{' '}
                <Text style={{ fontWeight: '700', color: '#16A34A' }}>{paidCyclesCount}</Text> • Remaining:{' '}
                <Text style={{ fontWeight: '700', color: '#D97706' }}>{pendingCyclesCount}</Text>
              </Text>
            </View>

            {/* 3. Cycle List */}
            {rentDueView === 'upcoming' ? (
              <View style={{ marginTop: 10 }}>
                {upcomingDues.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Feather name="check-circle" size={28} color="#16A34A" />
                    <Text style={styles.emptyTitle}>Zero Outstanding Rent Dues</Text>
                    <Text style={styles.emptySub}>All monthly rent cycles for this agreement are settled up to date.</Text>
                  </View>
                ) : (
                  upcomingDues.map((item) => {
                    const isOverdue = item.status === 'overdue';
                    const isDueNow = item.status === 'due_now';
                    const isPending = item.status === 'pending_confirmation';
                    const isDueSoon = item.status === 'due_soon';

                    return (
                      <View key={item.id} style={[styles.cycleCard, isOverdue && styles.cycleCardOverdue, isDueNow && styles.cycleCardDueNow]}>
                        <View style={styles.cycleCardTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cycleCardTitle}>{item.cycleLabel}</Text>
                            <Text style={styles.cycleCardSub}>
                              {item.propertyName} • Unit {item.unitNumber}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.cycleStatusPill,
                              (pendingDepositRecord || item.isDepositPending)
                                ? styles.badgeAmber
                                : isOverdue
                                  ? styles.badgeRed
                                  : isDueNow
                                    ? styles.badgeAmber
                                    : isPending
                                      ? styles.badgeBlue
                                      : isDueSoon
                                        ? styles.badgeAmber
                                        : styles.badgeGrey,
                            ]}
                          >
                            <Text
                              style={[
                                styles.cycleStatusPillText,
                                (pendingDepositRecord || item.isDepositPending)
                                  ? styles.badgeAmberText
                                  : isOverdue
                                    ? styles.badgeRedText
                                    : isDueNow
                                      ? styles.badgeAmberText
                                      : isPending
                                        ? styles.badgeBlueText
                                        : isDueSoon
                                          ? styles.badgeAmberText
                                          : styles.badgeGreyText,
                              ]}
                            >
                              {(pendingDepositRecord || item.isDepositPending)
                                ? 'AWAITING DEPOSIT'
                                : isOverdue
                                  ? 'OVERDUE'
                                  : isDueNow
                                    ? 'DUE NOW'
                                    : isPending
                                      ? 'PENDING VERIFICATION'
                                      : isDueSoon
                                        ? 'DUE SOON'
                                        : 'SCHEDULED'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cycleCardBody}>
                          <View style={styles.cycleDetailCol}>
                            <Text style={styles.cycleDetailLbl}>Due Date</Text>
                            <Text style={[styles.cycleDetailVal, isOverdue && { color: '#DC2626' }]}>
                              {item.dueDate}
                            </Text>
                          </View>
                          <View style={styles.cycleDetailCol}>
                            <Text style={styles.cycleDetailLbl}>Amount</Text>
                            <Text style={styles.cycleDetailAmount}>
                              {format(item.amount, item.currency || activeCurrency)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cycleCardBottom}>
                          <Text style={styles.cycleNoteText}>
                            {item.isMoveInMonth
                              ? 'Immediate First Month Rent (Move-in)'
                              : item.isRenewalCycle
                                ? `Renewed Term (${item.percentageIncrease ? `+${item.percentageIncrease}%` : 'New Rate'})`
                                : 'Standard Monthly Cycle • 5-day grace period'}
                          </Text>

                          {isPending ? (
                            <View style={styles.awaitingTextBadge}>
                              <Text style={styles.awaitingTextBadgeText}>Awaiting Approval</Text>
                            </View>
                          ) : (pendingDepositRecord || item.isDepositPending) ? (
                            <TouchableOpacity
                              style={[styles.cyclePayBtn, styles.cyclePayBtnLocked]}
                              onPress={handlePayDeposit}
                              activeOpacity={0.85}
                            >
                              <Feather name="lock" size={12} color="#475569" style={{ marginRight: 4 }} />
                              <Text style={styles.cyclePayBtnLockedText}>Deposit First</Text>
                            </TouchableOpacity>
                          ) : (isOverdue || isDueNow || isDueSoon || currentDueItem?.id === item.id) ? (
                            <TouchableOpacity
                              style={styles.cyclePayBtn}
                              onPress={() => handlePayCycleItem(item)}
                              activeOpacity={0.85}
                            >
                              <Text style={styles.cyclePayBtnText}>Pay Rent</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.scheduledPill}>
                              <Text style={styles.scheduledPillText}>Scheduled</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : (
              <View style={{ marginTop: 10 }}>
                {historyDues.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Feather name="clock" size={28} color="#94A3B8" />
                    <Text style={styles.emptyTitle}>No Past Settled Cycles</Text>
                    <Text style={styles.emptySub}>No completed rent cycle payments are recorded yet.</Text>
                  </View>
                ) : (
                  historyDues.map((item) => (
                    <View key={item.id} style={styles.cycleCard}>
                      <View style={styles.cycleCardTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cycleCardTitle}>{item.cycleLabel}</Text>
                          <Text style={styles.cycleCardSub}>
                            {item.propertyName} • Unit {item.unitNumber}
                          </Text>
                        </View>
                        <View style={[styles.cycleStatusPill, styles.badgeGreen]}>
                          <Text style={[styles.cycleStatusPillText, styles.badgeGreenText]}>
                            ✓ SETTLED & PAID
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cycleCardBody}>
                        <View style={styles.cycleDetailCol}>
                          <Text style={styles.cycleDetailLbl}>Settled Date</Text>
                          <Text style={styles.cycleDetailVal}>{item.paidAt || item.dueDate}</Text>
                        </View>
                        <View style={styles.cycleDetailCol}>
                          <Text style={styles.cycleDetailLbl}>Amount Paid</Text>
                          <Text style={[styles.cycleDetailAmount, { color: '#059669' }]}>
                            {format(item.amount, item.currency || activeCurrency)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cycleCardBottom}>
                        <Text style={styles.cycleNoteText}>
                          {item.paymentMethod || 'Direct Transfer'} • Ref: {item.transactionRef || 'Settled'}
                        </Text>
                        <TouchableOpacity
                          style={styles.cycleReceiptBtn}
                          onPress={() => handleViewCycleReceipt(item)}
                          activeOpacity={0.85}
                        >
                          <Feather name="file-text" size={13} color="#0F172A" style={{ marginRight: 4 }} />
                          <Text style={styles.cycleReceiptBtnText}>View Receipt</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* =============================================================== */}
        {/* SUBTAB 2: OFFICIAL RENTAL INVOICES                              */}
        {/* =============================================================== */}
        {subTab === 'invoices' && (
          <>
            {tenantInvoices.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="file-text" size={32} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No Invoices</Text>
                <Text style={styles.emptySub}>No rental invoices found for this residence.</Text>
              </View>
            ) : (
              tenantInvoices.map((inv) => (
                <View key={inv.id} style={styles.invoiceCard}>
                  <View style={styles.invoiceHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.invoiceTitle}>
                        {inv.propertyName || 'Property'} • Unit {inv.unit}
                      </Text>
                      <Text style={styles.invoiceIdText}>Invoice #{inv.id} • Due {inv.due}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        inv.status === 'paid'
                          ? { backgroundColor: '#DCFCE7' }
                          : inv.status === 'overdue'
                            ? { backgroundColor: '#FEE2E2' }
                            : { backgroundColor: '#FEF3C7' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          inv.status === 'paid'
                            ? { color: '#15803D' }
                            : inv.status === 'overdue'
                              ? { color: '#DC2626' }
                              : { color: '#B45309' },
                        ]}
                      >
                        {inv.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.invoiceLineItems}>
                    <View style={styles.invoiceLineItem}>
                      <Text style={styles.lineItemLabel}>Monthly Rent</Text>
                      <Text style={styles.lineItemVal}>{format(inv.amount || inv.total, inv.currency || activeCurrency)}</Text>
                    </View>
                    {(inv as any).utilityCharges ? (
                      <View style={styles.invoiceLineItem}>
                        <Text style={styles.lineItemLabel}>Utility / Maintenance Dues</Text>
                        <Text style={styles.lineItemVal}>{format((inv as any).utilityCharges, inv.currency || activeCurrency)}</Text>
                      </View>
                    ) : null}
                    {(inv.lateFeeApplied || 0) > 0 && (
                      <View style={styles.invoiceLineItem}>
                        <Text style={[styles.lineItemLabel, { color: '#DC2626', fontWeight: '600' }]}>
                          Late Fee Penalty ({inv.lateFeeCalculation || 'Overdue'})
                        </Text>
                        <Text style={[styles.lineItemVal, { color: '#DC2626', fontWeight: '700' }]}>
                          +{format(inv.lateFeeApplied || 0, inv.currency || activeCurrency)}
                        </Text>
                      </View>
                    )}
                    {inv.lateFeeWaived && (
                      <View style={styles.invoiceLineItem}>
                        <Text style={[styles.lineItemLabel, { color: '#16A34A', fontWeight: '600' }]}>
                          Late Fee Penalty
                        </Text>
                        <Text style={[styles.lineItemVal, { color: '#16A34A', fontWeight: '600' }]}>
                          Waived
                        </Text>
                      </View>
                    )}
                    <View style={[styles.invoiceLineItem, { marginTop: 4 }]}>
                      <Text style={[styles.lineItemLabel, { fontWeight: '700', color: '#0F172A' }]}>Total Amount</Text>
                      <Text style={[styles.lineItemVal, { fontWeight: '800', color: '#0F172A', fontSize: 15 }]}>
                        {format(inv.total, inv.currency || activeCurrency)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.invoiceActionsRow}>
                    <TouchableOpacity
                      style={styles.invoiceDocBtn}
                      onPress={() => {
                        setSelectedInvoiceForDoc(inv);
                        setShowInvoiceDocModal(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="printer" size={13} color="#0F172A" style={{ marginRight: 5 }} />
                      <Text style={styles.invoiceDocBtnText}>View Invoice (PDF)</Text>
                    </TouchableOpacity>

                    {inv.status !== 'paid' && (
                      <TouchableOpacity
                        style={styles.invoicePayBtn}
                        onPress={() => handleOpenPayModal(inv)}
                        activeOpacity={0.85}
                      >
                        <Feather name="zap" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                        <Text style={styles.invoicePayBtnText}>Pay Now</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* =============================================================== */}
        {/* SUBTAB 3: VERIFIED INFLOW HISTORY & LEDGER                     */}
        {/* =============================================================== */}
        {subTab === 'ledger' && (
          <>
            {/* Pending Inflow Claims submitted by tenant awaiting landlord confirmation */}
            {pendingInflowClaimsSubmittedByMe.map((claim: any) => (
              <View key={claim.id} style={styles.inflowPendingBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.inflowPendingIconBox}>
                    <Feather name="clock" size={15} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.inflowPendingTitle}>
                      Cash Handover Submitted — {format(claim.amount, claim.currency || activeCurrency)}
                    </Text>
                    <Text style={styles.inflowPendingSub}>
                      Claim #{claim.id} • {claim.handoverDate || claim.date || 'Pending'} {claim.unit ? `(Unit ${claim.unit})` : ''} • Awaiting landlord confirmation
                    </Text>
                  </View>
                  <View style={styles.inflowPendingBadge}>
                    <Text style={styles.inflowPendingBadgeText}>Awaiting Review</Text>
                  </View>
                </View>
              </View>
            ))}

            {tenantPayments.length === 0 && pendingInflowClaimsSubmittedByMe.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="clock" size={32} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No Ledger Transactions</Text>
                <Text style={styles.emptySub}>No payment or refund records found for this unit.</Text>
              </View>
            ) : (
              tenantPayments.map((p) => {
                const isOutflow = p.direction === 'outflow' || p.type === 'deposit_refund';
                const matchedInvoice = state.invoices.find(
                  (inv) =>
                    (p.invoiceId && inv.id === p.invoiceId) ||
                    (p.id && (inv.receiptNumber === p.id || p.id === `PAY-${inv.id}`))
                );
                const purposeLabel =
                  matchedInvoice?.items?.[0]?.description ||
                  (matchedInvoice?.type === 'deposit' ? 'Security Deposit' :
                    matchedInvoice?.type === 'utility' ? 'Utility Bill' :
                      matchedInvoice?.type === 'maintenance' ? 'Maintenance Fee' :
                        matchedInvoice?.type === 'late_fee' ? 'Late Payment Fee' :
                          matchedInvoice?.type === 'rent' ? 'Monthly Rent' : null) ||
                  (p.type === 'rent' ? 'Monthly Rent' :
                    p.type === 'deposit' ? 'Security Deposit' :
                      p.type === 'deposit_refund' ? 'Deposit Refund' :
                        p.type === 'utility' ? 'Utility Bill' :
                          p.type === 'late_fee' ? 'Late Payment Fee' :
                            'Payment');
                const isPaid = p.status === 'paid';
                const isPending = p.status === 'pending' || p.status === 'pending_confirmation';
                const isDeclined = p.status === 'disputed' || p.status === 'failed' || p.status === 'cancelled';

                return (
                  <View key={p.id} style={styles.ledgerCard}>
                    <View style={styles.ledgerHeader}>
                      <View
                        style={[
                          styles.receiptIconBox,
                          isOutflow
                            ? { backgroundColor: '#F3E8FF' }
                            : isPaid
                              ? { backgroundColor: '#DCFCE7' }
                              : isPending
                                ? { backgroundColor: '#FEF3C7' }
                                : { backgroundColor: '#FEE2E2' },
                        ]}
                      >
                        <Feather
                          name={isOutflow ? 'arrow-down-left' : isPaid ? 'check' : isPending ? 'clock' : 'alert-circle'}
                          size={15}
                          color={isOutflow ? '#7E22CE' : isPaid ? '#059669' : isPending ? '#D97706' : '#DC2626'}
                        />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.ledgerTitle}>{purposeLabel}</Text>
                          <View
                            style={[
                              styles.directionBadge,
                              isOutflow ? { backgroundColor: '#F3E8FF' } : { backgroundColor: '#DCFCE7' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.directionBadgeText,
                                isOutflow ? { color: '#7E22CE' } : { color: '#15803D' },
                              ]}
                            >
                              {isOutflow ? '↓ Refund' : '↑ Payment'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.ledgerSub}>
                          {p.propertyName || activeProperty?.name || 'Residence'} • Unit {p.unit}
                        </Text>
                        <Text style={styles.ledgerSub}>
                          Ref #{p.referenceNo || p.id} • {p.date} • {p.method}
                        </Text>
                      </View>
                      <View style={styles.ledgerAmountBox}>
                        <Text
                          style={[
                            styles.ledgerAmountText,
                            isOutflow && { color: '#7E22CE' },
                          ]}
                        >
                          {isOutflow ? '+ ' : ''}
                          {format(p.amount, p.currency || activeCurrency)}
                        </Text>
                        <View
                          style={[
                            styles.statusTagBadge,
                            isPaid
                              ? { backgroundColor: '#DEF7EC' }
                              : isPending
                                ? { backgroundColor: '#FEF3C7' }
                                : { backgroundColor: '#FEE2E2' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusTagText,
                              isPaid
                                ? { color: '#059669' }
                                : isPending
                                  ? { color: '#B45309' }
                                  : { color: '#DC2626' },
                            ]}
                          >
                            {isPaid ? 'SETTLED' : isPending ? 'PENDING' : 'DECLINED'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {isDeclined && (p.rejectionReason || p.notes) && (
                      <View style={styles.declineNoteBox}>
                        <Text style={styles.declineNoteText}>
                          Reason: {p.rejectionReason || p.notes}
                        </Text>
                      </View>
                    )}

                    <View style={styles.ledgerFooterRow}>
                      <TouchableOpacity
                        style={styles.viewReceiptBtn}
                        onPress={() => handleViewPaymentReceipt(p)}
                        activeOpacity={0.8}
                      >
                        <Feather name="file-text" size={12} color="#2563EB" style={{ marginRight: 4 }} />
                        <Text style={styles.viewReceiptBtnText}>View Voucher / Receipt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* =============================================================== */}
        {/* SUBTAB 4: SECURITY DEPOSIT CUSTODY & REFUND HUB                */}
        {/* =============================================================== */}
        {subTab === 'deposit' && (
          <>
            {!hasActiveTenancy && myUnits.length === 0 && !activeMoveOut ? (
              <View style={styles.noScheduleCard}>
                <Feather name="shield" size={28} color="#94A3B8" style={{ marginBottom: 8 }} />
                <Text style={styles.noScheduleTitle}>No Active Custody Deposit</Text>
                <Text style={styles.noScheduleSub}>
                  Security deposits and trust custody accounts will appear here once you have an active leased property.
                </Text>
              </View>
            ) : !isDepositPaid ? (
              <View style={[styles.depositHeroCard, { borderColor: '#F59E0B' }]}>
                <View style={styles.depositHeroTop}>
                  <View style={[styles.depositHeroIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <Feather name="shield" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={styles.depositHeroTitle}>Security Deposit</Text>
                      <View style={[styles.cycleStatusPill, styles.badgeAmber, { flexShrink: 0 }]}>
                        <Text style={[styles.cycleStatusPillText, styles.badgeAmberText]}>PENDING PAYMENT</Text>
                      </View>
                    </View>
                    <Text style={styles.depositHeroSub}>
                      Held in trust for move-in.
                    </Text>
                  </View>
                </View>

                <View style={styles.depositAmountBox}>
                  <Text style={styles.depositAmountLabel}>Total Deposit Held: {format(0, pendingDepositRecord?.currency || activeAgreement?.currency || activeCurrency)}</Text>
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309', textTransform: 'uppercase' }}>
                      Deposit Due - Pending Payment
                    </Text>
                    <Text style={[styles.depositAmountBig, { color: '#0F172A', marginTop: 2 }]}>
                      {format(
                        pendingDepositRecord?.amount || activeAgreement?.deposit || activeUnit?.deposit || 0,
                        pendingDepositRecord?.currency || activeAgreement?.currency || activeUnit?.currency || activeCurrency
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.depositSpecsGrid}>
                  <View style={styles.depositSpecCell}>
                    <Text style={styles.depositSpecLabel}>Custody Status</Text>
                    <Text style={[styles.depositSpecVal, { color: '#D97706' }]}>
                      Pending Payment
                    </Text>
                  </View>
                  <View style={styles.depositSpecCell}>
                    <Text style={styles.depositSpecLabel}>Invoice Reference</Text>
                    <Text style={styles.depositSpecVal}>
                      {pendingDepositRecord?.reference || '#INV-DEP'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.heroPayNowBtn, { marginTop: 14 }]}
                  onPress={handlePayDeposit}
                  activeOpacity={0.85}
                >
                  <Feather name="zap" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.heroPayNowBtnText}>
                    Pay ({format(
                      pendingDepositRecord?.amount || activeAgreement?.deposit || activeUnit?.deposit || 0,
                      pendingDepositRecord?.currency || activeAgreement?.currency || activeUnit?.currency || activeCurrency
                    )})
                  </Text>
                </TouchableOpacity>

                <View style={[styles.trustNoteStrip, { marginTop: 12 }]}>
                  <Feather name="shield" size={13} color="#10B981" style={{ marginRight: 6 }} />
                  <Text style={styles.trustNoteText}>
                    <Text style={{ fontWeight: '700' }}>Deposit Custody: </Text>
                    Held in trust. Refunded upon move-out.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.depositHeroCard}>
                <View style={styles.depositHeroTop}>
                  <View style={styles.depositHeroIconBox}>
                    <Feather name="shield" size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.depositHeroTitle}>Security Deposit</Text>
                    <Text style={styles.depositHeroSub}>
                      Gross deposit held in trust custody for Unit {activeUnit?.unitNumber || activeAgreement?.unit || 'Residence'}
                    </Text>
                  </View>
                </View>

                <View style={styles.depositAmountBox}>
                  <Text style={styles.depositAmountLabel}>Deposit Held & Secured in Trust</Text>
                  <Text style={styles.depositAmountBig}>
                    {format(
                      activeAgreement?.deposit || activeUnit?.deposit || 0,
                      activeAgreement?.currency || activeUnit?.currency || activeProperty?.currency || activeCurrency
                    )}
                  </Text>
                </View>

                <View style={styles.depositSpecsGrid}>
                  <View style={styles.depositSpecCell}>
                    <Text style={styles.depositSpecLabel}>Custody Status</Text>
                    <Text style={[styles.depositSpecVal, { color: isDisbursed ? '#059669' : '#D97706' }]}>
                      {isDisbursed
                        ? hasConfirmedReceipt
                          ? 'Refund Settled'
                          : 'Refund Disbursed'
                        : 'Active Custody'}
                    </Text>
                  </View>
                  <View style={styles.depositSpecCell}>
                    <Text style={styles.depositSpecLabel}>Est. Refund Date</Text>
                    <Text style={styles.depositSpecVal}>
                      {activeMoveOut?.refundDate || activeMoveOut?.moveOutDate || 'Upon Tenancy Conclude'}
                    </Text>
                  </View>
                </View>

                {activeMoveOut && (
                  <TouchableOpacity
                    style={[
                      styles.reviewSettlementBtn,
                      isDisbursed && !hasConfirmedReceipt && { backgroundColor: '#059669' },
                    ]}
                    onPress={() => {
                      if (isDisbursed && !hasConfirmedReceipt) {
                        handleConfirmRefundReceipt();
                      } else {
                        setShowSettlementModal(true);
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather
                      name={
                        isDisbursed && !hasConfirmedReceipt
                          ? 'check-circle'
                          : hasConfirmedReceipt
                            ? 'file-text'
                            : 'sliders'
                      }
                      size={14}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.reviewSettlementBtnText}>
                      {isDisbursed
                        ? !hasConfirmedReceipt
                          ? 'Confirm Receipt'
                          : 'Voucher'
                        : (activeMoveOut.status === 'awaiting_tenant_approval' || (activeMoveOut as any).settlementStatus === 'awaiting_tenant_approval') && !activeSettlement?.chosenPayoutDetails && activeSettlement?.status !== 'approved'
                          ? 'Claim Refund'
                          : 'Settlement'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Deductions Itemization */}
            {activeMoveOut && activeMoveOut.totalDeductions > 0 && (
              <View style={styles.deductionsCard}>
                <Text style={styles.deductionsHeading}>Itemized Repair & Utility Deductions</Text>
                {activeMoveOut.inspectionChecklist
                  ?.filter((c) => c.deduction > 0)
                  .map((d, idx) => (
                    <View key={idx} style={styles.deductionRow}>
                      <Text style={styles.deductionReason}>{d.item} ({d.room})</Text>
                      <Text style={styles.deductionAmount}>- {format(d.deduction, activeCurrency)}</Text>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* =============================================================== */}
      {/* MODAL 1: PAY NOW CHECKOUT MODAL                                 */}
      {/* =============================================================== */}
      <Modal visible={showPayModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderTopColor: colors.line, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Settle Rental Invoice</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
                  Invoice #{targetInvoiceForPay?.id} • {format(targetInvoiceForPay?.total || 0, activeCurrency)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPayModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalBody}>
                <Text style={[styles.modalInputLabel, { color: colors.ink }]}>Select Payment Gateway / Method</Text>

                {/* Payment Gateway Dropdown Selector */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.surfaceSunken,
                    marginBottom: isPayMethodDropdownOpen ? 4 : 12,
                  }}
                  onPress={() => setIsPayMethodDropdownOpen((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Text style={{ fontSize: 18 }}>
                      {availableGateways.find((gw) => gw.key === payMethod)?.icon || '💳'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                        {availableGateways.find((gw) => gw.key === payMethod)?.label || 'Select Payment Gateway'}
                      </Text>
                      {availableGateways.find((gw) => gw.key === payMethod)?.subtitle ? (
                        <Text style={{ fontSize: 11, color: colors.inkSoft }}>
                          {availableGateways.find((gw) => gw.key === payMethod)?.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name={isPayMethodDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
                </TouchableOpacity>

                {/* Dropdown Options List */}
                {isPayMethodDropdownOpen && (
                  <View
                    style={{
                      marginBottom: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.surface,
                      overflow: 'hidden',
                    }}
                  >
                    {availableGateways.map((gw) => {
                      const isSelected = payMethod === gw.key;
                      return (
                        <TouchableOpacity
                          key={gw.key}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 12,
                            backgroundColor: isSelected ? 'rgba(5, 150, 105, 0.08)' : colors.surface,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.line,
                          }}
                          onPress={() => {
                            setPayMethod(gw.key);
                            setIsPayMethodDropdownOpen(false);
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <Text style={{ fontSize: 18 }}>{gw.icon}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '500', color: colors.navy }}>
                                {gw.label}
                              </Text>
                              <Text style={{ fontSize: 11, color: colors.inkSoft }}>{gw.subtitle}</Text>
                            </View>
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={18} color="#059669" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ── Gateway Detail Panels ── */}

                {/* UPI Direct */}
                {payMethod === 'upi' && (
                  <View style={[styles.methodDetailBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, borderWidth: 1 }]}>
                    <Text style={[styles.detailBoxTitle, { color: colors.navy }]}>📱 UPI Direct Settlement</Text>
                    {ownerMethods.upi?.upiId ? (
                      <>
                        <Text style={[styles.detailBoxSub, { color: colors.inkSoft }]}>
                          Send to VPA: <Text style={{ fontWeight: '700', color: colors.navy }}>{ownerMethods.upi.upiId}</Text>
                        </Text>
                        {ownerMethods.upi?.merchantName ? (
                          <Text style={[styles.detailBoxSub, { color: colors.inkSoft, marginTop: 4 }]}>
                            Payee: {ownerMethods.upi.merchantName}
                          </Text>
                        ) : null}
                        <TouchableOpacity
                          style={{
                            marginTop: 10,
                            marginBottom: 8,
                            backgroundColor: '#059669',
                            paddingVertical: 9,
                            paddingHorizontal: 14,
                            borderRadius: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onPress={() => {
                            const upiUrl = `upi://pay?pa=${encodeURIComponent(ownerMethods.upi?.upiId || '')}&pn=${encodeURIComponent(ownerMethods.upi?.merchantName || 'Property Owner')}&am=${targetInvoiceForPay?.total || 0}&cu=INR&tn=${encodeURIComponent(`Rent Unit ${targetInvoiceForPay?.unit || ''}`)}`;
                            Linking.openURL(upiUrl).catch(() => {
                              Alert.alert('UPI App', 'Could not open UPI app automatically. Please copy the VPA and pay in your preferred app.');
                            });
                          }}
                        >
                          <Feather name="external-link" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Open UPI App (GPay / PhonePe / Paytm)</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.detailBoxSub, { color: colors.inkSoft }]}>Open GPay / PhonePe / Paytm and scan or enter the landlord's UPI ID.</Text>
                    )}
                    <Text style={[styles.modalInputLabel, { color: colors.ink, marginTop: 10 }]}>Transaction UTR / UPI Reference Number</Text>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                      value={offlineUtr}
                      onChangeText={setOfflineUtr}
                      placeholder="e.g. 12-digit UPI Ref / UTR"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                )}

                {/* Bank Wire */}
                {payMethod === 'bank' && (
                  <View style={[styles.methodDetailBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, borderWidth: 1 }]}>
                    <Text style={[styles.detailBoxTitle, { color: colors.navy }]}>🏦 Bank Transfer (NEFT / IMPS / RTGS)</Text>
                    {ownerMethods.bank?.accountNumber ? (
                      <>
                        <Text style={[styles.detailBoxSub, { color: colors.inkSoft }]}>
                          {ownerMethods.bank.bankName ? `Bank: ${ownerMethods.bank.bankName}\n` : ''}
                          A/c No: {ownerMethods.bank.accountNumber}
                          {ownerMethods.bank.routing ? `\nIFSC / Routing: ${ownerMethods.bank.routing}` : ''}
                          {ownerMethods.bank.accountName ? `\nName: ${ownerMethods.bank.accountName}` : ''}
                        </Text>
                      </>
                    ) : null}
                    <Text style={[styles.modalInputLabel, { color: colors.ink }]}>Transaction UTR / Reference Number</Text>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                      value={offlineUtr}
                      onChangeText={setOfflineUtr}
                      placeholder="e.g. UTR1234567890"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                )}

                {/* Cash Handover */}
                {payMethod === 'cash' && (
                  <View style={[styles.methodDetailBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, borderWidth: 1 }]}>
                    <Text style={[styles.detailBoxTitle, { color: colors.navy }]}>💵 Physical Cash Handover</Text>
                    {ownerMethods.cash?.instructions ? (
                      <Text style={[styles.detailBoxSub, { color: colors.inkSoft, marginBottom: 8 }]}>{ownerMethods.cash.instructions}</Text>
                    ) : null}
                    <Text style={[styles.modalInputLabel, { color: colors.ink }]}>Recipient Person</Text>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                      value={cashRecipientName}
                      onChangeText={setCashRecipientName}
                      placeholder="Recipient Name"
                      placeholderTextColor={colors.inkSoft}
                    />
                    <Text style={[styles.modalInputLabel, { color: colors.ink }]}>Handover Date</Text>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                      value={cashHandoverDate}
                      onChangeText={setCashHandoverDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                )}

                {/* Online gateways (Easebuzz / Razorpay / Stripe / PayPal) */}
                {(payMethod === 'easebuzz' || payMethod === 'razorpay' || payMethod === 'stripe' || payMethod === 'paypal') && (
                  <View style={[styles.methodDetailBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, borderWidth: 1 }]}>
                    <Text style={[styles.detailBoxTitle, { color: colors.navy }]}>
                      {payMethod === 'easebuzz' ? 'Easebuzz'
                        : payMethod === 'razorpay' ? 'Razorpay'
                          : payMethod === 'stripe' ? 'Credit / Debit Card'
                            : 'PayPal'}
                    </Text>
                    <Text style={[styles.detailBoxSub, { color: colors.inkSoft }]}>
                      Tap "Confirm & Settle" to launch the secure payment gateway.
                    </Text>
                  </View>
                )}

                <View style={{ marginBottom: 16, backgroundColor: colors.surfaceSunken, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: colors.line }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <Text style={{ fontSize: 13, color: colors.inkSoft }}>Base Bill Amount:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>
                      {format(targetInvoiceForPay?.amount || 0, activeCurrency)}
                    </Text>
                  </View>
                  {(targetInvoiceForPay?.tax || 0) > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ fontSize: 13, color: colors.inkSoft }}>Taxes / GST:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>
                        +{format(targetInvoiceForPay?.tax || 0, activeCurrency)}
                      </Text>
                    </View>
                  )}
                  {(targetInvoiceForPay?.lateFeeApplied || 0) > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>
                        Late Fee Penalty ({targetInvoiceForPay?.lateFeeCalculation || 'Overdue'}):
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                        +{format(targetInvoiceForPay?.lateFeeApplied || 0, activeCurrency)}
                      </Text>
                    </View>
                  )}
                  {targetInvoiceForPay?.lateFeeWaived && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '600' }}>
                        Late Fee Penalty:
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#16A34A' }}>
                        Waived by Landlord
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy }}>Total Due:</Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0D9488' }}>
                      {format(targetInvoiceForPay?.total || 0, activeCurrency)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.modalSubmitBtn, isSubmittingPayment && { opacity: 0.7 }]}
                  onPress={handleConfirmPayment}
                  disabled={isSubmittingPayment}
                  activeOpacity={0.85}
                >
                  <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.modalSubmitBtnText}>
                    {isSubmittingPayment ? 'Processing...' : `Confirm & Settle ${format(targetInvoiceForPay?.total || 0, activeCurrency)}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* =============================================================== */}
      {/* UNIVERSAL 1-TO-1 WEB PARITY INVOICE / VOUCHER / RECEIPT MODAL  */}
      {/* =============================================================== */}
      <MobileRentalInvoiceDocument
        visible={showInvoiceDocModal}
        invoice={selectedInvoiceForDoc}
        onClose={() => setShowInvoiceDocModal(false)}
        onPayNow={handleOpenPayModal}
      />

      {/* =============================================================== */}
      {/* MODAL 4: DEPOSIT SETTLEMENT REVIEW & PAYOUT DESTINATION         */}
      {/* =============================================================== */}
      <Modal visible={showSettlementModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderTopColor: colors.line, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Deposit Settlement Review</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSettlementModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {isDisbursed ? (
                <>
                  {/* Deductions Breakdown Box */}
                  <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: colors.inkSoft }}>Original Deposit Held</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>
                        {format(activeMoveOut?.depositHeld || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: '#DC2626' }}>Total Deductions</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#DC2626' }}>
                        - {format(activeMoveOut?.totalDeductions || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy }}>Net Refund Payable</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669' }}>
                        {format(activeMoveOut?.netRefundAmount || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                  </View>

                  {/* Landlord Disbursement Details Card */}
                  <View style={{ backgroundColor: isDark ? '#06281E' : '#F0FDF4', borderWidth: 1, borderColor: isDark ? '#065F46' : '#BBF7D0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Feather name="check-circle" size={15} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#34D399' : '#065F46' }}>
                        Landlord Disbursement Record
                      </Text>
                    </View>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Amount Disbursed: </Text>
                        {format(activeSettlement?.finalRefundAmount ?? activeMoveOut?.netRefundAmount ?? 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                      <Text style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Disbursement Rail: </Text>
                        {(activeSettlement?.disbursementMethod || activeMoveOut?.payoutMethod || 'Direct Transfer').toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Payment Reference: </Text>
                        {activeSettlement?.paymentReference || 'UTR-SETTLED'}
                      </Text>
                      <Text style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Disbursed Date: </Text>
                        {activeSettlement?.disbursedAt ? new Date(activeSettlement.disbursedAt).toLocaleString() : 'Recent'}
                      </Text>
                    </View>
                  </View>

                  {!hasConfirmedReceipt ? (
                    <TouchableOpacity
                      style={[styles.modalSubmitBtn, { backgroundColor: '#059669', marginTop: 8 }]}
                      onPress={handleConfirmRefundReceipt}
                      disabled={isConfirmingReceipt}
                    >
                      <Feather name="check-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.modalSubmitBtnText}>
                        {isConfirmingReceipt ? 'Confirming...' : '✓ Confirm Refund Received'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: isDark ? '#06281E' : '#ECFDF5', borderRadius: 8, padding: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: isDark ? '#34D399' : '#059669' }}>
                        ✓ Refund Receipt Confirmed by Resident • Tenancy Concluded
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.decisionTabs}>
                    <TouchableOpacity
                      style={[styles.decisionTab, { backgroundColor: colors.surfaceSunken }, settlementDecision === 'accept' && styles.decisionTabActive]}
                      onPress={() => setSettlementDecision('accept')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.decisionTabText, { color: colors.inkSoft }, settlementDecision === 'accept' && styles.decisionTabTextActive]}>
                        Accept Refund
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.decisionTab, { backgroundColor: colors.surfaceSunken }, settlementDecision === 'contest' && styles.decisionTabActive]}
                      onPress={() => setSettlementDecision('contest')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.decisionTabText, { color: colors.inkSoft }, settlementDecision === 'contest' && styles.decisionTabTextActive]}>
                        Contest
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {settlementDecision === 'accept' ? (
                    <>
                      <Text style={[styles.modalInputLabel, { color: colors.ink }]}>Select Refund Payout Rail</Text>
                      <View style={styles.methodsRow}>
                        {(['upi', 'bank', 'paypal', 'cash'] as const).map((r) => (
                          <TouchableOpacity
                            key={r}
                            style={[
                              styles.methodCard,
                              { backgroundColor: colors.surfaceSunken, borderColor: colors.line },
                              payoutRail === r && styles.methodCardActive,
                            ]}
                            onPress={() => setPayoutRail(r)}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.methodCardText,
                                { color: colors.navy },
                                payoutRail === r && styles.methodCardTextActive,
                              ]}
                            >
                              {r.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {payoutRail === 'upi' && (
                        <>
                          <Text style={[styles.modalInputLabel, { color: colors.ink }]}>UPI ID / VPA Handle</Text>
                          <TextInput
                            style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                            value={upiId}
                            onChangeText={setUpiId}
                            placeholder="e.g. resident@okhdfcbank"
                            placeholderTextColor={colors.inkSoft}
                          />
                        </>
                      )}

                      {payoutRail === 'bank' && (
                        <>
                          <Text style={[styles.modalInputLabel, { color: colors.ink }]}>Account Number</Text>
                          <TextInput
                            style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                            value={bankAccNumber}
                            onChangeText={setBankAccNumber}
                            placeholder="e.g. 1029384756"
                            placeholderTextColor={colors.inkSoft}
                            keyboardType="numeric"
                          />
                          <Text style={[styles.modalInputLabel, { color: colors.ink }]}>IFSC Code</Text>
                          <TextInput
                            style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                            value={bankIfsc}
                            onChangeText={setBankIfsc}
                            placeholder="e.g. HDFC0001234"
                            placeholderTextColor={colors.inkSoft}
                            autoCapitalize="characters"
                          />
                        </>
                      )}

                      {payoutRail === 'paypal' && (
                        <>
                          <Text style={[styles.modalInputLabel, { color: colors.ink }]}>PayPal Email Address</Text>
                          <TextInput
                            style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy }]}
                            value={paypalEmail}
                            onChangeText={setPaypalEmail}
                            placeholder="user@paypal.me"
                            placeholderTextColor={colors.inkSoft}
                            keyboardType="email-address"
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={[styles.modalInputLabel, { color: colors.ink }]}>Reason for Contesting Deductions</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy, height: 90, textAlignVertical: 'top' }]}
                        value={contestReason}
                        onChangeText={setContestReason}
                        placeholder="Explain discrepancy in deductions or repair charges..."
                        placeholderTextColor={colors.inkSoft}
                        multiline
                      />
                    </>
                  )}

                  <TouchableOpacity
                    style={[styles.modalSubmitBtn, isSubmittingSettlement && { opacity: 0.7 }, { marginTop: 14 }]}
                    onPress={handleConfirmSettlement}
                    disabled={isSubmittingSettlement}
                    activeOpacity={0.85}
                  >
                    <Feather name="check-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalSubmitBtnText}>
                      {isSubmittingSettlement ? 'Submitting...' : '✓ Claim Refund'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Change Autopay Payment Method Modal */}
      <Modal visible={showAutopayModal} transparent animationType="slide" onRequestClose={() => setShowAutopayModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>Change Rent Autopay Method</Text>
              <TouchableOpacity onPress={() => setShowAutopayModal(false)}>
                <Feather name="x" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
                Select a payment method below. Propithub automatically revokes your old mandate with zero double-charging.
              </Text>

              {/* Autopay Gateway Dropdown Selector */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.surfaceSunken,
                  marginBottom: isAutopayGatewayDropdownOpen ? 4 : 12,
                }}
                onPress={() => setIsAutopayGatewayDropdownOpen((prev) => !prev)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Ionicons
                    name={(availableTenantGateways.find((gw) => gw.key === selectedMobileGateway)?.icon as any) || 'card-outline'}
                    size={20}
                    color={colors.ink}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>
                    {availableTenantGateways.find((gw) => gw.key === selectedMobileGateway)?.name || 'Select Payment Gateway'}
                  </Text>
                </View>
                <Ionicons name={isAutopayGatewayDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
              </TouchableOpacity>

              {/* Dropdown Options List */}
              {isAutopayGatewayDropdownOpen && (
                <View
                  style={{
                    marginBottom: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.surface,
                    overflow: 'hidden',
                  }}
                >
                  {availableTenantGateways.map((gw) => {
                    const isSelected = selectedMobileGateway === gw.key;
                    return (
                      <TouchableOpacity
                        key={gw.key}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 12,
                          backgroundColor: isSelected ? 'rgba(197, 160, 89, 0.12)' : colors.surface,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.line,
                        }}
                        onPress={() => {
                          setSelectedMobileGateway(gw.key);
                          setIsAutopayGatewayDropdownOpen(false);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Ionicons name={gw.icon} size={18} color={isSelected ? colors.brass : colors.inkSoft} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '500', color: colors.ink }}>{gw.name}</Text>
                            <Text style={{ fontSize: 11, color: colors.inkSoft }}>{gw.description}</Text>
                          </View>
                        </View>
                        {isSelected && <Ionicons name="checkmark" size={18} color={colors.brass} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Interactive Mandate Input Form */}
              <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 10, padding: 14, marginVertical: 10, borderWidth: 1, borderColor: colors.line }}>
                {selectedMobileGateway === 'stripe' && (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy, textTransform: 'uppercase' }}>
                      Credit / Debit Card
                    </Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                      placeholder="Name on Card"
                      placeholderTextColor={colors.inkSoft}
                      value={mandateCardName}
                      onChangeText={setMandateCardName}
                    />
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink, letterSpacing: 1 }}
                      placeholder="Card Number"
                      placeholderTextColor={colors.inkSoft}
                      keyboardType="numeric"
                      maxLength={19}
                      value={mandateCardNumber}
                      onChangeText={(val) => {
                        const raw = val.replace(/\D/g, '').slice(0, 16);
                        const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
                        setMandateCardNumber(formatted);
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TextInput
                        style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                        placeholder="MM/YY"
                        placeholderTextColor={colors.inkSoft}
                        maxLength={5}
                        value={mandateCardExpiry}
                        onChangeText={(val) => {
                          let clean = val.replace(/\D/g, '').slice(0, 4);
                          if (clean.length >= 3) clean = `${clean.slice(0, 2)}/${clean.slice(2)}`;
                          setMandateCardExpiry(clean);
                        }}
                      />
                      <TextInput
                        style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                        placeholder="CVV"
                        placeholderTextColor={colors.inkSoft}
                        secureTextEntry
                        keyboardType="numeric"
                        maxLength={4}
                        value={mandateCardCvv}
                        onChangeText={(val) => setMandateCardCvv(val.replace(/\D/g, '').slice(0, 4))}
                      />
                    </View>
                  </View>
                )}

                {selectedMobileGateway === 'razorpay' && (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 6,
                          alignItems: 'center',
                          backgroundColor: mandateRzpSubMode === 'upi' ? '#ECFDF5' : colors.surface,
                          borderWidth: 1,
                          borderColor: mandateRzpSubMode === 'upi' ? '#10B981' : colors.line,
                        }}
                        onPress={() => setMandateRzpSubMode('upi')}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: mandateRzpSubMode === 'upi' ? '#065F46' : colors.inkSoft }}>UPI AutoPay</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 6,
                          alignItems: 'center',
                          backgroundColor: mandateRzpSubMode === 'card' ? '#ECFDF5' : colors.surface,
                          borderWidth: 1,
                          borderColor: mandateRzpSubMode === 'card' ? '#10B981' : colors.line,
                        }}
                        onPress={() => setMandateRzpSubMode('card')}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: mandateRzpSubMode === 'card' ? '#065F46' : colors.inkSoft }}>Debit / Credit Card</Text>
                      </TouchableOpacity>
                    </View>

                    {mandateRzpSubMode === 'upi' ? (
                      <View style={{ gap: 6 }}>
                        <TextInput
                          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                          placeholder="UPI ID (e.g. mobile@okhdfcbank)"
                          placeholderTextColor={colors.inkSoft}
                          autoCapitalize="none"
                          value={mandateUpiId}
                          onChangeText={setMandateUpiId}
                        />
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {['@okhdfcbank', '@okicici', '@ybl', '@paytm'].map((h) => (
                            <TouchableOpacity
                              key={h}
                              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4 }}
                              onPress={() => {
                                const prefix = mandateUpiId.includes('@') ? mandateUpiId.split('@')[0] : mandateUpiId || 'resident';
                                setMandateUpiId(`${prefix}${h}`);
                              }}
                            >
                              <Text style={{ fontSize: 11, color: colors.ink }}>{h}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <TextInput
                          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                          placeholder="Card Number"
                          placeholderTextColor={colors.inkSoft}
                          keyboardType="numeric"
                          maxLength={19}
                          value={mandateCardNumber}
                          onChangeText={setMandateCardNumber}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                            placeholder="MM/YY"
                            placeholderTextColor={colors.inkSoft}
                            maxLength={5}
                            value={mandateCardExpiry}
                            onChangeText={setMandateCardExpiry}
                          />
                          <TextInput
                            style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                            placeholder="CVV"
                            placeholderTextColor={colors.inkSoft}
                            secureTextEntry
                            maxLength={4}
                            value={mandateCardCvv}
                            onChangeText={setMandateCardCvv}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {selectedMobileGateway === 'easebuzz' && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>e-NACH NetBanking</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                      placeholder="Savings Account Number"
                      placeholderTextColor={colors.inkSoft}
                      keyboardType="numeric"
                      value={mandateAccountNum}
                      onChangeText={setMandateAccountNum}
                    />
                  </View>
                )}

                {selectedMobileGateway === 'paypal' && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>PayPal Account Email</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                      placeholder="user@example.com"
                      placeholderTextColor={colors.inkSoft}
                      autoCapitalize="none"
                      value={mandatePaypalEmail}
                      onChangeText={setMandatePaypalEmail}
                    />
                  </View>
                )}
              </View>

              {/* Consent Toggle */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 8 }}
                onPress={() => setMandateConsentChecked(!mandateConsentChecked)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={mandateConsentChecked ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={mandateConsentChecked ? '#10B981' : colors.inkSoft}
                  style={{ marginTop: 2 }}
                />
                <Text style={{ flex: 1, fontSize: 11, color: colors.ink, lineHeight: 16 }}>
                  I authorize Propithub to register an automated recurring mandate on this payment instrument for my monthly rent with 48h advance notice.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: colors.brass,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 8,
                  marginBottom: 10,
                }}
                disabled={isUpdatingAutopay}
                onPress={() => handleSwitchMobileTenantGateway(selectedMobileGateway)}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                  {isUpdatingAutopay ? 'Authorizing...' : 'Authorize'}
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
    payNowHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#059669',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    payNowHeaderBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
    cashClaimBanner: {
      backgroundColor: '#FFFBEB',
      borderWidth: 1.5,
      borderColor: '#FDE68A',
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    cashClaimTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    cashClaimIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#FEF3C7',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    cashClaimTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: '#92400E',
    },
    cashClaimSub: {
      fontSize: 12,
      color: '#78350F',
      marginTop: 2,
      lineHeight: 16,
    },
    cashClaimBtnsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    declineClaimBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 7,
      paddingVertical: 8,
    },
    declineClaimBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    confirmClaimBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#D97706',
      borderRadius: 7,
      paddingVertical: 8,
    },
    confirmClaimBtnText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    balanceHeroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
    },
    balanceHeroLeft: {
      flex: 1,
    },
    balanceHeroLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.inkSoft,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    balanceHeroAmount: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.navy,
      marginVertical: 2,
    },
    balanceHeroSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    heroPayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#10B981',
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    heroPayBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    tabsCapsule: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
      borderRadius: 8,
      padding: 3,
      marginBottom: 16,
    },
    tabBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 6,
    },
    tabBtnActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    tabBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    tabBtnTextActive: {
      color: colors.navy,
      fontWeight: '700',
    },
    scheduleInfoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EFF6FF',
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
    },
    scheduleInfoText: {
      flex: 1,
      fontSize: 11.5,
      color: '#1E40AF',
      lineHeight: 16,
    },
    scheduleRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
      marginBottom: 8,
    },
    scheduleMonthBox: {
      flex: 1,
    },
    scheduleMonthText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
    },
    scheduleDueSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    scheduleAmountBox: {
      alignItems: 'flex-end',
      marginRight: 10,
    },
    scheduleAmountText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
    },
    schedulePayBtn: {
      backgroundColor: '#10B981',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    schedulePayBtnText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 30,
      alignItems: 'center',
      marginBottom: 16,
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
      textAlign: 'center',
      marginTop: 4,
    },
    invoiceCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 12,
    },
    invoiceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    invoiceTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
    },
    invoiceIdText: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    statusPill: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: '800',
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      marginVertical: 10,
    },
    invoiceLineItems: {
      gap: 4,
    },
    invoiceLineItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    lineItemLabel: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    lineItemVal: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    invoiceActionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    invoiceDocBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 7,
      paddingVertical: 8,
    },
    invoiceDocBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    invoicePayBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 7,
      paddingVertical: 8,
    },
    invoicePayBtnText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    inflowPendingBanner: {
      backgroundColor: '#EFF6FF',
      borderWidth: 1,
      borderColor: '#BFDBFE',
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    inflowPendingIconBox: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: '#DBEAFE',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    inflowPendingTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#1E3A8A',
    },
    inflowPendingSub: {
      fontSize: 11,
      color: '#2563EB',
      marginTop: 2,
      lineHeight: 15,
    },
    inflowPendingBadge: {
      backgroundColor: '#DBEAFE',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    inflowPendingBadgeText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#1D4ED8',
    },
    directionBadge: {
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    directionBadgeText: {
      fontSize: 9,
      fontWeight: '700',
    },
    statusTagBadge: {
      marginTop: 3,
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: 4,
    },
    statusTagText: {
      fontSize: 8.5,
      fontWeight: '800',
    },
    declineNoteBox: {
      backgroundColor: '#FEF2F2',
      borderLeftWidth: 3,
      borderLeftColor: '#DC2626',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 4,
      marginTop: 8,
    },
    declineNoteText: {
      fontSize: 11,
      color: '#DC2626',
      lineHeight: 15,
    },
    ledgerCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
      marginBottom: 8,
    },
    ledgerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    receiptIconBox: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: '#DCFCE7',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    ledgerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    ledgerSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    ledgerAmountBox: {
      alignItems: 'flex-end',
    },
    ledgerAmountText: {
      fontSize: 13.5,
      fontWeight: '800',
      color: colors.navy,
    },
    settledTagText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#15803D',
    },
    ledgerFooterRow: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      alignItems: 'flex-end',
    },
    viewReceiptBtn: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    viewReceiptBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: '#2563EB',
    },
    depositHeroCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 16,
      marginBottom: 14,
    },
    depositHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    depositHeroIconBox: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: '#DCFCE7',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    depositHeroTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
    },
    depositHeroSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    depositAmountBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      alignItems: 'center',
    },
    depositAmountLabel: {
      fontSize: 11,
      color: colors.inkSoft,
      textTransform: 'uppercase',
    },
    depositAmountBig: {
      fontSize: 22,
      fontWeight: '800',
      color: '#059669',
      marginTop: 2,
    },
    depositSpecsGrid: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    depositSpecCell: {
      flex: 1,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 8,
    },
    depositSpecLabel: {
      fontSize: 10.5,
      color: colors.inkSoft,
    },
    depositSpecVal: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 2,
    },
    reviewSettlementBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 8,
      paddingVertical: 10,
    },
    reviewSettlementBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    deductionsCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
    },
    deductionsHeading: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 8,
    },
    deductionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    deductionReason: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    deductionAmount: {
      fontSize: 12,
      fontWeight: '700',
      color: '#DC2626',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
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
      color: colors.navy,
    },
    methodsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginVertical: 8,
    },
    methodCard: {
      flexBasis: '47%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 10,
      gap: 8,
    },
    methodCardActive: {
      borderColor: '#059669',
      backgroundColor: '#F0FDF4',
    },
    methodCardText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
    methodCardTextActive: {
      color: '#059669',
    },
    methodCardSubtext: {
      fontSize: 9.5,
      color: colors.inkMuted,
      marginTop: 1,
    },
    methodCardSubtextActive: {
      color: '#059669',
    },
    methodDetailBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 10,
      marginTop: 6,
    },
    detailBoxTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
    detailBoxSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
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
    invoiceDocPaper: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      padding: 14,
      overflow: 'hidden',
    },
    docTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    docBrand: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.navy,
      flex: 1,
      marginRight: 8,
    },
    docStamp: {
      fontSize: 10,
      fontWeight: '800',
      backgroundColor: '#DCFCE7',
      color: '#15803D',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      flexShrink: 0,
    },
    docMeta: {
      fontSize: 11,
      color: colors.inkSoft,
      lineHeight: 16,
      marginBottom: 10,
    },
    docTable: {
      borderTopWidth: 1,
      borderColor: colors.line,
      paddingTop: 8,
    },
    docTableRowHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    docTableRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    docColDesc: {
      fontSize: 11.5,
      color: colors.navy,
    },
    docColAmt: {
      fontSize: 11.5,
      color: colors.navy,
    },
    receiptCardBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 10,
      padding: 16,
      alignItems: 'center',
    },
    receiptBigAmount: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.navy,
      marginTop: 6,
    },
    receiptSettledText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#059669',
      marginTop: 2,
    },
    receiptMetaText: {
      fontSize: 11.5,
      color: colors.inkSoft,
      lineHeight: 18,
      textAlign: 'center',
    },
    decisionTabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    decisionTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderRadius: 8,
      paddingVertical: 10,
    },
    decisionTabActive: {
      backgroundColor: '#10B981',
    },
    decisionTabText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    decisionTabTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    rentDueHeroCard: {
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1.5,
    },
    rentDueHeroOverdue: {
      backgroundColor: '#FEF2F2',
      borderColor: '#EF4444',
    },
    rentDueHeroDueNow: {
      backgroundColor: '#FFFBEB',
      borderColor: '#F59E0B',
    },
    rentDueHeroStandard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
    },
    rentDueHeroBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
      flexWrap: 'wrap',
    },
    rentDueHeroStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    rentDueHeroStatusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    moveInBadge: {
      backgroundColor: '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    moveInBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#059669',
    },
    badgeRed: {
      backgroundColor: '#FEE2E2',
    },
    badgeRedText: {
      color: '#DC2626',
    },
    badgeAmber: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    },
    badgeAmberText: {
      color: colors.inkSoft,
    },
    badgeBlue: {
      backgroundColor: '#DBEAFE',
    },
    badgeBlueText: {
      color: '#1D4ED8',
    },
    badgeGrey: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    },
    badgeGreyText: {
      color: colors.inkSoft,
    },
    badgeGreen: {
      backgroundColor: '#DCFCE7',
    },
    badgeGreenText: {
      color: '#15803D',
    },
    rentDueHeroAmountRow: {
      marginVertical: 4,
    },
    rentDueHeroAmount: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.navy,
    },
    rentDueHeroMetaBox: {
      marginVertical: 6,
      gap: 2,
    },
    rentDueHeroMetaText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    rentDueHeroActionRow: {
      marginTop: 10,
    },
    verificationPendingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    verificationPendingText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#B45309',
    },
    heroPayNowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 10,
    },
    heroPayNowBtnText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    trustNoteStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: 'rgba(0,0,0,0.06)',
    },
    trustNoteText: {
      fontSize: 11,
      color: colors.inkSoft,
      flex: 1,
      lineHeight: 15,
    },
    allSettledCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#BBF7D0',
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
    },
    allSettledTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#15803D',
      marginBottom: 2,
    },
    allSettledSub: {
      fontSize: 11.5,
      color: '#166534',
      lineHeight: 16,
    },
    noScheduleCard: {
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.line,
      borderRadius: 12,
      padding: 20,
      marginBottom: 14,
    },
    noScheduleTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 2,
    },
    noScheduleSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      textAlign: 'center',
      lineHeight: 16,
    },
    rentDueSwitcherRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    rentDueCapsule: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      padding: 4,
      borderRadius: 10,
      flex: 1,
      gap: 4,
    },
    rentDueCapsuleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    rentDueCapsuleBtnActive: {
      backgroundColor: '#10B981',
    },
    rentDueCapsuleText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    rentDueCapsuleTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    cycleSummaryStrip: {
      paddingHorizontal: 2,
      marginBottom: 8,
    },
    cycleSummaryText: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    cycleCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    cycleCardOverdue: {
      borderLeftWidth: 4,
      borderLeftColor: '#EF4444',
    },
    cycleCardDueNow: {
      borderLeftWidth: 4,
      borderLeftColor: '#F59E0B',
    },
    cycleCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    cycleCardTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
    },
    cycleCardSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    cycleStatusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    cycleStatusPillText: {
      fontSize: 10,
      fontWeight: '800',
    },
    cycleCardBody: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 10,
      marginVertical: 8,
    },
    cycleDetailCol: {
      gap: 2,
    },
    cycleDetailLbl: {
      fontSize: 10.5,
      color: colors.inkSoft,
    },
    cycleDetailVal: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
    cycleDetailAmount: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.navy,
    },
    cycleCardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    },
    cycleNoteText: {
      fontSize: 11,
      color: colors.inkSoft,
      flex: 1,
      marginRight: 8,
    },
    awaitingTextBadge: {
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    awaitingTextBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#B45309',
    },
    cyclePayBtn: {
      backgroundColor: '#059669',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
    },
    cyclePayBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    scheduledPill: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    scheduledPillText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    cycleReceiptBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    cycleReceiptBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    depositRequiredHero: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: '#10B981',
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
    },
    depositRequiredTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    depositRequiredBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    depositRequiredBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#059669',
      letterSpacing: 0.5,
    },
    depositRequiredStatusTag: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#059669',
    },
    depositRequiredTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.navy,
      marginBottom: 3,
    },
    depositRequiredSub: {
      fontSize: 12,
      color: colors.inkSoft,
      lineHeight: 16,
      marginBottom: 12,
    },
    depositRequiredAmountRow: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      padding: 12,
      gap: 10,
    },
    depositRequiredAmountInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    depositRequiredAmountLabel: {
      fontSize: 11,
      color: colors.inkSoft,
      fontWeight: '600',
    },
    depositRequiredAmount: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.navy,
    },
    depositRequiredPayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      width: '100%',
    },
    depositRequiredPayBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    heroPayNowBtnLocked: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.line,
    },
    heroPayNowBtnLockedText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    cyclePayBtnLocked: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    cyclePayBtnLockedText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.inkSoft,
    },
  });
