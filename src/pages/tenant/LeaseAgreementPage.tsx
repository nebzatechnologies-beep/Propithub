import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Agreement, MoveOutRequest, TenantRecord, RenewalItem, TenantUploadedIdItem, RequiredIdItem } from '../../types';
import { downloadAgreementPDF } from '../../lib/pdf';
import { isFirebaseConfigured } from '../../lib/firebase';
import {
  FileText,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  CreditCard,
  AlertCircle,
  Eye,
  ShieldCheck,
  FileCheck,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  HelpCircle,
  X,
  Building,
  Home,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';

export const LeaseAgreementPage: React.FC = () => {
  const { state, updateState, uploadSignedAgreement, saveMoveout, showToast, requestLeaseRenewal, respondToLeaseRenewal, submitTenantSignedRenewal, confirmCashClaim, rejectCashClaim, updateAgreementAutopay } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenantName = user?.displayName || 'Resident';

  const tenantEmail = user?.email?.toLowerCase() || '';

  const fallbackTenant: TenantRecord = {
    id: user?.id || `usr_tenant_${Date.now()}`,
    name: tenantName,
    email: tenantEmail,
    phone: user?.phone || '',
    unit: 'Unassigned',
    owner: 'Unassigned',
    ownerId: '',
    leaseStart: '',
    leaseEnd: '',
    rent: 0,
    deposit: 0,
    rating: 5.0,
    unitsRented: [],
    history: [],
    kycDocuments: [],
  };

  // Resolve tenantRecord: ID first, then email — never name (prevents cross-tenant collision)
  const tenantRecord: TenantRecord =
    state.tenants.find((t) => user?.id && t.id === user.id) ||
    (!isFirebaseConfigured && tenantEmail
      ? state.tenants.find((t) => t.email.toLowerCase() === tenantEmail)
      : undefined) ||
    fallbackTenant;

  const assignedUnit = (tenantRecord?.unit && tenantRecord.unit !== 'Unassigned') ? tenantRecord.unit : '';
  const [activeUnit, setActiveUnit] = useState(
    tenantRecord?.unitsRented?.[0] || assignedUnit || ''
  );
  const [selectedTenancyKey, setSelectedTenancyKey] = useState<string>('');
  const [subTab, setSubTab] = useState<'owner' | 'renewal'>('owner');
  const [isViewAgOpen, setIsViewAgOpen] = useState(false);
  const [isUploadSignedOpen, setIsUploadSignedOpen] = useState(false);
  const [signedFileName, setSignedFileName] = useState('');
  const [signedFileData, setSignedFileData] = useState<string | null>(null);
  const [signedFileSize, setSignedFileSize] = useState<number | null>(null);
  const [uploadedIdsState, setUploadedIdsState] = useState<Record<string, TenantUploadedIdItem>>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [optInAutopayDuringLease, setOptInAutopayDuringLease] = useState(true);
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const [noticeDate, setNoticeDate] = useState('');
  const [isPreviewChecklistOpen, setIsPreviewChecklistOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [selectedMoveOut, setSelectedMoveOut] = useState<MoveOutRequest | null>(null);
  const [ownerLeaseFilter, setOwnerLeaseFilter] = useState<'all' | 'active' | 'pending' | 'concluded'>('all');
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [selectedRenewalForReview, setSelectedRenewalForReview] = useState<{ agreement: Agreement; renewal: RenewalItem } | null>(null);
  const [selectedAgreementForNotice, setSelectedAgreementForNotice] = useState<Agreement | null>(null);
  const [selectedAgreementForRenewalRequest, setSelectedAgreementForRenewalRequest] = useState<Agreement | null>(null);

  // Renewal signed document upload state
  const [tenantRenewalSignedFile, setTenantRenewalSignedFile] = useState<string | null>(null);
  const [tenantRenewalSignedFileName, setTenantRenewalSignedFileName] = useState('');
  const [tenantRenewalSignedFileSize, setTenantRenewalSignedFileSize] = useState<number | null>(null);
  const [isSubmittingTenantSignedRenewal, setIsSubmittingTenantSignedRenewal] = useState(false);

  // Resolve targetOwner by ownerId only — display name is not a unique identifier
  const targetOwner = state.users.find((u) => u.id === tenantRecord.ownerId);
  const resolvedOwnerName = targetOwner?.displayName || tenantRecord.owner || 'Property Owner';
  const resolvedOwnerPhone = targetOwner?.phone || '+91 98450 11223';
  const resolvedOwnerEmail = targetOwner?.email || 'owner@propithub.app';

  const getMoveoutStepIndex = (status: string) => {
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

  // Helper to determine if an agreement strictly belongs to this tenant
  const isTenantAgreement = (a: Agreement) => {
    // 1. Direct tenant ID match
    if (user?.id && a.tenantId && a.tenantId === user.id) return true;
    if (tenantRecord?.id && a.tenantId && a.tenantId === tenantRecord.id) return true;

    // 2. Direct tenant email match
    if (tenantEmail) {
      if (a.tenantEmail && a.tenantEmail.toLowerCase() === tenantEmail) return true;
      if (a.tenant && a.tenant.toLowerCase() === tenantEmail) return true;
    }

    // 3. Unit+property match — only valid when tenantId ALSO matches.
    if (
      (assignedUnit && a.unit === assignedUnit) ||
      (tenantRecord?.unit && a.unit === tenantRecord.unit)
    ) {
      if (a.tenantId && (a.tenantId === user?.id || a.tenantId === tenantRecord?.id)) return true;
    }

    return false;
  };

  // Multi-property tenancy tracking: compute all distinct residences across properties for this resident
  const myTenancies = useMemo(() => {
    const list: Array<{
      key: string;
      unit: string;
      propertyId?: string;
      propertyName: string;
      ownerId?: string;
      ownerName: string;
      agreementId?: string;
      status?: string;
    }> = [];
    const seen = new Set<string>();

    // 1. From all agreements for this tenant (prioritize active/pending over terminated)
    state.agreements
      .filter(isTenantAgreement)
      .sort((a, b) => {
        const activeA = a.status !== 'terminated' ? 1 : 0;
        const activeB = b.status !== 'terminated' ? 1 : 0;
        return activeB - activeA;
      })
      .forEach((ag) => {
        const prop = state.properties.find((p) => p.id === ag.propertyId);
        const propName = prop?.name || (ag as any).propertyName || tenantRecord?.propertyName || 'Residence';
        const key = `${ag.propertyId || 'prop'}_${(ag.unit || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            key,
            unit: ag.unit,
            propertyId: ag.propertyId,
            propertyName: propName,
            ownerId: ag.ownerId,
            ownerName: ag.ownerName || 'Property Owner',
            agreementId: ag.id,
            status: ag.status,
          });
        }
      });

    // 2. From tenantRecord.unitsRented or assignedUnit if not already captured
    const fallbackUnits = Array.from(new Set([
      ...(tenantRecord?.unitsRented || []),
      ...(assignedUnit ? [assignedUnit] : []),
    ]));
    fallbackUnits.forEach((u) => {
      const cleanU = (u || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase();
      const existing = list.some((t) => 
        (!tenantRecord?.propertyId || !t.propertyId || t.propertyId === tenantRecord.propertyId) &&
        (t.unit || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase() === cleanU
      );
      if (!existing && u) {
        const key = `rec_${tenantRecord?.propertyId || 'prop'}_${cleanU}`;
        list.push({
          key,
          unit: u,
          propertyId: tenantRecord?.propertyId,
          propertyName: tenantRecord?.propertyName || 'Residence',
          ownerId: tenantRecord?.ownerId,
          ownerName: tenantRecord?.owner || 'Property Owner',
        });
      }
    });

    return list;
  }, [state.agreements, state.properties, user?.id, tenantRecord, tenantEmail, assignedUnit]);

  // Sync selectedTenancyKey when tenancies change
  useEffect(() => {
    if (!selectedTenancyKey || !myTenancies.some((t) => t.key === selectedTenancyKey)) {
      if (myTenancies.length > 0) {
        setSelectedTenancyKey(myTenancies[0].key);
        setActiveUnit(myTenancies[0].unit);
      }
    }
  }, [myTenancies, selectedTenancyKey]);

  const activeTenancy = useMemo(() => {
    return myTenancies.find((t) => t.key === selectedTenancyKey) || myTenancies[0] || null;
  }, [myTenancies, selectedTenancyKey]);

  const myAgreement = useMemo(() => {
    const rawMatching = state.agreements.filter(isTenantAgreement);

    // If activeTenancy is selected, FIRST filter to agreements matching this activeTenancy (propertyId & unit)
    if (activeTenancy) {
      const cleanTargetUnit = (activeTenancy.unit || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase();
      const tenancyAgreements = rawMatching.filter((a) => {
        const cleanAUnit = (a.unit || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase();
        const unitMatch = cleanAUnit === cleanTargetUnit || a.unit === activeTenancy.unit || a.id === activeTenancy.unit;
        const propMatch = !activeTenancy.propertyId || !a.propertyId || a.propertyId === activeTenancy.propertyId;
        return unitMatch && propMatch;
      });

      if (tenancyAgreements.length > 0) {
        const getWeight = (ag: Agreement) => {
          if (ag.status === 'active') return 100;
          if (ag.status === 'pending_deposit') return 90;
          if (ag.status === 'pending_approval' || (ag as any).status === 'awaiting_owner_signature') return 80;
          if (ag.signedDocumentUrl) return 75;
          if (ag.status === 'awaiting_tenant_upload' || ag.status === 'awaiting_tenant_signature' || ag.status === 'rejected') return 50;
          if (ag.status === 'terminated') return 10;
          return 40;
        };

        tenancyAgreements.sort((a, b) => {
          const weightDiff = getWeight(b) - getWeight(a);
          if (weightDiff !== 0) return weightDiff;
          const timeA = new Date((a as any).tenantSignedAt || a.signedUploadedAt || a.createdAt || a.start || 0).getTime();
          const timeB = new Date((b as any).tenantSignedAt || b.signedUploadedAt || b.createdAt || b.start || 0).getTime();
          return timeB - timeA;
        });

        return tenancyAgreements[0];
      }
    }

    // Fallback if no specific tenancy match: sort all by status weight
    const matching = [...rawMatching].sort((a, b) => {
      const getWeight = (ag: Agreement) => {
        if (ag.status === 'active') return 100;
        if (ag.status === 'pending_deposit') return 90;
        if (ag.status === 'pending_approval' || (ag as any).status === 'awaiting_owner_signature') return 80;
        if (ag.signedDocumentUrl) return 75;
        if (ag.status === 'awaiting_tenant_upload' || ag.status === 'awaiting_tenant_signature' || ag.status === 'rejected') return 50;
        if (ag.status === 'terminated') return 10;
        return 40;
      };
      const weightDiff = getWeight(b) - getWeight(a);
      if (weightDiff !== 0) return weightDiff;
      const timeA = new Date((a as any).tenantSignedAt || a.signedUploadedAt || a.createdAt || a.start || 0).getTime();
      const timeB = new Date((b as any).tenantSignedAt || b.signedUploadedAt || b.createdAt || b.start || 0).getTime();
      return timeB - timeA;
    });

    return matching[0];
  }, [state.agreements, user?.id, tenantRecord?.id, tenantEmail, assignedUnit, tenantRecord?.unit, activeUnit, activeTenancy]);

  const currentUnit = state.units.find(
    (u) =>
      (myAgreement?.unit && (u.unitNumber === myAgreement.unit || u.id === myAgreement.unit || (u.unitNumber && myAgreement.unit && u.unitNumber.replace(/^(unit|apt|flat|#)\s*/i, '').trim().toLowerCase() === myAgreement.unit.replace(/^(unit|apt|flat|#)\s*/i, '').trim().toLowerCase()))) ||
      (assignedUnit && (u.unitNumber === assignedUnit || u.id === assignedUnit))
  );
  const currentProperty = state.properties.find(
    (p) =>
      p.id === myAgreement?.propertyId ||
      p.id === currentUnit?.propertyId ||
      p.id === tenantRecord?.propertyId ||
      (!myAgreement?.propertyId && !currentUnit?.propertyId && !tenantRecord?.propertyId && (
        p.name === (myAgreement as any)?.propertyName ||
        p.name === currentUnit?.propertyName ||
        p.name === tenantRecord?.propertyName
      ))
  );
  const resolvedPropertyName =
    state.properties.find((p) => p.id === myAgreement?.propertyId || p.name === myAgreement?.propertyId)?.name ||
    (myAgreement as any)?.propertyName ||
    currentProperty?.name ||
    tenantRecord?.propertyName ||
    '';
  const agreementCurrency =
    getCurrencySymbol(
      myAgreement?.currency ||
      currentUnit?.currency ||
      currentProperty?.currency ||
      tenantRecord?.currency
    ) || DEFAULT_CURRENCY_SYMBOL;

  // Strict tenant-scoped renewal resolution: must match unit AND belong to THIS resident
  const normalizeUnit = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

  // Build the set of all unit strings this tenant is attached to (across all agreements)
  // so that renewals on secondary properties are not missed.
  const myAllAgreementUnits = new Set<string>();
  state.agreements.forEach((a) => {
    const isMe =
      (user?.id && a.tenantId === user.id) ||
      (tenantRecord?.id && a.tenantId === tenantRecord.id) ||
      (!isFirebaseConfigured && tenantEmail &&
        (a.tenantEmail?.toLowerCase() === tenantEmail || a.tenant?.toLowerCase() === tenantEmail));
    if (isMe && a.unit) myAllAgreementUnits.add(normalizeUnit(a.unit));
  });
  if (tenantRecord.unit && tenantRecord.unit !== 'Unassigned') {
    myAllAgreementUnits.add(normalizeUnit(tenantRecord.unit));
  }

  const existingRenewal = (state.renewals || []).find((r) => {
    // 1. Must match a unit this tenant holds
    const unitMatches = r.unit && myAllAgreementUnits.has(normalizeUnit(r.unit));
    if (!unitMatches) return false;

    // 2. Must have an explicit tenantId match — name-based fallback removed to prevent
    //    cross-tenant leakage when two tenants share the same display name.
    const tenantIdMatches =
      (user?.id && r.tenantId === user.id) ||
      (tenantRecord?.id && r.tenantId === tenantRecord.id) ||
      (myAgreement?.tenantId && r.tenantId === myAgreement.tenantId);

    // If renewal has an explicit tenantId, it MUST match this resident.
    // If renewal has no tenantId at all, only include it if the unit is exclusively
    // this tenant's (i.e., backed by an active agreement with tenantId match).
    if (r.tenantId) return tenantIdMatches;

    // No tenantId on renewal: only safe to show if agreement has a matching tenantId
    return Boolean(myAgreement?.tenantId && tenantIdMatches === false
      ? false
      : myAgreement && myAllAgreementUnits.has(normalizeUnit(r.unit))
    );
  });

  // pendingInvitation: any pending invite addressed to this tenant,
  // regardless of which property it belongs to (multi-property aware)
  const pendingInvitation = (state.tenancyRequests || []).find(
    (r) =>
      r.status === 'pending' &&
      ((user?.id && r.tenantId === user.id) ||
        (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail))
  );

  // Find all move-outs associated with this resident
  const myMoveOuts = state.moveouts.filter(
    (m) =>
      (user?.id && m.tenantId === user.id) ||
      (tenantEmail && (m as any).tenantEmail?.toLowerCase() === tenantEmail) ||
      (tenantEmail && m.tenant?.toLowerCase() === tenantEmail)
  );

  // Active move-out in progress for current agreement
  const activeMoveOut = myMoveOuts.find((m) => {
    if (m.status === 'refund_completed') return false;
    if (myAgreement) {
      if ((m as any).agreementId) return (m as any).agreementId === myAgreement.id;
      // Fallback for legacy moveouts without agreementId:
      const matchesProp = !m.propertyId || !myAgreement.propertyId || m.propertyId === myAgreement.propertyId;
      const matchesUnit = m.unit === myAgreement.unit;
      if (!matchesProp || !matchesUnit) return false;
      const moTime = new Date((m as any).createdAt || m.moveOutDate || 0).getTime();
      const agTime = new Date(myAgreement.createdAt || myAgreement.start || 0).getTime();
      if (agTime > 0 && moTime > 0 && agTime > moTime) return false;
      return true;
    }
    return true;
  });

  // Completed move-out strictly for current agreement
  const completedMoveOut = myMoveOuts.find((m) => {
    if (m.status !== 'refund_completed') return false;
    if (myAgreement) {
      if ((m as any).agreementId) return (m as any).agreementId === myAgreement.id;
      // If current agreement is active/not terminated, an old move-out does NOT apply to this agreement
      if (myAgreement.status !== 'terminated') return false;
      const matchesProp = !m.propertyId || !myAgreement.propertyId || m.propertyId === myAgreement.propertyId;
      const matchesUnit = m.unit === myAgreement.unit;
      if (!matchesProp || !matchesUnit) return false;
      const moTime = new Date((m as any).settledAt || (m as any).refundDate || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
      const agTime = new Date(myAgreement.createdAt || myAgreement.start || 0).getTime();
      if (agTime > 0 && moTime > 0 && agTime > moTime) return false;
      return true;
    }
    return true;
  });

  // The move-out record to display: active has priority; if none active, show completed
  const existingMoveOut = activeMoveOut || completedMoveOut;
  const isMoveOutCompleted = Boolean(completedMoveOut && !activeMoveOut);
  const isTerminatedLease = myAgreement?.status === 'terminated' || isMoveOutCompleted;

  // Cross-reference deposit invoice payment status — strict matching ONLY.
  const matchingDepInv = myAgreement?.depositInvoiceId
    ? state.invoices.find((i) => i.id === myAgreement.depositInvoiceId)
    : state.invoices.find((i) => i.leaseAgreementId === myAgreement?.id && i.invoiceType === 'deposit');
  const isDepositSettled = myAgreement?.depositStatus === 'paid' || matchingDepInv?.status === 'paid';
  const isPendingApproval =
    myAgreement?.status === 'pending_approval' ||
    (myAgreement as any)?.status === 'awaiting_owner_signature' ||
    Boolean(myAgreement?.signedDocumentUrl && (myAgreement?.status === 'awaiting_tenant_upload' || myAgreement?.status === 'awaiting_tenant_signature'));
  const isPendingDeposit = !isDepositSettled && myAgreement?.status === 'pending_deposit';
  const isActiveLease = myAgreement?.status === 'active' && !isPendingApproval && !isPendingDeposit && !isTerminatedLease && !isMoveOutCompleted;
  const isAwaitingUpload =
    !isPendingApproval &&
    !isActiveLease &&
    !isPendingDeposit &&
    !isTerminatedLease &&
    (myAgreement?.status === 'awaiting_tenant_upload' ||
      myAgreement?.status === 'awaiting_tenant_signature' ||
      myAgreement?.status === 'rejected' ||
      !myAgreement?.signedDocumentUrl);

  // Strictly matched agreements for this resident
  const rawAgreements = state.agreements.filter(isTenantAgreement);

  // Deduplicate active agreements per property + unit (keeping the newest one)
  const seenActiveUnits = new Set<string>();
  const allMyAgreements: Agreement[] = [];

  const sortedAgreements = [...rawAgreements].sort((a, b) => {
    const timeA = new Date(a.ownerSignedUploadedAt || a.initialUploadedAt || a.start || 0).getTime();
    const timeB = new Date(b.ownerSignedUploadedAt || b.initialUploadedAt || b.start || 0).getTime();
    return timeB - timeA;
  });

  for (const ag of sortedAgreements) {
    const isCurrentActive =
      ag.status === 'active' ||
      ag.status === 'awaiting_tenant_upload' ||
      ag.status === 'awaiting_tenant_signature' ||
      ag.status === 'pending_deposit' ||
      ag.status === 'pending_approval';

    const cleanUnitStr = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
    const isAgVacated = (state.moveouts || []).some((m) => {
      const isDone = m.status === 'refund_completed' || m.tenantConfirmedReceipt;
      if (!isDone) return false;
      if (m.id === ag.id || (m as any).agreementId === ag.id || (m as any).leaseAgreementId === ag.id) return true;
      if ((m as any).agreementId && (m as any).agreementId !== ag.id) return false;
      const matchesUnit = cleanUnitStr(m.unit) === cleanUnitStr(ag.unit) || (m as any).unitId === ag.unit;
      const matchesTenant = m.tenantId === user?.id || (tenantEmail && (m.tenant?.toLowerCase() === tenantEmail || (m as any).tenantEmail?.toLowerCase() === tenantEmail));
      const matchesProp = (m.propertyId && ag.propertyId)
        ? m.propertyId === ag.propertyId
        : (!m.propertyId && !ag.propertyId && Boolean((m as any).propertyName && (ag as any).propertyName && (m as any).propertyName === (ag as any).propertyName));
      if (!matchesUnit || !matchesTenant || !matchesProp) return false;

      const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.refundDate || m.moveOutDate || (m as any).createdAt || 0).getTime();
      const agTime = new Date(ag.createdAt || ag.start || 0).getTime();
      if (moTime > 0 && agTime > moTime) {
        return false; // Newer agreement for re-entry!
      }
      return ag.status === 'terminated';
    }) || (state.depositSettlements || []).some((s) => {
      const isDone = s.status === 'refunded' || s.tenantConfirmedReceipt;
      if (!isDone) return false;
      if (s.agreementId === ag.id) return true;
      if (s.agreementId && s.agreementId !== ag.id) return false;
      const matchesUnit = cleanUnitStr(s.unit) === cleanUnitStr(ag.unit);
      const matchesTenant = s.tenantId === user?.id || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail);
      const matchesProp = (s.propertyId && ag.propertyId)
        ? s.propertyId === ag.propertyId
        : (!s.propertyId && !ag.propertyId && Boolean((s as any).propertyName && (ag as any).propertyName && (s as any).propertyName === (ag as any).propertyName));
      if (!matchesUnit || !matchesTenant || !matchesProp) return false;

      const sTime = new Date(s.disbursedAt || (s as any).updatedAt || s.createdAt || 0).getTime();
      const agTime = new Date(ag.createdAt || ag.start || 0).getTime();
      if (sTime > 0 && agTime > sTime) {
        return false; // Newer agreement for re-entry!
      }
      return ag.status === 'terminated';
    });

    if (isCurrentActive && !isAgVacated) {
      const activeKey = `${ag.propertyId || ''}_${ag.unit || ''}`;
      if (!seenActiveUnits.has(activeKey)) {
        seenActiveUnits.add(activeKey);
        allMyAgreements.push(ag);
      }
    }
  }

  const isResidentFullyVacated = allMyAgreements.length === 0 && (
    (state.moveouts || []).some(
      (m) =>
        m.status === 'refund_completed' &&
        (m.tenantId === user?.id || (tenantEmail && (m.tenant?.toLowerCase() === tenantEmail || (m as any).tenantEmail?.toLowerCase() === tenantEmail)))
    ) ||
    (state.depositSettlements || []).some(
      (s) =>
        s.status === 'refunded' &&
        (s.tenantId === user?.id || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail))
    )
  );

  // Complete list of displayable agreements with robust fallback to tenantRecord active tenancy
  const displayAgreements: Agreement[] =
    allMyAgreements.length > 0
      ? allMyAgreements
      : (tenantRecord && tenantRecord.unit && tenantRecord.unit !== 'Unassigned' && !isTerminatedLease && !isMoveOutCompleted && !isResidentFullyVacated)
        ? [
          {
            id: `AGR-${(tenantRecord.id || 'LEASE').slice(-6).toUpperCase()}`,
            ownerId: tenantRecord.ownerId || targetOwner?.id || '',
            ownerName: tenantRecord.owner || resolvedOwnerName,
            propertyId: tenantRecord.propertyId || '',
            unit: tenantRecord.unit,
            tenant: tenantRecord.name,
            tenantId: tenantRecord.id,
            type: 'builder' as const,
            start: tenantRecord.leaseStart || new Date().toISOString().split('T')[0],
            end: tenantRecord.leaseEnd || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
            rent: tenantRecord.rent || 0,
            deposit: tenantRecord.deposit || 0,
            rentDueDay: (tenantRecord as any).rentDueDay || 1,
            status: isTerminatedLease ? ('terminated' as const) : ('active' as const),
            depositStatus: isDepositSettled ? ('paid' as const) : ('unpaid' as const),
            autoRenew: false,
          },
        ]
        : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSignedFileName(file.name);
      setSignedFileSize(Math.round(file.size / 1024));
      const reader = new FileReader();
      reader.onload = () => {
        setSignedFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadDraft = (targetAgParam?: Agreement | any) => {
    const agToDownload = targetAgParam || selectedAgreement || myAgreement || (displayAgreements.length > 0 ? displayAgreements[0] : null);
    if (!agToDownload) {
      showToast('No agreement document found on record to download.');
      return;
    }
    const downloadDocUrl = agToDownload.initialAgreementUrl || agToDownload.fileData || agToDownload.ownerSignedDocumentUrl;
    if (downloadDocUrl) {
      const link = document.createElement('a');
      link.href = downloadDocUrl;
      link.download = agToDownload.initialAgreementName || agToDownload.fileName || agToDownload.ownerSignedDocumentName || `Tenancy_Agreement_${agToDownload.unit}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('✓ Landlord-signed agreement downloaded! Please review and append your signature.');
      return;
    }
    const propName = state.properties.find((p) => p.id === agToDownload.propertyId)?.name || tenantRecord?.propertyName || 'Residence Property';
    downloadAgreementPDF(agToDownload, propName, agToDownload.ownerName || tenantRecord.owner || 'Property Owner', tenantName);
    showToast('✓ Tenancy Agreement PDF generated! Please print and sign physically in ink.');
  };

  const handleConfirmUploadSigned = async () => {
    const targetAg = selectedAgreement || myAgreement;
    if (!targetAg) {
      showToast('No tenancy agreement found to upload.');
      return;
    }
    if (!signedFileData) {
      showToast('Please select your signed lease document (PDF, photo, or scan).');
      return;
    }

    // Check if landlord requested any ID documents
    const requiredIds: RequiredIdItem[] = targetAg.requiredIdList && targetAg.requiredIdList.length > 0
      ? targetAg.requiredIdList
      : (targetAg.requiredIdTypes && targetAg.requiredIdTypes.length > 0
        ? targetAg.requiredIdTypes.map((t: string, idx: number) => ({ id: `req_${idx}`, name: t }))
        : (targetAg.requiredIdType
          ? [{ id: 'req_0', name: targetAg.requiredIdType }]
          : (targetAg.requireTenantId ? [{ id: 'req_0', name: 'Voter ID' }] : [])));

    if (targetAg.requireTenantId && requiredIds.length > 0) {
      const missingIds = requiredIds.filter((item) => !uploadedIdsState[item.id] || !uploadedIdsState[item.id].fileUrl);
      if (missingIds.length > 0) {
        showToast(`⚠️ Please upload all required ID documents (${missingIds.map((m) => m.name).join(', ')}).`);
        return;
      }
    }

    if (!agreedToTerms) {
      showToast('Please check the confirmation box to certify your genuine ink signature.');
      return;
    }

    setIsSubmittingUpload(true);
    try {
      const uploadedIdsArray = Object.values(uploadedIdsState);
      await uploadSignedAgreement(targetAg.id, signedFileData, signedFileName, uploadedIdsArray);

      if (optInAutopayDuringLease) {
        const rentVal = Number(targetAg.rent) || Number(tenantRecord?.rent) || 0;
        const dueDay = targetAg.rentDueDay || 1;
        const nextD = new Date();
        nextD.setDate(dueDay);
        if (nextD.getTime() <= Date.now()) {
          nextD.setMonth(nextD.getMonth() + 1);
        }
        await updateAgreementAutopay(targetAg.id, {
          enabled: true,
          status: 'active',
          activeGateway: 'razorpay',
          mandateId: `mandate_lease_${Date.now()}`,
          authInstrument: 'upi',
          paymentMethodDisplay: 'UPI AutoPay (Google Pay / PhonePe)',
          rentAmount: rentVal,
          maxAuthorizedAmount: rentVal * 1.5,
          currency: targetAg.currency || tenantRecord?.currency || 'INR',
          billingDay: dueDay,
          rentDueDay: dueDay,
          nextDebitDate: nextD.toISOString().split('T')[0],
          failureCount: 0,
          updatedAt: new Date().toISOString(),
        }).catch(console.warn);
      }

      setIsUploadSignedOpen(false);
      setSelectedAgreement(null);
      setSignedFileData(null);
      setSignedFileName('');
      setSignedFileSize(null);
      setUploadedIdsState({});
      setAgreedToTerms(false);
      showToast('✓ Signed agreement uploaded and Rent Autopay activated! Awaiting landlord approval.');
    } catch (err) {
      console.error(err);
      showToast('Failed to upload signed agreement. Please try again.');
    } finally {
      setIsSubmittingUpload(false);
    }
  };

  const handleRequestRenewal = async (targetAgParam?: Agreement) => {
    const targetAg = targetAgParam || selectedAgreementForRenewalRequest || myAgreement;
    const targetUnit = targetAg?.unit || activeUnit || tenantRecord.unit;
    if (!targetUnit || targetUnit === 'Unassigned') {
      showToast('No assigned rental unit found to request renewal.');
      return;
    }
    await requestLeaseRenewal(targetUnit, undefined, targetAg?.propertyId);
    setSelectedAgreementForRenewalRequest(null);
  };

  const handleGiveNotice = async () => {
    const targetAg = selectedAgreementForNotice || myAgreement;
    const resolvedUnit = targetAg?.unit || activeUnit || tenantRecord.unit;
    const resolvedPropertyId = targetAg?.propertyId || '';

    const matchedUnit = state.units.find(
      (u) =>
        (u.unitNumber === resolvedUnit || u.id === resolvedUnit) &&
        (!resolvedPropertyId || u.propertyId === resolvedPropertyId)
    );
    const matchedAgreement =
      targetAg ||
      state.agreements.find(
        (a) =>
          (a.unit === resolvedUnit || a.id === resolvedUnit) &&
          (!resolvedPropertyId || a.propertyId === resolvedPropertyId) &&
          (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
      );

    const resolvedOwnerId =
      matchedAgreement?.ownerId ||
      matchedUnit?.ownerId ||
      targetOwner?.id ||
      tenantRecord.ownerId ||
      '';

    const resolvedOwnerName =
      matchedAgreement?.approvedBy ||
      matchedAgreement?.counterSignatory ||
      matchedAgreement?.ownerName ||
      targetOwner?.displayName ||
      (matchedUnit as any)?.owner ||
      tenantRecord.owner ||
      'Property Owner';

    const resolvedDeposit =
      matchedAgreement?.deposit ||
      matchedUnit?.deposit ||
      tenantRecord.deposit ||
      0;

    const resolvedCurrency =
      matchedAgreement?.currency ||
      matchedUnit?.currency ||
      currentProperty?.currency ||
      tenantRecord?.currency ||
      DEFAULT_CURRENCY;
    const moveOutDate = noticeDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const initialChecklist = [
      { room: 'Living Room', item: 'Paint, Walls & Ceilings', amenity: 'Paint, Walls & Ceilings', condition: 'good' as const, deduction: 0, photos: [], notes: '' },
      { room: 'Kitchen', item: 'Counters, Cabinets & Appliances', amenity: 'Counters, Cabinets & Appliances', condition: 'good' as const, deduction: 0, photos: [], notes: '' },
      { room: 'Bedrooms', item: 'Doors, Windows, Locks & Keys', amenity: 'Doors, Windows, Locks & Keys', condition: 'good' as const, deduction: 0, photos: [], notes: '' },
      { room: 'Bathroom', item: 'Plumbing, Sanitary & Taps', amenity: 'Plumbing, Sanitary & Taps', condition: 'good' as const, deduction: 0, photos: [], notes: '' },
      { room: 'Premises', item: 'Flooring, Tiles & Carpets', amenity: 'Flooring, Tiles & Carpets', condition: 'good' as const, deduction: 0, photos: [], notes: '' },
      { room: 'Utility / Balcony', item: 'Electrical, Lighting & Fixtures', amenity: 'Electrical, Lighting & Fixtures', condition: 'good' as const, deduction: 0, photos: [], notes: '' },
    ];

    const newMoveOut: MoveOutRequest = {
      id: `MO-${Math.floor(1000 + Math.random() * 9000)}`,
      ownerId: resolvedOwnerId,
      ownerName: resolvedOwnerName,
      unit: resolvedUnit,
      propertyId: resolvedPropertyId || matchedUnit?.propertyId || '',
      agreementId: matchedAgreement?.id || undefined,
      tenant: user?.displayName || tenantRecord.name,
      tenantId: user?.id,
      tenantEmail: user?.email || tenantRecord.email,
      tenantPhone: user?.phone || tenantRecord.phone,
      owner: resolvedOwnerName,
      moveOutDate,
      deposit: resolvedDeposit,
      currency: resolvedCurrency,
      status: 'requested',
      inspectionDate: null,
      refundDate: null,
      amenityPhotos: [],
      outcome: null,
      inspectionChecklist: initialChecklist,
      createdAt: new Date().toISOString(),
    };

    const notif = resolvedOwnerId
      ? {
        id: `notif_${Date.now()}`,
        userId: resolvedOwnerId,
        title: 'Move-Out Notice Received',
        body: `${user?.displayName || tenantRecord.name} has submitted move-out notice for Unit ${resolvedUnit}, effective ${moveOutDate}.`,
        link: '/owner/vacates',
        isRead: false,
        createdAt: new Date().toISOString(),
      }
      : null;

    await saveMoveout(newMoveOut as any);
    if (notif) {
      updateState((prev) => ({
        ...prev,
        notifications: [...(prev.notifications || []), notif],
      }));
    }

    const matchingRenewalForUnit = (state.renewals || []).find(
      (r) =>
        (r.unit === resolvedUnit || r.id === resolvedUnit) &&
        (!resolvedPropertyId || !r.propertyId || r.propertyId === resolvedPropertyId)
    );
    if (matchingRenewalForUnit && matchingRenewalForUnit.status !== 'rejected') {
      await respondToLeaseRenewal(
        resolvedUnit,
        'rejected',
        'Superseded by move-out notice',
        resolvedPropertyId
      );
    }

    setIsNoticeOpen(false);
    setSelectedAgreementForNotice(null);
    showToast(
      `✓ Move-out notice submitted. ${resolvedOwnerName} has been notified to schedule an inspection.`
    );
  };

  const getMoveoutBadge = (s: string) => {
    switch (s) {
      case 'requested':
      case 'notice_filed':
        return <span className="badge amber">Notice received</span>;
      case 'inspection_scheduled':
        return <span className="badge amber">Inspection scheduled</span>;
      case 'inspected':
        return <span className="badge amber">Inspected</span>;
      case 'refund_scheduled':
      case 'awaiting_tenant_approval':
      case 'settlement_pending':
        return <span className="badge amber">Refund scheduled</span>;
      case 'refund_completed':
      case 'settled':
        return <span className="badge green">Refund completed</span>;
      default:
        return <span className="badge grey">{s}</span>;
    }
  };

  return (
    <div>
      {/* Tenancy Execution Lifecycle Status Banners */}
      {pendingInvitation ? (
        <div style={{ background: 'var(--surface)', border: '2px solid var(--amber)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber)', fontWeight: 700, fontSize: '15px' }}>
                <Clock size={18} /> Tenancy Invitation Awaiting Your Response
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.5, maxWidth: '100%' }}>
                Your landlord <b style={{ color: 'var(--ink)' }}>{pendingInvitation.ownerName}</b> has invited you to lease <b style={{ color: 'var(--ink)' }}>Unit {pendingInvitation.unitNumber}</b> ({pendingInvitation.propertyName}).
                Please review and accept this tenancy invitation on your Dashboard first before proceeding to physical ink signing and security deposit settlement.
              </p>
            </div>
            <Link to="/tenant/dashboard" className="btn brass small" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Review Invitation on Dashboard &rarr;
            </Link>
          </div>
        </div>
      ) : !myAgreement ? (
        <div style={{ background: '#F8F9FA', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileText size={20} color="var(--ink-soft)" />
          <div>
            <b style={{ color: 'var(--ink)' }}>No Lease Agreement Pending</b>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', margin: 0 }}>
              Your landlord will draft and dispatch your tenancy agreement here. Once dispatched, you will download and physically sign it.
            </p>
          </div>
        </div>
      ) : isPendingApproval ? (
        <div style={{ background: 'var(--surface)', border: '2px solid var(--amber)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber)', fontWeight: 700, fontSize: '15px' }}>
                <Clock size={18} /> Step 2: Awaiting Landlord Approval
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.5, maxWidth: '100%' }}>
                Your ink-signed lease agreement for <b style={{ color: 'var(--ink)' }}>Unit {(activeUnit || myAgreement.unit || '').replace(/^unit\s*/i, '')}{resolvedPropertyName ? ` • ${resolvedPropertyName}` : ''}</b> was received. Your landlord is currently reviewing the document. Once approved, your security deposit invoice will be unlocked for payment.
              </p>
            </div>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                setSelectedAgreement(myAgreement);
                setIsViewAgOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Eye size={13} /> View Uploaded Signed Copy
            </button>
          </div>
        </div>
      ) : isAwaitingUpload ? (
        <div style={{ background: 'var(--surface)', border: myAgreement?.rejectionReason ? '2px solid #DC2626' : '2px solid var(--amber)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ width: '100%' }}>
              {myAgreement?.rejectionReason ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#DC2626', fontWeight: 700, fontSize: '15px' }}>
                    <AlertTriangle size={18} /> Signed Document Rejected by Landlord
                  </div>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '10px 14px', margin: '10px 0', fontSize: '13px', color: '#991B1B' }}>
                    <b>Feedback / Reason:</b> {myAgreement.rejectionReason}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.5 }}>
                    Please review the feedback above, re-sign or rectify the document, and upload your corrected signed copy below to resubmit for landlord approval.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber)', fontWeight: 700, fontSize: '15px' }}>
                    <Clock size={18} /> Step 1: Physical Signature Required
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.5, maxWidth: '100%' }}>
                    Your landlord has prepared your tenancy agreement for <b style={{ color: 'var(--ink)' }}>Unit {(activeUnit || myAgreement.unit || '').replace(/^unit\s*/i, '')}{resolvedPropertyName ? ` • ${resolvedPropertyName}` : ''}</b>.
                    Download the official agreement PDF, sign physically in ink offline, and upload the scanned document to trigger your security deposit invoice.
                  </p>
                </>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn secondary btn-mobile-full"
                  onClick={handleDownloadDraft}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={15} /> 1. Download Formal Agreement (PDF)
                </button>
                <button
                  type="button"
                  className="btn brass btn-mobile-full"
                  onClick={() => setIsUploadSignedOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Upload size={15} /> {myAgreement?.rejectionReason ? '2. Re-upload Corrected Signed Copy' : '2. Upload Signed Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : isPendingDeposit ? (
        <div style={{ background: 'var(--surface)', border: '2px solid var(--teal-primary)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--teal-primary)', fontWeight: 700, fontSize: '15px' }}>
                <CreditCard size={18} /> Step 3: Agreement Approved! Settle Move-in Security Deposit
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                Landlord approved your signed lease for <b style={{ color: 'var(--ink)' }}>Unit {(activeUnit || myAgreement.unit || '').replace(/^unit\s*/i, '')}{resolvedPropertyName ? ` • ${resolvedPropertyName}` : ''}</b>! Please settle your refundable security deposit of <b style={{ color: 'var(--ink)' }}>{getCurrencySymbol(myAgreement.currency || agreementCurrency)}{(myAgreement.deposit || tenantRecord?.deposit || 0).toLocaleString('en-IN')}</b> (Invoice #{myAgreement.depositInvoiceId || 'DEP'}) to complete lease activation.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary small btn-mobile-full"
                onClick={() => {
                  setSelectedAgreement(myAgreement);
                  setIsViewAgOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Eye size={13} /> View Signed Copy
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={() => navigate('/tenant/payments')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <CreditCard size={15} /> Pay Security Deposit →
              </button>
            </div>
          </div>
        </div>
      ) : myAgreement && isActiveLease ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--teal-light)', color: 'var(--teal-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={16} />
            </div>
            <span style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
              <b>Lease Agreement Active & Fully Executed.</b> Unit <b>{(activeUnit || myAgreement.unit || '').replace(/^unit\s*/i, '')}{resolvedPropertyName ? ` • ${resolvedPropertyName}` : ''}</b> is officially registered.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary small btn-mobile-full"
              onClick={() => handleDownloadDraft(myAgreement)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Download size={13} /> Official PDF
            </button>
            <button
              type="button"
              className="btn secondary small btn-mobile-full"
              onClick={() => {
                setSelectedAgreement(myAgreement);
                setIsViewAgOpen(true);
              }}
            >
              View Details
            </button>
          </div>
        </div>
      ) : null}

      <div className="tabs">
        <div
          className={`tab ${subTab === 'owner' ? 'active' : ''}`}
          onClick={() => setSubTab('owner')}
        >
          Owner & lease
        </div>
        <div
          className={`tab ${subTab === 'renewal' ? 'active' : ''}`}
          onClick={() => setSubTab('renewal')}
        >
          Renew or vacate
        </div>
      </div>

      {subTab === 'owner' ? (
        <div>
          {/* Tenancy Offer Notice if pending acceptance */}
          {pendingInvitation && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '14px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={18} color="#B45309" />
                <div>
                  <b style={{ color: '#92400E', fontSize: '13.5px' }}>New Tenancy Invitation Pending Your Acceptance</b>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#B45309' }}>
                    Landlord <b>{pendingInvitation.ownerName}</b> invited you to Unit <b>{pendingInvitation.unitNumber}</b> ({pendingInvitation.propertyName}). Review and accept terms on your Dashboard.
                  </p>
                </div>
              </div>
              <Link to="/tenant/dashboard" className="btn brass small" style={{ fontSize: '12px', padding: '6px 14px' }}>
                Review on Dashboard &rarr;
              </Link>
            </div>
          )}

          {/* Unified Tenancy Records & Lease Agreements Table */}
          {(() => {
            // Build unified list of records across current agreements & past ledger history
            const unifiedRecords: Array<{
              id: string;
              ref: string;
              unit: string;
              property: string;
              owner: string;
              period: string;
              rentDisplay: string;
              depositDisplay: string;
              statusCategory: 'active' | 'pending' | 'concluded';
              statusBadgeText: string;
              statusBg: string;
              statusColor: string;
              rawAgreement?: Agreement;
              isHistoryRecord?: boolean;
            }> = [];

            // Add all lease agreements (active, pending, and past concluded)
            const agreementsToDisplay = rawAgreements.length > 0 ? rawAgreements : displayAgreements;
            agreementsToDisplay.forEach((ag) => {
              const normUnit = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
              const cleanAgUnit = normUnit(ag.unit);

              const prop = state.properties.find((p) => p.id === ag.propertyId);
              const agProp = prop?.name || (ag as any).propertyName || tenantRecord?.propertyName || 'Residence';
              const resolvedOwnerName = ag.ownerName || tenantRecord?.owner || 'Property Owner';

              // Check if there is an unaccepted/pending tenancy invitation for this agreement/unit
              const hasPendingInviteForAg = (state.tenancyRequests || []).some(
                (r) =>
                  r.status === 'pending' &&
                  (normUnit(r.unitNumber) === cleanAgUnit || r.unitId === ag.unit) &&
                  (r.tenantId === ag.tenantId || (r.tenantEmail && ag.tenantEmail && r.tenantEmail.toLowerCase() === ag.tenantEmail.toLowerCase()))
              );

              const isAgTerminated = ag.status === 'terminated' || (ag.status as string) === 'cancelled';
              const isAgPendingApproval = !isAgTerminated && (ag.status === 'pending_approval' || (ag as any).status === 'awaiting_owner_signature');
              const isAgPendingDeposit = !isAgTerminated && !hasPendingInviteForAg && (ag.status === 'pending_deposit' || (ag.status === 'active' && ag.depositStatus === 'unpaid'));
              const isAgAwaitingSign = !isAgTerminated && (ag.status === 'awaiting_tenant_signature' || ag.status === 'awaiting_tenant_upload' || (!ag.signedDocumentUrl && !isAgTerminated && !isAgPendingApproval && !isAgPendingDeposit && !hasPendingInviteForAg));
              const isAgActive = !isAgTerminated && !hasPendingInviteForAg && ag.status === 'active' && ag.depositStatus === 'paid';

              let statusCategory: 'active' | 'pending' | 'concluded' = 'pending';
              let statusColor = '#B45309';
              let statusBg = '#FEF3C7';
              let statusBadgeText = 'Pending Approval';

              if (isAgTerminated) {
                statusCategory = 'concluded';
                statusColor = '#64748B';
                statusBg = '#F1F5F9';
                statusBadgeText = 'Concluded';
              } else if (hasPendingInviteForAg) {
                statusCategory = 'pending';
                statusColor = '#B45309';
                statusBg = '#FEF3C7';
                statusBadgeText = 'Pending Acceptance';
              } else if (isAgActive) {
                statusCategory = 'active';
                statusColor = '#15803D';
                statusBg = '#DCFCE7';
                statusBadgeText = '✓ Active Lease';
              } else if (isAgPendingDeposit) {
                statusCategory = 'pending';
                statusColor = '#1D4ED8';
                statusBg = '#DBEAFE';
                statusBadgeText = 'Deposit Due';
              } else if (isAgPendingApproval) {
                statusCategory = 'pending';
                statusColor = '#B45309';
                statusBg = '#FEF3C7';
                statusBadgeText = 'Pending Approval';
              } else if (isAgAwaitingSign) {
                statusCategory = 'pending';
                statusColor = '#B45309';
                statusBg = '#FEF3C7';
                statusBadgeText = 'Signature Pending';
              }

              unifiedRecords.push({
                id: ag.id,
                ref: `#${ag.id.slice(-6).toUpperCase()}`,
                unit: ag.unit || '—',
                property: agProp,
                owner: ag.ownerName || resolvedOwnerName,
                period: `${ag.start || 'Start'} → ${ag.end || 'End'}`,
                rentDisplay: `${getCurrencySymbol(ag.currency || agreementCurrency)}${(ag.rent || 0).toLocaleString('en-IN')}/mo`,
                depositDisplay: `Dep: ${getCurrencySymbol(ag.currency || agreementCurrency)}${(ag.deposit || 0).toLocaleString('en-IN')}`,
                statusCategory,
                statusBadgeText,
                statusBg,
                statusColor,
                rawAgreement: ag,
              });
            });

            // Add previous tenancy & rental history
            const pastHistory = (tenantRecord?.history || []).filter(
              (h) => h && h.period && !h.period.toLowerCase().includes('pending')
            );
            pastHistory.forEach((h, idx) => {
              unifiedRecords.push({
                id: `hist_${idx}`,
                ref: `#HIST-${idx + 1}`,
                unit: tenantRecord?.unit || '—',
                property: h.property || 'Previous Residence',
                owner: h.owner || 'Past Landlord',
                period: h.period,
                rentDisplay: '—',
                depositDisplay: 'Settled',
                statusCategory: 'concluded',
                statusBadgeText: 'Concluded',
                statusBg: '#F1F5F9',
                statusColor: '#64748B',
                isHistoryRecord: true,
              });
            });

            const filteredRecords = unifiedRecords.filter((rec) => {
              if (ownerLeaseFilter === 'all') return true;
              return rec.statusCategory === ownerLeaseFilter;
            });

            const counts = {
              all: unifiedRecords.length,
              active: unifiedRecords.filter((r) => r.statusCategory === 'active').length,
              pending: unifiedRecords.filter((r) => r.statusCategory === 'pending').length,
              concluded: unifiedRecords.filter((r) => r.statusCategory === 'concluded').length,
            };

            return (
              <div className="panel" style={{ marginBottom: '22px' }}>
                <div className="panel-body">
                  {/* Table Header & Filter Tabs */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700 }}>Tenancy Records &amp; Lease Agreements</h4>
                      <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--ink-soft)' }}>
                        All current agreements, pending executions, and past rental history records
                      </p>
                    </div>

                    {/* Filter Pills */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {[
                        { id: 'all', label: 'All Records', count: counts.all },
                        { id: 'active', label: 'Active', count: counts.active },
                        { id: 'pending', label: 'Pending', count: counts.pending },
                        { id: 'concluded', label: 'Concluded / History', count: counts.concluded },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setOwnerLeaseFilter(f.id as any)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: ownerLeaseFilter === f.id ? 700 : 500,
                            border: ownerLeaseFilter === f.id ? '1px solid var(--brass)' : '1px solid var(--line)',
                            background: ownerLeaseFilter === f.id ? 'var(--brass)' : '#ffffff',
                            color: ownerLeaseFilter === f.id ? '#ffffff' : 'var(--ink)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>{f.label}</span>
                          <span
                            style={{
                              fontSize: '10.5px',
                              padding: '1px 6px',
                              borderRadius: '999px',
                              background: ownerLeaseFilter === f.id ? 'rgba(255, 255, 255, 0.25)' : 'var(--surface-sunken, #f1f0eb)',
                              color: ownerLeaseFilter === f.id ? '#ffffff' : 'var(--ink-soft)',
                            }}
                          >
                            {f.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredRecords.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 20px', background: '#FAFAF7', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <FileText size={36} style={{ margin: '0 auto 10px', display: 'block', color: 'var(--ink-soft)', opacity: 0.4 }} />
                      <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: 'var(--ink)' }}>No Records Found</h4>
                      <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
                        There are no records matching the selected filter ({ownerLeaseFilter}).
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="desktop-table-view">
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: 'var(--surface-sunken, #f9f8f5)' }}>
                                {['Reference', 'Unit & Property', 'Landlord / Owner', 'Lease Period', 'Rent & Deposit', 'Status', 'Action'].map((h) => (
                                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 600, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredRecords.map((rec, idx) => (
                                <tr key={rec.id} style={{ borderBottom: '1px solid var(--line)', background: idx % 2 === 0 ? '#ffffff' : 'var(--surface-sunken, #fbfaf8)' }}>
                                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--brass)', whiteSpace: 'nowrap' }}>
                                    {rec.ref}
                                  </td>
                                  <td style={{ padding: '12px' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Unit {rec.unit}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{rec.property}</div>
                                  </td>
                                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontWeight: 500 }}>{rec.owner}</div>
                                  </td>
                                  <td style={{ padding: '12px', whiteSpace: 'nowrap', fontSize: '12px' }}>
                                    <div>{rec.period}</div>
                                  </td>
                                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontWeight: 600 }}>{rec.rentDisplay}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{rec.depositDisplay}</div>
                                  </td>
                                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: rec.statusBg, color: rec.statusColor }}>
                                      {rec.statusBadgeText}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => {
                                          if (rec.rawAgreement) {
                                            setSelectedAgreement(rec.rawAgreement);
                                          } else {
                                            setSelectedAgreement({
                                              id: rec.ref.replace('#', ''),
                                              ownerId: tenantRecord.ownerId || '',
                                              unit: rec.unit,
                                              ownerName: rec.owner,
                                              start: rec.period.includes('→') ? rec.period.split('→')[0].trim() : rec.period,
                                              end: rec.period.includes('→') ? rec.period.split('→')[1].trim() : '',
                                              rent: tenantRecord.rent || 0,
                                              deposit: tenantRecord.deposit || 0,
                                              status: 'terminated',
                                              depositStatus: 'paid',
                                              propertyId: '',
                                              tenant: tenantRecord.name,
                                              tenantId: tenantRecord.id,
                                              type: 'builder',
                                              autoRenew: false,
                                            });
                                          }
                                          setIsViewAgOpen(true);
                                        }}
                                      >
                                        <Eye size={13} /> View
                                      </button>
                                      {rec.rawAgreement && (
                                        <button
                                          type="button"
                                          className="btn secondary small"
                                          title="Download Agreement PDF"
                                          style={{ padding: '5px 8px' }}
                                          onClick={() => handleDownloadDraft(rec.rawAgreement)}
                                        >
                                          <Download size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Mobile Card View */}
                      <div className="mobile-card-view">
                        {filteredRecords.map((rec) => (
                          <div key={rec.id} className="staff-card">
                            <div className="staff-card-header">
                              <div>
                                <span style={{ fontWeight: 700, color: 'var(--brass)', fontSize: '14px' }}>{rec.ref}</span>
                                <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginTop: '2px' }}>
                                  Unit {rec.unit} • {rec.property}
                                </div>
                              </div>
                              <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: rec.statusBg, color: rec.statusColor }}>
                                {rec.statusBadgeText}
                              </span>
                            </div>

                            <div className="staff-card-meta">
                              <div className="staff-card-meta-item">
                                <b>Landlord:</b> {rec.owner}
                              </div>
                              <div className="staff-card-meta-item">
                                <b>Period:</b> {rec.period}
                              </div>
                              <div className="staff-card-meta-item">
                                <b>Rent:</b> {rec.rentDisplay} ({rec.depositDisplay})
                              </div>
                            </div>

                            <div className="staff-card-footer">
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                onClick={() => {
                                  if (rec.rawAgreement) {
                                    setSelectedAgreement(rec.rawAgreement);
                                  } else {
                                    setSelectedAgreement({
                                      id: rec.ref.replace('#', ''),
                                      ownerId: tenantRecord.ownerId || '',
                                      unit: rec.unit,
                                      ownerName: rec.owner,
                                      start: rec.period.includes('→') ? rec.period.split('→')[0].trim() : rec.period,
                                      end: rec.period.includes('→') ? rec.period.split('→')[1].trim() : '',
                                      rent: tenantRecord.rent || 0,
                                      deposit: tenantRecord.deposit || 0,
                                      status: 'terminated',
                                      depositStatus: 'paid',
                                      propertyId: '',
                                      tenant: tenantRecord.name,
                                      tenantId: tenantRecord.id,
                                      type: 'builder',
                                      autoRenew: false,
                                    });
                                  }
                                  setIsViewAgOpen(true);
                                }}
                              >
                                <Eye size={13} /> View Details
                              </button>
                              {rec.rawAgreement && (
                                <button
                                  type="button"
                                  className="btn brass small btn-mobile-full"
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                  onClick={() => handleDownloadDraft(rec.rawAgreement)}
                                >
                                  <Download size={13} /> Download
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Active Residences & Lease Renewals Table */}
          <div className="panel">
            <div className="panel-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Active Residences &amp; Lease Renewals</h3>
                <p className="hint" style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  Review terms, request lease renewals, or schedule move-out notices for each of your rented properties.
                </p>
              </div>
              <span className="badge brass" style={{ fontWeight: 600 }}>
                {displayAgreements.length} Active {displayAgreements.length === 1 ? 'Residence' : 'Residences'}
              </span>
            </div>

            <div className="panel-body" style={{ padding: 0 }}>
              {displayAgreements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px' }}>
                  <Building size={32} style={{ color: 'var(--ink-soft)', margin: '0 auto 8px', display: 'block' }} />
                  <p className="hint" style={{ fontSize: '13.5px', margin: 0 }}>No active residential leases found on record.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-sunken, #f9f8f5)' }}>
                        {['Property & Residence', 'Landlord / Owner', 'Lease Period', 'Rent & Deposit', 'Renewal Status', 'Actions'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontWeight: 600, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayAgreements.map((ag, idx) => {
                        const unitObj = state.units.find(
                          (u) =>
                            (u.unitNumber === ag.unit || u.id === ag.unit) &&
                            (!ag.propertyId || u.propertyId === ag.propertyId)
                        );
                        const propObj = state.properties.find(
                          (p) => p.id === ag.propertyId || p.id === unitObj?.propertyId
                        );
                        const propName = propObj?.name || tenantRecord?.propertyName || 'Residence Property';
                        const ownerObj = state.users.find(
                          (u) => u.id === ag.ownerId || u.id === propObj?.ownerId || u.id === unitObj?.ownerId
                        );
                        const landlordName =
                          ag.approvedBy ||
                          ag.counterSignatory ||
                          ag.ownerName ||
                          ownerObj?.displayName ||
                          tenantRecord.owner ||
                          'Property Owner';

                        const matchingRenewal = (state.renewals || []).find(
                          (r) =>
                            (r.unit === ag.unit || r.id === ag.unit) &&
                            (!ag.propertyId || !r.propertyId || r.propertyId === ag.propertyId)
                        );

                        const matchingMoveOut = (myMoveOuts || []).find(
                          (mo) =>
                            mo.unit === ag.unit &&
                            (!ag.propertyId || !mo.propertyId || mo.propertyId === ag.propertyId)
                        );

                        const leaseEndStr = ag.end || tenantRecord.leaseEnd || '';
                        let daysRemaining: number | null = null;
                        if (leaseEndStr) {
                          const endMs = new Date(leaseEndStr).getTime();
                          if (!isNaN(endMs)) {
                            daysRemaining = Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24));
                          }
                        }

                        return (
                          <tr
                            key={ag.id || `${ag.propertyId}_${ag.unit}_${idx}`}
                            style={{
                              borderBottom: '1px solid var(--line)',
                              background: idx % 2 === 0 ? '#ffffff' : 'var(--surface-sunken, #fbfaf8)',
                            }}
                          >
                            {/* Residence & Property */}
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#FEF3C7', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Home size={16} />
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{propName}</div>
                                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--brass)' }}>Unit {ag.unit}</span>
                                    {(unitObj?.unitType || (unitObj as any)?.type) && (
                                      <span>• {unitObj?.unitType || (unitObj as any)?.type}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Landlord / Owner */}
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{landlordName}</div>
                              {ownerObj?.email && (
                                <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                  {ownerObj.email}
                                </div>
                              )}
                            </td>

                            {/* Lease Period & Timeline */}
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 600, fontSize: '12.5px' }}>
                                {ag.start || 'Start'} → {ag.end || tenantRecord.leaseEnd || 'End'}
                              </div>
                              <div style={{ marginTop: '4px' }}>
                                {daysRemaining !== null ? (
                                  daysRemaining < 0 ? (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#DC2626' }}>
                                      Expired {Math.abs(daysRemaining)} days ago
                                    </span>
                                  ) : daysRemaining <= 30 ? (
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#D97706' }}>
                                      ⚠️ {daysRemaining} days remaining
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#0284C7' }}>
                                      {daysRemaining} days remaining
                                    </span>
                                  )
                                ) : (
                                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Ongoing term</span>
                                )}
                              </div>
                            </td>

                            {/* Rent & Deposit */}
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                {getCurrencySymbol(ag.currency || agreementCurrency)}{(ag.rent || tenantRecord.rent || 0).toLocaleString('en-IN')}<span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--ink-soft)' }}>/mo</span>
                              </div>
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                Deposit: {getCurrencySymbol(ag.currency || agreementCurrency)}{(ag.deposit || tenantRecord.deposit || 0).toLocaleString('en-IN')}
                              </div>
                            </td>

                            {/* Renewal Status */}
                            <td style={{ padding: '12px 16px' }}>
                              {matchingMoveOut ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#FEF3C7', color: '#B45309' }}>
                                  🚪 Notice: {matchingMoveOut.status.replace('_', ' ')}
                                </span>
                              ) : matchingRenewal?.status === 'renewal_offered' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: '#DBEAFE', color: '#1D4ED8' }}>
                                    ✨ Offer: +{matchingRenewal.percentageIncrease || 0}% Increment
                                  </span>
                                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                    Proposed: <b>{getCurrencySymbol(matchingRenewal.currency || ag.currency || agreementCurrency)}{(matchingRenewal.proposedRent || 0).toLocaleString('en-IN')}/mo</b>
                                  </span>
                                </div>
                              ) : matchingRenewal?.status === 'renewal_requested' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#FEF3C7', color: '#D97706' }}>
                                  <Clock size={12} /> Awaiting Landlord Offer
                                </span>
                              ) : matchingRenewal?.status === 'signed_by_tenant' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#FEF3C7', color: '#D97706' }}>
                                  <Clock size={12} /> Signed Copy Uploaded
                                </span>
                              ) : matchingRenewal?.status === 'accepted' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#DCFCE7', color: '#15803D' }}>
                                    ✓ Confirmed &amp; Active
                                  </span>
                                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                    Through {matchingRenewal.newLeaseEnd}
                                  </span>
                                </div>
                              ) : matchingRenewal?.status === 'rejected' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#FEE2E2', color: '#DC2626' }}>
                                  Offer Declined
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#F3F4F6', color: 'var(--ink-soft)' }}>
                                  Active Tenancy
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '12px 16px' }}>
                              {matchingMoveOut ? (
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                  onClick={() => setSelectedMoveOut(matchingMoveOut)}
                                >
                                  <Eye size={13} /> View Move-Out
                                </button>
                              ) : matchingRenewal?.status === 'renewal_offered' ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: 600 }}
                                    onClick={() => setSelectedRenewalForReview({ agreement: ag, renewal: matchingRenewal })}
                                  >
                                    <Sparkles size={13} /> Review Offer &amp; Sign
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ color: '#DC2626', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setSelectedAgreementForNotice(ag);
                                      setIsNoticeOpen(true);
                                    }}
                                  >
                                    Vacate
                                  </button>
                                </div>
                              ) : matchingRenewal?.status === 'renewal_requested' ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span className="hint" style={{ fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                                    Waiting for landlord
                                  </span>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ color: '#DC2626', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setSelectedAgreementForNotice(ag);
                                      setIsNoticeOpen(true);
                                    }}
                                  >
                                    Vacate
                                  </button>
                                </div>
                              ) : matchingRenewal?.status === 'signed_by_tenant' ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {matchingRenewal.tenantSignedFileUrl && (
                                    <a
                                      href={matchingRenewal.tenantSignedFileUrl}
                                      download={matchingRenewal.tenantSignedFileName || `Signed_Renewal_${ag.unit}.pdf`}
                                      className="btn secondary small"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', textDecoration: 'none' }}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Download size={13} /> Signed Copy
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ color: '#DC2626', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setSelectedAgreementForNotice(ag);
                                      setIsNoticeOpen(true);
                                    }}
                                  >
                                    Vacate
                                  </button>
                                </div>
                              ) : matchingRenewal?.status === 'accepted' ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {(matchingRenewal.tenantSignedFileUrl || matchingRenewal.ownerAgreementFileUrl) && (
                                    <a
                                      href={matchingRenewal.tenantSignedFileUrl || matchingRenewal.ownerAgreementFileUrl || '#'}
                                      download={matchingRenewal.tenantSignedFileName || matchingRenewal.ownerAgreementFileName || `Executed_Renewal_${ag.unit}.pdf`}
                                      className="btn secondary small"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', textDecoration: 'none' }}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Download size={13} /> Contract
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ whiteSpace: 'nowrap' }}
                                    onClick={() => handleRequestRenewal(ag)}
                                  >
                                    Next Renewal
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ color: '#DC2626', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setSelectedAgreementForNotice(ag);
                                      setIsNoticeOpen(true);
                                    }}
                                  >
                                    Vacate
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                    onClick={() => handleRequestRenewal(ag)}
                                  >
                                    Request Renewal
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ color: '#DC2626', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setSelectedAgreementForNotice(ag);
                                      setIsNoticeOpen(true);
                                    }}
                                  >
                                    Notice to Vacate
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Move-Out & Settlement Requests Table */}
          {myMoveOuts.length > 0 && (
            <div className="panel">
              <div className="panel-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Move-Out &amp; Vacate Requests</h4>
                  <p className="hint" style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
                    Track walkthroughs, inspection schedules, and security deposit return statuses.
                  </p>
                </div>
                <span className="hint" style={{ fontSize: '12px' }}>{myMoveOuts.length} request{myMoveOuts.length > 1 ? 's' : ''}</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-sunken, #f9f8f5)' }}>
                        {['Reference', 'Property / Unit', 'Move-Out Date', 'Inspection', 'Deposit Held', 'Status', 'Action'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {myMoveOuts.map((mo, idx) => {
                        const moProp = state.properties.find(p => p.id === mo.propertyId)?.name || 'Residence Property';
                        const statusLabel: Record<string, string> = {
                          requested: 'Notice Received',
                          inspection_scheduled: 'Inspection Scheduled',
                          inspected: 'Walkthrough Done',
                          refund_scheduled: 'Refund Scheduled',
                          refund_completed: 'Settled & Released',
                        };
                        const statusColor: Record<string, string> = {
                          requested: '#B45309',
                          inspection_scheduled: '#1D4ED8',
                          inspected: '#6D28D9',
                          refund_scheduled: '#0369A1',
                          refund_completed: '#15803D',
                        };
                        const statusBg: Record<string, string> = {
                          requested: '#FEF3C7',
                          inspection_scheduled: '#DBEAFE',
                          inspected: '#EDE9FE',
                          refund_scheduled: '#E0F2FE',
                          refund_completed: '#DCFCE7',
                        };
                        const matchClaim = (state.cashClaims || []).find(
                          (c) =>
                            (c.status === 'pending_confirmation' || (c as any).status === 'pending') &&
                            c.claimedByRole === 'owner' &&
                            (c.moveOutId === mo.id || c.unit === mo.unit)
                        );
                        return (
                          <tr key={mo.id} style={{ borderBottom: '1px solid var(--line)', background: idx % 2 === 0 ? '#ffffff' : 'var(--surface-sunken, #fbfaf8)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--brass)' }}>#{mo.id.slice(-6).toUpperCase()}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontWeight: 600 }}>Unit {mo.unit || '—'}</div>
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{moProp}</div>
                            </td>
                            <td style={{ padding: '10px 14px' }}>{mo.moveOutDate || '—'}</td>
                            <td style={{ padding: '10px 14px' }}>{mo.inspectionDate || <span className="hint">Awaiting</span>}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{mo.currency || DEFAULT_CURRENCY_SYMBOL}{(mo.deposit || 0).toLocaleString('en-IN')}</td>
                            <td style={{ padding: '10px 14px' }}>
                              {mo.status === 'refund_scheduled' && matchClaim ? (
                                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#FEF3C7', color: '#B45309' }}>
                                  ⏳ Cash Handover Pending
                                </span>
                              ) : (
                                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: statusBg[mo.status] || '#F3F4F6', color: statusColor[mo.status] || 'var(--ink)' }}>
                                  {statusLabel[mo.status] || mo.status}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {matchClaim && (
                                  <button
                                    type="button"
                                    className="btn small"
                                    style={{
                                      background: '#16A34A',
                                      color: '#fff',
                                      border: 'none',
                                      padding: '3px 8px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      whiteSpace: 'nowrap',
                                    }}
                                    onClick={() => setSelectedMoveOut(mo)}
                                    title="Landlord reported cash refund. Click to review and confirm."
                                  >
                                    <CheckCircle2 size={12} /> Confirm Cash ({mo.currency || DEFAULT_CURRENCY_SYMBOL}{matchClaim.amount.toLocaleString('en-IN')})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                  onClick={() => setSelectedMoveOut(mo)}
                                >
                                  <Eye size={13} /> View
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View Agreement Document Modal */}
      {isViewAgOpen && (() => {
        const agToView = selectedAgreement || myAgreement || (displayAgreements.length > 0 ? displayAgreements[0] : null);
        const agPropName = state.properties.find((p) => p.id === agToView?.propertyId)?.name || tenantRecord?.propertyName || 'Residence Property';
        const isAgTerminated = agToView?.status === 'terminated' || isTerminatedLease;
        const isAgPendingApproval = agToView?.status === 'pending_approval' || (agToView as any)?.status === 'awaiting_owner_signature';
        const isAgPendingDeposit = agToView?.status === 'pending_deposit';
        const isAgActive = agToView?.status === 'active' && !isAgTerminated && !isAgPendingApproval && !isAgPendingDeposit;
        const isAgDepositSettled = agToView?.depositStatus === 'paid' || isDepositSettled;
        const isAgAwaitingUpload = agToView?.status === 'awaiting_tenant_upload' || (!agToView?.signedDocumentUrl && !isAgActive && !isAgTerminated && !isAgPendingDeposit && !isAgPendingApproval);

        return (
          <div className="modal-backdrop" onClick={() => { setIsViewAgOpen(false); setSelectedAgreement(null); }}>
            <div className="modal-card" style={{ maxWidth: '660px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                    Tenancy Agreement — Unit {agToView?.unit || activeUnit}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                    {agPropName} • Ref #{agToView?.id?.slice(-6).toUpperCase() || 'AGR'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => { setIsViewAgOpen(false); setSelectedAgreement(null); }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                {/* Status Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: '#FAF9F5', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
                  <span className="hint" style={{ fontSize: '13px' }}>
                    Landlord: <b>{agToView?.ownerName || tenantRecord.owner || resolvedOwnerName}</b>
                  </span>
                  <span className={`badge ${isAgActive ? 'green' : isAgTerminated ? 'grey' : isAgPendingDeposit ? 'blue' : isAgPendingApproval ? 'amber' : 'amber'}`}>
                    {isAgActive
                      ? '✓ Active Lease'
                      : isAgTerminated
                        ? 'Tenancy Concluded'
                        : isAgPendingDeposit
                          ? 'Security Deposit Pending'
                          : isAgPendingApproval
                            ? 'Pending Approval'
                            : 'Physical Signature Pending'}
                  </span>
                </div>

                {/* Direct Landlord Contact */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                    <Phone size={14} color="var(--brass)" />
                    <span><b>Landlord Phone:</b> {resolvedOwnerPhone}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={`tel:${resolvedOwnerPhone}`} className="btn secondary small" style={{ fontSize: '11.5px', padding: '3px 8px', textDecoration: 'none' }}>
                      Call
                    </a>
                    <a href={`mailto:${resolvedOwnerEmail}`} className="btn secondary small" style={{ fontSize: '11.5px', padding: '3px 8px', textDecoration: 'none' }}>
                      Email
                    </a>
                  </div>
                </div>

                <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="k" style={{ color: 'var(--ink-soft)' }}>Term</span>
                  <span>{agToView?.start || tenantRecord.leaseStart || '—'} → {agToView?.end || tenantRecord.leaseEnd || '—'}</span>
                </div>
                <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="k" style={{ color: 'var(--ink-soft)' }}>Monthly rent</span>
                  <span style={{ fontWeight: 600 }}>{agToView?.currency || agreementCurrency}{(agToView?.rent || tenantRecord.rent || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="k" style={{ color: 'var(--ink-soft)' }}>Rent Due Day</span>
                  <span>Day {agToView?.rentDueDay || (tenantRecord as any).rentDueDay || 1} of every month</span>
                </div>
                <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="k" style={{ color: 'var(--ink-soft)' }}>Security Deposit</span>
                  <span style={{ fontWeight: 600 }}>{agToView?.currency || agreementCurrency}{(agToView?.deposit || tenantRecord.deposit || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="k" style={{ color: 'var(--ink-soft)' }}>Deposit Status</span>
                  <span className={`badge ${isAgDepositSettled ? 'green' : 'amber'}`}>
                    {isAgDepositSettled ? '✓ Settled in Full' : 'Pending Payment'}
                  </span>
                </div>

                {/* Tenancy Agreement Records: Landlord Pre-Signed Copy & Resident Signed Copy */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ledger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={16} color="var(--brass)" />
                    Tenancy Agreement Documents on Record
                  </div>

                  {/* Record 1: Landlord Pre-Signed Copy */}
                  {(agToView?.initialAgreementUrl || agToView?.fileData || agToView?.ownerSignedDocumentUrl) && (
                    <div style={{ padding: '14px 16px', background: '#FAF9F5', border: '1.5px solid var(--brass)', borderRadius: 'var(--radius)', boxShadow: '0 2px 8px rgba(197, 160, 89, 0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#F2EBD9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ShieldCheck size={22} color="var(--brass)" />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 700, color: 'var(--ledger)', fontSize: '13.5px' }}>
                                1. Landlord Pre-Signed Lease Agreement
                              </span>
                              <span className="badge green" style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                                ✓ Owner Signed
                              </span>
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                              {agToView.initialAgreementName || agToView.ownerSignedDocumentName || agToView.fileName || 'Landlord_Signed_Lease.pdf'} • Dispatched by <b>{agToView.ownerName || tenantRecord.owner || 'Property Owner'}</b>
                            </span>
                          </div>
                        </div>
                        <a
                          className="btn brass small"
                          href={agToView.initialAgreementUrl || agToView.fileData || agToView.ownerSignedDocumentUrl}
                          download={agToView.initialAgreementName || agToView.ownerSignedDocumentName || agToView.fileName || `Landlord_Signed_Lease_${agToView.unit}.pdf`}
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600, padding: '8px 14px' }}
                        >
                          <Download size={13} /> Download Landlord Copy
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Record 2: Resident Signed Copy */}
                  {agToView?.signedDocumentUrl ? (
                    <div style={{ padding: '12px 14px', background: '#F2F8F4', border: '1px solid #B8DCBE', borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileCheck size={18} color="var(--ledger)" />
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--ledger)', fontSize: '13px', display: 'block' }}>
                              2. Your Signed Submission (Resident Copy)
                            </span>
                            <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                              {agToView.signedDocumentName || 'Signed_Agreement.pdf'} • Uploaded on {agToView.signedUploadedAt ? new Date(agToView.signedUploadedAt).toLocaleDateString() : 'file'}
                            </span>
                          </div>
                        </div>
                        <a
                          className="btn secondary small"
                          href={agToView.signedDocumentUrl}
                          download={agToView.signedDocumentName || `Resident_Signed_${agToView.unit}.pdf`}
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Download size={12} /> Download My Copy
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 14px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} />
                        <span><b>2. Resident Signed Copy:</b> Pending your physical ink signature and file upload.</span>
                      </div>
                      {isAgAwaitingUpload && (
                        <button
                          type="button"
                          className="btn brass small"
                          onClick={() => {
                            if (agToView) {
                              setSelectedAgreement(agToView);
                            }
                            setIsViewAgOpen(false);
                            setIsUploadSignedOpen(true);
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
                        >
                          <Upload size={12} /> Upload Signed Copy
                        </button>
                      )}
                    </div>
                  )}

                  {/* Record 3: Resident Uploaded Identity Documents */}
                  {agToView?.tenantUploadedIds && agToView.tenantUploadedIds.length > 0 ? (
                    <div style={{ padding: '12px 14px', background: '#FAF9F5', border: '1.5px solid var(--brass)', borderRadius: 'var(--radius)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ledger)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <ShieldCheck size={16} color="var(--brass)" />
                        3. Your Identity Verification Documents ({agToView.tenantUploadedIds.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {agToView.tenantUploadedIds.map((idDoc: any, idx: number) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="badge brass" style={{ fontSize: '10.5px' }}>{idDoc.name}</span>
                              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink)' }}>{idDoc.fileName}</span>
                            </div>
                            <a
                              className="btn secondary small"
                              href={idDoc.fileUrl}
                              download={idDoc.fileName || `${idDoc.name}.pdf`}
                              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px' }}
                            >
                              <Download size={11} /> Download ID
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : agToView?.requireTenantId ? (
                    <div style={{ padding: '12px 14px', background: '#FFFDF5', border: '1px solid #FCD34D', borderRadius: 'var(--radius)', fontSize: '12.5px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={16} color="#D97706" />
                      <span><b>3. Identity Documents:</b> Landlord requires {agToView.requiredIdList?.map((i: any) => i.name).join(', ') || agToView.requiredIdType || 'ID Document'} upon signing.</span>
                    </div>
                  ) : null}
                </div>

                {agToView?.contentHtml ? (
                  <div
                    style={{
                      marginTop: '14px',
                      padding: '14px',
                      background: '#FAFAF7',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius)',
                      maxHeight: '260px',
                      overflowY: 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: agToView.contentHtml }}
                  />
                ) : agToView?.fileData ? (
                  <div className="note-box" style={{ marginTop: '14px' }}>
                    Original template document: <b>{agToView.fileName}</b>
                  </div>
                ) : (
                  <p style={{ color: 'var(--ink-soft)', fontSize: '13px', marginTop: '14px' }}>
                    Standard residential tenancy record on file.
                  </p>
                )}
              </div>
              <div className="modal-foot">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setIsViewAgOpen(false);
                    setSelectedAgreement(null);
                  }}
                >
                  Close
                </button>
                {agToView && (
                  <button
                    type="button"
                    className="btn brass"
                    onClick={() => handleDownloadDraft(agToView)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={14} /> Download Official PDF
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Upload Physical Signed Agreement Modal (NO E-SIGN) */}
      {isUploadSignedOpen && (() => {
        const agToUpload = selectedAgreement || myAgreement;
        if (!agToUpload) return null;
        return (
          <div className="modal-backdrop" onClick={() => setIsUploadSignedOpen(false)}>
            <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Upload Signed Agreement — Unit {agToUpload.unit || activeUnit}</h3>
                <button type="button" className="modal-close" onClick={() => setIsUploadSignedOpen(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ padding: '12px 14px', background: '#F8F9FA', border: '1px solid var(--line)', borderRadius: 'var(--radius)', marginBottom: '14px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Required Physical Signing Steps:</div>
                  <ol style={{ margin: '0 0 0 18px', padding: 0, fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                    <li>Download and print the official tenancy agreement PDF.</li>
                    <li>Affix your physical ink signature on the resident signature line.</li>
                    <li>Scan or take a clear photo of the signed pages and upload below.</li>
                  </ol>
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => handleDownloadDraft(agToUpload)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Download size={12} /> Download Draft PDF If Not Already Done
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>Select Signed Lease Document (PDF, PNG, JPG)</label>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.png,.jpg,.jpeg"
                    style={{ padding: '8px', border: '1px dashed var(--line-strong)', width: '100%', borderRadius: 'var(--radius)' }}
                  />
                </div>

                {signedFileData && (
                  <div style={{ margin: '10px 0', padding: '10px 14px', background: '#F2F8F4', border: '1px solid #B8DCBE', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <FileCheck size={16} color="var(--ledger)" />
                      <span><b>{signedFileName}</b> {signedFileSize ? `(${signedFileSize} KB)` : ''}</span>
                    </div>
                    <span className="badge green">Ready</span>
                  </div>
                )}

                {/* Landlord-requested Identity Documents */}
                {(() => {
                  const requiredIds: RequiredIdItem[] = agToUpload.requiredIdList && agToUpload.requiredIdList.length > 0
                    ? agToUpload.requiredIdList
                    : (agToUpload.requiredIdTypes && agToUpload.requiredIdTypes.length > 0
                      ? agToUpload.requiredIdTypes.map((t: string, idx: number) => ({ id: `req_${idx}`, name: t }))
                      : (agToUpload.requiredIdType
                        ? [{ id: 'req_0', name: agToUpload.requiredIdType }]
                        : (agToUpload.requireTenantId ? [{ id: 'req_0', name: 'Voter ID' }] : [])));
                  if (!agToUpload.requireTenantId || requiredIds.length === 0) return null;
                  const uploadedCount = requiredIds.filter((r) => uploadedIdsState[r.id]?.fileUrl).length;
                  return (
                    <div style={{ marginTop: '14px', padding: '12px 14px', background: '#FFFDF8', border: '1.5px solid var(--brass)', borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ledger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={16} color="var(--brass)" /> Identity Documents Requested by Landlord *
                        </div>
                        <span className={`badge ${uploadedCount === requiredIds.length ? 'green' : 'amber'}`} style={{ fontSize: '11px' }}>
                          {uploadedCount}/{requiredIds.length} uploaded
                        </span>
                      </div>
                      <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        Upload a clear scan or photo of each document below. All are mandatory to submit.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {requiredIds.map((reqId, idx) => {
                          const uploaded = uploadedIdsState[reqId.id];
                          return (
                            <div key={reqId.id} style={{ padding: '8px 10px', background: '#fff', border: '1px solid var(--line)', borderRadius: '6px' }}>
                              <label style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                {idx + 1}. {reqId.name}
                              </label>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    setUploadedIdsState((prev) => ({
                                      ...prev,
                                      [reqId.id]: {
                                        id: reqId.id,
                                        name: reqId.name,
                                        fileUrl: reader.result as string,
                                        fileName: f.name,
                                        fileSize: Math.round(f.size / 1024),
                                        uploadedAt: new Date().toISOString(),
                                      },
                                    }));
                                  };
                                  reader.readAsDataURL(f);
                                }}
                                style={{ fontSize: '12px', width: '100%' }}
                              />
                              {uploaded && (
                                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ledger)' }}>
                                  <FileCheck size={14} color="var(--ledger)" />
                                  <span><b>{uploaded.fileName}</b> {uploaded.fileSize ? `(${uploaded.fileSize} KB)` : ''}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius)', border: '1px solid var(--line)', marginTop: '16px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={optInAutopayDuringLease}
                    onChange={(e) => setOptInAutopayDuringLease(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Enable Monthly Rent Autopay</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                      Automatically debit future recurring monthly rent on your due day via UPI/Card (T-48h advance notice before each debit). Cancel anytime.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '13px', marginTop: '16px' }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <span>
                    I certify that this document has been physically signed by me in ink, and I agree to the terms and financial covenants (Monthly Rent: {getCurrencySymbol(agToUpload.currency || agreementCurrency)}{(agToUpload.rent || tenantRecord?.rent || 0).toLocaleString('en-IN')}, Deposit: {getCurrencySymbol(agToUpload.currency || agreementCurrency)}{(agToUpload.deposit || tenantRecord?.deposit || 0).toLocaleString('en-IN')}) for Unit <b>{agToUpload.unit || activeUnit}</b>.
                  </span>
                </label>
              </div>
              <div className="modal-foot">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setIsUploadSignedOpen(false)}
                  disabled={isSubmittingUpload}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn brass ${isSubmittingUpload ? 'btn-processing' : ''}`}
                  disabled={!agreedToTerms || !signedFileData || isSubmittingUpload}
                  onClick={handleConfirmUploadSigned}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ButtonProcessing
                    loading={isSubmittingUpload}
                    loadingText="Uploading Document..."
                    defaultText="Submit Signed Document"
                    icon={<Upload size={14} />}
                  />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Review Lease Renewal Offer Modal */}
      {selectedRenewalForReview && (() => {
        const { agreement: ag, renewal } = selectedRenewalForReview;
        const propName = state.properties.find((p) => p.id === ag.propertyId)?.name || tenantRecord?.propertyName || 'Residence Property';
        const ownerObj = state.users.find((u) => u.id === ag.ownerId || u.id === renewal.ownerId);
        const landlordName = ag.approvedBy || ag.counterSignatory || ag.ownerName || ownerObj?.displayName || 'Property Owner';

        return (
          <div className="modal-backdrop" onClick={() => setSelectedRenewalForReview(null)}>
            <div className="modal-card" style={{ maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>Lease Renewal Offer</h3>
                    <span className="badge blue" style={{ fontWeight: 700 }}>
                      +{renewal.percentageIncrease || 0}% Increment
                    </span>
                  </div>
                  <div className="hint" style={{ fontSize: '13px', marginTop: '3px' }}>
                    {propName} • Unit {ag.unit} • Landlord: {landlordName}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setSelectedRenewalForReview(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Rent & Term Comparison Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', background: 'var(--surface-sunken)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '2px' }}>Current Monthly Rent</span>
                    <b style={{ fontSize: '16px', color: 'var(--ink)' }}>{getCurrencySymbol(renewal.currency || ag.currency || agreementCurrency)}{(renewal.currentRent || ag.rent || tenantRecord.rent).toLocaleString('en-IN')}/mo</b>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '2px' }}>Proposed Renewal Rent</span>
                    <b style={{ fontSize: '18px', color: 'var(--brass)' }}>{getCurrencySymbol(renewal.currency || ag.currency || agreementCurrency)}{(renewal.proposedRent || 0).toLocaleString('en-IN')}/mo</b>
                    <span style={{ fontSize: '11px', color: '#059669', display: 'block', fontWeight: 600 }}>
                      +{getCurrencySymbol(renewal.currency || ag.currency || agreementCurrency)}{(renewal.rentIncreaseAmount || 0).toLocaleString('en-IN')}/mo (+{renewal.percentageIncrease}%)
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '2px' }}>Proposed Extension Period</span>
                    <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{renewal.termMonths || 12} Months</b>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>
                      {renewal.newLeaseStart} to {renewal.newLeaseEnd}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', background: 'var(--surface-sunken)', padding: '10px 14px', borderRadius: '6px' }}>
                  ℹ️ <b>Effective Date Notice:</b> The new rent of {getCurrencySymbol(renewal.currency || ag.currency || agreementCurrency)}{(renewal.proposedRent || 0).toLocaleString('en-IN')}/mo strictly takes effect on <b>{renewal.newLeaseStart}</b>, after your current lease term concludes on <b>{renewal.leaseEnd || ag.end || tenantRecord.leaseEnd}</b>. Your current monthly billing remains unchanged until then.
                  {renewal.ownerNotes && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #CBD5E1', color: 'var(--ink)' }}>
                      <b>Landlord Note:</b> "{renewal.ownerNotes}"
                    </div>
                  )}
                </div>

                {/* Landlord's Renewal Agreement Document (if provided) */}
                {renewal.ownerAgreementFileUrl && (
                  <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: '8px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brass)' }}>
                          <FileText size={22} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)' }}>
                            {renewal.ownerAgreementFileName || 'Renewal_Agreement_Document.pdf'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                            Formal renewal lease contract dispatched by your landlord
                            {renewal.ownerAgreementFileSize ? ` • ${renewal.ownerAgreementFileSize} KB` : ''}
                          </div>
                        </div>
                      </div>
                      <a
                        href={renewal.ownerAgreementFileUrl}
                        download={renewal.ownerAgreementFileName || `Renewal_Agreement_${ag.unit}.pdf`}
                        className="btn secondary small"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={14} /> Download Agreement PDF
                      </a>
                    </div>
                  </div>
                )}

                {/* Upload Signed Document Section */}
                <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', display: 'block' }}>
                      Upload Your Signed Renewal Copy (PDF / Scan)
                    </label>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      Download the agreement above, sign the document, and upload your signed copy below for landlord approval.
                    </div>
                  </div>

                  {tenantRenewalSignedFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileCheck size={20} color="#16A34A" />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                            {tenantRenewalSignedFileName}
                          </div>
                          {tenantRenewalSignedFileSize && (
                            <div style={{ fontSize: '11px', color: '#15803D' }}>{tenantRenewalSignedFileSize} KB</div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ padding: '2px 8px', fontSize: '11px', color: '#DC2626' }}
                        onClick={() => {
                          setTenantRenewalSignedFile(null);
                          setTenantRenewalSignedFileName('');
                          setTenantRenewalSignedFileSize(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        border: '2px dashed #94A3B8',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: 'var(--surface-sunken)',
                      }}
                    >
                      <Upload size={22} color="var(--brass)" style={{ marginBottom: '6px' }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                        Click or drag to attach your signed renewal contract
                      </span>
                      <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        PDF, PNG, JPG scans up to 10MB
                      </span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setTenantRenewalSignedFileName(file.name);
                            setTenantRenewalSignedFileSize(Math.round(file.size / 1024));
                            const reader = new FileReader();
                            reader.onload = () => {
                              setTenantRenewalSignedFile(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ color: '#DC2626' }}
                  onClick={() => setIsDeclineModalOpen(true)}
                >
                  <X size={15} /> Decline Offer
                </button>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {tenantRenewalSignedFile ? (
                    <button
                      type="button"
                      className={`btn brass ${isSubmittingTenantSignedRenewal ? 'btn-processing' : ''}`}
                      disabled={isSubmittingTenantSignedRenewal}
                      onClick={async () => {
                        setIsSubmittingTenantSignedRenewal(true);
                        try {
                          await submitTenantSignedRenewal(
                            ag.unit,
                            tenantRenewalSignedFile,
                            tenantRenewalSignedFileName,
                            tenantRenewalSignedFileSize || undefined,
                            ag.propertyId
                          );
                          setTenantRenewalSignedFile(null);
                          setTenantRenewalSignedFileName('');
                          setTenantRenewalSignedFileSize(null);
                          setSelectedRenewalForReview(null);
                        } finally {
                          setIsSubmittingTenantSignedRenewal(false);
                        }
                      }}
                    >
                      <ButtonProcessing
                        loading={isSubmittingTenantSignedRenewal}
                        loadingText="Submitting Renewal..."
                        defaultText="Sign & Submit Renewal Agreement"
                        icon={<CheckCircle2 size={16} />}
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn brass"
                      onClick={async () => {
                        await respondToLeaseRenewal(ag.unit, 'accepted', undefined, ag.propertyId);
                        setSelectedRenewalForReview(null);
                      }}
                    >
                      <CheckCircle2 size={16} /> Accept Renewal Terms
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Give Notice to Vacate Modal */}
      {isNoticeOpen && (() => {
        const targetAg = selectedAgreementForNotice || myAgreement;
        const targetUnit = targetAg?.unit || activeUnit || tenantRecord.unit;
        const propName = state.properties.find((p) => p.id === targetAg?.propertyId)?.name || tenantRecord?.propertyName || 'Residence Property';

        return (
          <div className="modal-backdrop" onClick={() => { setIsNoticeOpen(false); setSelectedAgreementForNotice(null); }}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px' }}>Give Notice to Vacate</h3>
                  <div className="hint" style={{ fontSize: '12.5px', marginTop: '2px' }}>
                    {propName} • Unit {targetUnit}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => { setIsNoticeOpen(false); setSelectedAgreementForNotice(null); }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label>Planned Move-Out Date</label>
                  <input
                    type="date"
                    value={noticeDate}
                    onChange={(e) => setNoticeDate(e.target.value)}
                  />
                </div>
                <p className="hint">
                  This notifies your landlord immediately for <b>Unit {targetUnit}</b> ({propName}) so they can schedule a property walkthrough inspection and arrange your security deposit settlement.
                </p>
              </div>
              <div className="modal-foot">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => { setIsNoticeOpen(false); setSelectedAgreementForNotice(null); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={handleGiveNotice}
                >
                  Confirm &amp; Notify Landlord
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Preview 6-Point Inspection Checklist Modal */}
      {isPreviewChecklistOpen && (
        <div className="modal-backdrop" onClick={() => setIsPreviewChecklistOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Standard 6-Point Move-Out Inspection Checklist</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsPreviewChecklistOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ marginBottom: '14px' }}>
                Your landlord or property manager will inspect these standard areas during the physical walkthrough. Keeping them clean and in good order prevents deposit deductions:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  {
                    title: 'Paint, Walls & Ceilings',
                    desc: 'Checked for excessive nail holes, unauthorized dark paint, deep scuffs, or water stains. Normal gentle wear-and-tear is expected.',
                  },
                  {
                    title: 'Electrical, Lighting & Fixtures',
                    desc: 'All switches, sockets, ceiling lights, exhaust fans, and AC remotes should be functional and undamaged.',
                  },
                  {
                    title: 'Plumbing, Sanitary & Taps',
                    desc: 'Faucets, showers, geysers, toilet flush valves, and drains must operate without active clogs or leaks.',
                  },
                  {
                    title: 'Flooring, Tiles & Carpets',
                    desc: 'Checked for broken or chipped ceramic tiles, heavy chemical burns, or deep floor damage.',
                  },
                  {
                    title: 'Doors, Windows, Locks & Keys',
                    desc: 'All window latches, internal door handles, and main entry locks must function smoothly with all original keys returned.',
                  },
                  {
                    title: 'Kitchen Counters, Cabinets & Appliances',
                    desc: 'Sink grease traps, modular cabinets, and any landlord-provided appliances (stove, chimney) should be cleaned of residue.',
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius)',
                      padding: '10px 14px',
                      background: 'var(--surface-sunken, #fbfaf8)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>
                      {idx + 1}. {item.title}
                    </div>
                    <div className="hint" style={{ fontSize: '12px' }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn brass"
                style={{ width: '100%' }}
                onClick={() => setIsPreviewChecklistOpen(false)}
              >
                Close & Return to Move-Out Tracker
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move-Out Detail Modal */}
      {selectedMoveOut && (
        <div className="modal-backdrop" onClick={() => setSelectedMoveOut(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0 }}>Move-Out Details</h3>
                <span className="hint" style={{ fontSize: '13px' }}>#{selectedMoveOut.id}</span>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setSelectedMoveOut(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Cash Handover Confirmation Needed Banner inside Move-Out Details Modal */}
              {(() => {
                const matchClaim = (state.cashClaims || []).find(
                  (c) =>
                    (c.status === 'pending_confirmation' || (c as any).status === 'pending') &&
                    c.claimedByRole === 'owner' &&
                    (c.moveOutId === selectedMoveOut.id || c.unit === selectedMoveOut.unit)
                );
                if (!matchClaim) return null;
                return (
                  <div
                    style={{
                      background: '#FFFBEB',
                      border: '1.5px solid #F59E0B',
                      borderRadius: 'var(--radius)',
                      padding: '16px 18px',
                      boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        ⚡ CASH REFUND HANDOVER CONFIRMATION NEEDED
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Claim #{matchClaim.id}</span>
                    </div>
                    <h4 style={{ margin: '4px 0 6px', fontSize: '15px', color: 'var(--ink)' }}>
                      {matchClaim.claimedByName} reported handing you {matchClaim.currency} {matchClaim.amount.toLocaleString('en-IN')} in Cash
                    </h4>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '14px' }}>
                      <b>Date:</b> {matchClaim.handoverDate} • <b>Unit:</b> {matchClaim.unit} • <b>Location:</b> {matchClaim.handoverLocation || 'On-Site Inspection'}
                      {matchClaim.notes && <span style={{ display: 'block', marginTop: '2px', fontStyle: 'italic' }}>"{matchClaim.notes}"</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-mobile-full"
                        style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        onClick={async () => {
                          await confirmCashClaim(matchClaim.id);
                          setSelectedMoveOut(null);
                        }}
                      >
                        <CheckCircle2 size={16} /> Confirm I Received Cash
                      </button>
                      <button
                        type="button"
                        className="btn secondary btn-mobile-full"
                        style={{ borderColor: '#DC2626', color: '#DC2626', padding: '8px 14px', fontSize: '12.5px', fontWeight: 600 }}
                        onClick={async () => {
                          const reason = window.prompt('Please enter the reason for declining this cash refund (e.g. Cash not received, or discrepancy):');
                          if (reason && reason.trim()) {
                            await rejectCashClaim(matchClaim.id, reason.trim());
                            setSelectedMoveOut(null);
                          }
                        }}
                      >
                        Decline / Not Received
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Status Header */}
              <div style={{ background: 'var(--surface-sunken, #fbfaf8)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Move-Out & Tenancy Settlement</h4>
                    </div>
                    <p className="hint" style={{ margin: 0, fontSize: '13px' }}>
                      {(selectedMoveOut.status === 'requested' || selectedMoveOut.status === 'notice_filed') && 'Your move-out notice has been submitted. Waiting for your landlord to schedule an on-site walkthrough inspection.'}
                      {selectedMoveOut.status === 'inspection_scheduled' && `Walkthrough inspection confirmed for ${selectedMoveOut.inspectionDate || 'upcoming date'}. Please review the preparation checklist below.`}
                      {selectedMoveOut.status === 'inspected' && 'Walkthrough inspection completed. Deductions and settlement calculations are being finalized.'}
                      {(selectedMoveOut.status === 'refund_scheduled' || selectedMoveOut.status === 'awaiting_tenant_approval' || selectedMoveOut.status === 'settlement_pending') && `Inspection settled. Security deposit refund scheduled for disbursement on ${selectedMoveOut.refundDate || 'upcoming date'}.`}
                      {(selectedMoveOut.status === 'refund_completed' || selectedMoveOut.status === 'settled') && 'Security deposit refund disbursed and tenancy officially concluded. All lease obligations fulfilled.'}
                    </p>
                  </div>
                  <div>{getMoveoutBadge(selectedMoveOut.status)}</div>
                </div>

                {/* Progress Stepper */}
                <div style={{ marginTop: '24px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '16px', left: '30px', right: '30px', height: '2px', background: 'var(--line)', zIndex: 0 }} />
                    <div style={{
                      position: 'absolute', top: '16px', left: '30px',
                      width: `${Math.max(0, Math.min(100, ((getMoveoutStepIndex(selectedMoveOut.status) - 1) / 4) * 100))}%`,
                      height: '2px', background: 'var(--brass)', transition: 'width 0.3s ease', zIndex: 0
                    }} />
                    {[
                      { step: 1, title: 'Notice Given', date: selectedMoveOut.moveOutDate || 'Logged' },
                      { step: 2, title: 'Inspection Scheduled', date: selectedMoveOut.inspectionDate || 'Pending' },
                      { step: 3, title: 'Walkthrough Done', date: selectedMoveOut.status !== 'requested' && selectedMoveOut.status !== 'inspection_scheduled' ? 'Inspected' : 'Upcoming' },
                      { step: 4, title: 'Refund Scheduled', date: selectedMoveOut.refundDate || 'Pending' },
                      { step: 5, title: 'Settled & Released', date: selectedMoveOut.status === 'refund_completed' ? 'Completed' : 'Final Step' },
                    ].map((s) => {
                      const currentStepIdx = getMoveoutStepIndex(selectedMoveOut.status);
                      const isCompleted = currentStepIdx > s.step;
                      const isCurrent = currentStepIdx === s.step;
                      return (
                        <div key={s.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '18%', zIndex: 1 }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 600,
                            background: isCompleted ? 'var(--brass)' : '#ffffff',
                            color: isCompleted ? '#ffffff' : isCurrent ? 'var(--brass)' : 'var(--ink-soft)',
                            border: isCompleted || isCurrent ? '2px solid var(--brass)' : '2px solid var(--line)',
                            boxShadow: isCurrent ? '0 0 0 4px rgba(184,134,11,0.15)' : 'none',
                            marginBottom: '8px',
                          }}>
                            {isCompleted ? <CheckCircle2 size={16} /> : s.step}
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: isCurrent ? 600 : 500, color: isCurrent ? 'var(--ink)' : 'var(--ink-soft)' }}>{s.title}</div>
                          <div style={{ fontSize: '11px', color: isCurrent ? 'var(--brass)' : 'var(--ink-soft)', marginTop: '2px' }}>{s.date}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Key Milestones Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '6px' }}><Calendar size={14} /> Agreed Move-Out Date</div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{selectedMoveOut.moveOutDate || 'Not specified'}</div>
                  <div className="hint" style={{ fontSize: '11px', marginTop: '4px' }}>Target vacating timeline</div>
                </div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: selectedMoveOut.inspectionDate ? 'rgba(184,134,11,0.05)' : '#ffffff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: selectedMoveOut.inspectionDate ? 'var(--brass)' : 'var(--ink-soft)', fontSize: '12px', marginBottom: '6px' }}><Clock size={14} /> Walkthrough Inspection</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: selectedMoveOut.inspectionDate ? 'var(--brass)' : 'var(--ink)' }}>{selectedMoveOut.inspectionDate || 'Awaiting schedule'}</div>
                  <div className="hint" style={{ fontSize: '11px', marginTop: '4px' }}>{selectedMoveOut.inspectionDate ? 'Landlord walkthrough date' : 'Will be scheduled by landlord'}</div>
                </div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '6px' }}><CreditCard size={14} /> Estimated Deposit Refund</div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{selectedMoveOut.refundDate || 'Pending inspection'}</div>
                  <div className="hint" style={{ fontSize: '11px', marginTop: '4px' }}>Target disbursement date</div>
                </div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '6px' }}><ShieldCheck size={14} /> Security Deposit Held</div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{selectedMoveOut.currency || DEFAULT_CURRENCY_SYMBOL}{(selectedMoveOut.deposit || 0).toLocaleString('en-IN')}</div>
                  <div className="hint" style={{ fontSize: '11px', marginTop: '4px' }}>Subject to inspection report</div>
                </div>
              </div>

              {/* Deposit Settlement Summary */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', background: 'var(--surface)' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>Deposit Settlement Summary</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Original Security Deposit Received</span>
                    <span style={{ fontWeight: 600 }}>{selectedMoveOut.currency || DEFAULT_CURRENCY_SYMBOL}{(selectedMoveOut.deposit || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {selectedMoveOut.deductions && selectedMoveOut.deductions.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger)', margin: '8px 0 4px' }}>Deductions Assessed During Inspection:</div>
                      {selectedMoveOut.deductions.map((d, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
                          <span>• {d.reason} <span className="hint">({d.amenity})</span></span>
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>-{selectedMoveOut.currency || DEFAULT_CURRENCY_SYMBOL}{d.amount.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface-sunken)', padding: '8px 12px', borderRadius: '4px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                      No deductions assessed. (Detailed damage inspection checklist will be finalized during on-site walkthrough).
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, paddingTop: '10px', borderTop: '1px solid var(--line)', marginTop: '6px' }}>
                    <span>Net Estimated Refund Balance</span>
                    <span style={{ color: 'var(--brass)', fontSize: '17px' }}>
                      {getCurrencySymbol(selectedMoveOut.currency) || DEFAULT_CURRENCY_SYMBOL}
                      {(selectedMoveOut.finalRefundAmount !== undefined
                        ? selectedMoveOut.finalRefundAmount
                        : Math.max(0, (selectedMoveOut.deposit || 0) - (selectedMoveOut.deductions?.reduce((sum, d) => sum + d.amount, 0) || 0))
                      ).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Inspection Condition Photos */}
              {selectedMoveOut.amenityPhotos && selectedMoveOut.amenityPhotos.length > 0 && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', background: 'var(--surface)' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>Condition Photos — Inspection Report</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    {selectedMoveOut.amenityPhotos.map((p, idx) => (
                      <div key={idx}>
                        <img
                          src={p.image}
                          alt={p.name}
                          style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--line)' }}
                        />
                        <div className="hint" style={{ marginTop: '5px', fontSize: '12px', fontWeight: 500, textAlign: 'center' }}>{p.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist items (if inspectionChecklist available) */}
              {selectedMoveOut.inspectionChecklist && selectedMoveOut.inspectionChecklist.length > 0 && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', background: 'var(--surface)' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>Amenity Inspection Results</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedMoveOut.inspectionChecklist.map((item, i) => {
                      const isDamaged = item.condition === 'damaged';
                      const isFair = item.condition === 'minor_wear' || item.condition === 'fair';
                      const isGood = item.condition === 'good';
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '8px 12px', background: 'var(--surface-sunken, #fbfaf8)', borderRadius: '6px', border: '1px solid var(--line)' }}>
                          <span style={{ fontWeight: 500 }}>
                            {item.room ? <span style={{ color: 'var(--ink-soft)', marginRight: '6px' }}>{item.room} —</span> : null}
                            {item.item || item.amenity}
                          </span>
                          <span style={{
                            padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                            background: isGood ? '#DCFCE7' : isDamaged ? '#FEE2E2' : '#FEF3C7',
                            color: isGood ? '#15803D' : isDamaged ? '#DC2626' : '#B45309',
                          }}>
                            {isGood ? 'Good' : isDamaged ? 'Damaged' : 'Normal Wear'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contact panel */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Landlord & Inspection Coordination</h4>
                <p className="hint" style={{ fontSize: '12px', margin: 0 }}>Coordinate access for the walkthrough or request a timing adjustment directly with your landlord:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                  <div><b>Landlord:</b> {resolvedOwnerName}</div>
                  <div><b>Phone:</b> {resolvedOwnerPhone}</div>
                  <div><b>Email:</b> {resolvedOwnerEmail}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={`tel:${resolvedOwnerPhone}`} className="btn secondary small" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>Call Landlord</a>
                  <a href={`mailto:${resolvedOwnerEmail}?subject=Move-Out%20Inspection%20-%20Unit%20${selectedMoveOut.unit}`} className="btn brass small" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>Email Landlord</a>
                </div>
              </div>

            </div>
            <div className="modal-foot">
              <button type="button" className="btn brass" style={{ width: '100%' }} onClick={() => setSelectedMoveOut(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Renewal Offer Modal */}
      {isDeclineModalOpen && (() => {
        const targetUnit = selectedRenewalForReview?.renewal.unit || tenantRecord.unit;
        const targetAg = selectedRenewalForReview?.agreement;
        const propName = state.properties.find((p) => p.id === targetAg?.propertyId)?.name || tenantRecord?.propertyName || 'Residence Property';

        return (
          <div className="modal-backdrop" onClick={() => setIsDeclineModalOpen(false)}>
            <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px' }}>Decline Renewal Offer</h3>
                  <div className="hint" style={{ fontSize: '12.5px', marginTop: '2px' }}>
                    {propName} • Unit {targetUnit}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setIsDeclineModalOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: '13.5px', color: 'var(--ink)', marginBottom: '12px' }}>
                  Are you sure you want to decline the proposed renewal terms for <b>Unit {targetUnit}</b> ({propName})? Your tenancy will remain scheduled to end on <b>{targetAg?.end || tenantRecord.leaseEnd || myAgreement?.end || 'the current expiry date'}</b>.
                </p>
                <div className="field">
                  <label>Reason / Feedback for Landlord (Optional)</label>
                  <textarea
                    rows={3}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g., The proposed rent increase is above my budget; I would consider a +5% adjustment instead."
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setIsDeclineModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => {
                    await respondToLeaseRenewal(targetUnit, 'rejected', declineReason, targetAg?.propertyId);
                    setIsDeclineModalOpen(false);
                    setDeclineReason('');
                    setSelectedRenewalForReview(null);
                  }}
                >
                  Confirm Decline
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
