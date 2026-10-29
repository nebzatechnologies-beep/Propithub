import React, { useState, useMemo, useEffect } from 'react';
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
import { Ionicons, Feather, FontAwesome5 } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useTenantActiveUnit } from '../hooks/useTenantActiveUnit';
import { TenantMultiPropertySwitcher } from '../components/TenantMultiPropertySwitcher';
import { getTenantReminders } from '../lib/reminders';
import { MobileAgreement, MobileMoveOut, MobileRenewalItem, MobileRequiredIdItem, MobileTenantUploadedIdItem } from '../types';
import { uploadOrCompressImage } from '../lib/imageUploader';
import { pickDocument, pickSingleImage } from '../lib/nativePicker';
import { downloadDocument, DocumentDownloadItem } from '../lib/documentService';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';

interface TenantLeaseScreenProps {
  onGiveNoticePress?: () => void;
}

export const TenantLeaseScreen: React.FC<TenantLeaseScreenProps> = ({ onGiveNoticePress }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const {
    state,
    updateAgreement,
    addMoveOut,
    updateMoveOut,
    requestLeaseRenewal,
    submitTenantSignedRenewal,
    respondToLeaseRenewal,
    respondToDepositSettlement,
    confirmRefundReceipt,
    updateAgreementAutopay,
  } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();

  const {
    myUnits,
    isMultiUnit,
    activeUnit,
    activeAgreement: hookActiveAgreement,
    activeProperty,
    activeCurrency,
    selectedTenantUnitId,
    setSelectedTenantUnitId,
  } = useTenantActiveUnit();

  // Contextual top lease reminders (expiring lease countdown, pending signature, move-out inspection)
  const contextualLeaseReminders = useMemo(() => {
    const all = getTenantReminders(state, user);
    return all.filter((r) => r.category === 'lease' || r.category === 'occupancy');
  }, [state, user]);

  const [subTab, setSubTab] = useState<'owner' | 'renewal'>('owner');
  const [agreementFilter, setAgreementFilter] = useState<'all' | 'active' | 'pending' | 'concluded'>('all');

  // Physical Ink-Sign Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [targetAgreementForUpload, setTargetAgreementForUpload] = useState<MobileAgreement | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [optInAutopayDuringLease, setOptInAutopayDuringLease] = useState(true);
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const [uploadedIdsState, setUploadedIdsState] = useState<Record<string, { fileUrl: string; fileName: string }>>({});

  // Real Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<DocumentDownloadItem | null>(null);
  const [uploadedFileData, setUploadedFileData] = useState<string>('');

  // Move-Out Notice Modal
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeMoveOutDate, setNoticeMoveOutDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [noticeUnitSelection, setNoticeUnitSelection] = useState('');
  const [isSubmittingNotice, setIsSubmittingNotice] = useState(false);

  // Move-Out Inspection Checklist Modal
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // Security Deposit Settlement Review Modal State (1-to-1 Web Parity)
  const [showSettlementReviewModal, setShowSettlementReviewModal] = useState(false);
  const [settlementDecision, setSettlementDecision] = useState<'accept' | 'contest'>('accept');
  const [settlementPayoutRail, setSettlementPayoutRail] = useState<'upi' | 'bank' | 'paypal' | 'cash'>('upi');
  const [settlementAccountHolder, setSettlementAccountHolder] = useState(user.displayName || 'Resident');
  const [settlementUpiId, setSettlementUpiId] = useState('');
  const [settlementBankAccNumber, setSettlementBankAccNumber] = useState('');
  const [settlementBankIfsc, setSettlementBankIfsc] = useState('');
  const [settlementPaypalEmail, setSettlementPaypalEmail] = useState(user.email || '');
  const [settlementContestReason, setSettlementContestReason] = useState('');
  const [settlementInputError, setSettlementInputError] = useState('');
  const [isSubmittingSettlementReview, setIsSubmittingSettlementReview] = useState(false);

  // Renewal Request Modal
  const [showRenewalRequestModal, setShowRenewalRequestModal] = useState(false);
  const [proposedRenewalRent, setProposedRenewalRent] = useState('');
  const [renewalStartDate, setRenewalStartDate] = useState('');
  const [renewalEndDate, setRenewalEndDate] = useState('');
  const [renewalNote, setRenewalNote] = useState('');
  const [isSubmittingRenewalRequest, setIsSubmittingRenewalRequest] = useState(false);

  // Renewal Review Modal
  const [showRenewalReviewModal, setShowRenewalReviewModal] = useState(false);
  const [reviewingAgreement, setReviewingAgreement] = useState<MobileAgreement | null>(null);
  const [reviewingRenewal, setReviewingRenewal] = useState<MobileRenewalItem | null>(null);
  const [renewalSignedAttached, setRenewalSignedAttached] = useState(false);
  const [tenantRenewalSignedFile, setTenantRenewalSignedFile] = useState<string | null>(null);
  const [tenantRenewalSignedFileName, setTenantRenewalSignedFileName] = useState('');
  const [tenantRenewalSignedFileSize, setTenantRenewalSignedFileSize] = useState<number | null>(null);
  const [isSubmittingTenantSignedRenewal, setIsSubmittingTenantSignedRenewal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReasonText, setDeclineReasonText] = useState('');

  const tenantName = user.displayName || 'Resident';
  const tenantEmail = (user.email || '').toLowerCase();

  // Tenant-scoped agreements
  const myAgreements = useMemo(() => {
    const rawList = state.agreements.filter((a) => {
      if (a.status === 'terminated' || a.status === 'cancelled') return false;

      const isMyAg =
        (user?.id && a.tenantId === user.id) ||
        (tenantEmail && a.tenantEmail?.toLowerCase().trim() === tenantEmail);
      if (!isMyAg) return false;

      // Filter by active unit only when multi-unit is explicitly toggled
      if (activeUnit && isMultiUnit && selectedTenantUnitId) {
        const cleanAgUnit = (a.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const cleanActiveUnit = (activeUnit.unitNumber || activeUnit.id || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const uMatch = cleanAgUnit === cleanActiveUnit || a.unit.toLowerCase() === activeUnit.id.toLowerCase();
        const pMatch = !a.propertyId || !activeUnit.propertyId || a.propertyId === activeUnit.propertyId;
        if (!uMatch || !pMatch) return false;
      }

      // Exclude agreements for units where move-out has concluded
      const cleanAgUnit = (a.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const hasCompletedMoveOut = (state.moveOuts || []).some((m) => {
        const cleanMUnit = (m.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const matchesUnit =
          (cleanMUnit && cleanAgUnit && cleanMUnit === cleanAgUnit) ||
          (m.unit && a.id && m.unit.toLowerCase().trim() === a.id.toLowerCase().trim());
        const matchesProp = !m.propertyId || !a.propertyId || m.propertyId === a.propertyId;
        const isCompleted =
          m.status === 'settled' ||
          m.status === 'refund_completed' ||
          Boolean(m.tenantConfirmedReceipt);

        if (!matchesUnit || !matchesProp || !isCompleted) return false;

        if (m.agreementId || (m as any).leaseAgreementId) {
          return m.agreementId === a.id || (m as any).leaseAgreementId === a.id;
        }

        // A pending onboarding agreement is never a completed move-out
        if (
          a.status === 'awaiting_tenant_signature' ||
          a.status === 'awaiting_tenant_upload' ||
          a.status === 'draft' ||
          a.status === 'pending_approval' ||
          a.status === 'pending_deposit'
        ) {
          return false;
        }

        const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const agEnd = new Date(a.end || 0).getTime();

        // If agreement ends in the future and after the move out date, it is the new active/re-onboarded lease
        if (agEnd > Date.now() && (moTime === 0 || agEnd > moTime)) {
          return false;
        }

        // If the agreement has ended before the move-out or in the past, it was vacated
        if (agEnd > 0 && (agEnd <= moTime || agEnd < Date.now())) {
          return true;
        }

        return false;
      });
      if (hasCompletedMoveOut) return false;

      return true;
    });

    // Deduplicate per property and unit: prioritize active/pending leases
    const byUnit = new Map<string, MobileAgreement>();
    const statusRank = (s: string) => {
      if (s === 'active') return 100;
      if (s === 'pending_deposit') return 90;
      if (s === 'pending_approval' || (s as any) === 'awaiting_owner_signature') return 80;
      if (s === 'awaiting_tenant_upload' || s === 'awaiting_tenant_signature') return 70;
      if (s === 'draft') return 50;
      return 10;
    };
    rawList.forEach((ag) => {
      const cleanUnit = (ag.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const uKey = `${(ag.propertyId || '').toLowerCase()}_${cleanUnit}`;
      const existing = byUnit.get(uKey);
      if (!existing) {
        byUnit.set(uKey, ag);
      } else {
        const rankDiff = statusRank(ag.status) - statusRank(existing.status);
        if (rankDiff > 0) {
          byUnit.set(uKey, ag);
        } else if (rankDiff === 0) {
          const existingEnd = new Date(existing.end || existing.createdAt || 0).getTime();
          const agEnd = new Date(ag.end || ag.createdAt || 0).getTime();
          if (agEnd > existingEnd) {
            byUnit.set(uKey, ag);
          }
        }
      }
    });
    return Array.from(byUnit.values());
  }, [state.agreements, state.moveOuts, user, tenantEmail, tenantName, activeUnit]);

  const allTenantAgreements = useMemo(() => {
    return state.agreements.filter((a) => {
      const matchId = Boolean(user?.id && a.tenantId === user.id);
      const matchEmail = Boolean(tenantEmail && a.tenantEmail?.toLowerCase().trim() === tenantEmail);
      return matchId || matchEmail;
    });
  }, [state.agreements, user?.id, tenantEmail]);

  const agreementCounts = useMemo(() => {
    const list = allTenantAgreements;
    const isAgVacated = (a: any) =>
      a.status === 'terminated' ||
      a.status === 'expired' ||
      (state.moveOuts || []).some(
        (m) =>
          (!m.propertyId || !a.propertyId || m.propertyId === a.propertyId) &&
          (m.agreementId === a.id || (!m.agreementId && (m.unit === a.unit || m.unit === (a as any).unitId))) &&
          (m.status === 'refund_completed' || m.status === 'settled' || Boolean(m.tenantConfirmedReceipt))
      );

    const hasPendingInvite = (a: any) =>
      (state.tenancyRequests || []).some(
        (r) =>
          r.status === 'pending' &&
          (((r as any).agreementId && (r as any).agreementId === a.id) ||
            (r.unit && a.unit && r.unit.toLowerCase().trim() === a.unit.toLowerCase().trim())) &&
          (!r.propertyId || !a.propertyId || r.propertyId === a.propertyId)
      );

    const activeCount = list.filter(
      (a) => a.status === 'active' && !isAgVacated(a) && !hasPendingInvite(a) && a.depositStatus === 'paid'
    ).length;

    const pendingCount = list.filter(
      (a) =>
        !isAgVacated(a) &&
        (hasPendingInvite(a) ||
          a.status === 'draft' ||
          a.status === 'awaiting_tenant_signature' ||
          a.status === 'awaiting_tenant_upload' ||
          a.status === 'pending_approval' ||
          (a.status as any) === 'awaiting_owner_signature' ||
          a.status === 'pending_deposit' ||
          (a.status === 'active' && (a.depositStatus !== 'paid' || hasPendingInvite(a))))
    ).length;
    const concludedCount = list.filter((a) => isAgVacated(a)).length;

    return {
      all: list.length,
      active: activeCount,
      pending: pendingCount,
      concluded: concludedCount,
    };
  }, [allTenantAgreements, state.moveOuts, state.tenancyRequests]);

  // Filtered agreements based on pill
  const filteredAgreements = useMemo(() => {
    const list = allTenantAgreements;
    const isAgVacated = (a: any) =>
      a.status === 'terminated' ||
      a.status === 'expired' ||
      (state.moveOuts || []).some(
        (m) =>
          (!m.propertyId || !a.propertyId || m.propertyId === a.propertyId) &&
          (m.agreementId === a.id || (!m.agreementId && (m.unit === a.unit || m.unit === (a as any).unitId))) &&
          (m.status === 'refund_completed' || m.status === 'settled' || Boolean(m.tenantConfirmedReceipt))
      );

    const hasPendingInvite = (a: any) =>
      (state.tenancyRequests || []).some(
        (r) =>
          r.status === 'pending' &&
          (((r as any).agreementId && (r as any).agreementId === a.id) ||
            (r.unit && a.unit && r.unit.toLowerCase().trim() === a.unit.toLowerCase().trim())) &&
          (!r.propertyId || !a.propertyId || r.propertyId === a.propertyId)
      );

    if (agreementFilter === 'active') {
      return list.filter(
        (a) => a.status === 'active' && !isAgVacated(a) && !hasPendingInvite(a) && a.depositStatus === 'paid'
      );
    }
    if (agreementFilter === 'pending') {
      return list.filter(
        (a) =>
          !isAgVacated(a) &&
          (hasPendingInvite(a) ||
            a.status === 'draft' ||
            a.status === 'awaiting_tenant_signature' ||
            a.status === 'awaiting_tenant_upload' ||
            a.status === 'pending_approval' ||
            (a.status as any) === 'awaiting_owner_signature' ||
            a.status === 'pending_deposit' ||
            (a.status === 'active' && (a.depositStatus !== 'paid' || hasPendingInvite(a))))
      );
    }
    if (agreementFilter === 'concluded') {
      return list.filter((a) => isAgVacated(a));
    }
    return list;
  }, [allTenantAgreements, agreementFilter, state.moveOuts, state.tenancyRequests]);

  // Active Agreement
  const primaryAgreement = useMemo(() => {
    return hookActiveAgreement || myAgreements.find((a) => a.status === 'active') || myAgreements[0] || null;
  }, [hookActiveAgreement, myAgreements]);

  // Active Move-Out for tenant (Strict Unique ID & Email)
  const activeMoveOut = useMemo(() => {
    const matchesTenant = (m: any) =>
      Boolean(user.id && m.tenantId === user.id) ||
      Boolean(tenantEmail && ((m.tenantEmail?.toLowerCase() === tenantEmail) || (m.tenant?.toLowerCase() === tenantEmail)));

    const isCompleted = (m: any) =>
      m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt);

    // 1. Look for an in-progress move-out matching activeUnit first
    const inProgressForUnit = state.moveOuts.find((m) => {
      if (!matchesTenant(m) || isCompleted(m)) return false;
      const unitMatches = !activeUnit || m.unit === activeUnit.unitNumber || m.unit === activeUnit.id;
      if (!unitMatches) return false;

      // If tenant has an agreement in onboarding or active, only link if this move-out was specifically filed for this agreement
      if (primaryAgreement) {
        if (m.agreementId && m.agreementId !== primaryAgreement.id) return false;
        const moCreatedAt = new Date((m as any).createdAt || m.moveOutDate || 0).getTime();
        const agCreatedAt = new Date(primaryAgreement.createdAt || primaryAgreement.start || 0).getTime();
        if (agCreatedAt > 0 && moCreatedAt > 0 && moCreatedAt < agCreatedAt) return false;
      }
      return true;
    });
    if (inProgressForUnit) return inProgressForUnit;

    // 2. Look for any in-progress move-out for this tenant
    const anyInProgress = state.moveOuts.find((m) => {
      if (!matchesTenant(m) || isCompleted(m)) return false;
      if (primaryAgreement) {
        if (m.agreementId && m.agreementId !== primaryAgreement.id) return false;
        const moCreatedAt = new Date((m as any).createdAt || m.moveOutDate || 0).getTime();
        const agCreatedAt = new Date(primaryAgreement.createdAt || primaryAgreement.start || 0).getTime();
        if (agCreatedAt > 0 && moCreatedAt > 0 && moCreatedAt < agCreatedAt) return false;
      }
      return true;
    });
    if (anyInProgress) return anyInProgress;

    // 3. Only return a completed move-out if tenant specifically has a pending refund confirmation
    const pendingReceiptMoveOut = state.moveOuts.find(
      (m) => matchesTenant(m) && m.status === 'refund_completed' && !m.tenantConfirmedReceipt
    );
    if (pendingReceiptMoveOut) return pendingReceiptMoveOut;

    return null;
  }, [state.moveOuts, user.id, tenantName, tenantEmail, activeUnit, primaryAgreement]);

  const isTenancyActive = useMemo(() => {
    return Boolean(
      primaryAgreement &&
      primaryAgreement.status === 'active'
    );
  }, [primaryAgreement]);

  const eligibleRenewalAgreements = useMemo(() => {
    return myAgreements
      .filter(
        (ag) =>
          ag.status === 'active' ||
          ag.status === 'pending_deposit' ||
          ag.status === 'pending_approval' ||
          ag.status === 'awaiting_tenant_signature'
      )
      .filter((ag) => {
        if (!activeUnit) return true;
        const cleanAgUnit = (ag.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const cleanActiveUnit = (activeUnit.unitNumber || activeUnit.id || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        return cleanAgUnit === cleanActiveUnit || ag.unit.toLowerCase() === activeUnit.id.toLowerCase();
      });
  }, [myAgreements, activeUnit]);

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

  const isSettlementAccepted = useMemo(() => {
    return Boolean(
      activeMoveOut?.settlementStatus === 'approved' ||
      activeMoveOut?.status === 'refund_scheduled' ||
      (activeMoveOut as any)?.tenantApprovedSettlement ||
      activeSettlement?.status === 'approved' ||
      Boolean(activeMoveOut?.chosenPayoutDetails) ||
      Boolean(activeSettlement?.chosenPayoutDetails)
    );
  }, [activeMoveOut, activeSettlement]);

  useEffect(() => {
    const details = activeMoveOut?.chosenPayoutDetails || activeSettlement?.chosenPayoutDetails;
    if (details) {
      if (details.method) {
        const m = details.method;
        if (m === 'bank_in' || m === 'iban') {
          setSettlementPayoutRail('bank');
        } else if (m === 'upi' || m === 'paypal' || m === 'cash') {
          setSettlementPayoutRail(m);
        }
      }
      if (details.accountHolderName) setSettlementAccountHolder(details.accountHolderName);
      if (details.upiId) setSettlementUpiId(details.upiId);
      if (details.accountNumber) setSettlementBankAccNumber(details.accountNumber);
      if (details.ifscCode) setSettlementBankIfsc(details.ifscCode);
      if (details.paypalEmail) setSettlementPaypalEmail(details.paypalEmail);
    }
  }, [activeMoveOut?.chosenPayoutDetails, activeSettlement?.chosenPayoutDetails]);

  const getMoveoutStepIndex = (status?: string) => {
    switch (status) {
      case 'requested':
      case 'notice_filed':
        return 1;
      case 'inspection_scheduled':
        return 2;
      case 'inspected':
        return 3;
      case 'refund_scheduled':
      case 'settlement_pending':
      case 'awaiting_tenant_approval':
        return 4;
      case 'refund_completed':
      case 'settled':
        return 5;
      default:
        return 1;
    }
  };

  const currentMoveOutStep = getMoveoutStepIndex(activeMoveOut?.status);

  // Helper for status badge
  const renderStatusBadge = (agOrStatus: MobileAgreement | string, isVacated?: boolean) => {
    if (typeof agOrStatus === 'string') {
      const status = agOrStatus;
      if (status === 'terminated' || status === 'expired') {
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#F1F5F9' }]}>
            <Text style={[styles.statusBadgeText, { color: '#64748B' }]}>Concluded</Text>
          </View>
        );
      }
      if (status === 'active') {
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>Active</Text>
          </View>
        );
      }
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#F1F5F9' }]}>
          <Text style={[styles.statusBadgeText, { color: '#475569' }]}>{status ? status.replace(/_/g, ' ') : ''}</Text>
        </View>
      );
    }

    const ag = agOrStatus;
    if (isVacated || ag.status === 'terminated' || ag.status === 'expired') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#F1F5F9' }]}>
          <Text style={[styles.statusBadgeText, { color: '#64748B' }]}>Concluded</Text>
        </View>
      );
    }

    const hasPendingInvite = (state.tenancyRequests || []).some(
      (r) =>
        r.status === 'pending' &&
        (((r as any).agreementId && (r as any).agreementId === ag.id) ||
          (r.unit && ag.unit && r.unit.toLowerCase().trim() === ag.unit.toLowerCase().trim())) &&
        (!r.propertyId || !ag.propertyId || r.propertyId === ag.propertyId)
    );

    if (hasPendingInvite) {
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1 }]}>
          <Text style={[styles.statusBadgeText, { color: '#B45309', fontWeight: '700' }]}>Pending Acceptance</Text>
        </View>
      );
    }

    if (ag.status === 'active' && ag.depositStatus !== 'paid') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#F0FDFA', borderColor: '#CCFBF1', borderWidth: 1 }]}>
          <Text style={[styles.statusBadgeText, { color: '#0F766E', fontWeight: '700' }]}>Deposit Due</Text>
        </View>
      );
    }

    switch (ag.status as any) {
      case 'active':
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>Active</Text>
          </View>
        );
      case 'awaiting_tenant_upload':
      case 'awaiting_tenant_signature':
      case 'draft':
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.statusBadgeText, { color: '#B45309' }]}>Sign Required</Text>
          </View>
        );
      case 'pending_approval':
      case 'awaiting_owner_signature' as any:
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1 }]}>
            <Text style={[styles.statusBadgeText, { color: '#B45309', fontWeight: '700' }]}>Pending Approval</Text>
          </View>
        );
      case 'pending_deposit':
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#F0FDFA' }]}>
            <Text style={[styles.statusBadgeText, { color: '#0F766E' }]}>Deposit Due</Text>
          </View>
        );
      case 'cancelled':
      case 'terminated':
      case 'expired':
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#F1F5F9' }]}>
            <Text style={[styles.statusBadgeText, { color: '#64748B' }]}>Concluded</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#F1F5F9' }]}>
            <Text style={[styles.statusBadgeText, { color: '#475569' }]}>{ag.status ? ag.status.replace(/_/g, ' ') : ''}</Text>
          </View>
        );
    }
  };

  const handleDownloadDraft = (ag: MobileAgreement) => {
    downloadDocument({
      fileName: ag.initialAgreementName || `Tenancy_Agreement_${ag.unit}.pdf`,
      fileUrl: ag.initialAgreementUrl,
      title: 'Formal Non-Judicial Stamped Tenancy Draft',
      docType: 'Official Tenancy Draft',
      meta: {
        tenantName: ag.tenant || tenantName,
        unit: ag.unit,
        propertyName: ag.propertyName,
        amount: ag.rent ? format(ag.rent, ag.currency || activeCurrency) : undefined,
        date: ag.start,
      },
    });
  };

  const handleOpenUploadModal = (ag: MobileAgreement) => {
    setTargetAgreementForUpload(ag);
    setUploadedFileName(`Signed_Tenancy_Agreement_${ag.unit || 'Unit'}.pdf`);
    setUploadedFileData('');
    setAgreedToTerms(true);
    setUploadedIdsState({}); // reset ID uploads
    setShowUploadModal(true);
  };

  const handleUploadTenantIdDocument = async (reqId: MobileRequiredIdItem) => {
    try {
      const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
      if (!picked) return;
      const dataUrl = picked.base64 || picked.uri;
      setUploadedIdsState((prev) => ({
        ...prev,
        [reqId.id]: {
          fileUrl: dataUrl,
          fileName: picked.name,
        },
      }));
      Alert.alert('Document Attached ✓', `${reqId.name} attached: ${picked.name}`);
    } catch (err: any) {
      Alert.alert('Selection Error', err?.message || 'Could not select document.');
    }
  };

  const handleConfirmUploadSigned = () => {
    if (!targetAgreementForUpload) return;
    if (!uploadedFileName.trim()) {
      Alert.alert('File Required', 'Please attach your signed agreement document.');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Declaration Required', 'Please certify that this document has genuine physical ink signatures.');
      return;
    }

    // Validate required IDs if any
    const requiredIds: MobileRequiredIdItem[] = targetAgreementForUpload.requiredIdList && targetAgreementForUpload.requiredIdList.length > 0
      ? targetAgreementForUpload.requiredIdList
      : (targetAgreementForUpload.requiredIdTypes && targetAgreementForUpload.requiredIdTypes.length > 0
        ? targetAgreementForUpload.requiredIdTypes.map((t, i) => ({ id: `req_${i}`, name: t }))
        : (targetAgreementForUpload.requiredIdType
          ? [{ id: 'req_0', name: targetAgreementForUpload.requiredIdType }]
          : []));
    if (targetAgreementForUpload.requireTenantId && requiredIds.length > 0) {
      const missing = requiredIds.filter((r) => !uploadedIdsState[r.id]);
      if (missing.length > 0) {
        Alert.alert('IDs Required', `Please attach: ${missing.map((m) => m.name).join(', ')}.`);
        return;
      }
    }

    const uploadedIds: MobileTenantUploadedIdItem[] = requiredIds
      .filter((r) => uploadedIdsState[r.id])
      .map((r) => ({
        id: r.id,
        name: r.name,
        fileUrl: uploadedIdsState[r.id].fileUrl,
        fileName: uploadedIdsState[r.id].fileName,
        uploadedAt: new Date().toISOString(),
      }));

    setIsSubmittingUpload(true);
    (async () => {
      try {
        let safeSignedDocUrl = uploadedFileData;
        if (uploadedFileData && targetAgreementForUpload) {
          safeSignedDocUrl = await uploadOrCompressImage(
            uploadedFileData,
            `agreements/${targetAgreementForUpload.id}/tenant_signed_${Date.now()}`
          );
        }

        const safeUploadedIds = await Promise.all(
          uploadedIds.map(async (docItem) => {
            if (docItem.fileUrl && docItem.fileUrl.startsWith('data:')) {
              try {
                const cloudUrl = await uploadOrCompressImage(
                  docItem.fileUrl,
                  `agreements/${targetAgreementForUpload.id}/id_${docItem.id}_${Date.now()}`
                );
                return { ...docItem, fileUrl: cloudUrl };
              } catch {
                return docItem;
              }
            }
            return docItem;
          })
        );

        updateAgreement(targetAgreementForUpload.id, {
          status: 'pending_approval',
          signedDocumentUrl: safeSignedDocUrl || targetAgreementForUpload.initialAgreementUrl || undefined,
          signedDocumentName: uploadedFileName,
          tenantSignature: user.displayName || 'Resident',
          tenantSignedAt: new Date().toISOString(),
          tenantUploadedIds: safeUploadedIds.length > 0 ? safeUploadedIds : undefined,
          rejectionReason: undefined,
          rejectedAt: undefined,
        });

        if (optInAutopayDuringLease) {
          const rentVal = Number(targetAgreementForUpload.rent) || 0;
          const dueDay = (targetAgreementForUpload as any).rentDueDay || 1;
          const nextD = new Date();
          nextD.setDate(dueDay);
          if (nextD.getTime() <= Date.now()) {
            nextD.setMonth(nextD.getMonth() + 1);
          }
          updateAgreementAutopay(targetAgreementForUpload.id, {
            enabled: true,
            status: 'active',
            activeGateway: 'razorpay',
            mandateId: `mandate_lease_${Date.now()}`,
            authInstrument: 'upi',
            paymentMethodDisplay: 'UPI AutoPay (Google Pay / PhonePe)',
            rentAmount: rentVal,
            maxAuthorizedAmount: rentVal * 1.5,
            currency: targetAgreementForUpload.currency || 'INR',
            billingDay: dueDay,
            rentDueDay: dueDay,
            nextDebitDate: nextD.toISOString().split('T')[0],
            failureCount: 0,
            updatedAt: new Date().toISOString(),
          }).catch(console.warn);
        }

        setIsSubmittingUpload(false);
        setShowUploadModal(false);
        setTargetAgreementForUpload(null);
        Alert.alert(
          'Signed Lease Uploaded ✓',
          'Your signed tenancy agreement was successfully uploaded. Your landlord has been notified to review and verify.'
        );
      } catch (err) {
        setIsSubmittingUpload(false);
        console.warn('Tenant upload error:', err);
      }
    })();
  };

  const handleSubmitNotice = () => {
    const targetUnit = noticeUnitSelection || activeUnit?.unitNumber || primaryAgreement?.unit || '';
    const targetProperty = activeUnit?.propertyName || primaryAgreement?.propertyName || '';

    setIsSubmittingNotice(true);
    setTimeout(() => {
      const dynamicDeposit =
        primaryAgreement?.deposit ??
        activeUnit?.deposit ??
        (primaryAgreement?.rent ? primaryAgreement.rent * 2 : (activeUnit?.rent ? activeUnit.rent * 2 : 0));

      const newMo: MobileMoveOut = {
        id: `MO-${Math.floor(1000 + Math.random() * 9000)}`,
        ownerId: primaryAgreement?.ownerId || '',
        tenantId: user.id,
        tenantName,
        tenantEmail: user.email,
        propertyId: activeUnit?.propertyId || primaryAgreement?.propertyId || '',
        propertyName: targetProperty,
        unit: targetUnit,
        moveOutDate: noticeMoveOutDate,
        depositHeld: dynamicDeposit,
        currency: primaryAgreement?.currency || activeCurrency,
        status: 'notice_filed',
        inspectionChecklist: [
          { room: 'Living Area', item: 'Paint, Walls & Ceilings', condition: 'good', deduction: 0 },
          { room: 'Kitchen', item: 'Plumbing & Fixtures', condition: 'good', deduction: 0 },
          { room: 'Bedrooms', item: 'Flooring & Windows', condition: 'good', deduction: 0 },
        ],
        totalDeductions: 0,
        unpaidBills: 0,
        netRefundAmount: dynamicDeposit,
        agreementId: primaryAgreement?.id,
        deposit: dynamicDeposit,
        tenant: tenantName,
      } as any;

      addMoveOut(newMo);
      setIsSubmittingNotice(false);
      setShowNoticeModal(false);
      Alert.alert(
        'Move-Out Notice Registered ✓',
        `Official move-out notice registered for Unit ${targetUnit || 'assigned premises'}, effective ${noticeMoveOutDate}. Your landlord has been notified to schedule checkout inspection.`
      );
    }, 600);
  };

  const handleSendRenewalRequest = async (targetAgParam?: MobileAgreement) => {
    const targetAg = targetAgParam || reviewingAgreement || primaryAgreement;
    const targetUnit = targetAg?.unit || (activeUnit ? activeUnit.unitNumber : '');
    if (!targetUnit) {
      Alert.alert('Unit Required', 'No assigned unit found to request renewal.');
      return;
    }

    setIsSubmittingRenewalRequest(true);
    try {
      await requestLeaseRenewal(targetUnit, renewalNote, targetAg?.propertyId);
      setShowRenewalRequestModal(false);
      setRenewalNote('');
      Alert.alert(
        'Renewal Request Dispatched ✓',
        `Your lease renewal request has been dispatched to your landlord for Unit ${targetUnit}. Expiring tenancies and pending requests will appear in your Renewals Hub.`
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to dispatch renewal request.');
    } finally {
      setIsSubmittingRenewalRequest(false);
    }
  };

  const handlePickRenewalSignedFile = async () => {
    try {
      const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
      if (!picked) return;
      const dataUrl = picked.base64 || picked.uri;
      setTenantRenewalSignedFileName(picked.name);
      setTenantRenewalSignedFileSize(Math.round((picked.size || 50000) / 1024));
      setTenantRenewalSignedFile(dataUrl);
      setRenewalSignedAttached(true);
      Alert.alert('Signed Document Attached ✓', `Attached: ${picked.name}`);
    } catch (err: any) {
      Alert.alert('Selection Error', err?.message || 'Could not attach signed document.');
    }
  };

  const handleAcceptRenewal = async () => {
    const targetUnit = reviewingRenewal?.unit || reviewingAgreement?.unit || '';
    const propId = reviewingRenewal?.propertyId || reviewingAgreement?.propertyId;
    if (!targetUnit) return;

    if (tenantRenewalSignedFile) {
      // Option A: Submit signed renewal agreement (requires landlord approval)
      setIsSubmittingTenantSignedRenewal(true);
      try {
        await submitTenantSignedRenewal(
          targetUnit,
          tenantRenewalSignedFile,
          tenantRenewalSignedFileName || `Signed_Renewal_${targetUnit}.pdf`,
          tenantRenewalSignedFileSize || undefined,
          propId
        );
        setShowRenewalReviewModal(false);
        setTenantRenewalSignedFile(null);
        setTenantRenewalSignedFileName('');
        setTenantRenewalSignedFileSize(null);
        setRenewalSignedAttached(false);
        setReviewingAgreement(null);
        setReviewingRenewal(null);
        Alert.alert(
          'Signed Agreement Submitted ✓',
          `Your signed renewal agreement for Unit ${targetUnit} was submitted to your landlord for final approval.`
        );
      } catch (err) {
        console.error(err);
        Alert.alert('Submission Error', 'Failed to submit signed renewal agreement.');
      } finally {
        setIsSubmittingTenantSignedRenewal(false);
      }
    } else {
      // Option B: Accept renewal terms directly
      try {
        await respondToLeaseRenewal(targetUnit, 'accepted', undefined, propId);
        setShowRenewalReviewModal(false);
        setReviewingAgreement(null);
        setReviewingRenewal(null);
        Alert.alert(
          'Lease Renewal Accepted ✓',
          `Congratulations! Your tenancy for Unit ${targetUnit} has been extended with the renewed terms.`
        );
      } catch (err) {
        console.error(err);
        Alert.alert('Error', 'Failed to accept renewal terms.');
      }
    }
  };

  const handleConfirmDeclineRenewal = async () => {
    const targetUnit = reviewingRenewal?.unit || reviewingAgreement?.unit || '';
    const propId = reviewingRenewal?.propertyId || reviewingAgreement?.propertyId;
    if (!targetUnit) return;

    try {
      await respondToLeaseRenewal(targetUnit, 'rejected', declineReasonText, propId);
      setShowDeclineModal(false);
      setShowRenewalReviewModal(false);
      setDeclineReasonText('');
      setReviewingAgreement(null);
      setReviewingRenewal(null);
      Alert.alert(
        'Renewal Declined',
        `You have declined the renewal offer for Unit ${targetUnit}. Your existing lease end date remains in effect.`
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to decline renewal offer.');
    }
  };

  const handleConfirmSettlementResponse = async () => {
    if (!activeMoveOut) return;
    setSettlementInputError('');
    if (settlementDecision === 'contest' && !settlementContestReason.trim()) {
      setSettlementInputError('Please provide notes explaining your deduction dispute.');
      Alert.alert('Reason Required', 'Please provide notes explaining your deduction dispute.');
      return;
    }
    if (settlementDecision === 'accept') {
      if (settlementPayoutRail === 'upi' && !settlementUpiId.trim()) {
        setSettlementInputError('Please enter your UPI handle (e.g. resident@okhdfcbank).');
        Alert.alert('UPI Required', 'Please enter your UPI handle (e.g. resident@okhdfcbank).');
        return;
      }
      if (settlementPayoutRail === 'bank' && (!settlementBankAccNumber.trim() || !settlementBankIfsc.trim())) {
        setSettlementInputError('Please enter your Account Number and IFSC Code.');
        Alert.alert('Bank Details Required', 'Please enter your Account Number and IFSC Code.');
        return;
      }
    }

    setIsSubmittingSettlementReview(true);
    try {
      const payoutDetails = {
        method: settlementPayoutRail === 'bank' ? ('bank_in' as const) : settlementPayoutRail,
        accountHolderName: settlementAccountHolder,
        upiId: settlementPayoutRail === 'upi' ? settlementUpiId.trim() : undefined,
        accountNumber: settlementPayoutRail === 'bank' ? settlementBankAccNumber.trim() : undefined,
        ifscCode: settlementPayoutRail === 'bank' ? settlementBankIfsc.trim().toUpperCase() : undefined,
        paypalEmail: settlementPayoutRail === 'paypal' ? settlementPaypalEmail.trim() : undefined,
      };

      await respondToDepositSettlement(
        activeMoveOut.id,
        settlementDecision === 'accept' ? 'approved' : 'rejected',
        settlementDecision === 'contest' ? settlementContestReason.trim() : undefined,
        payoutDetails
      );

      setShowSettlementReviewModal(false);
      Alert.alert(
        settlementDecision === 'accept' ? 'Settlement Approved ✓' : 'Deductions Contested',
        settlementDecision === 'accept'
          ? `Payout destination (${settlementPayoutRail.toUpperCase()}) registered. Your landlord has been notified to disburse your refund.`
          : 'Your dispute notes have been submitted to your landlord for recalculation and review.'
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to submit settlement response.');
    } finally {
      setIsSubmittingSettlementReview(false);
    }
  };

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
      `Have you verified that the refund of ${refundAmt} has reached your account?\n\nConfirming receipt will formally conclude your tenancy, release this residence, and clear any outstanding dues for Unit ${activeMoveOut.unit}.`,
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: '✓ Yes, Confirm Receipt',
          onPress: async () => {
            setIsConfirmingReceipt(true);
            try {
              await confirmRefundReceipt(settleId);
              setShowSettlementReviewModal(false);
              Alert.alert(
                'Tenancy Concluded ✓',
                `Deposit refund receipt confirmed for Unit ${activeMoveOut.unit}. Your tenancy is fully settled and active records cleared.`
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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}

      {/* Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="file-text" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Agreements</Text>
          </View>
        </View>
        {activeMoveOut ? (
          isDisbursed && hasConfirmedReceipt ? (
            <View style={[styles.noticeHeaderBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}>
              <Feather name="check-circle" size={12} color="#16A34A" style={{ marginRight: 4 }} />
              <Text style={[styles.noticeHeaderBtnText, { color: '#15803D' }]}>
                Tenancy Concluded ✓
              </Text>
            </View>
          ) : (
            <View style={[styles.noticeHeaderBtn, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }]}>
              <Feather name="clock" size={12} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={[styles.noticeHeaderBtnText, { color: '#B45309' }]}>
                Vacating (Step {currentMoveOutStep}/5)
              </Text>
            </View>
          )
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Multi-Property Switcher for Tenants */}
        <TenantMultiPropertySwitcher
          myUnits={myUnits}
          selectedUnitId={selectedTenantUnitId}
          onSelectUnit={(unitId) => setSelectedTenantUnitId(unitId)}
        />

        {/* Contextual Top Lease Reminders & Expiry Countdowns (1-to-1 Web Parity) */}
        {contextualLeaseReminders.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            {contextualLeaseReminders.map((reminder) => {
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
                      name={reminder.icon === 'alert-triangle' ? 'alert-triangle' : reminder.icon === 'calendar' ? 'calendar' : 'file-text'}
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
                        if (reminder.title.toLowerCase().includes('renewal') || reminder.id.includes('renewal')) {
                          setSubTab('renewal');
                        } else {
                          setSubTab('owner');
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                        {reminder.actionLabel || 'View Details'}
                      </Text>
                      <Feather name="arrow-right" size={12} color="#FFFFFF" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 2 Sub-Tabs Matching Web Exactly: Owner Agreements vs Renewals */}
        <TourTarget id="tenant-lease-subtabs">
        <View style={styles.subTabCapsule}>
          <TouchableOpacity
            style={[styles.subTabBtn, subTab === 'owner' && styles.subTabBtnActive]}
            onPress={() => setSubTab('owner')}
            activeOpacity={0.8}
          >
            <Feather
              name="file-text"
              size={14}
              color={subTab === 'owner' ? '#0F172A' : '#64748B'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.subTabText, subTab === 'owner' && styles.subTabTextActive]}>
              Agreements
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabBtn, subTab === 'renewal' && styles.subTabBtnActive]}
            onPress={() => setSubTab('renewal')}
            activeOpacity={0.8}
          >
            <Feather
              name="refresh-cw"
              size={14}
              color={subTab === 'renewal' ? '#0F172A' : '#64748B'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.subTabText, subTab === 'renewal' && styles.subTabTextActive]}>
              Renewals
            </Text>
          </TouchableOpacity>
        </View>

        {/* =============================================================== */}
        </TourTarget>
        {/* =============================================================== */}
        {/* SUBTAB 1: OWNER AGREEMENTS & MOVE-OUT PIPELINE                  */}
        {/* =============================================================== */}
        {subTab === 'owner' && (
          <>
            {/* Action Banners for Tenancy Execution Lifecycle */}
            {primaryAgreement && (
              primaryAgreement.status === 'awaiting_tenant_signature' ||
              primaryAgreement.status === 'awaiting_tenant_upload' ||
              primaryAgreement.status === 'rejected' ||
              primaryAgreement.status === 'draft' ||
              (!primaryAgreement.signedDocumentUrl &&
                primaryAgreement.status !== 'pending_approval' &&
                primaryAgreement.status !== 'pending_deposit' &&
                primaryAgreement.status !== 'active' &&
                primaryAgreement.status !== 'terminated' &&
                primaryAgreement.status !== 'expired' &&
                primaryAgreement.depositStatus !== 'paid')
            ) ? (
              <View style={[styles.actionBanner, primaryAgreement.rejectionReason && { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}>
                <View style={styles.actionBannerTop}>
                  <View style={[styles.actionBannerIconBox, primaryAgreement.rejectionReason && { backgroundColor: '#FEE2E2' }]}>
                    <Feather name={primaryAgreement.rejectionReason ? "alert-triangle" : "clock"} size={16} color={primaryAgreement.rejectionReason ? "#DC2626" : "#D97706"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionBannerTitle, primaryAgreement.rejectionReason && { color: '#B91C1C' }]}>
                      {primaryAgreement.rejectionReason ? 'Document Rejected' : 'Signature Required'}
                    </Text>
                    {primaryAgreement.rejectionReason ? (
                      <View style={{ marginVertical: 6, padding: 8, backgroundColor: '#FFFFFF', borderRadius: 6, borderWidth: 1, borderColor: '#FECACA' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>Feedback / Reason:</Text>
                        <Text style={{ fontSize: 12, color: '#7F1D1D', marginTop: 2 }}>{primaryAgreement.rejectionReason}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.actionBannerSub, primaryAgreement.rejectionReason && { color: '#7F1D1D' }]}>
                      {primaryAgreement.rejectionReason
                        ? 'Review feedback above, re-sign, and re-upload.'
                        : `Download, sign in ink, and upload.`}
                    </Text>
                  </View>
                </View>
                <View style={styles.actionBannerBtns}>
                  <TouchableOpacity
                    style={styles.bannerBtnSecondary}
                    onPress={() => handleDownloadDraft(primaryAgreement)}
                    activeOpacity={0.8}
                  >
                    <Feather name="download" size={13} color="#0F172A" style={{ marginRight: 4 }} />
                    <Text style={styles.bannerBtnSecondaryText}>Download</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bannerBtnPrimary, primaryAgreement.rejectionReason && { backgroundColor: '#DC2626' }]}
                    onPress={() => handleOpenUploadModal(primaryAgreement)}
                    activeOpacity={0.85}
                  >
                    <Feather name="upload" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.bannerBtnPrimaryText}>
                      {primaryAgreement.rejectionReason ? 'Re-upload' : 'Upload'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (primaryAgreement?.status === 'pending_approval' || (primaryAgreement?.status as any) === 'awaiting_owner_signature') ? (
              <View style={[styles.actionBanner, { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }]}>
                <View style={styles.actionBannerTop}>
                  <View style={[styles.actionBannerIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <Feather name="clock" size={16} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionBannerTitle, { color: '#92400E' }]}>Awaiting Approval</Text>
                    <Text style={[styles.actionBannerSub, { color: '#78350F' }]}>
                      Signed lease uploaded. Awaiting owner review.
                    </Text>
                  </View>
                </View>
              </View>
            ) : primaryAgreement?.status === 'pending_deposit' ? (
              <View style={[styles.actionBanner, { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' }]}>
                <View style={styles.actionBannerTop}>
                  <View style={[styles.actionBannerIconBox, { backgroundColor: '#DBEAFE' }]}>
                    <Feather name="credit-card" size={16} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionBannerTitle, { color: '#1E40AF' }]}>Deposit Due</Text>
                    <Text style={[styles.actionBannerSub, { color: '#1E3A8A' }]}>
                      Lease approved. Pay deposit to move in.
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Filter Pills: All, Active, Pending, Concluded */}
            <View style={styles.filterPillsRow}>
              {(['all', 'active', 'pending', 'concluded'] as const).map((filterKey) => (
                <TouchableOpacity
                  key={filterKey}
                  style={[
                    styles.filterPill,
                    agreementFilter === filterKey && styles.filterPillActive,
                  ]}
                  onPress={() => setAgreementFilter(filterKey)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      agreementFilter === filterKey && styles.filterPillTextActive,
                    ]}
                  >
                    {filterKey.charAt(0).toUpperCase() + filterKey.slice(1)} ({agreementCounts[filterKey]})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Agreements List */}
            {filteredAgreements.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="file-text" size={32} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No Agreements Found</Text>
                <Text style={styles.emptySub}>No lease agreements matching the selected filter criteria.</Text>
              </View>
            ) : (
              filteredAgreements.map((ag) => (
                <View key={ag.id} style={styles.agreementCard}>
                  <View style={styles.agreementHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.agreementTitle}>
                        {ag.propertyName || 'Property'} • Unit {ag.unit}
                      </Text>
                      <Text style={styles.agreementIdText}>Agreement #{ag.id}</Text>
                    </View>
                    {(() => {
                      const isVacated =
                        ag.status === 'terminated' ||
                        ag.status === 'expired' ||
                        (state.moveOuts || []).some(
                          (m) =>
                            (!m.propertyId || !ag.propertyId || m.propertyId === ag.propertyId) &&
                            (m.agreementId === ag.id || (!m.agreementId && (m.unit === ag.unit || m.unit === (ag as any).unitId))) &&
                            (m.status === 'refund_completed' || m.status === 'settled' || Boolean(m.tenantConfirmedReceipt))
                        );
                      return renderStatusBadge(ag, isVacated);
                    })()}
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.specGrid}>
                    <View style={styles.specCell}>
                      <Text style={styles.specLabel}>Monthly Rent</Text>
                      <Text style={styles.specValue}>{format(ag.rent, ag.currency || activeCurrency)}/mo</Text>
                    </View>
                    <View style={styles.specCell}>
                      <Text style={styles.specLabel}>Security Deposit</Text>
                      <Text style={styles.specValue}>{format(ag.deposit, ag.currency || activeCurrency)}</Text>
                    </View>
                    <View style={styles.specCell}>
                      <Text style={styles.specLabel}>Term Start</Text>
                      <Text style={styles.specValue}>{ag.start}</Text>
                    </View>
                    <View style={styles.specCell}>
                      <Text style={styles.specLabel}>Term Expiry</Text>
                      <Text style={styles.specValue}>{ag.end}</Text>
                    </View>
                    <View style={styles.specCell}>
                      <Text style={styles.specLabel}>Lock-in Period</Text>
                      <Text style={styles.specValue}>{ag.lockInMonths || 6} Months</Text>
                    </View>
                    <View style={styles.specCell}>
                      <Text style={styles.specLabel}>Notice Period</Text>
                      <Text style={styles.specValue}>{ag.noticePeriodDays || 30} Days</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Legal Execution & Signature Audit Trail */}
                  <View style={styles.auditTrailRow}>
                    <View style={styles.shieldIconBox}>
                      <Feather name="shield" size={15} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.auditTitle}>
                        {ag.status === 'active' ? 'Registered Lease' : 'Lease Document'}
                      </Text>
                      <Text style={styles.auditSub}>
                        Signatory: {ag.tenant || tenantName} • Landlord: {ag.ownerName || 'Property Landlord'}
                      </Text>
                    </View>
                    <View style={styles.verifiedTag}>
                      <Text style={styles.verifiedTagText}>
                        {ag.status === 'active' ? 'REGISTERED' : 'OFFICIAL'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Row */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.cardActionBtnSecondary}
                      onPress={() => {
                        const isSigned = !!(ag.signedDocumentUrl || (ag.status !== 'awaiting_tenant_upload' && ag.status !== 'awaiting_tenant_signature' && ag.signedDocumentName));
                        const viewFileName = (isSigned ? ag.signedDocumentName : null) || ag.initialAgreementName || ag.documentUrl || `Tenancy_Agreement_${ag.unit}.pdf`;
                        const viewFileUrl = (isSigned ? ag.signedDocumentUrl : null) || ag.initialAgreementUrl || ag.documentUrl;
                        setPreviewDoc({
                          fileName: viewFileName,
                          fileUrl: viewFileUrl,
                          title: isSigned ? 'Signed Tenancy Agreement' : 'Formal Tenancy Draft',
                          docType: isSigned ? 'Resident Ink-Signed Agreement' : 'Official Tenancy Draft',
                          meta: {
                            agreementId: ag.id,
                            tenantName: ag.tenant || tenantName,
                            unit: ag.unit,
                            propertyName: ag.propertyName,
                            amount: ag.rent ? format(ag.rent, ag.currency || activeCurrency) : undefined,
                            date: ag.start,
                          },
                        });
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="eye" size={13} color="#0F172A" style={{ marginRight: 5 }} />
                      <Text style={styles.cardActionBtnSecondaryText}>
                        {ag.signedDocumentUrl || ag.status === 'active' || ag.status === 'pending_approval' ? 'View Document' : 'View Draft'}
                      </Text>
                    </TouchableOpacity>

                    {ag.status === 'awaiting_tenant_signature' ||
                      ag.status === 'awaiting_tenant_upload' ||
                      ag.status === 'draft' ? (
                      <TouchableOpacity
                        style={styles.cardActionBtnPrimary}
                        onPress={() => handleOpenUploadModal(ag)}
                        activeOpacity={0.85}
                      >
                        <Feather name="upload" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                        <Text style={styles.cardActionBtnPrimaryText}>Upload</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.cardActionBtnSecondary}
                        onPress={() => handleDownloadDraft(ag)}
                        activeOpacity={0.8}
                      >
                        <Feather name="download" size={13} color="#0F172A" style={{ marginRight: 5 }} />
                        <Text style={styles.cardActionBtnSecondaryText}>Download</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}

            {/* ========================================================= */}
            {/* 5-STAGE MOVE-OUT PIPELINE TRACKER (100% Web Parity)       */}
            {/* ========================================================= */}
            {activeMoveOut ? (
              <View style={[styles.moveOutCard, { overflow: 'hidden' }]}>
                <View style={[styles.moveOutCardHeader, { gap: 8 }]}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Text style={styles.moveOutCardTitle}>Move-Out Pipeline</Text>
                    <Text style={styles.moveOutCardSub} numberOfLines={2}>
                      Active Vacate for Unit {activeMoveOut.unit}
                    </Text>
                  </View>
                  <View style={[styles.stageCapsule, { flexShrink: 0 }]}>
                    <Text style={styles.stageCapsuleText}>STAGE {currentMoveOutStep}/5</Text>
                  </View>
                </View>

                {/* 5 Progress Segments */}
                <View style={styles.stagePillsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <View
                      key={s}
                      style={[
                        styles.stagePill,
                        s <= currentMoveOutStep && styles.stagePillCompleted,
                      ]}
                    />
                  ))}
                </View>

                {/* Stage Step Descriptions */}
                <View style={styles.stageStepInfo}>
                  <View style={styles.stageInfoLeft}>
                    <Feather
                      name={currentMoveOutStep === 5 ? 'check-circle' : 'clock'}
                      size={16}
                      color={currentMoveOutStep === 5 ? '#10B981' : '#D97706'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.stageInfoTitle}>
                      {currentMoveOutStep === 1 && 'Stage 1: Notice Received'}
                      {currentMoveOutStep === 2 && 'Stage 2: Inspection Scheduled'}
                      {currentMoveOutStep === 3 && 'Stage 3: Inspection Verified'}
                      {currentMoveOutStep === 4 && 'Stage 4: Refund Scheduled'}
                      {currentMoveOutStep === 5 && 'Stage 5: Refund Completed'}
                    </Text>
                  </View>
                  <Text style={styles.stageDateText}>
                    Target Move-Out: {activeMoveOut.moveOutDate || '30 Days Notice'}
                  </Text>
                </View>

                {/* Interactive Checklist & Notice Controls */}
                <View style={{ marginTop: 12 }}>
                  {currentMoveOutStep === 1 && (
                    <View style={styles.moveOutActiveNoticeBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Feather name="check-circle" size={14} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.moveOutActiveNoticeTitle}>
                          Move-Out Notice Active • Effective {activeMoveOut.moveOutDate}
                        </Text>
                      </View>
                      <Text style={styles.moveOutActiveNoticeSub}>
                        Notice received by landlord. Awaiting walkthrough inspection schedule.
                      </Text>
                      <TouchableOpacity
                        style={styles.fullWidthChecklistBtn}
                        onPress={() => setShowChecklistModal(true)}
                        activeOpacity={0.8}
                      >
                        <Feather name="list" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                        <Text style={styles.fullWidthChecklistBtnText}>View Move-Out Prep Checklist</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {currentMoveOutStep === 2 && (
                    <View style={styles.moveOutActiveNoticeBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Feather name="calendar" size={14} color="#C59A45" style={{ marginRight: 6 }} />
                        <Text style={styles.moveOutActiveNoticeTitle}>
                          Walkthrough Scheduled: {activeMoveOut.inspectionDate || 'Upcoming'}
                        </Text>
                      </View>
                      <Text style={styles.moveOutActiveNoticeSub}>
                        Please ensure premises are cleared for walkthrough. Target refund: {activeMoveOut.refundDate || 'Within 10 days'}.
                      </Text>
                      <TouchableOpacity
                        style={styles.fullWidthChecklistBtn}
                        onPress={() => setShowChecklistModal(true)}
                        activeOpacity={0.8}
                      >
                        <Feather name="list" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                        <Text style={styles.fullWidthChecklistBtnText}>Inspection Checklist & Requirements</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {isDisbursed ? (
                    !hasConfirmedReceipt ? (
                      <View style={[styles.moveOutActiveNoticeBox, { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Feather name="zap" size={15} color="#D97706" style={{ marginRight: 6 }} />
                          <Text style={[styles.moveOutActiveNoticeTitle, { color: '#B45309' }]}>
                            ⚡ Refund Disbursed — Action Required: Confirm Receipt
                          </Text>
                        </View>
                        <Text style={[styles.moveOutActiveNoticeSub, { color: '#92400E' }]}>
                          Your landlord has disbursed {format(activeSettlement?.finalRefundAmount ?? activeMoveOut.netRefundAmount, activeMoveOut.currency || activeCurrency)} via {(activeSettlement?.disbursementMethod || activeMoveOut.payoutMethod || 'Direct Transfer').toUpperCase()}. Please confirm receipt to conclude your tenancy.
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                          <TouchableOpacity
                            style={[styles.reviewSettlementPrimaryBtn, { backgroundColor: '#059669' }]}
                            onPress={handleConfirmRefundReceipt}
                            activeOpacity={0.85}
                            disabled={isConfirmingReceipt}
                          >
                            <Feather name="check-circle" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                            <Text style={styles.reviewSettlementPrimaryBtnText} numberOfLines={1}>
                              {isConfirmingReceipt ? 'Confirming...' : '✓ Confirm Refund Received'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.reviewSettlementSecondaryBtn}
                            onPress={() => setShowSettlementReviewModal(true)}
                            activeOpacity={0.8}
                          >
                            <Feather name="file-text" size={14} color="#0F172A" style={{ marginRight: 5 }} />
                            <Text style={styles.reviewSettlementSecondaryBtnText} numberOfLines={1}>
                              Review Settlement
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={[styles.moveOutActiveNoticeBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Feather name="check-circle" size={15} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={[styles.moveOutActiveNoticeTitle, { color: '#065F46' }]}>
                            ✓ Tenancy Concluded & Refund Received
                          </Text>
                        </View>
                        <Text style={[styles.moveOutActiveNoticeSub, { color: '#047857' }]}>
                          Deposit refund receipt confirmed. All lease obligations have been fulfilled and Unit {activeMoveOut.unit} vacated.
                        </Text>
                        <TouchableOpacity
                          style={styles.fullWidthChecklistBtn}
                          onPress={() => setShowSettlementReviewModal(true)}
                          activeOpacity={0.8}
                        >
                          <Feather name="file-text" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                          <Text style={styles.fullWidthChecklistBtnText}>View Concluded Settlement Record</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  ) : (currentMoveOutStep === 3 || currentMoveOutStep === 4) ? (
                    <View
                      style={[
                        styles.moveOutActiveNoticeBox,
                        isSettlementAccepted
                          ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }
                          : { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Feather
                          name={isSettlementAccepted ? 'check-circle' : 'alert-circle'}
                          size={15}
                          color={isSettlementAccepted ? '#059669' : '#D97706'}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.moveOutActiveNoticeTitle,
                            { color: isSettlementAccepted ? '#065F46' : '#B45309' },
                          ]}
                        >
                          {isSettlementAccepted
                            ? 'Settlement Accepted — Pending Payout'
                            : 'Inspection Finalized — Review Settlement'}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.moveOutActiveNoticeSub,
                          { color: isSettlementAccepted ? '#047857' : '#92400E' },
                        ]}
                      >
                        {isSettlementAccepted
                          ? `You accepted the settlement. Landlord payout of ${format(activeMoveOut.netRefundAmount, activeMoveOut.currency || activeCurrency)} (${(activeMoveOut.chosenPayoutDetails?.method || activeSettlement?.chosenPayoutDetails?.method || settlementPayoutRail).toUpperCase()}) is in progress.`
                          : `Net Refundable Deposit: ${format(activeMoveOut.netRefundAmount, activeMoveOut.currency || activeCurrency)}. Review itemized deductions and claim your refund.`}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={[
                            styles.reviewSettlementPrimaryBtn,
                            isSettlementAccepted && { backgroundColor: '#059669' },
                          ]}
                          onPress={() => {
                            setSettlementInputError('');
                            setShowSettlementReviewModal(true);
                          }}
                          activeOpacity={0.85}
                        >
                          <Feather name="check-circle" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.reviewSettlementPrimaryBtnText} numberOfLines={1}>
                            {isSettlementAccepted ? 'View Claim' : 'Claim Refund'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.reviewSettlementSecondaryBtn}
                          onPress={() => setShowChecklistModal(true)}
                          activeOpacity={0.8}
                        >
                          <Feather name="file-text" size={14} color="#0F172A" style={{ marginRight: 5 }} />
                          <Text style={styles.reviewSettlementSecondaryBtnText} numberOfLines={1}>
                            Report
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : isTenancyActive ? (
              <View style={[styles.moveOutCard, { overflow: 'hidden', paddingVertical: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.moveOutCardTitle}>Notice to Vacate</Text>
                    <Text style={styles.moveOutCardSub}>
                      {/* Planning to move out? Submit formal notice to initiate your walkthrough inspection and deposit settlement. */}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.giveNoticeBtn}
                    onPress={() => setShowNoticeModal(true)}
                    activeOpacity={0.85}
                  >
                    <Feather name="edit-3" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                    <Text style={styles.giveNoticeBtnText}>Give Notice</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        )}

        {/* =============================================================== */}
        {/* SUBTAB 2: LEASE RENEWAL HUB                                     */}
        {/* =============================================================== */}
        {subTab === 'renewal' && (
          <>
            {eligibleRenewalAgreements.length === 0 ? (
              <View style={[styles.emptyCard, { marginTop: 12 }]}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Feather name="repeat" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                </View>
                <Text style={styles.emptyTitle}>No Active Lease to Extend</Text>
                <Text style={styles.emptySub}>
                  Tenancy renewal requests and extension proposals are only available once you have an active, signed lease agreement with your property owner.
                </Text>
              </View>
            ) : (
              <>
                {/* Request Renewal Card Banner */}
                <View style={styles.renewalHeroCard}>
                  <View style={styles.renewalHeroIconBox}>
                    <Feather name="repeat" size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.renewalHeroTitle}>Extend Your Tenancy</Text>
                    <Text style={styles.renewalHeroSub}>
                      {/* Request a 12-month lease renewal directly with your landlord with transparent rent escalation and terms. */}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.requestRenewalBtn}
                    onPress={() => {
                      setShowRenewalRequestModal(true);
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="plus" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.requestRenewalBtnText}>Request Renewal</Text>
                  </TouchableOpacity>
                </View>

                {/* List of Renewal Offers & Proposals */}
                <Text style={styles.sectionHeading}>Renewal Offers & Pipeline</Text>

                {eligibleRenewalAgreements.map((ag) => {
                  const matchingRenewal = (state.renewals || []).find(
                    (r) =>
                      (r.agreementId && r.agreementId === ag.id) ||
                      ((!r.propertyId || !ag.propertyId || r.propertyId === ag.propertyId) &&
                        Boolean(r.unit && r.unit.toLowerCase() === ag.unit.toLowerCase()))
                  );

                  const isOffered = matchingRenewal?.status === 'renewal_offered';
                  const isSignedByTenant = matchingRenewal?.status === 'signed_by_tenant';
                  const isAccepted = matchingRenewal?.status === 'accepted';
                  const isDeclined = matchingRenewal?.status === 'rejected';
                  const isRequested = matchingRenewal?.status === 'renewal_requested';

                  const effectiveRent = ag.rent || activeUnit?.rent || 0;
                  const proposedRent = matchingRenewal?.proposedRent || (effectiveRent > 0 ? Math.round(effectiveRent * 1.08) : 0);
                  const percentageIncrease = matchingRenewal?.percentageIncrease || 8;
                  const newStart = matchingRenewal?.newLeaseStart || ag.end;
                  const newEnd = matchingRenewal?.newLeaseEnd || '12 Months';

                  return (
                    <View key={ag.id} style={styles.agreementCard}>
                      <View style={styles.agreementHeader}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.agreementTitle} numberOfLines={1}>
                            Unit {ag.unit}
                          </Text>
                          {ag.propertyName ? (
                            <Text style={styles.agreementSubProperty} numberOfLines={1}>
                              {ag.propertyName}
                            </Text>
                          ) : null}
                          <Text style={styles.agreementIdText}>Current Rent: {format(ag.rent, ag.currency || activeCurrency)}/mo</Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              alignSelf: 'flex-start',
                              backgroundColor:
                                isAccepted
                                  ? '#DCFCE7'
                                  : isSignedByTenant || isRequested
                                    ? '#FEF3C7'
                                    : isOffered
                                      ? '#DBEAFE'
                                      : isDeclined
                                        ? '#FEE2E2'
                                        : '#F1F5F9',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              {
                                color:
                                  isAccepted
                                    ? '#15803D'
                                    : isSignedByTenant || isRequested
                                      ? '#B45309'
                                      : isOffered
                                        ? '#1D4ED8'
                                        : isDeclined
                                          ? '#DC2626'
                                          : '#64748B',
                              },
                            ]}
                          >
                            {isAccepted
                              ? 'Renewed'
                              : isSignedByTenant
                                ? 'Signed'
                                : isOffered
                                  ? `Offer (+${percentageIncrease}%)`
                                  : isDeclined
                                    ? 'Declined'
                                    : isRequested
                                      ? 'Awaiting Offer'
                                      : 'Active'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.divider} />

                      {isOffered ? (
                        <>
                          <View style={styles.specGrid}>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Proposed Rent</Text>
                              <Text style={[styles.specValue, { color: '#059669', fontWeight: '700' }]}>
                                {format(proposedRent, matchingRenewal?.currency || ag.currency || activeCurrency)}/mo
                              </Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Commencement</Text>
                              <Text style={styles.specValue}>{newStart}</Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Extension Expiry</Text>
                              <Text style={styles.specValue}>{newEnd}</Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Escalation</Text>
                              <Text style={styles.specValue}>+{percentageIncrease}%</Text>
                            </View>
                          </View>

                          {matchingRenewal?.ownerNotes ? (
                            <View style={styles.renewalNoteBox}>
                              <Feather name="message-square" size={13} color="#64748B" style={{ marginRight: 6 }} />
                              <Text style={styles.renewalNoteText}>Landlord: "{matchingRenewal.ownerNotes}"</Text>
                            </View>
                          ) : null}

                          <View style={styles.cardActionsRow}>
                            <TouchableOpacity
                              style={styles.cardActionBtnPrimary}
                              onPress={() => {
                                setReviewingAgreement(ag);
                                setReviewingRenewal(matchingRenewal || null);
                                setTenantRenewalSignedFile(null);
                                setTenantRenewalSignedFileName('');
                                setTenantRenewalSignedFileSize(null);
                                setRenewalSignedAttached(false);
                                setShowRenewalReviewModal(true);
                              }}
                              activeOpacity={0.85}
                            >
                              <Feather name="file-text" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                              <Text style={styles.cardActionBtnPrimaryText}>Review & Sign</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : isSignedByTenant ? (
                        <View style={{ paddingVertical: 8 }}>
                          <View style={styles.specGrid}>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Proposed Rent</Text>
                              <Text style={[styles.specValue, { color: '#059669', fontWeight: '700' }]}>
                                {format(proposedRent, matchingRenewal?.currency || ag.currency || activeCurrency)}/mo
                              </Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Submitted On</Text>
                              <Text style={styles.specValue}>{matchingRenewal?.tenantSignedAt ? matchingRenewal.tenantSignedAt.split('T')[0] : 'Recently'}</Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Extended Through</Text>
                              <Text style={styles.specValue}>{newEnd}</Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Status</Text>
                              <Text style={[styles.specValue, { color: '#D97706', fontWeight: '600' }]}>In Review</Text>
                            </View>
                          </View>
                          <View style={[styles.noticeInfoBox, { marginVertical: 8 }]}>
                            <Feather name="clock" size={14} color="#D97706" style={{ marginRight: 6, marginTop: 1 }} />
                            <Text style={styles.noticeInfoText}>
                              Your ink-signed renewal contract ({matchingRenewal?.tenantSignedFileName || 'Signed_Copy.pdf'}) was submitted. Your landlord is reviewing for final approval.
                            </Text>
                          </View>
                          {matchingRenewal?.tenantSignedFileUrl && (
                            <TouchableOpacity
                              style={styles.cardActionBtnSecondary}
                              onPress={() => {
                                setPreviewDoc({
                                  fileName: matchingRenewal.tenantSignedFileName || `Signed_Renewal_${ag.unit}.pdf`,
                                  fileUrl: matchingRenewal.tenantSignedFileUrl || undefined,
                                  title: `Tenant Signed Renewal — Unit ${ag.unit}`,
                                  docType: 'Signed Lease Addendum',
                                  meta: {
                                    tenantName: user.displayName || 'Resident',
                                    unit: ag.unit,
                                    propertyName: ag.propertyName,
                                    date: matchingRenewal?.tenantSignedAt || new Date().toISOString(),
                                    status: 'signed',
                                  },
                                });
                              }}
                              activeOpacity={0.8}
                            >
                              <Feather name="eye" size={13} color="#0F172A" style={{ marginRight: 5 }} />
                              <Text style={styles.cardActionBtnSecondaryText}>View Signed Copy</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : isAccepted ? (
                        <View style={{ paddingVertical: 8 }}>
                          <View style={styles.specGrid}>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Contracted Rent</Text>
                              <Text style={[styles.specValue, { color: '#059669', fontWeight: '700' }]}>
                                {format(matchingRenewal?.proposedRent || ag.rent, matchingRenewal?.currency || ag.currency || activeCurrency)}/mo
                              </Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Active From</Text>
                              <Text style={styles.specValue}>{matchingRenewal?.newLeaseStart || ag.start}</Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Extended To</Text>
                              <Text style={styles.specValue}>{matchingRenewal?.newLeaseEnd || ag.end}</Text>
                            </View>
                            <View style={styles.specCell}>
                              <Text style={styles.specLabel}>Term Status</Text>
                              <Text style={[styles.specValue, { color: '#059669', fontWeight: '700' }]}>Active ✓</Text>
                            </View>
                          </View>
                          <View style={[styles.noticeInfoBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', marginVertical: 8 }]}>
                            <Feather name="check-circle" size={14} color="#059669" style={{ marginRight: 6, marginTop: 1 }} />
                            <Text style={[styles.noticeInfoText, { color: '#065F46' }]}>
                              Lease renewal successfully activated through {matchingRenewal?.newLeaseEnd || ag.end}.
                            </Text>
                          </View>
                        </View>
                      ) : isRequested ? (
                        <View style={{ paddingVertical: 6 }}>
                          <View style={[styles.noticeInfoBox, { marginVertical: 4 }]}>
                            <Feather name="clock" size={14} color="#D97706" style={{ marginRight: 6, marginTop: 1 }} />
                            <Text style={styles.noticeInfoText}>
                              Renewal requested{matchingRenewal?.requestedAt ? ` on ${matchingRenewal.requestedAt.split('T')[0]}` : ''}. Landlord will send the offer draft soon.
                            </Text>
                          </View>
                        </View>
                      ) : isDeclined ? (
                        <View style={{ paddingVertical: 10 }}>
                          <Text style={{ fontSize: 12.5, color: '#DC2626', marginBottom: 8 }}>
                            The previous renewal offer was declined.{matchingRenewal?.tenantNotes ? ` Reason: "${matchingRenewal.tenantNotes}".` : ''} Existing lease concludes on {ag.end}.
                          </Text>
                          <TouchableOpacity
                            style={styles.cardActionBtnSecondary}
                            onPress={() => {
                              setReviewingAgreement(ag);
                              setShowRenewalRequestModal(true);
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather name="repeat" size={13} color="#0F172A" style={{ marginRight: 5 }} />
                            <Text style={styles.cardActionBtnSecondaryText}>Request Renewal</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 10 }}>
                            Current lease expires on {ag.end}. You can initiate renewal requests at any time.
                          </Text>
                          <TouchableOpacity
                            style={styles.cardActionBtnSecondary}
                            onPress={() => {
                              setReviewingAgreement(ag);
                              setShowRenewalRequestModal(true);
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather name="send" size={13} color="#0F172A" style={{ marginRight: 5 }} />
                            <Text style={styles.cardActionBtnSecondaryText}>Request Extension</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* =============================================================== */}
      {/* MODAL 1: PHYSICAL INK-SIGNATURE UPLOAD                          */}
      {/* =============================================================== */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Upload Signed Agreement</Text>
                <Text style={styles.modalSub}>
                  Unit {targetAgreementForUpload?.unit} • Physical Ink Signature Upload
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 28 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalInputLabel}>Scanned Agreement File</Text>
              <View style={styles.uploadFileBox}>
                <Feather name="file-text" size={32} color="#059669" />
                <Text style={styles.uploadFileName}>{uploadedFileName || 'Signed_Agreement_Unit.pdf'}</Text>
                <Text style={styles.uploadFileSize}>4.2 MB • Scanned Document Verified</Text>
                <TouchableOpacity
                  style={styles.chooseFileBtn}
                  onPress={async () => {
                    try {
                      const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                      if (picked) {
                        setUploadedFileName(picked.name);
                        setUploadedFileData(picked.base64 || picked.uri);
                        Alert.alert('Signed Document Attached ✓', `${picked.name} attached.`);
                      }
                    } catch (err: any) {
                      Alert.alert('Selection Error', err?.message || 'Could not attach file.');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="folder" size={13} color="#0F172A" style={{ marginRight: 5 }} />
                  <Text style={styles.chooseFileBtnText}>Choose Scanned File</Text>
                </TouchableOpacity>
              </View>

              {/* Landlord-Required Identity Verification Documents */}
              {(() => {
                if (!targetAgreementForUpload?.requireTenantId) return null;
                const requiredIds: MobileRequiredIdItem[] = targetAgreementForUpload.requiredIdList && targetAgreementForUpload.requiredIdList.length > 0
                  ? targetAgreementForUpload.requiredIdList
                  : (targetAgreementForUpload.requiredIdTypes && targetAgreementForUpload.requiredIdTypes.length > 0
                    ? targetAgreementForUpload.requiredIdTypes.map((t, i) => ({ id: `req_${i}`, name: t }))
                    : (targetAgreementForUpload.requiredIdType
                      ? [{ id: 'req_0', name: targetAgreementForUpload.requiredIdType }]
                      : []));
                if (requiredIds.length === 0) return null;
                const uploadedCount = requiredIds.filter((r) => uploadedIdsState[r.id]).length;
                return (
                  <View
                    style={{
                      marginTop: 14,
                      padding: 12,
                      backgroundColor: '#FFFBEB',
                      borderWidth: 1.5,
                      borderColor: '#F59E0B',
                      borderRadius: 10,
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name="shield" size={16} color="#D97706" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>
                          Documents Required *
                        </Text>
                      </View>
                      <View style={{ backgroundColor: uploadedCount === requiredIds.length ? '#D1FAE5' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: uploadedCount === requiredIds.length ? '#065F46' : '#92400E' }}>
                          {uploadedCount}/{requiredIds.length}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#78350F', marginBottom: 10, lineHeight: 16 }}>
                      The landlord has requested the following ID documents. All are mandatory.
                    </Text>
                    <View style={{ gap: 10 }}>
                      {requiredIds.map((reqId, idx) => {
                        const uploaded = uploadedIdsState[reqId.id];
                        return (
                          <View
                            key={reqId.id}
                            style={{
                              backgroundColor: uploaded ? '#ECFDF5' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: uploaded ? '#A7F3D0' : '#E5E7EB',
                              borderRadius: 8,
                              padding: 10,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 }}>
                              {idx + 1}. {reqId.name}
                            </Text>
                            {uploaded ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Feather name="check-circle" size={14} color="#059669" />
                                <Text style={{ fontSize: 11.5, color: '#065F46', flex: 1 }} numberOfLines={1}>
                                  {uploaded.fileName}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => handleUploadTenantIdDocument(reqId)}
                                  style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#E0E7FF', borderRadius: 6 }}
                                  activeOpacity={0.8}
                                >
                                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#4338CA' }}>Replace</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => {
                                    const next = { ...uploadedIdsState };
                                    delete next[reqId.id];
                                    setUploadedIdsState(next);
                                  }}
                                  style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#FEE2E2', borderRadius: 6 }}
                                  activeOpacity={0.8}
                                >
                                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#DC2626' }}>Remove</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  paddingVertical: 9,
                                  backgroundColor: '#F3F4F6',
                                  borderWidth: 1,
                                  borderStyle: 'dashed',
                                  borderColor: '#CBD5E1',
                                  borderRadius: 7,
                                }}
                                onPress={() => handleUploadTenantIdDocument(reqId)}
                                activeOpacity={0.8}
                              >
                                <Feather name="upload" size={13} color="#475569" />
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B' }}>
                                  Attach {reqId.name}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}

              <TouchableOpacity
                style={styles.declarationRow}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, agreedToTerms && styles.checkboxActive]}>
                  {agreedToTerms && <Feather name="check" size={12} color="#FFFFFF" />}
                </View>
                <Text style={styles.declarationText}>
                  I solemnly certify that this document bears genuine physical ink signatures from the resident and satisfies all legal tenancy covenants under the state rent control act.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, isSubmittingUpload && { opacity: 0.7 }]}
                onPress={handleConfirmUploadSigned}
                disabled={isSubmittingUpload}
                activeOpacity={0.85}
              >
                <Feather name="upload-cloud" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSubmitBtnText}>
                  {isSubmittingUpload ? 'Uploading...' : 'Submit Agreement'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL 2: MOVE-OUT NOTICE SUBMISSION                             */}
      {/* =============================================================== */}
      <Modal visible={showNoticeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Submit Move-Out Notice</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNoticeModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalInputLabel}>Rental Unit</Text>
              <TextInput
                style={styles.modalInput}
                value={noticeUnitSelection || activeUnit?.unitNumber || primaryAgreement?.unit || ''}
                onChangeText={setNoticeUnitSelection}
                placeholder="Unit Number"
              />

              <Text style={styles.modalInputLabel}>Effective Move-Out Date</Text>
              <TextInput
                style={styles.modalInput}
                value={noticeMoveOutDate}
                onChangeText={setNoticeMoveOutDate}
                placeholder="YYYY-MM-DD"
              />

              <View style={styles.noticeInfoBox}>
                <Feather name="info" size={14} color="#D97706" style={{ marginRight: 6, marginTop: 2 }} />
                <Text style={styles.noticeInfoText}>
                  Upon submitting notice, your landlord will schedule a physical inspection before handover. Your refundable deposit will be calculated minus verified deductions.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSubmitNotice}
                activeOpacity={0.85}
              >
                <Feather name="check-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSubmitBtnText}>Submit Notice</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL 3: ROOM-BY-ROOM INSPECTION CHECKLIST / REPORT PREVIEW      */}
      {/* =============================================================== */}
      <Modal visible={showChecklistModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {currentMoveOutStep >= 3 ? 'Inspection Assessment Report' : 'Inspection Handover Checklist'}
                </Text>
                <Text style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                  {currentMoveOutStep >= 3
                    ? `Walkthrough results for Unit ${activeMoveOut?.unit || primaryAgreement?.unit}`
                    : `Pre-walkthrough standards for Unit ${activeMoveOut?.unit || primaryAgreement?.unit}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowChecklistModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Contextual Status Banner */}
              {currentMoveOutStep < 3 ? (
                <View style={[styles.checklistInfoBanner, { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Feather name="clock" size={15} color="#D97706" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#B45309' }}>
                      Walkthrough Inspection Not Yet Conducted
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: '#92400E', lineHeight: 16 }}>
                    {activeMoveOut?.inspectionDate
                      ? `Walkthrough inspection is scheduled for ${activeMoveOut.inspectionDate}. Your unit has NOT been evaluated yet.`
                      : 'The physical on-site walkthrough will be scheduled by your landlord shortly.'}{' '}
                    Please ensure the 6 areas below meet these standards prior to the walkthrough to avoid deposit deductions.
                  </Text>
                </View>
              ) : (
                <View style={[styles.checklistInfoBanner, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Feather name="check-circle" size={15} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#065F46' }}>
                      Walkthrough Inspection Completed
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: '#047857', lineHeight: 16 }}>
                    Inspected on {activeMoveOut?.inspectionDate || 'Walkthrough'}.{' '}
                    {(activeMoveOut?.totalDeductions || 0) > 0
                      ? `${format(activeMoveOut?.totalDeductions || 0, activeMoveOut?.currency || activeCurrency)} in deductions assessed. Review details below.`
                      : 'Zero deductions assessed. All inspected items verified in satisfactory condition.'}
                  </Text>
                </View>
              )}

              {/* Items List: Dynamic if inspected, Preparation Standards if pending */}
              {currentMoveOutStep >= 3 && activeMoveOut?.inspectionChecklist && activeMoveOut.inspectionChecklist.length > 0 ? (
                activeMoveOut.inspectionChecklist.map((item, idx) => {
                  const isDamaged = item.condition === 'damaged';
                  const isFair = item.condition === 'minor_wear';
                  return (
                    <View key={idx} style={styles.checklistItemRow}>
                      <View
                        style={[
                          styles.checkIconBox,
                          isDamaged
                            ? styles.checkIconBoxDamaged
                            : isFair
                              ? styles.checkIconBoxFair
                              : styles.checkIconBox,
                        ]}
                      >
                        <Feather
                          name={isDamaged ? 'x-circle' : isFair ? 'alert-triangle' : 'check'}
                          size={14}
                          color={isDamaged ? '#DC2626' : isFair ? '#D97706' : '#059669'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.checklistName}>{item.room ? `${item.room} — ` : ''}{item.item}</Text>
                        <Text style={styles.checklistSpec}>
                          {item.notes || (isDamaged ? 'Damaged / requires repair' : isFair ? 'Minor wear noted' : 'Verified in good order.')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checklistStatusTag,
                          isDamaged
                            ? styles.checklistStatusTagDamaged
                            : isFair
                              ? styles.checklistStatusTagFair
                              : styles.checklistStatusTag,
                        ]}
                      >
                        <Text
                          style={[
                            styles.checklistStatusTagText,
                            isDamaged
                              ? styles.checklistStatusTagDamagedText
                              : isFair
                                ? styles.checklistStatusTagFairText
                                : styles.checklistStatusTagText,
                          ]}
                        >
                          {isDamaged ? `-${format(item.deduction, activeMoveOut?.currency || activeCurrency)}` : isFair ? 'FAIR' : 'GOOD'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                [
                  { name: 'Paint, Walls & Ceilings', spec: 'No unapproved nail holes, scuffs, or wall peeling.' },
                  { name: 'Electrical, Lighting & Fixtures', spec: 'All light sockets, ceiling fans, and switches operational.' },
                  { name: 'Plumbing, Sanitary & Taps', spec: 'Zero leaks under sinks; clean toilet flush mechanisms.' },
                  { name: 'Flooring, Tiles & Carpets', spec: 'Zero broken tiles, vacuumed carpets, clean grouting.' },
                  { name: 'Doors, Windows, Locks & Keys', spec: 'All original room keys and locksets handed over.' },
                  { name: 'Kitchen Counters & Cabinets', spec: 'Degreased stove area, cleared cabinets and shelves.' },
                ].map((item, idx) => (
                  <View key={idx} style={styles.checklistItemRow}>
                    <View
                      style={[
                        styles.checkIconBox,
                        currentMoveOutStep < 3 && styles.checkIconBoxPending,
                      ]}
                    >
                      <Feather
                        name={currentMoveOutStep < 3 ? 'clock' : 'check'}
                        size={13}
                        color={currentMoveOutStep < 3 ? '#64748B' : '#059669'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checklistName}>{item.name}</Text>
                      <Text style={styles.checklistSpec}>{item.spec}</Text>
                      {currentMoveOutStep < 3 && (
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                          Criteria will be evaluated during walkthrough
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.checklistStatusTag,
                        currentMoveOutStep < 3 && styles.checklistStatusTagPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.checklistStatusTagText,
                          currentMoveOutStep < 3 && styles.checklistStatusTagPendingText,
                        ]}
                      >
                        {currentMoveOutStep < 3 ? 'PENDING' : 'GOOD'}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {/* Settlement Summary Box */}
              <View style={styles.checklistSummaryBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Security Deposit Held</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>
                    {format(activeMoveOut?.depositHeld || primaryAgreement?.deposit || 0, activeMoveOut?.currency || activeCurrency)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                    {currentMoveOutStep < 3 ? 'Deductions' : 'Total Assessed Deductions'}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: currentMoveOutStep < 3 ? '#64748B' : (activeMoveOut?.totalDeductions || 0) > 0 ? '#DC2626' : '#059669',
                    }}
                  >
                    {currentMoveOutStep < 3
                      ? '₹0 (Pending Walkthrough)'
                      : (activeMoveOut?.totalDeductions || 0) > 0
                        ? `-${format(activeMoveOut?.totalDeductions || 0, activeMoveOut?.currency || activeCurrency)}`
                        : '₹0 (Zero Deductions)'}
                  </Text>
                </View>
                <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 4 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                    {currentMoveOutStep < 3 ? 'Estimated Refund Balance' : 'Net Refundable Deposit'}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#059669' }}>
                    {format(
                      activeMoveOut ? activeMoveOut.netRefundAmount : primaryAgreement?.deposit || 0,
                      activeMoveOut?.currency || activeCurrency
                    )}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            {currentMoveOutStep >= 3 && currentMoveOutStep <= 4 ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { flex: 1, marginTop: 0, backgroundColor: '#059669' }]}
                  onPress={() => {
                    setShowChecklistModal(false);
                    setShowSettlementReviewModal(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="credit-card" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.modalSubmitBtnText}>Review Payout</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bannerBtnSecondary, { paddingVertical: 12, paddingHorizontal: 16 }]}
                  onPress={() => setShowChecklistModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.bannerBtnSecondaryText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { marginTop: 16 }]}
                onPress={() => setShowChecklistModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalSubmitBtnText}>
                  {currentMoveOutStep < 3 ? 'Understood • Close Checklist' : 'Done'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL 4: REQUEST LEASE RENEWAL MODAL (Web Parity)              */}
      {/* =============================================================== */}
      <Modal visible={showRenewalRequestModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Request Lease Renewal</Text>
                <Text style={styles.modalSub}>
                  Unit {reviewingAgreement?.unit || primaryAgreement?.unit || activeUnit?.unitNumber || 'Residence'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowRenewalRequestModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  padding: 12,
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1,
                  borderColor: '#BBF7D0',
                  borderRadius: 8,
                  marginBottom: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Feather name="info" size={15} color="#059669" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#065F46' }}>
                    Renewal Consideration Request
                  </Text>
                </View>
                <Text style={{ fontSize: 11.5, color: '#047857', lineHeight: 16 }}>
                  {/* Submitting a renewal request notifies your landlord that you wish to extend your lease. Your landlord will review your request and issue official proposed renewal terms (proposed rent & new lease dates) for your review and signature. */}
                </Text>
              </View>

              <Text style={styles.modalInputLabel}>Resident Note / Comments (Optional)</Text>
              <TextInput
                style={[styles.modalInput, { height: 75, textAlignVertical: 'top' }]}
                value={renewalNote}
                onChangeText={setRenewalNote}
                placeholder="Add any notes or comments for your landlord regarding renewal..."
                placeholderTextColor="#94A3B8"
                multiline
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, isSubmittingRenewalRequest && { opacity: 0.7 }]}
                onPress={() => handleSendRenewalRequest()}
                disabled={isSubmittingRenewalRequest}
                activeOpacity={0.85}
              >
                <Feather name="send" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSubmitBtnText}>
                  {isSubmittingRenewalRequest ? 'Sending Request...' : 'Send Renewal Request'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL 5: REVIEW RENEWAL PROPOSAL MODAL                          */}
      {/* =============================================================== */}
      <Modal visible={showRenewalReviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Renewal Proposal Addendum</Text>
                <Text style={styles.modalSub}>
                  Unit {reviewingRenewal?.unit || reviewingAgreement?.unit} • Extension Term
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowRenewalReviewModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                {/* Financial & Term Breakdown */}
                <View style={styles.renewalBreakdownBox}>
                  <View style={styles.renewalBreakdownRow}>
                    <Text style={styles.breakdownLabel}>Proposed Monthly Rent</Text>
                    <Text style={[styles.breakdownValue, { color: '#059669', fontSize: 16 }]}>
                      {format(
                        reviewingRenewal?.proposedRent || reviewingAgreement?.rent || 0,
                        reviewingRenewal?.currency || reviewingAgreement?.currency || activeCurrency
                      )}/mo
                    </Text>
                  </View>
                  <View style={styles.renewalBreakdownRow}>
                    <Text style={styles.breakdownLabel}>Escalation Rate</Text>
                    <Text style={[styles.breakdownValue, { color: '#2563EB' }]}>
                      +{reviewingRenewal?.percentageIncrease || 8}%
                    </Text>
                  </View>
                  <View style={styles.renewalBreakdownRow}>
                    <Text style={styles.breakdownLabel}>Commencement Date</Text>
                    <Text style={styles.breakdownValue}>
                      {reviewingRenewal?.newLeaseStart || reviewingAgreement?.end || '—'}
                    </Text>
                  </View>
                  <View style={styles.renewalBreakdownRow}>
                    <Text style={styles.breakdownLabel}>Extension Expiry</Text>
                    <Text style={styles.breakdownValue}>
                      {reviewingRenewal?.newLeaseEnd || '12 Months'}
                    </Text>
                  </View>
                </View>

                {/* Effective Date & Landlord Note Callout */}
                <View style={[styles.noticeInfoBox, { marginBottom: 12 }]}>
                  <Feather name="info" size={14} color="#D97706" style={{ marginRight: 6, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noticeInfoText}>
                      The renewed rent strictly takes effect on {reviewingRenewal?.newLeaseStart || 'the start date'} after your current lease term concludes. Your current monthly billing remains unchanged until then.
                    </Text>
                    {reviewingRenewal?.ownerNotes ? (
                      <Text style={[styles.noticeInfoText, { marginTop: 6, fontWeight: '700', color: '#92400E' }]}>
                        Landlord Note: "{reviewingRenewal.ownerNotes}"
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Landlord's Dispatched Draft Agreement (if available) */}
                {reviewingRenewal?.ownerAgreementFileUrl && (
                  <View style={[styles.renewalBreakdownBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Feather name="file-text" size={16} color="#059669" style={{ marginRight: 6 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>
                          {reviewingRenewal.ownerAgreementFileName || 'Renewal_Agreement_Draft.pdf'}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#15803D' }}>
                          Draft agreement dispatched by your landlord {reviewingRenewal.ownerAgreementFileSize ? `• ${reviewingRenewal.ownerAgreementFileSize} KB` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        style={[styles.cardActionBtnSecondary, { flex: 1, paddingVertical: 6 }]}
                        onPress={() => {
                          setPreviewDoc({
                            fileName: reviewingRenewal.ownerAgreementFileName || `Renewal_Draft_${reviewingRenewal.unit}.pdf`,
                            fileUrl: reviewingRenewal.ownerAgreementFileUrl || undefined,
                            title: `Renewal Draft Agreement — Unit ${reviewingRenewal.unit}`,
                            docType: 'Official Draft Contract',
                            meta: {
                              agreementId: reviewingAgreement?.id,
                              tenantName: user.displayName || 'Resident',
                              unit: reviewingRenewal.unit,
                              propertyName: reviewingAgreement?.propertyName,
                            },
                          });
                        }}
                      >
                        <Feather name="eye" size={13} color="#475569" style={{ marginRight: 4 }} />
                        <Text style={styles.cardActionBtnSecondaryText}>View Draft</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.cardActionBtnSecondary, { flex: 1, paddingVertical: 6 }]}
                        onPress={() => {
                          downloadDocument({
                            fileName: reviewingRenewal.ownerAgreementFileName || `Renewal_Agreement_${reviewingRenewal.unit}.pdf`,
                            fileUrl: reviewingRenewal.ownerAgreementFileUrl,
                            title: 'Renewal Tenancy Agreement Draft',
                            docType: 'Official Draft Contract',
                            meta: {
                              tenantName: user.displayName || 'Resident',
                              unit: reviewingRenewal.unit,
                              propertyName: reviewingAgreement?.propertyName,
                              amount: format(reviewingRenewal.proposedRent || 0, activeCurrency),
                            },
                          });
                        }}
                      >
                        <Feather name="download" size={13} color="#475569" style={{ marginRight: 4 }} />
                        <Text style={styles.cardActionBtnSecondaryText}>Download</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Upload Signed Addendum File */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A', marginBottom: 6 }}>
                  Upload Your Signed Renewal Copy (Optional / PDF scan)
                </Text>
                {tenantRenewalSignedFile ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 8, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                      <Feather name="check-circle" size={16} color="#16A34A" style={{ marginRight: 6 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#166534' }} numberOfLines={1}>
                          {tenantRenewalSignedFileName}
                        </Text>
                        {tenantRenewalSignedFileSize ? (
                          <Text style={{ fontSize: 11, color: '#15803D' }}>{tenantRenewalSignedFileSize} KB</Text>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setTenantRenewalSignedFile(null);
                        setTenantRenewalSignedFileName('');
                        setTenantRenewalSignedFileSize(null);
                        setRenewalSignedAttached(false);
                      }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#FEE2E2', borderRadius: 4 }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.attachAddendumBtn}
                    onPress={handlePickRenewalSignedFile}
                    activeOpacity={0.8}
                  >
                    <Feather
                      name="file-plus"
                      size={15}
                      color="#0F172A"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.attachAddendumBtnText}>
                      Attach Signed Addendum
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Actions: Decline or Accept/Submit */}
                <View style={styles.reviewActionsRow}>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => setShowDeclineModal(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.acceptBtn, isSubmittingTenantSignedRenewal && { opacity: 0.7 }]}
                    onPress={handleAcceptRenewal}
                    disabled={isSubmittingTenantSignedRenewal}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.acceptBtnText}>
                      {isSubmittingTenantSignedRenewal
                        ? 'Submitting...'
                        : tenantRenewalSignedFile
                          ? 'Submit Signed'
                          : 'Accept Renewal'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL 5.1: DECLINE RENEWAL OFFER MODAL                         */}
      {/* =============================================================== */}
      <Modal visible={showDeclineModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Decline Renewal Offer</Text>
                <Text style={styles.modalSub}>
                  Unit {reviewingRenewal?.unit || reviewingAgreement?.unit} • Feedback to Landlord
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowDeclineModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
                Please select or provide a reason for declining. Your landlord will be notified.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {[
                  'Rent increase is too high',
                  'Relocating to another city',
                  'Need a different unit size',
                  'Personal / financial reasons',
                ].map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={{
                      backgroundColor: declineReasonText === reason ? '#DC2626' : '#F1F5F9',
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                    }}
                    onPress={() => setDeclineReasonText(reason)}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '600',
                        color: declineReasonText === reason ? '#FFFFFF' : '#475569',
                      }}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.modalInput, { height: 75, textAlignVertical: 'top' }]}
                value={declineReasonText}
                onChangeText={setDeclineReasonText}
                placeholder="Optional notes or counter-proposals..."
                multiline
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { flex: 1, backgroundColor: '#F1F5F9' }]}
                  onPress={() => setShowDeclineModal(false)}
                >
                  <Text style={[styles.modalSubmitBtnText, { color: '#64748B' }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { flex: 1, backgroundColor: '#DC2626' }]}
                  onPress={handleConfirmDeclineRenewal}
                >
                  <Text style={styles.modalSubmitBtnText}>Confirm Decline</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* =============================================================== */}
      {/* MODAL 5: SETTLEMENT REVIEW & PAYOUT MODAL                       */}
      {/* =============================================================== */}
      <Modal visible={showSettlementReviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Review Move-Out</Text>
                <Text style={styles.modalSub}>
                  Unit {activeMoveOut?.unit} • Deposit Settlement Review
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowSettlementReviewModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {isDisbursed ? (
                <>
                  {/* Deductions Breakdown Box */}
                  <View style={styles.settleSummaryBox}>
                    <View style={styles.settleSummaryRow}>
                      <Text style={styles.settleSummaryLabel}>Original Deposit Held</Text>
                      <Text style={styles.settleSummaryVal}>
                        {format(activeMoveOut?.depositHeld || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                    <View style={styles.settleSummaryRow}>
                      <Text style={[styles.settleSummaryLabel, { color: '#DC2626' }]}>Total Assessed Deductions</Text>
                      <Text style={[styles.settleSummaryVal, { color: '#DC2626' }]}>
                        - {format(activeMoveOut?.totalDeductions || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                    <View style={[styles.settleSummaryRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, marginTop: 4 }]}>
                      <Text style={[styles.settleSummaryLabel, { fontWeight: '700', color: '#0F172A' }]}>Net Refund Payable</Text>
                      <Text style={[styles.settleSummaryVal, { fontSize: 16, color: '#059669' }]}>
                        {format(activeMoveOut?.netRefundAmount || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                  </View>

                  {/* Landlord Disbursement Details Card */}
                  <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 8, padding: 12, marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Feather name="check-circle" size={15} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#065F46' }}>
                        Landlord Disbursement Verified
                      </Text>
                    </View>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 12, color: '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Amount Disbursed: </Text>
                        {format(activeSettlement?.finalRefundAmount ?? activeMoveOut?.netRefundAmount ?? 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Disbursement Rail: </Text>
                        {(activeSettlement?.disbursementMethod || activeMoveOut?.payoutMethod || 'Direct Transfer').toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Payment Reference: </Text>
                        {activeSettlement?.paymentReference || 'UTR-SETTLED'}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#047857' }}>
                        <Text style={{ fontWeight: '600' }}>Disbursed Date: </Text>
                        {activeSettlement?.disbursedAt ? new Date(activeSettlement.disbursedAt).toLocaleString() : 'Recent'}
                      </Text>
                    </View>
                  </View>

                  {!hasConfirmedReceipt ? (
                    <TouchableOpacity
                      style={[styles.modalSubmitBtn, { backgroundColor: '#059669', marginTop: 16 }]}
                      onPress={handleConfirmRefundReceipt}
                      disabled={isConfirmingReceipt}
                    >
                      <Text style={styles.modalSubmitBtnText}>
                        {isConfirmingReceipt ? 'Confirming Receipt...' : '✓ Confirm Refund Received'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: '#ECFDF5', borderRadius: 8, padding: 12, marginTop: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#059669' }}>
                        ✓ Refund Receipt Confirmed by Resident • Tenancy Concluded
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {/* Decision Tabs */}
                  <View style={styles.settleDecisionTabRow}>
                    <TouchableOpacity
                      style={[styles.settleDecisionTab, settlementDecision === 'accept' && styles.settleDecisionTabActive]}
                      onPress={() => setSettlementDecision('accept')}
                    >
                      <Feather name="check" size={13} color={settlementDecision === 'accept' ? '#FFFFFF' : '#64748B'} style={{ marginRight: 4 }} />
                      <Text style={[styles.settleDecisionTabText, settlementDecision === 'accept' && styles.settleDecisionTabTextActive]}>
                        Accept Refund
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.settleDecisionTab, settlementDecision === 'contest' && styles.settleDecisionTabDanger]}
                      onPress={() => setSettlementDecision('contest')}
                    >
                      <Feather name="alert-triangle" size={13} color={settlementDecision === 'contest' ? '#FFFFFF' : '#64748B'} style={{ marginRight: 4 }} />
                      <Text style={[styles.settleDecisionTabText, settlementDecision === 'contest' && styles.settleDecisionTabTextActive]}>
                        Contest
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Deductions Breakdown Box */}
                  <View style={styles.settleSummaryBox}>
                    <View style={styles.settleSummaryRow}>
                      <Text style={styles.settleSummaryLabel}>Original Deposit Held</Text>
                      <Text style={styles.settleSummaryVal}>
                        {format(activeMoveOut?.depositHeld || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                    <View style={styles.settleSummaryRow}>
                      <Text style={[styles.settleSummaryLabel, { color: '#DC2626' }]}>Total Assessed Deductions</Text>
                      <Text style={[styles.settleSummaryVal, { color: '#DC2626' }]}>
                        - {format(activeMoveOut?.totalDeductions || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                    <View style={[styles.settleSummaryRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, marginTop: 4 }]}>
                      <Text style={[styles.settleSummaryLabel, { fontWeight: '700', color: '#0F172A' }]}>Net Refund Payable</Text>
                      <Text style={[styles.settleSummaryVal, { fontSize: 16, color: '#059669' }]}>
                        {format(activeMoveOut?.netRefundAmount || 0, activeMoveOut?.currency || activeCurrency)}
                      </Text>
                    </View>
                  </View>

                  {settlementDecision === 'accept' ? (
                    <>
                      <Text style={styles.modalInputLabel}>Select Refund Payout Rail</Text>
                      <View style={styles.payoutRailPillRow}>
                        {(['upi', 'bank', 'paypal', 'cash'] as const).map((rail) => (
                          <TouchableOpacity
                            key={rail}
                            style={[styles.payoutRailPill, settlementPayoutRail === rail && styles.payoutRailPillActive]}
                            onPress={() => setSettlementPayoutRail(rail)}
                          >
                            <Text style={[styles.payoutRailPillText, settlementPayoutRail === rail && styles.payoutRailPillTextActive]}>
                              {rail === 'upi' ? 'UPI' : rail === 'bank' ? 'Bank Wire' : rail === 'paypal' ? 'PayPal' : 'Cash'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.modalInputLabel}>Account Holder Name</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={settlementAccountHolder}
                        onChangeText={setSettlementAccountHolder}
                        placeholder="Full legal name"
                      />

                      {settlementPayoutRail === 'upi' && (
                        <>
                          <Text style={styles.modalInputLabel}>UPI ID (VPA)</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={settlementUpiId}
                            onChangeText={setSettlementUpiId}
                            placeholder="e.g. resident@okhdfcbank"
                            autoCapitalize="none"
                          />
                        </>
                      )}

                      {settlementPayoutRail === 'bank' && (
                        <>
                          <Text style={styles.modalInputLabel}>Account Number</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={settlementBankAccNumber}
                            onChangeText={setSettlementBankAccNumber}
                            placeholder="Bank account number"
                            keyboardType="numeric"
                          />
                          <Text style={styles.modalInputLabel}>IFSC Code</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={settlementBankIfsc}
                            onChangeText={setSettlementBankIfsc}
                            placeholder="e.g. HDFC0001234"
                            autoCapitalize="characters"
                          />
                        </>
                      )}

                      {settlementPayoutRail === 'paypal' && (
                        <>
                          <Text style={styles.modalInputLabel}>PayPal Email</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={settlementPaypalEmail}
                            onChangeText={setSettlementPaypalEmail}
                            placeholder="name@email.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                          />
                        </>
                      )}

                      {settlementInputError ? (
                        <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
                          <Feather name="alert-circle" size={14} color="#DC2626" style={{ marginRight: 6 }} />
                          <Text style={{ fontSize: 11.5, color: '#DC2626', flex: 1 }}>{settlementInputError}</Text>
                        </View>
                      ) : null}

                      <TouchableOpacity
                        style={[styles.modalSubmitBtn, { backgroundColor: '#059669', marginTop: 14 }]}
                        onPress={handleConfirmSettlementResponse}
                        disabled={isSubmittingSettlementReview}
                      >
                        <Text style={styles.modalSubmitBtnText}>
                          {isSubmittingSettlementReview
                            ? 'Submitting...'
                            : isSettlementAccepted
                              ? 'Update Payout Details'
                              : '✓ Claim Refund'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={styles.modalInputLabel}>Dispute Notes & Contested Items</Text>
                      <TextInput
                        style={[styles.modalInput, { height: 90, textAlignVertical: 'top' }]}
                        value={settlementContestReason}
                        onChangeText={setSettlementContestReason}
                        placeholder="Specify why you contest these deductions (e.g., normal wear and tear, pre-existing damages)..."
                        multiline
                      />

                      <TouchableOpacity
                        style={[styles.modalSubmitBtn, { backgroundColor: '#DC2626', marginTop: 14 }]}
                        onPress={handleConfirmSettlementResponse}
                        disabled={isSubmittingSettlementReview}
                      >
                        <Text style={styles.modalSubmitBtnText}>
                          {isSubmittingSettlementReview ? 'Submitting...' : 'Submit Dispute'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL 6: REAL DOCUMENT INSPECTION & VIEWER MODAL                */}
      {/* =============================================================== */}
      <DocumentViewerModal
        visible={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
        onAttachFile={async (dataUrl, fileName) => {
          if (previewDoc?.meta?.agreementId) {
            const agId = previewDoc.meta.agreementId;
            const ag = (state.agreements || []).find((a) => a.id === agId);
            if (ag) {
              const safeUrl = await uploadOrCompressImage(
                dataUrl,
                `agreements/${ag.id}/${Date.now()}_${fileName}`
              );
              if (previewDoc.title?.includes('Draft') || previewDoc.title?.includes('Dispatched')) {
                updateAgreement(ag.id, { initialAgreementUrl: safeUrl, initialAgreementName: fileName });
              } else {
                updateAgreement(ag.id, { signedDocumentUrl: safeUrl, signedDocumentName: fileName });
              }
            }
          }
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
    noticeHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FECACA',
      borderRadius: 6,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    noticeHeaderBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#DC2626',
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
    subTabCapsule: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
      borderRadius: 8,
      padding: 3,
      marginBottom: 16,
    },
    subTabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 6,
    },
    subTabBtnActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    subTabText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    subTabTextActive: {
      color: colors.navy,
      fontWeight: '700',
    },
    actionBanner: {
      backgroundColor: '#FFFBEB',
      borderWidth: 1.5,
      borderColor: '#FDE68A',
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    actionBannerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    actionBannerIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#FEF3C7',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    actionBannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#92400E',
    },
    actionBannerSub: {
      fontSize: 12,
      color: '#78350F',
      marginTop: 3,
      lineHeight: 17,
    },
    actionBannerBtns: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    bannerBtnSecondary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 7,
      paddingVertical: 8,
    },
    bannerBtnSecondaryText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    bannerBtnPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 7,
      paddingVertical: 8,
    },
    bannerBtnPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    filterPillsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 14,
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    filterPillActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    filterPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    filterPillTextActive: {
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
    agreementCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 16,
      marginBottom: 14,
    },
    agreementHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    agreementTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
    },
    agreementSubProperty: {
      fontSize: 12.5,
      fontWeight: '500',
      color: colors.inkSoft,
      marginTop: 2,
    },
    agreementIdText: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      marginVertical: 12,
    },
    specGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    specCell: {
      width: '48%',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 9,
    },
    specLabel: {
      fontSize: 11,
      color: colors.inkSoft,
      marginBottom: 2,
    },
    specValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    auditTrailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#BBF7D0',
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
    },
    shieldIconBox: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: '#DCFCE7',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
    },
    auditTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: '#166534',
    },
    auditSub: {
      fontSize: 10.5,
      color: '#15803D',
      marginTop: 1,
    },
    verifiedTag: {
      backgroundColor: '#DCFCE7',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    verifiedTagText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#15803D',
    },
    cardActionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    cardActionBtnSecondary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 9,
    },
    cardActionBtnSecondaryText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    cardActionBtnPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 8,
      paddingVertical: 9,
    },
    cardActionBtnPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    moveOutCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 16,
      marginTop: 4,
      marginBottom: 16,
    },
    moveOutCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    moveOutCardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
    },
    moveOutCardSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    stageCapsule: {
      backgroundColor: '#EFF6FF',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    stageCapsuleText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#2563EB',
    },
    stagePillsRow: {
      flexDirection: 'row',
      gap: 4,
      marginBottom: 12,
    },
    stagePill: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
    },
    stagePillCompleted: {
      backgroundColor: '#10B981',
    },
    stageStepInfo: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
    },
    stageInfoLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    stageInfoTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    stageDateText: {
      fontSize: 11,
      color: colors.inkSoft,
      marginLeft: 22,
    },
    moveOutBtnsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    checklistBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 9,
    },
    checklistBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    giveNoticeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#DC2626',
      borderRadius: 8,
      paddingVertical: 9,
    },
    giveNoticeBtnText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    renewalHeroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: '#A7F3D0',
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    renewalHeroIconBox: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: '#D1FAE5',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    renewalHeroTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#065F46',
    },
    renewalHeroSub: {
      fontSize: 11,
      color: '#047857',
      marginTop: 2,
      lineHeight: 15,
    },
    requestRenewalBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#059669',
      borderRadius: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginLeft: 8,
    },
    requestRenewalBtnText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    sectionHeading: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 10,
    },
    renewalNoteBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 7,
      padding: 8,
      marginVertical: 10,
    },
    renewalNoteText: {
      fontSize: 11.5,
      color: colors.inkSoft,
      fontStyle: 'italic',
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
      borderWidth: 1,
      borderColor: colors.line,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    modalBody: {
      paddingVertical: 4,
    },
    modalInputLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink,
      marginBottom: 6,
      marginTop: 10,
    },
    modalInput: {
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.navy,
    },
    uploadFileBox: {
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: '#059669',
      backgroundColor: isDark ? '#06281E' : '#F0FDF4',
      borderRadius: 10,
      padding: 16,
      alignItems: 'center',
      marginVertical: 10,
    },
    uploadFileName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 8,
    },
    uploadFileSize: {
      fontSize: 11,
      color: '#059669',
      marginTop: 2,
      marginBottom: 10,
    },
    chooseFileBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chooseFileBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    declarationRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginVertical: 12,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.line,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
      marginTop: 2,
    },
    checkboxActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    declarationText: {
      flex: 1,
      fontSize: 11,
      color: colors.ink,
      lineHeight: 16,
    },
    noticeInfoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? '#2D1B06' : '#FFFBEB',
      borderRadius: 8,
      padding: 10,
      marginVertical: 12,
    },
    noticeInfoText: {
      flex: 1,
      fontSize: 11,
      color: isDark ? '#FBBF24' : '#92400E',
      lineHeight: 16,
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
    checklistItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    checkIconBox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: isDark ? '#064E3B' : '#DCFCE7',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    checklistName: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.navy,
    },
    checklistSpec: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    checklistStatusTag: {
      backgroundColor: isDark ? '#064E3B' : '#DCFCE7',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 6,
    },
    checklistStatusTagText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#15803D',
    },
    checklistInfoBanner: {
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
      borderWidth: 1,
    },
    checkIconBoxPending: {
      backgroundColor: colors.surfaceSunken,
      borderColor: colors.line,
      borderWidth: 1,
    },
    checkIconBoxFair: {
      backgroundColor: isDark ? '#2D1B06' : '#FEF3C7',
    },
    checkIconBoxDamaged: {
      backgroundColor: isDark ? '#3B1212' : '#FEE2E2',
    },
    checklistStatusTagPending: {
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
    },
    checklistStatusTagPendingText: {
      color: colors.inkSoft,
    },
    checklistStatusTagFair: {
      backgroundColor: isDark ? '#2D1B06' : '#FEF3C7',
    },
    checklistStatusTagFairText: {
      color: isDark ? '#FBBF24' : '#B45309',
    },
    checklistStatusTagDamaged: {
      backgroundColor: isDark ? '#3B1212' : '#FEE2E2',
    },
    checklistStatusTagDamagedText: {
      color: '#DC2626',
    },
    checklistSummaryBox: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      padding: 12,
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.line,
    },
    renewalBreakdownBox: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
    },
    renewalBreakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    breakdownLabel: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    breakdownValue: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    attachAddendumBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      paddingVertical: 10,
      marginBottom: 14,
    },
    attachAddendumBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    reviewActionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    declineBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      paddingVertical: 12,
    },
    declineBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink,
    },
    acceptBtn: {
      flex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#059669',
      borderRadius: 8,
      paddingVertical: 12,
    },
    acceptBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    pdfPaperMock: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      padding: 16,
    },
    pdfPaperHeading: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.navy,
      textAlign: 'center',
    },
    pdfPaperSub: {
      fontSize: 10.5,
      color: colors.inkSoft,
      textAlign: 'center',
      marginTop: 2,
    },
    pdfPaperDivider: {
      height: 1,
      backgroundColor: colors.line,
      marginVertical: 10,
    },
    pdfPaperBody: {
      fontSize: 11.5,
      lineHeight: 18,
      color: colors.ink,
    },
    moveOutActiveNoticeBox: {
      backgroundColor: isDark ? '#06281E' : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDark ? '#065F46' : '#BBF7D0',
      borderRadius: 10,
      padding: 12,
    },
    moveOutActiveNoticeTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#15803D',
    },
    moveOutActiveNoticeSub: {
      fontSize: 11.5,
      color: isDark ? '#6EE7B7' : '#166534',
      marginTop: 2,
      lineHeight: 16,
    },
    fullWidthChecklistBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 9,
      marginTop: 10,
    },
    fullWidthChecklistBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
    reviewSettlementPrimaryBtn: {
      flex: 1.25,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#D97706',
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    reviewSettlementPrimaryBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    reviewSettlementSecondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    reviewSettlementSecondaryBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    settleDecisionTabRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    settleDecisionTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
    },
    settleDecisionTabActive: {
      backgroundColor: '#059669',
    },
    settleDecisionTabDanger: {
      backgroundColor: '#DC2626',
    },
    settleDecisionTabText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    settleDecisionTabTextActive: {
      color: '#FFFFFF',
    },
    settleSummaryBox: {
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      padding: 12,
      marginBottom: 14,
    },
    settleSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    settleSummaryLabel: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    settleSummaryVal: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    payoutRailPillRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 12,
    },
    payoutRailPill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: colors.surfaceSunken,
    },
    payoutRailPillActive: {
      backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
      borderWidth: 1,
      borderColor: '#059669',
    },
    payoutRailPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    payoutRailPillTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
  });
