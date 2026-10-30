import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Agreement, TenancyRequest, Unit, DepositSettlement, Announcement, Invoice, TenantRecord } from '../../types';
import { downloadDepositSettlementPdf } from '../../lib/pdf';
import { isFirebaseConfigured } from '../../lib/firebase';
import { Spinner, ButtonProcessing } from '../../components/common/Spinner';
import {
  Mail,
  CheckCircle,
  XCircle,
  Home,
  Calendar,
  CreditCard,
  Shield,
  Clock,
  Eye,
  Download,
  FileText,
  Building,
  MapPin,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Camera,
  Layers,
  Sparkles,
  User,
  Phone,
  Check,
  X,
  Compass,
  Zap,
  Droplets,
  AlertCircle,
  Landmark,
  Megaphone,
  Pin,
  Flame,
  Wrench,
  ShieldCheck,
  Award,
} from 'lucide-react';
import { getTenantReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';
import { DepositSettlementReviewModal } from '../../components/common/DepositSettlementReviewModal';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';

export const TenantDashboardPage: React.FC = () => {
  const { state, updateState, showToast, saveAgreement, saveInvoice, saveUnit, saveTenant, saveTenancyRequest, acknowledgeAnnouncement, confirmCashClaim, rejectCashClaim, confirmRefundReceipt } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenantEmail = user?.email?.toLowerCase().trim() || '';
  const tenantRecord = state.tenants.find(
    (t) =>
      (user?.id && t.id === user.id) ||
      (tenantEmail && t.email?.toLowerCase() === tenantEmail)
  );
  const rawDisplayName = user?.displayName?.trim();
  const tenantName = (rawDisplayName && !rawDisplayName.includes('@'))
    ? rawDisplayName
    : (tenantRecord?.name && !tenantRecord.name.includes('@'))
    ? tenantRecord.name
    : user?.email
    ? user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Resident';

  const [settlementToReview, setSettlementToReview] = useState<DepositSettlement | null>(null);

  // Real-time automated reminders for rent, deposit, lease, tickets
  const tenantReminders = useMemo(() => {
    return getTenantReminders(state, user);
  }, [state, user]);

  // Check if tenant has any active or pending lease context
  const hasActiveOrPendingLease = useMemo(() => {
    const hasAssignedUnit = state.units.some(
      (u) =>
        (u.currentTenantId === user?.id || (!isFirebaseConfigured && tenantEmail && u.tenant?.toLowerCase() === tenantEmail)) &&
        (u.status === 'occupied' || u.status === 'reserved')
    );
    const hasActiveAg = state.agreements.some(
      (a) =>
        (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) &&
        a.status !== 'terminated'
    );
    const hasPendingReq = (state.tenancyRequests || []).some(
      (r) =>
        (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)) &&
        (r.status === 'pending' || r.status === 'accepted')
    );
    return hasAssignedUnit || hasActiveAg || hasPendingReq;
  }, [state.units, state.agreements, state.tenancyRequests, user?.id, tenantEmail]);

  // Only consider completed move-out for the "Concluded Tenancy" view if the resident has NO active/pending lease
  const completedMoveOut = useMemo(() => {
    if (hasActiveOrPendingLease) return undefined;
    return (state.moveouts || []).find(
      (m) =>
        m.tenantId === user?.id &&
        m.status === 'refund_completed'
    );
  }, [hasActiveOrPendingLease, state.moveouts, user?.id]);

  // Match by tenantId (primary) or email (offline fallback only).
  // Display-name fallback removed — two tenants sharing the same display name would
  // see each other's reviews without this guard.
  const myTenantReviews = (state.reviews?.tenants || []).filter(
    (r: any) =>
      (user?.id && r.tenantId === user.id) ||
      (!isFirebaseConfigured && tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)
  );

  // Build a set of unitIds that have a real active agreement or invitation tied to this tenant
  const myAgreementUnitIds = useMemo(() => {
    const unitIds = new Set<string>();
    state.agreements
      .filter(
        (a) =>
          a.status !== 'terminated' &&
          ((user?.id && a.tenantId === user.id) ||
            (!isFirebaseConfigured && tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
      )
      .forEach((a) => {
        const matchedUnit =
          state.units.find((u) => u.id === a.unit) ||
          state.units.find(
            (u) =>
              u.unitNumber === a.unit &&
              (!a.propertyId || u.propertyId === a.propertyId)
          );
        if (matchedUnit?.id) unitIds.add(matchedUnit.id);
      });

    // Also include units from active/pending tenancy invitations
    (state.tenancyRequests || [])
      .filter(
        (r) =>
          (r.status === 'pending' || r.status === 'accepted') &&
          ((user?.id && r.tenantId === user.id) ||
            (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail))
      )
      .forEach((r) => {
        const matchedUnit =
          state.units.find((u) => u.id === r.unitId) ||
          state.units.find(
            (u) =>
              u.unitNumber === r.unitNumber &&
              (!r.propertyId || u.propertyId === r.propertyId)
          );
        if (matchedUnit?.id) unitIds.add(matchedUnit.id);
      });

    return unitIds;
  }, [state.agreements, state.units, state.tenancyRequests, user?.id, tenantEmail]);

  // Find units where tenant is actively matched.
  // Priority: agreement-backed unit (via tenantId) > currentTenantId match > email-only match (requires agreement)
  const myUnits = state.units
    .filter((u) => {
      const byId = user?.id && u.currentTenantId === user.id;
      const byEmail = !isFirebaseConfigured && tenantEmail && u.tenant?.toLowerCase() === tenantEmail;
      // An email-only match is only trusted if there is a real agreement or invitation for that unit
      const isTenantMatch = byId || (byEmail && myAgreementUnitIds.has(u.id));
      if (!isTenantMatch) return false;

      // Must be actively occupied or reserved
      if (u.status !== 'occupied' && u.status !== 'reserved') return false;

      // If tenant explicitly declined an invitation for this unit, exclude it unless there is a subsequent active agreement
      const hasDeclinedReq = (state.tenancyRequests || []).some(
        (r) =>
          (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId) &&
          (r.unitId === u.id || r.unitNumber === u.unitNumber) &&
          (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)) &&
          r.status === 'declined'
      );

      // If tenant has an active / non-terminated agreement or pending request for this unit, it IS active!
      const hasActiveAgreementForUnit = state.agreements.some(
        (a) =>
          (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
          (a.unit === u.unitNumber || a.unit === u.id) &&
          (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) &&
          a.status !== 'terminated'
      );

      if (hasDeclinedReq && !hasActiveAgreementForUnit) {
        return false;
      }

      const hasPendingReqForUnit = (state.tenancyRequests || []).some(
        (r) =>
          (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId) &&
          (r.unitId === u.id || r.unitNumber === u.unitNumber) &&
          (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)) &&
          (r.status === 'pending' || r.status === 'accepted')
      );
      if (hasActiveAgreementForUnit || hasPendingReqForUnit) {
        return true;
      }

      // If all agreements for this unit are terminated and no active request exists, exclude it
      const hasAgreements = state.agreements.some(
        (a) =>
          (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
          (a.unit === u.unitNumber || a.unit === u.id) &&
          (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
      );
      const allAgreementsTerminated = hasAgreements && state.agreements
        .filter(
          (a) =>
            (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
            (a.unit === u.unitNumber || a.unit === u.id) &&
            (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
        )
        .every((a) => a.status === 'terminated');
      if (allAgreementsTerminated) return false;

      // Check if a move-out concluded this specific tenancy
      const hasCompletedMoveOut = (state.moveouts || []).some(
        (m) =>
          (!m.propertyId || !u.propertyId || m.propertyId === u.propertyId) &&
          (m.tenantId === user?.id || (tenantEmail && m.tenant?.toLowerCase() === tenantEmail)) &&
          (m.unit === u.unitNumber || m.unit === u.id) &&
          m.status === 'refund_completed'
      );
      if (hasCompletedMoveOut) return false;

      return false;
    })
    .sort((a, b) => {
      // Prioritize units backed by an active or accepted agreement
      const aHasActive = state.agreements.some(
        (ag) => (ag.tenantId === user?.id || (tenantEmail && ag.tenantEmail?.toLowerCase() === tenantEmail)) &&
          (ag.unit === a.unitNumber || ag.unit === a.id) && ag.status === 'active'
      ) ? 0 : 1;
      const bHasActive = state.agreements.some(
        (ag) => (ag.tenantId === user?.id || (tenantEmail && ag.tenantEmail?.toLowerCase() === tenantEmail)) &&
          (ag.unit === b.unitNumber || ag.unit === b.id) && ag.status === 'active'
      ) ? 0 : 1;
      if (aHasActive !== bHasActive) return aHasActive - bHasActive;

      const aHasAg = myAgreementUnitIds.has(a.id) ? 0 : 1;
      const bHasAg = myAgreementUnitIds.has(b.id) ? 0 : 1;
      return aHasAg - bHasAg;
    });

  // Active Building Announcements for Tenant
  const myAnnouncements = useMemo(() => {
    const propertyIds = new Set<string>();
    myUnits.forEach((u) => {
      if (u.propertyId) propertyIds.add(u.propertyId);
    });

    const userIds = new Set<string>();
    if (user?.id) userIds.add(user.id);
    if ((user as any)?.uid) userIds.add((user as any).uid);
    (state.tenants || []).forEach((t) => {
      if (
        (user?.email && t.email && t.email.toLowerCase() === user.email.toLowerCase()) ||
        (user?.id && (t.id === user.id || (t as any).userId === user.id))
      ) {
        userIds.add(t.id);
      }
    });
    myUnits.forEach((u) => {
      if (u.currentTenantId) userIds.add(u.currentTenantId);
    });

    return (state.announcements || [])
      .filter((a: Announcement) => {
        if (a.status !== 'published') return false;
        if (!a.targetScope.targetRoles.includes('tenant')) return false;

        // If targeted to specific recipients, ensure current tenant is targeted
        if (
          a.targetScope.mode === 'specific_people' ||
          (a.targetScope.targetUserIds && a.targetScope.targetUserIds.length > 0)
        ) {
          const targeted = a.targetScope.targetUserIds || [];
          const isTargeted = targeted.some((tid) => userIds.has(tid));
          if (!isTargeted) return false;
        }

        if (a.targetScope.allProperties) return true;
        return a.targetScope.propertyIds.some((pId) => propertyIds.has(pId));
      })
      .sort((a: Announcement, b: Announcement) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
      });
  }, [state.announcements, state.tenants, myUnits, user]);

  const [respondingReqId, setRespondingReqId] = useState<string | null>(null);
  const [ackingNoticeId, setAckingNoticeId] = useState<string | null>(null);

  const handleTenantAcknowledge = async (announcementId: string) => {
    setAckingNoticeId(announcementId);
    try {
      // Use the currently selected unit (not always myUnits[0]) so multi-property tenants
      // get the correct property attributed on their acknowledgement record.
      const ackUnit =
        (selectedUnitId && myUnits.find((u) => u.id === selectedUnitId)) ||
        myUnits[0];
      await acknowledgeAnnouncement(announcementId, {
        tenantId: user?.id || 'tenant',
        tenantName,
        unitNumber: ackUnit?.unitNumber,
        propertyId: ackUnit?.propertyId,
        propertyName: ackUnit?.propertyName,
        acknowledgedAt: new Date().toISOString(),
      });
      showToast('✓ Notice acknowledged. Thank you!');
    } catch (err) {
      console.error('Failed to acknowledge announcement:', err);
      showToast('Could not register acknowledgment.');
    } finally {
      setAckingNoticeId(null);
    }
  };

  const [selectedUnitId, setSelectedUnitId] = useState<string>(myUnits[0]?.id || '');
  const [reviewingRequest, setReviewingRequest] = useState<TenancyRequest | null>(null);
  const [galleryActiveIndex, setGalleryActiveIndex] = useState<number>(0);

  // Sync selectedUnitId when myUnits loads async (e.g. Firebase data arrives after mount)
  useEffect(() => {
    setSelectedUnitId((prev) => {
      // Only update if current selection is empty or no longer valid
      if (!prev || !myUnits.some((u) => u.id === prev)) {
        return myUnits[0]?.id || '';
      }
      return prev;
    });
  }, [myUnits]);

  // Active deposit settlements for this tenant that require attention on Overview
  const mySettlements = (state.depositSettlements || []).filter((s) => {
    const isForMe =
      (user?.id && s.tenantId === user.id) ||
      (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail) ||
      (user?.displayName && s.tenantName?.toLowerCase() === user.displayName.toLowerCase());
    if (!isForMe) return false;

    // 1. If already refunded, it is settled & released -> archived to Transactions > Security Deposit Ledger
    if (s.status === 'refunded' || Boolean(s.tenantConfirmedReceipt)) return false;

    // 2. If the corresponding move-out has already been settled and released, do not show on overview
    const matchingMoveout = (state.moveouts || []).find(
      (m) =>
        m.id === s.id.replace('DEP-SETTLE-', '') ||
        (m.unit === s.unit && (!s.tenantId || m.tenantId === s.tenantId))
    );
    if (matchingMoveout?.status === 'refund_completed' || Boolean(matchingMoveout?.tenantConfirmedReceipt)) return false;

    // 3. If lease agreement for this unit is terminated and depositStatus is refunded, do not show
    const matchingAg = (state.agreements || []).find(
      (a) =>
        a.id === s.agreementId ||
        (a.unit === s.unit && (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)))
    );
    if (matchingAg && (matchingAg.status === 'terminated' || matchingAg.depositStatus === 'refunded')) {
      return false;
    }

    return true;
  });

  // Active cash refund claims awaiting confirmation by this tenant
  const pendingRefundClaimsForMe = (state.cashClaims || []).filter(
    (c) =>
      (c.status === 'pending_confirmation' || (c as any).status === 'pending') &&
      c.claimedByRole === 'owner' &&
      ((user?.id && c.tenantId === user.id) ||
        (tenantEmail && c.tenantName?.toLowerCase() === tenantName.toLowerCase()) ||
        myUnits.some((u) => u.unitNumber === c.unit || u.id === c.unit) ||
        mySettlements.some((s) => s.id === c.settlementId || s.unit === c.unit))
  );
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'unit' | 'property' | 'amenity'>('all');
  const [lightboxItem, setLightboxItem] = useState<{ url: string; title: string; categoryLabel: string } | null>(null);

  const openReviewModal = (req: TenancyRequest) => {
    setGalleryActiveIndex(0);
    setGalleryFilter('all');
    setReviewingRequest(req);
  };

  // Self-healing: if a move-out was completed for a unit, ensure that unit in Firestore & local state is freed
  // ONLY if there is NO new active tenancy or pending reservation for this unit
  useEffect(() => {
    if (!completedMoveOut || hasActiveOrPendingLease) return;
    const dirtyUnit = state.units.find(
      (u) =>
        (u.unitNumber === completedMoveOut.unit || u.id === completedMoveOut.unit) &&
        (u.status === 'occupied' || u.tenant || u.currentTenantId)
    );
    if (dirtyUnit) {
      // Guard: do not clean if dirtyUnit has an active agreement or pending request
      const isReoccupied = state.agreements.some(
        (a) =>
          (a.unit === dirtyUnit.unitNumber || a.unit === dirtyUnit.id) &&
          a.status !== 'terminated'
      ) || (state.tenancyRequests || []).some(
        (r) =>
          (r.unitId === dirtyUnit.id || r.unitNumber === dirtyUnit.unitNumber) &&
          (r.status === 'pending' || r.status === 'accepted')
      );
      if (isReoccupied) return;

      const cleanedUnit: Unit = {
        ...dirtyUnit,
        status: 'vacant',
        tenant: null,
        currentTenantId: null,
      };
      saveUnit(cleanedUnit);
      updateState((prev) => ({
        ...prev,
        units: prev.units.map((u) => (u.id === dirtyUnit.id ? cleanedUnit : u)),
      }));
    }
  }, [completedMoveOut, hasActiveOrPendingLease, state.units, state.agreements, state.tenancyRequests, saveUnit, updateState]);

  // Active unit & property — always prefer the best-matched unit from myUnits
  const currentUnit =
    (selectedUnitId && state.units.find((u) => u.id === selectedUnitId && myUnits.some((mu) => mu.id === u.id))) ||
    myUnits[0];

  // Active agreement for the current unit — derive BEFORE currentProperty so we can use its propertyId
  // Pick the newest non-terminated agreement for this resident & unit
  const currentAgreement = useMemo(() => {
    return state.agreements
      .filter(
        (a) =>
          a.status !== 'terminated' &&
          (a.unit === currentUnit?.unitNumber || a.unit === currentUnit?.id) &&
          (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
      )
      .sort((a, b) => {
        const timeA = new Date(a.approvedAt || a.counterSignedAt || a.ownerSignedUploadedAt || a.initialUploadedAt || a.createdAt || a.start || 0).getTime();
        const timeB = new Date(b.approvedAt || b.counterSignedAt || b.ownerSignedUploadedAt || b.initialUploadedAt || b.createdAt || b.start || 0).getTime();
        return timeB - timeA;
      })[0];
  }, [state.agreements, currentUnit, user?.id, tenantEmail]);

  // Resolve the property: agreement.propertyId is authoritative (unit.propertyId can be stale seed data)
  const currentProperty =
    state.properties.find((p) => p.id === currentAgreement?.propertyId) ||
    state.properties.find((p) => p.id === currentUnit?.propertyId);

  // Authoritative financial values: agreement is source of truth, unit is fallback
  const activeRent = currentAgreement?.rent || currentUnit?.rent || 0;
  const activeDeposit = currentAgreement?.deposit || currentUnit?.deposit || 0;
  const activeCurrency = getCurrencySymbol(currentAgreement?.currency || currentUnit?.currency || currentProperty?.currency || tenantRecord?.currency) || DEFAULT_CURRENCY_SYMBOL;

  const myTickets = state.tickets.filter(
    (t) => (user?.id && t.tenantId === user.id) || (tenantEmail && (t as any).tenantEmail?.toLowerCase() === tenantEmail)
  );

  // Resolved past unit & property for completed move-out display
  const pastUnit = completedMoveOut
    ? state.units.find((u) => u.unitNumber === completedMoveOut.unit || u.id === completedMoveOut.unit)
    : undefined;
  const pastProperty = pastUnit ? state.properties.find((p) => p.id === pastUnit.propertyId) : undefined;
  const pastCurrency = getCurrencySymbol(completedMoveOut?.currency || pastUnit?.currency || pastProperty?.currency) || DEFAULT_CURRENCY_SYMBOL;

  // Pending tenancy requests / invitations sent by owners to this tenant
  const myPendingRequests = (state.tenancyRequests || []).filter(
    (r) =>
      (r.tenantId === user?.id ||
        (tenantEmail && r.tenantEmail.toLowerCase() === tenantEmail)) &&
      r.status === 'pending'
  );

  // Accept Tenancy Invitation
  const handleAcceptRequest = (req: TenancyRequest) => {
    // Only match an existing non-terminated agreement that was created by the owner specifically
    // for THIS request (same tenantId/email AND same unit). Never match a terminated agreement from a previous cycle.
    const existingAg = state.agreements.find(
      (a) =>
        a.propertyId === req.propertyId &&
        a.unit === req.unitNumber &&
        a.status !== 'terminated' &&
        (a.tenantId === (user?.id || req.tenantId) ||
          (req.tenantEmail && a.tenantEmail?.toLowerCase() === req.tenantEmail.toLowerCase()))
    );
    const agId = existingAg?.id || `AG-${Math.floor(1000 + Math.random() * 9000)}`;

    const newAgreement: Agreement = {
      id: agId,
      ownerId: req.ownerId,
      propertyId: req.propertyId,
      unit: req.unitNumber,
      tenant: user?.displayName || req.tenantName,
      tenantId: user?.id || req.tenantId,
      tenantEmail: user?.email || req.tenantEmail,
      tenantPhone: user?.phone || req.tenantPhone,
      type: 'uploaded',
      executionMode: 'digital_dispatch',
      contentHtml: existingAg?.contentHtml || `
        <h3>Residential Tenancy Agreement</h3>
        <p>This Tenancy Agreement is made between Landlord <b>${req.ownerName}</b> and Tenant <b>${user?.displayName || req.tenantName}</b> for <b>${req.propertyName} - Unit ${req.unitNumber}</b>.</p>
        <p><b>Lease Term:</b> ${req.leaseStart} to ${req.leaseEnd}</p>
        <p><b>Agreed Monthly Rent:</b> ${getCurrencySymbol(req.currency)}${(req.rent ?? 0).toLocaleString()} payable on the 1st of each month.</p>
        <p><b>Security Deposit:</b> ${getCurrencySymbol(req.currency)}${(req.deposit ?? 0).toLocaleString()} held in trust.</p>
      `,
      // Use the file the owner attached to the invitation; fall back to any existing file
      fileData: req.agreementFileData || existingAg?.fileData || null,
      fileName: req.agreementFileData
        ? (req.agreementFileName || `Tenancy_Agreement_${req.unitNumber}.pdf`)
        : (existingAg?.fileName || `Tenancy_Agreement_${req.unitNumber}.pdf`),
      fileSize: req.agreementFileSize || existingAg?.fileSize || undefined,
      // Preserve the owner's initial upload so the tenant can download it
      initialAgreementUrl: req.agreementFileData || existingAg?.initialAgreementUrl || undefined,
      initialAgreementName: req.agreementFileData
        ? (req.agreementFileName || `Tenancy_Agreement_${req.unitNumber}.pdf`)
        : existingAg?.initialAgreementName,
      start: req.leaseStart || '',
      end: req.leaseEnd || '',
      rent: req.rent || 0,
      deposit: req.deposit || 0,
      currency: req.currency || state.properties.find((p) => p.id === req.propertyId)?.currency || state.units.find((u) => u.unitNumber === req.unitNumber || u.id === req.unitNumber)?.currency || DEFAULT_CURRENCY,
      rentDueDay: existingAg?.rentDueDay || 1,
      autoRenew: false,
      // Always start fresh — never inherit stale payment/signing state
      status: 'awaiting_tenant_upload',
      depositStatus: 'unpaid',
      depositInvoiceId: undefined,
      requireTenantId: req.requireTenantId ?? existingAg?.requireTenantId ?? false,
      requiredIdList: req.requiredIdList || (req.requiredIdTypes ? req.requiredIdTypes.map((t, idx) => ({ id: `req_id_${idx}`, name: t })) : existingAg?.requiredIdList) || [],
      requiredIdTypes: req.requiredIdTypes || existingAg?.requiredIdTypes || [],
      requiredIdType: req.requiredIdTypes?.[0] || existingAg?.requiredIdType,
      tenantSignature: null,
      signedDocumentUrl: undefined,
      signedDocumentName: undefined,
      signedUploadedAt: undefined,
      ownerSignedDocumentUrl: undefined,
      ownerSignedDocumentName: undefined,
      ownerSignedUploadedAt: undefined,
      approvedAt: undefined,
      approvedBy: undefined,
      counterSignedAt: undefined,
      counterSignatory: undefined,
    };

    // Owner notification
    const ownerNotif = {
      id: `notif_${Date.now()}`,
      userId: req.ownerId,
      title: 'Tenancy Invitation Accepted!',
      body: `${user?.displayName || req.tenantName} has accepted your lease offer for Unit ${req.unitNumber} at ${req.propertyName}. Awaiting physical ink signature upload.`,
      link: '/owner/leasing',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    updateState((prev) => {
      // 1. Keep Unit status as 'reserved' until deposit paid & owner counter-signs
      const isTargetUnit = (u: any) =>
        u.id === req.unitId ||
        (Boolean(req.unitNumber) && u.unitNumber === req.unitNumber && (!req.propertyId || !u.propertyId || u.propertyId === req.propertyId));

      const updatedUnits = prev.units.map((u) =>
        isTargetUnit(u)
          ? {
            ...u,
            status: 'reserved' as const,
            tenant: user?.displayName || req.tenantName,
            currentTenantId: user?.id || req.tenantId,
            rent: req.rent,
            deposit: req.deposit,
            currency: req.currency || u.currency || DEFAULT_CURRENCY,
          }
          : u
      );

      // 2. Update or create Tenant record
      let existingTenant = prev.tenants.find(
        (t) => (t.id === user?.id || (user?.id && (t as any).userId === user.id) || (tenantEmail && t.email.toLowerCase() === tenantEmail)) &&
               (req.propertyId && t.propertyId ? t.propertyId === req.propertyId : (!req.propertyId && !t.propertyId))
      );
      let updatedTenants = [...prev.tenants];

      if (existingTenant) {
        updatedTenants = prev.tenants.map((t) =>
          t.id === existingTenant!.id
            ? {
              ...t,
              unit: t.unit && t.unit !== 'Unassigned' && t.unit !== 'Pending' ? t.unit : req.unitNumber,
              unitsRented: Array.from(new Set([...(t.unitsRented || []), req.unitNumber])),
              propertyId: req.propertyId || t.propertyId,
              propertyName: req.propertyName || t.propertyName,
              owner: req.ownerName || t.owner,
              ownerId: req.ownerId || t.ownerId,
              rent: req.rent,
              deposit: req.deposit,
              currency: req.currency || t.currency || DEFAULT_CURRENCY,
              leaseStart: req.leaseStart,
              leaseEnd: req.leaseEnd,
            }
            : t
        );
      } else {
        const uniqueTenantDocId = user?.id
          ? (req.propertyId ? `${user.id}_${req.propertyId}` : user.id)
          : req.tenantId;
        const newRec = {
          id: uniqueTenantDocId,
          userId: user?.id,
          name: user?.displayName || req.tenantName,
          email: user?.email || req.tenantEmail,
          phone: user?.phone || '',
          propertyId: req.propertyId,
          propertyName: req.propertyName,
          unit: req.unitNumber,
          unitId: req.unitId,
          owner: req.ownerName,
          ownerId: req.ownerId,
          leaseStart: req.leaseStart,
          leaseEnd: req.leaseEnd,
          rent: req.rent,
          deposit: req.deposit,
          currency: req.currency || DEFAULT_CURRENCY,
          rating: 5.0,
          unitsRented: [req.unitNumber],
          history: [],
          kycDocuments: [],
        };
        updatedTenants.push(newRec);
      }

      // 3. Mark request as accepted
      const updatedRequests = (prev.tenancyRequests || []).map((r) =>
        r.id === req.id ? { ...r, status: 'accepted' as const, respondedAt: new Date().toISOString() } : r
      );

      // Persist to Firestore backend
      saveAgreement(newAgreement);
      const assignedUnit = updatedUnits.find(isTargetUnit);
      if (assignedUnit) saveUnit(assignedUnit);
      const acceptedReq = updatedRequests.find((r) => r.id === req.id);
      if (acceptedReq) saveTenancyRequest(acceptedReq, ownerNotif);
      const targetTenantRecord = updatedTenants.find(
        (t) => (!req.propertyId || !t.propertyId || t.propertyId === req.propertyId) &&
               (t.id === (user?.id || req.tenantId) || (user?.id && (t as any).userId === user.id) || (req.tenantEmail && t.email?.toLowerCase() === req.tenantEmail.toLowerCase()))
      );
      if (targetTenantRecord) saveTenant(targetTenantRecord);

      return {
        ...prev,
        units: updatedUnits,
        tenants: updatedTenants,
        agreements: [...prev.agreements.filter((a) => a.id !== agId), newAgreement],
        tenancyRequests: updatedRequests,
        notifications: [...(prev.notifications || []), ownerNotif],
      };
    });

    setRespondingReqId(req.id);
    try {
      setSelectedUnitId(req.unitId);
      setReviewingRequest(null);
      showToast(`✓ Tenancy invitation accepted! Unit ${req.unitNumber} reserved. Please sign and upload your agreement.`);
      navigate('/tenant/lease');
    } finally {
      setRespondingReqId(null);
    }
  };

  // Decline Tenancy Invitation (frees the reserved unit, cancels agreement, and voids pending invoices)
  const handleDeclineRequest = (req: TenancyRequest) => {
    const ownerNotif = {
      id: `notif_${Date.now()}`,
      userId: req.ownerId,
      title: 'Tenancy Invitation Declined',
      body: `${user?.displayName || req.tenantName} declined the tenancy offer for Unit ${req.unitNumber}. Unit is now vacant.`,
      link: '/owner/tenants',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    const declinedReq: TenancyRequest = {
      ...req,
      status: 'declined',
      respondedAt: new Date().toISOString(),
    };
    saveTenancyRequest(declinedReq, ownerNotif);

    // Free unit back to vacant
    const targetUnit = state.units.find(
      (u) =>
        u.id === req.unitId ||
        (req.unitNumber && u.unitNumber === req.unitNumber && (!req.propertyId || u.propertyId === req.propertyId))
    );
    if (targetUnit) {
      const freedUnit = {
        ...targetUnit,
        status: 'vacant' as const,
        tenant: null,
        currentTenantId: null,
      };
      saveUnit(freedUnit);
    }

    // 1. Terminate any active or pending agreements for this request, unit, or tenant
    const updatedAgreements: Agreement[] = (state.agreements || []).map((a) => {
      const matchesReq = (a as any).tenancyRequestId === req.id;
      const matchesUnitTenant =
        (a.unit === req.unitNumber || (a as any).unitId === req.unitId || (targetUnit && (a.unit === targetUnit.unitNumber || a.unit === targetUnit.id))) &&
        (a.tenantId === req.tenantId || (req.tenantEmail && a.tenantEmail?.toLowerCase() === req.tenantEmail.toLowerCase()));
      if (matchesReq || matchesUnitTenant) {
        const terminatedAg: Agreement = {
          ...a,
          status: 'terminated',
        };
        saveAgreement(terminatedAg);
        return terminatedAg;
      }
      return a;
    });

    // 2. Cancel any unconfirmed invoices (e.g. deposit or rent) for this declined tenancy
    const updatedInvoices: Invoice[] = (state.invoices || []).map((inv) => {
      const matchesAg = updatedAgreements.some((a) => a.status === 'terminated' && (inv.leaseAgreementId === a.id || inv.id === (a as any).depositInvoiceId));
      const matchesUnitTenant =
        (inv.unit === req.unitNumber || (targetUnit && inv.unit === targetUnit.unitNumber)) &&
        (inv.tenantId === req.tenantId || (inv.tenant && req.tenantName && inv.tenant.toLowerCase() === req.tenantName.toLowerCase()) || (req.tenantEmail && inv.tenantEmail?.toLowerCase() === req.tenantEmail.toLowerCase()));
      if (matchesAg || matchesUnitTenant) {
        const cancelledInv: Invoice = {
          ...inv,
          status: 'cancelled',
        };
        saveInvoice(cancelledInv);
        return cancelledInv;
      }
      return inv;
    });

    // 3. Clear unit assignment from tenant record
    const updatedTenants: TenantRecord[] = (state.tenants || []).map((t) => {
      const isMatch =
        t.id === req.tenantId ||
        (req.tenantEmail && t.email?.toLowerCase() === req.tenantEmail.toLowerCase());
      if (isMatch) {
        const updatedUnitsRented = (t.unitsRented || []).filter(
          (un) => un !== req.unitNumber && un !== req.unitId
        );
        const currentUnitCleared = t.unit === req.unitNumber || t.unit === req.unitId ? '' : t.unit;
        const updatedT: TenantRecord = {
          ...t,
          unit: currentUnitCleared,
          unitsRented: updatedUnitsRented,
        };
        saveTenant(updatedT);
        return updatedT;
      }
      return t;
    });

    updateState((prev) => {
      const nextUnits = prev.units.map((u) => {
        const isMatch =
          u.id === req.unitId ||
          (req.unitNumber && u.unitNumber === req.unitNumber && (!req.propertyId || u.propertyId === req.propertyId));
        return isMatch
          ? {
            ...u,
            status: 'vacant' as const,
            tenant: null,
            currentTenantId: null,
          }
          : u;
      });
      const targetPropertyId = targetUnit?.propertyId;
      const nextProperties = targetPropertyId
        ? prev.properties.map((p) =>
          p.id === targetPropertyId
            ? {
              ...p,
              occupied: nextUnits.filter((u) => u.propertyId === targetPropertyId && u.status === 'occupied').length,
            }
            : p
        )
        : prev.properties;

      return {
        ...prev,
        units: nextUnits,
        properties: nextProperties,
        tenants: updatedTenants,
        agreements: updatedAgreements,
        invoices: updatedInvoices,
        tenancyRequests: (prev.tenancyRequests || []).map((r) =>
          r.id === req.id ? declinedReq : r
        ),
        notifications: [...(prev.notifications || []), ownerNotif],
      };
    });
    showToast(`Tenancy offer declined. Unit ${req.unitNumber} released back to vacant and pending invoices voided.`);
  };

  return (
    <div>
      {/* Preserved Archive Banner for Decoupled Tenants */}
      {((tenantRecord as any)?.status === 'unmanaged_archive' || (state.agreements || []).some((a) => (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) && (a.status as string) === 'unmanaged_archive')) && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.03))',
            border: '1px solid #3B82F6',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div style={{ fontSize: '24px' }}>📁</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#1E40AF' }}>
              Read-Only Preserved Tenancy Archive
            </div>
            <div style={{ fontSize: '13px', color: '#1E3A8A', marginTop: '3px', lineHeight: 1.5 }}>
              The property landlord account associated with your previous tenancy was retired or unmanaged.
              Your signed lease agreements, official tax vouchers, and payment history have been securely archived
              and remain fully accessible in read-only mode for your personal and tax records.
            </div>
          </div>
        </div>
      )}

      {/* SECTION 0: Real-Time Automated Action Center & Reminders */}
      <DashboardReminderHub
        reminders={tenantReminders}
        role="tenant"
        title="Action Required & Reminders"
      />


      {/* SECTION: Actionable Cash Handover Confirmation Banners */}
      {pendingRefundClaimsForMe.map((c) => (
        <div
          key={c.id}
          style={{
            background: '#FFFBEB',
            border: '1.5px solid #F59E0B',
            borderRadius: 'var(--radius)',
            padding: '16px 18px',
            marginBottom: '20px',
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                  ⚡ CASH REFUND HANDOVER CONFIRMATION NEEDED
                </span>
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Claim #{c.id}</span>
              </div>
              <h4 style={{ margin: '6px 0 4px', fontSize: '15px', color: 'var(--ink)' }}>
                {c.claimedByName} reported handing you {getCurrencySymbol(c.currency)} {(Number(c.amount) || 0).toLocaleString('en-IN')} in Cash
              </h4>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                <b>Date:</b> {c.handoverDate} • <b>Unit:</b> {c.unit} • <b>Location:</b> {c.handoverLocation || 'On-Site Inspection'}
                {c.notes && <span style={{ display: 'block', marginTop: '2px', fontStyle: 'italic' }}>"{c.notes}"</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-mobile-full"
                style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={async () => {
                  await confirmCashClaim(c.id);
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
                    await rejectCashClaim(c.id, reason.trim());
                  }
                }}
              >
                Decline / Not Received
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* SECTION: Security Deposit Settlement & Refund Hub */}
      {mySettlements.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ledger)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Landmark size={18} color="var(--brass)" />
            Security Deposit Settlements ({mySettlements.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mySettlements.map((settlement) => {
              const myPayout = (state.payoutProfiles || []).find((p) => p.tenantId === user?.id);
              const grossDeposit = Number(settlement.grossDepositHeld ?? (settlement as any).deposit ?? (settlement as any).grossDeposit ?? 0);
              const netRefund = Number(settlement.netRefundableAmount ?? (settlement as any).netRefund ?? (settlement as any).finalRefundAmount ?? grossDeposit);
              const currency = settlement.currency || DEFAULT_CURRENCY;
              return (
                <div
                  key={settlement.id}
                  style={{
                    background: 'var(--surface)',
                    border: settlement.status === 'refunded' ? '2px solid #2F5D50' : '2px solid var(--brass, #C59A45)',
                    borderRadius: '10px',
                    padding: '20px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span
                          className={`badge ${settlement.status === 'refunded'
                              ? 'green'
                              : settlement.status === 'awaiting_tenant_cash_confirmation'
                                ? 'amber'
                                : settlement.status === 'approved'
                                  ? 'brass'
                                  : settlement.status === 'rejected' || settlement.status === 'contested'
                                    ? 'red'
                                    : 'amber'
                            }`}
                          style={settlement.status === 'awaiting_tenant_cash_confirmation' ? { background: '#FEF3C7', color: '#B45309', border: '1px solid #F59E0B' } : undefined}
                        >
                          {settlement.status === 'refunded'
                            ? '✓ Refund Disbursed'
                            : settlement.status === 'awaiting_tenant_cash_confirmation'
                              ? '⏳ Cash Handover Reported — Awaiting Your Confirmation'
                              : settlement.status === 'approved'
                                ? '✓ Accepted by Tenant'
                                : settlement.status === 'rejected' || settlement.status === 'contested'
                                  ? '❌ Deductions Rejected'
                                  : 'Action Required: Review Move-Out Settlement'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          Unit {settlement.unit} • {settlement.propertyName}
                        </span>
                      </div>
                      <h4 style={{ margin: 0, fontSize: '16px' }}>
                        Move-Out Security Deposit Reconciliation
                      </h4>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Net Refundable Amount:</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ledger)' }}>
                        {getCurrencySymbol(currency)}{netRefund.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* Deductions Breakdown */}
                  <div style={{ background: '#F8F9FA', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span>Initial Security Deposit Held:</span>
                      <b>{getCurrencySymbol(currency)}{grossDeposit.toLocaleString('en-IN')}</b>
                    </div>

                    {settlement.deductions && settlement.deductions.length > 0 ? (
                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '6px', marginTop: '6px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600, marginBottom: '4px' }}>
                          Itemized Deductions Assessed by Landlord:
                        </div>
                        {settlement.deductions.map((d) => (
                          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '3px' }}>
                            <span>• [{d.category ? d.category.replace('_', ' ').toUpperCase() : 'REPAIR'}] {d.title}</span>
                            <b style={{ color: 'var(--danger)' }}>- {getCurrencySymbol(currency)}{(Number(d.amount) || 0).toLocaleString('en-IN')}</b>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)' }}>
                        ✓ Zero deductions assessed. Full 100% deposit return approved by landlord.
                      </div>
                    )}
                  </div>

                  {/* Payout Destination Info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                      {settlement.chosenPayoutDetails ? (
                        <div>
                          <b>Payout Destination: </b>
                          <span style={{ color: 'var(--ledger)', fontWeight: 600 }}>
                            {settlement.chosenPayoutDetails.method === 'upi' && `UPI ID (${settlement.chosenPayoutDetails.upiId})`}
                            {settlement.chosenPayoutDetails.method === 'paypal' && `PayPal (${settlement.chosenPayoutDetails.paypalEmail})`}
                            {settlement.chosenPayoutDetails.method === 'iban' && `IBAN (${settlement.chosenPayoutDetails.iban})`}
                            {settlement.chosenPayoutDetails.method === 'bank_in' && `Bank Acc (${settlement.chosenPayoutDetails.accountNumber} • IFSC: ${settlement.chosenPayoutDetails.ifscCode})`}
                            {settlement.chosenPayoutDetails.method === 'cash' && `In-Person Hand Cash Handover`}
                          </span>
                          {settlement.paymentReference && (
                            <span style={{ marginLeft: '8px', color: 'var(--ink)', fontWeight: 600 }}>
                              • Ref: {settlement.paymentReference}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: settlement.status === 'awaiting_tenant_approval' ? 'var(--brass, #C59A45)' : 'var(--ink-soft)' }}>
                          {settlement.status === 'awaiting_tenant_approval'
                            ? '⚠️ Please review and accept to specify your refund destination handle (UPI / PayPal / Bank Wire / Cash).'
                            : myPayout
                              ? `Default Profile: ${myPayout.channel.toUpperCase()} (${myPayout.upiId || myPayout.paypalEmail || myPayout.accountNumber || 'Configured'})`
                              : 'No payout profile configured.'}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn secondary small btn-mobile-full"
                        onClick={() => downloadDepositSettlementPdf(settlement)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <Download size={13} /> Download PDF Voucher
                      </button>

                      {settlement.status === 'awaiting_tenant_approval' && (
                        <button
                          type="button"
                          className="btn brass small btn-mobile-full"
                          onClick={() => setSettlementToReview(settlement)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}
                        >
                          Review &amp; Claim Refund →
                        </button>
                      )}

                      {(settlement.status === 'rejected' || settlement.status === 'contested') && (
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => setSettlementToReview(settlement)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--danger)' }}
                        >
                          ❌ View Rejected Settlement
                        </button>
                      )}

                      {(settlement.status === 'awaiting_tenant_cash_confirmation' || settlement.status === 'approved') && (() => {
                        const cleanUnit = (u?: string) => (u || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase();
                        const matchingClaim = (state.cashClaims || []).find((c) => {
                          const isPending = c.status === 'pending_confirmation' || (c as any).status === 'pending';
                          if (!isPending) return false;
                          if (c.settlementId && (c.settlementId === settlement.id || settlement.id.includes(c.settlementId) || c.settlementId.includes(settlement.id))) return true;
                          if ((settlement as any).cashClaimId && c.id === (settlement as any).cashClaimId) return true;
                          if (c.moveOutId && settlement.id.includes(c.moveOutId)) return true;
                          if (c.unit && settlement.unit && cleanUnit(c.unit) === cleanUnit(settlement.unit) && (c.type === 'deposit_refund' || c.claimedByRole === 'owner')) return true;
                          return false;
                        });

                        if (settlement.status === 'awaiting_tenant_cash_confirmation' || matchingClaim) {
                          return (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn small btn-mobile-full"
                                style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '6px 14px', fontSize: '12.5px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                                onClick={async () => {
                                  if (matchingClaim) {
                                    await confirmCashClaim(matchingClaim.id);
                                  } else {
                                    await confirmRefundReceipt(settlement.id);
                                  }
                                  showToast('✓ Cash refund confirmed! Security deposit settled.');
                                }}
                              >
                                <CheckCircle2 size={14} /> Confirm Cash Received ({getCurrencySymbol(matchingClaim?.currency || settlement.currency)}{(Number(matchingClaim?.amount) || settlement.netRefundableAmount).toLocaleString('en-IN')})
                              </button>
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                onClick={() => setSettlementToReview(settlement)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                              >
                                Review Details
                              </button>
                            </div>
                          );
                        }
                        return (
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            onClick={() => setSettlementToReview(settlement)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <span className="badge brass" style={{ fontSize: '12px' }}>
                              ✓ Accepted — Awaiting Owner Disbursement
                            </span>
                          </button>
                        );
                      })()}

                      {settlement.status === 'refunded' && (
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => setSettlementToReview(settlement)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        >
                          {settlement.tenantConfirmedReceipt ? (
                            <span className="badge green" style={{ fontSize: '12px' }}>
                              ✓ Disbursed &amp; Settled
                            </span>
                          ) : (
                            <span className="badge amber" style={{ fontSize: '12px', background: '#FEF3C7', color: '#B45309', border: '1px solid #F59E0B', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                              ⚡ Disbursed — Confirm Receipt
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Building Announcements & Community Bulletins */}
      {myAnnouncements.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink-base)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Megaphone size={18} color="var(--brass, #c59b27)" />
            Building Announcements & Community Bulletins ({myAnnouncements.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {myAnnouncements.map((a) => {
              const isUrgent = a.priority === 'urgent' || a.priority === 'emergency';
              const hasAcked = (a.acknowledgments || []).some(
                (ack) => ack.tenantId === user?.id || (user?.email && ack.tenantName === tenantName)
              );

              return (
                <div
                  key={a.id}
                  className="panel"
                  style={{
                    padding: '18px 20px',
                    borderRadius: '8px',
                    borderLeft: isUrgent ? '4px solid #dc2626' : a.isPinned ? '4px solid var(--brass, #c59b27)' : '4px solid var(--border)',
                    background: isUrgent ? '#fef2f2' : 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {a.category === 'maintenance' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#1d4ed8', padding: '3px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                          <Wrench size={12} /> Maintenance
                        </span>
                      )}
                      {a.category === 'policy' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#b45309', padding: '3px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                          <ShieldCheck size={12} /> Building Policy
                        </span>
                      )}
                      {a.category === 'security' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#b91c1c', padding: '3px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                          <AlertCircle size={12} /> Safety & Security
                        </span>
                      )}
                      {isUrgent && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dc2626', color: '#fff', padding: '2px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
                          <Flame size={11} /> Urgent
                        </span>
                      )}
                      {a.isPinned && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
                          <Pin size={10} /> Pinned
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                      {new Date(a.publishedAt || a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 6px 0', fontSize: '15.5px', fontWeight: 700, color: 'var(--ink-base)' }}>
                    {a.title}
                  </h3>

                  <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--ink)', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                    {a.body}
                  </div>

                  {a.requireAcknowledgment && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                        Notice from <strong style={{ color: 'var(--ink-base)' }}>{a.authorName}</strong> • Compliance acknowledgment required
                      </div>

                      {hasAcked ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#16a34a', fontWeight: 700, fontSize: '12px', background: '#f0fdf4', padding: '4px 10px', borderRadius: '4px' }}>
                          <CheckCircle2 size={14} /> You have acknowledged this notice
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`btn brass small ${ackingNoticeId === a.id ? 'btn-processing' : ''}`}
                          onClick={() => handleTenantAcknowledge(a.id)}
                          disabled={ackingNoticeId === a.id}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                        >
                          <ButtonProcessing
                            loading={ackingNoticeId === a.id}
                            loadingText="Recording..."
                            defaultText="I Have Read & Acknowledge"
                            icon={<Check size={14} />}
                            spinnerSize="xs"
                          />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 1: Pending Tenancy Invitations & Requests Banner */}
      {myPendingRequests.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ledger)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={18} color="var(--brass)" />
            Pending Tenancy Invitations ({myPendingRequests.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {myPendingRequests.map((req) => (
              <div
                key={req.id}
                style={{
                  background: 'var(--surface)',
                  border: '2px solid var(--brass)',
                  borderRadius: '10px',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span className="badge amber" style={{ fontSize: '11px' }}>
                      <Clock size={11} /> Invitation Awaiting Response
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      Received {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                    {req.propertyName} • Unit {req.unitNumber}
                  </h3>

                  <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                    Offered by Landlord <b>{req.ownerName}</b> ({req.ownerEmail})
                  </div>

                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Monthly Rent:</span>{' '}
                      <b style={{ color: 'var(--ledger)' }}>
                        {getCurrencySymbol(req.currency)}
                        {(req.rent ?? 0).toLocaleString()}
                      </b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Security Deposit:</span>{' '}
                      <b>
                        {getCurrencySymbol(req.currency)}
                        {(req.deposit ?? 0).toLocaleString()}
                      </b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Lease Period:</span>{' '}
                      <span>
                        {req.leaseStart} to {req.leaseEnd}
                      </span>
                    </div>
                  </div>

                  {req.message && (
                    <div
                      style={{
                        marginTop: '10px',
                        fontSize: '12.5px',
                        background: '#FAFAF7',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        maxWidth: '100%',
                      }}
                    >
                      <b style={{ color: 'var(--ink)' }}>Note from Landlord:</b> "{req.message}"
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignSelf: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn secondary btn-mobile-full"
                    onClick={() => openReviewModal(req)}
                    style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Eye size={15} color="var(--brass)" /> Review Property & Agreement
                  </button>

                  <button
                    type="button"
                    className="btn secondary btn-mobile-full"
                    disabled={respondingReqId === req.id}
                    onClick={() => handleDeclineRequest(req)}
                    style={{ color: 'var(--danger)', fontSize: '13px' }}
                  >
                    <XCircle size={15} /> Decline
                  </button>

                  <button
                    type="button"
                    className={`btn brass btn-mobile-full ${respondingReqId === req.id ? 'btn-processing' : ''}`}
                    onClick={() => handleAcceptRequest(req)}
                    disabled={respondingReqId === req.id}
                    style={{ fontWeight: 600, fontSize: '13px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ButtonProcessing
                      loading={respondingReqId === req.id}
                      loadingText="Accepting..."
                      defaultText="Accept & Proceed to Sign"
                      icon={<CheckCircle size={16} />}
                      spinnerSize="xs"
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Review Property & Uploaded Agreement Document Before Accepting */}
      {reviewingRequest && (() => {
        const targetProp = state.properties.find((p) => p.id === reviewingRequest.propertyId);
        const targetU = state.units.find((u) => u.id === reviewingRequest.unitId);
        const ownerUser = state.users?.find((u) => u.id === reviewingRequest.ownerId);
        const ownerPhone = (reviewingRequest as any).ownerPhone || ownerUser?.phone;

        // Aggregate all media uploaded by the owner across Unit, Property, and Amenities
        interface GalleryMediaItem {
          id: string;
          url: string;
          category: 'unit' | 'property' | 'amenity';
          categoryLabel: string;
          title: string;
          subtitle?: string;
        }

        const allMedia: GalleryMediaItem[] = [];

        // 1. Unit Photos
        const unitImages = (targetU?.images && targetU.images.length > 0)
          ? targetU.images
          : (targetU?.image ? [targetU.image] : []);

        unitImages.forEach((img, idx) => {
          if (img && !allMedia.some((m) => m.url === img)) {
            allMedia.push({
              id: `unit-${idx}`,
              url: img,
              category: 'unit',
              categoryLabel: 'Unit Interior',
              title: `Unit ${reviewingRequest.unitNumber} • Photo ${idx + 1}`,
              subtitle: `${targetU?.unitType || 'Unit'} Layout`,
            });
          }
        });

        // 2. Property / Building Photos
        if (targetProp?.images && targetProp.images.length > 0) {
          targetProp.images.forEach((img, idx) => {
            if (img && !allMedia.some((m) => m.url === img)) {
              allMedia.push({
                id: `prop-${idx}`,
                url: img,
                category: 'property',
                categoryLabel: 'Property Exterior',
                title: `${targetProp.name || reviewingRequest.propertyName} • Photo ${idx + 1}`,
                subtitle: 'Building & Common Areas',
              });
            }
          });
        }

        // 3. Amenity Photos
        if (targetProp?.amenityPhotos && targetProp.amenityPhotos.length > 0) {
          targetProp.amenityPhotos.forEach((ap, idx) => {
            if (ap.image && !allMedia.some((m) => m.url === ap.image)) {
              allMedia.push({
                id: `amenity-${idx}`,
                url: ap.image,
                category: 'amenity',
                categoryLabel: 'Amenity Facility',
                title: ap.name,
                subtitle: 'Building Amenity Feature',
              });
            }
          });
        }

        const filteredMedia = allMedia.filter((m) => {
          if (galleryFilter === 'all') return true;
          return m.category === galleryFilter;
        });

        const activeIdx = Math.min(galleryActiveIndex, Math.max(0, filteredMedia.length - 1));
        const currentMedia = filteredMedia[activeIdx];

        const nextPhoto = () => {
          if (filteredMedia.length > 0) {
            setGalleryActiveIndex((activeIdx + 1) % filteredMedia.length);
          }
        };

        const prevPhoto = () => {
          if (filteredMedia.length > 0) {
            setGalleryActiveIndex((activeIdx - 1 + filteredMedia.length) % filteredMedia.length);
          }
        };

        const jumpToAmenityPhoto = (amenityName: string) => {
          const itemIdx = allMedia.findIndex(
            (m) => m.category === 'amenity' && m.title.toLowerCase() === amenityName.toLowerCase()
          );
          if (itemIdx !== -1) {
            setGalleryFilter('all');
            setGalleryActiveIndex(itemIdx);
          }
        };

        return (
          <div className="modal-backdrop" onClick={() => setReviewingRequest(null)}>
            <div className="modal-card" style={{ maxWidth: '840px', width: '96vw' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building size={20} color="var(--brass)" />
                    Review Property & Lease Agreement
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                    Official Invitation for <b>{reviewingRequest.propertyName}</b> • Unit <b>{reviewingRequest.unitNumber}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setReviewingRequest(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ maxHeight: '76vh', overflowY: 'auto', padding: '20px' }}>

                {/* 1. PROPERTY & LANDLORD IDENTIFICATION HEADER */}
                <div
                  style={{
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h4 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                          {reviewingRequest.propertyName}
                        </h4>
                        <span className="badge brass" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                          {targetProp?.propertyType || 'Residential'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink-soft)' }}>
                        <MapPin size={15} color="var(--brass)" style={{ flexShrink: 0 }} />
                        <span>
                          {typeof targetProp?.address === 'string'
                            ? targetProp.address
                            : targetProp?.address?.formattedAddress || 'Property Address on File'}
                        </span>
                      </div>
                      {(targetProp?.floorsCount || targetProp?.yearBuilt) && (
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                          {targetProp.floorsCount ? `${targetProp.floorsCount} Floors` : ''}
                          {targetProp.floorsCount && targetProp.yearBuilt ? ' • ' : ''}
                          {targetProp.yearBuilt ? `Constructed ${targetProp.yearBuilt}` : ''}
                          {targetProp.unitCount ? ` • ${targetProp.unitCount} Total Units` : ''}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className="badge green" style={{ fontSize: '12.5px', padding: '5px 12px', fontWeight: 600 }}>
                        Unit {reviewingRequest.unitNumber} ({targetU?.unitType || 'Residence'})
                      </span>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        Landlord: <b style={{ color: 'var(--ink)' }}>{reviewingRequest.ownerName}</b>
                      </div>
                    </div>
                  </div>

                  {/* Landlord Contact Info Strip */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '16px',
                      marginTop: '12px',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(0,0,0,0.06)',
                      fontSize: '12px',
                      color: 'var(--ink-soft)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <User size={13} color="var(--brass)" /> {reviewingRequest.ownerName} (Owner)
                    </span>
                    {reviewingRequest.ownerEmail && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Mail size={13} color="var(--brass)" /> {reviewingRequest.ownerEmail}
                      </span>
                    )}
                    {ownerPhone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Phone size={13} color="var(--brass)" /> {ownerPhone}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. OWNER-UPLOADED MEDIA GALLERY SHOWCASE */}
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Camera size={18} color="var(--brass)" />
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                        Owner Uploaded Photos ({allMedia.length})
                      </h4>
                    </div>

                    {/* Filter Pills */}
                    {allMedia.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => { setGalleryFilter('all'); setGalleryActiveIndex(0); }}
                          style={{
                            padding: '3px 10px',
                            fontSize: '11.5px',
                            borderRadius: '14px',
                            border: '1px solid',
                            borderColor: galleryFilter === 'all' ? 'var(--brass)' : 'var(--line)',
                            background: galleryFilter === 'all' ? '#FDF8ED' : '#FFF',
                            color: galleryFilter === 'all' ? 'var(--brass)' : 'var(--ink-soft)',
                            fontWeight: galleryFilter === 'all' ? 700 : 500,
                            cursor: 'pointer',
                          }}
                        >
                          All ({allMedia.length})
                        </button>
                        {unitImages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => { setGalleryFilter('unit'); setGalleryActiveIndex(0); }}
                            style={{
                              padding: '3px 10px',
                              fontSize: '11.5px',
                              borderRadius: '14px',
                              border: '1px solid',
                              borderColor: galleryFilter === 'unit' ? 'var(--brass)' : 'var(--line)',
                              background: galleryFilter === 'unit' ? '#FDF8ED' : '#FFF',
                              color: galleryFilter === 'unit' ? 'var(--brass)' : 'var(--ink-soft)',
                              fontWeight: galleryFilter === 'unit' ? 700 : 500,
                              cursor: 'pointer',
                            }}
                          >
                            Unit Photos ({unitImages.length})
                          </button>
                        )}
                        {targetProp?.images && targetProp.images.length > 0 && (
                          <button
                            type="button"
                            onClick={() => { setGalleryFilter('property'); setGalleryActiveIndex(0); }}
                            style={{
                              padding: '3px 10px',
                              fontSize: '11.5px',
                              borderRadius: '14px',
                              border: '1px solid',
                              borderColor: galleryFilter === 'property' ? 'var(--brass)' : 'var(--line)',
                              background: galleryFilter === 'property' ? '#FDF8ED' : '#FFF',
                              color: galleryFilter === 'property' ? 'var(--brass)' : 'var(--ink-soft)',
                              fontWeight: galleryFilter === 'property' ? 700 : 500,
                              cursor: 'pointer',
                            }}
                          >
                            Property & Exterior ({targetProp.images.length})
                          </button>
                        )}
                        {targetProp?.amenityPhotos && targetProp.amenityPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => { setGalleryFilter('amenity'); setGalleryActiveIndex(0); }}
                            style={{
                              padding: '3px 10px',
                              fontSize: '11.5px',
                              borderRadius: '14px',
                              border: '1px solid',
                              borderColor: galleryFilter === 'amenity' ? 'var(--brass)' : 'var(--line)',
                              background: galleryFilter === 'amenity' ? '#FDF8ED' : '#FFF',
                              color: galleryFilter === 'amenity' ? 'var(--brass)' : 'var(--ink-soft)',
                              fontWeight: galleryFilter === 'amenity' ? 700 : 500,
                              cursor: 'pointer',
                            }}
                          >
                            Amenities ({targetProp.amenityPhotos.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Main Gallery Display */}
                  {filteredMedia.length > 0 && currentMedia ? (
                    <div>
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          height: '320px',
                          background: '#0F172A',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img
                          src={currentMedia.url}
                          alt={currentMedia.title}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            display: 'block',
                            cursor: 'pointer',
                          }}
                          onClick={() => setLightboxItem(currentMedia)}
                          title="Click to expand high-resolution view"
                        />

                        {/* Top Badges Overlay */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            display: 'flex',
                            gap: '6px',
                            alignItems: 'center',
                            zIndex: 2,
                          }}
                        >
                          <span
                            style={{
                              background: 'rgba(15, 23, 42, 0.85)',
                              backdropFilter: 'blur(6px)',
                              color: '#F8FAFC',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '3px 9px',
                              borderRadius: '4px',
                              border: '1px solid rgba(255,255,255,0.15)',
                            }}
                          >
                            {currentMedia.categoryLabel}
                          </span>
                          <span
                            style={{
                              background: 'rgba(212, 175, 55, 0.9)',
                              color: '#0F172A',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {currentMedia.title}
                          </span>
                        </div>

                        {/* Right Actions: Counter & Expand */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            display: 'flex',
                            gap: '6px',
                            alignItems: 'center',
                            zIndex: 2,
                          }}
                        >
                          <span
                            style={{
                              background: 'rgba(15, 23, 42, 0.85)',
                              color: '#CBD5E1',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              padding: '4px 10px',
                              borderRadius: '4px',
                            }}
                          >
                            {activeIdx + 1} / {filteredMedia.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setLightboxItem(currentMedia)}
                            style={{
                              background: 'rgba(15, 23, 42, 0.85)',
                              color: '#FFF',
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Open full-screen image viewer"
                          >
                            <Maximize2 size={13} /> Fullscreen
                          </button>
                        </div>

                        {/* Left / Right Carousel Controls */}
                        {filteredMedia.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                              style={{
                                position: 'absolute',
                                left: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'rgba(15, 23, 42, 0.75)',
                                color: '#FFF',
                                border: 'none',
                                borderRadius: '50%',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                zIndex: 2,
                                transition: 'background 0.2s',
                              }}
                              aria-label="Previous photo"
                            >
                              <ChevronLeft size={20} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                              style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'rgba(15, 23, 42, 0.75)',
                                color: '#FFF',
                                border: 'none',
                                borderRadius: '50%',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                zIndex: 2,
                                transition: 'background 0.2s',
                              }}
                              aria-label="Next photo"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Horizontal Thumbnail Strip */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          marginTop: '10px',
                          overflowX: 'auto',
                          paddingBottom: '4px',
                        }}
                      >
                        {filteredMedia.map((media, idx) => (
                          <div
                            key={media.id}
                            onClick={() => setGalleryActiveIndex(idx)}
                            style={{
                              position: 'relative',
                              flexShrink: 0,
                              width: '74px',
                              height: '52px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: idx === activeIdx ? '2px solid var(--brass)' : '1px solid var(--line)',
                              boxShadow: idx === activeIdx ? '0 0 0 1px var(--brass)' : 'none',
                              opacity: idx === activeIdx ? 1 : 0.65,
                              transition: 'all 0.2s',
                            }}
                          >
                            <img
                              src={media.url}
                              alt={media.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                background: 'rgba(0,0,0,0.6)',
                                color: '#FFF',
                                fontSize: '8px',
                                textAlign: 'center',
                                padding: '1px',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                              }}
                            >
                              {media.category === 'unit' ? 'Unit' : media.category === 'amenity' ? 'Amenity' : 'Property'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '30px',
                        textAlign: 'center',
                        background: '#FAF9F5',
                        border: '1px dashed var(--line)',
                        borderRadius: '8px',
                        color: 'var(--ink-soft)',
                      }}
                    >
                      <Building size={32} style={{ margin: '0 auto 8px', color: 'var(--ink-soft)', opacity: 0.5 }} />
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>No Photos Uploaded Yet</div>
                      <div style={{ fontSize: '12px' }}>The owner has not uploaded any photos for this property or unit.</div>
                    </div>
                  )}
                </div>

                {/* 3. FINANCIAL & TENANCY TERMS HIGHLIGHT */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '10px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ padding: '12px', background: '#FAF9F5', border: '1px solid var(--line)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Agreed Monthly Rent</div>
                    <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--ledger)', marginTop: '2px' }}>
                      {getCurrencySymbol(reviewingRequest.currency)}{(Number(reviewingRequest.rent) || 0).toLocaleString()}
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink-soft)' }}> / mo</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>Due 1st of each month</div>
                  </div>

                  <div style={{ padding: '12px', background: '#FAF9F5', border: '1px solid var(--line)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Security Deposit</div>
                    <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--ink)', marginTop: '2px' }}>
                      {getCurrencySymbol(reviewingRequest.currency)}{(reviewingRequest.deposit ?? 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>100% Refundable Security Deposit</div>
                  </div>

                  <div style={{ padding: '12px', background: '#FAF9F5', border: '1px solid var(--line)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Tenancy Period</div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)', marginTop: '4px' }}>
                      {reviewingRequest.leaseStart}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>to {reviewingRequest.leaseEnd}</div>
                  </div>

                  <div style={{ padding: '12px', background: '#FAF9F5', border: '1px solid var(--line)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Notice / Lock-in</div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)', marginTop: '4px' }}>
                      {targetProp?.rules?.noticePeriodDays || 30} Days Notice
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                      Min {targetProp?.rules?.minLeaseMonths || 11} Months Lease
                    </div>
                  </div>
                </div>

                {/* 4. COMPREHENSIVE UNIT SPECIFICATIONS */}
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Home size={17} color="var(--brass)" />
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                      Unit Specifications & Utility Meters
                    </h4>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <div style={{ padding: '10px 12px', background: '#FAF9F5', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Unit Configuration</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginTop: '2px' }}>
                        {targetU?.unitType || 'Apartment Residence'}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: '#FAF9F5', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Floor Level</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginTop: '2px' }}>
                        {targetU?.floor ? `Floor ${targetU.floor}` : 'Standard Floor'}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: '#FAF9F5', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Carpet / Living Area</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginTop: '2px' }}>
                        {targetU?.areaSqFt ? `${targetU.areaSqFt.toLocaleString()} sq ft` : 'Spacious Layout'}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: '#FAF9F5', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Furnishing Status</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginTop: '2px' }}>
                        {targetU?.furnishing || 'Semi-Furnished'}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: '#FAF9F5', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Electricity Meter</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Zap size={14} color="var(--brass)" />
                        {targetU?.electricityMeter || 'Individual Meter'}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: '#FAF9F5', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Water Connection</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Droplets size={14} color="#0284C7" />
                        {targetU?.waterMeter ? `Meter #${targetU.waterMeter}` : 'Standard Utility'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. PROPERTY AMENITIES & FACILITIES */}
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={17} color="var(--brass)" />
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                        Building Amenities & Facilities ({targetProp?.amenities?.length || 0})
                      </h4>
                    </div>
                    {targetProp?.amenityPhotos && targetProp.amenityPhotos.length > 0 && (
                      <span style={{ fontSize: '11.5px', color: 'var(--brass)', fontWeight: 600 }}>
                        📷 {targetProp.amenityPhotos.length} with Photos
                      </span>
                    )}
                  </div>

                  {targetProp?.amenities && targetProp.amenities.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {targetProp.amenities.map((amenity, idx) => {
                        const hasPhoto = targetProp.amenityPhotos?.some(
                          (ap) => ap.name.toLowerCase() === amenity.toLowerCase() && !!ap.image
                        );

                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '20px',
                              background: hasPhoto ? '#FDF8ED' : '#FAF9F5',
                              border: hasPhoto ? '1px solid var(--brass)' : '1px solid var(--line)',
                              fontSize: '12.5px',
                              fontWeight: 500,
                              color: 'var(--ink)',
                            }}
                          >
                            <CheckCircle2 size={13} color={hasPhoto ? 'var(--brass)' : 'var(--ledger)'} />
                            <span>{amenity}</span>
                            {hasPhoto && (
                              <button
                                type="button"
                                onClick={() => jumpToAmenityPhoto(amenity)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '0 0 0 4px',
                                  cursor: 'pointer',
                                  color: 'var(--brass)',
                                  fontSize: '11px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  fontWeight: 600,
                                }}
                                title={`View photo of ${amenity}`}
                              >
                                📷 View
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                      Standard residential amenities provided as per lease terms.
                    </div>
                  )}
                </div>

                {/* 6. OPERATIONAL POLICIES & HOUSE RULES */}
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Shield size={17} color="var(--brass)" />
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                      Tenancy Policies & House Rules
                    </h4>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: targetProp?.rules?.petsAllowed ? '#F0FDF4' : '#FEF2F2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--ink)' }}>Pets Policy</span>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: targetProp?.rules?.petsAllowed ? '#166534' : '#991B1B',
                        }}
                      >
                        {targetProp?.rules?.petsAllowed ? '🐾 Allowed' : '🚫 No Pets'}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: targetProp?.rules?.smokingAllowed ? '#FFFBEB' : '#F0FDF4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--ink)' }}>Smoking Policy</span>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: targetProp?.rules?.smokingAllowed ? '#B45309' : '#166534',
                        }}
                      >
                        {targetProp?.rules?.smokingAllowed ? '⚠️ Permitted' : '🚭 Strict Non-Smoking'}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: targetProp?.rules?.sublettingAllowed ? '#F0FDF4' : '#FEF2F2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--ink)' }}>Subletting</span>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: targetProp?.rules?.sublettingAllowed ? '#166534' : '#991B1B',
                        }}
                      >
                        {targetProp?.rules?.sublettingAllowed ? '✅ Allowed' : '🔒 Prohibited'}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: '#FAF9F5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--ink)' }}>Minimum Lease</span>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ink)' }}>
                        {targetProp?.rules?.minLeaseMonths || 11} Months
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: '#FAF9F5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--ink)' }}>Notice Required</span>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ink)' }}>
                        {targetProp?.rules?.noticePeriodDays || 30} Days
                      </span>
                    </div>
                  </div>
                </div>

                {/* 7. LANDLORD INSTRUCTIONS / PERSONAL NOTE */}
                {reviewingRequest.message && (
                  <div
                    style={{
                      background: '#FFFDF5',
                      border: '1px solid #F3E8C8',
                      borderRadius: '8px',
                      padding: '14px 16px',
                      marginBottom: '18px',
                    }}
                  >
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--brass)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Special Instructions from Landlord
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{reviewingRequest.message}"
                    </div>
                  </div>
                )}

                {/* 8. OFFICIAL TENANCY AGREEMENT DOCUMENT BOX */}
                <div style={{ background: 'var(--surface)', border: '2px solid var(--brass)', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={22} color="var(--brass)" />
                      <div>
                        <b style={{ fontSize: '14.5px', color: 'var(--ink)' }}>Official Tenancy Agreement Document</b>
                        <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                          {reviewingRequest.agreementFileName || 'Tenancy_Agreement.pdf'} {reviewingRequest.agreementFileSize ? `(${reviewingRequest.agreementFileSize} KB)` : ''}
                        </div>
                      </div>
                    </div>
                    {reviewingRequest.agreementFileData && (
                      <a
                        className="btn brass small"
                        href={reviewingRequest.agreementFileData}
                        download={reviewingRequest.agreementFileName || 'Tenancy_Agreement.pdf'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: 600 }}
                      >
                        <Download size={13} /> Download Official PDF
                      </a>
                    )}
                  </div>

                  {/* Document Preview Box */}
                  <div style={{ border: '1px solid var(--line)', borderRadius: '6px', background: '#F8F9FA', padding: '8px', textAlign: 'center' }}>
                    {reviewingRequest.agreementFileData?.startsWith('data:image') ? (
                      <img
                        src={reviewingRequest.agreementFileData}
                        alt="Agreement Document Preview"
                        style={{ maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', margin: '0 auto', display: 'block', borderRadius: '4px' }}
                      />
                    ) : reviewingRequest.agreementFileData ? (
                      <iframe
                        src={reviewingRequest.agreementFileData}
                        style={{ width: '100%', height: '340px', border: 'none', borderRadius: '4px' }}
                        title="Agreement Document Preview"
                      />
                    ) : (
                      <p style={{ color: 'var(--ink-soft)', fontSize: '13px', margin: '24px 0' }}>
                        Agreement document is registered on file. Please download to review full covenants.
                      </p>
                    )}
                  </div>
                </div>

                {reviewingRequest.requireTenantId && (
                  <div
                    style={{
                      background: '#FDF8ED',
                      border: '1.5px solid var(--brass)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      marginBottom: '14px',
                      fontSize: '12.5px',
                      color: 'var(--ink)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <ShieldCheck size={18} color="var(--brass)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <b style={{ color: 'var(--ledger)' }}>Identity Documents Required by Landlord:</b>
                      <div style={{ marginTop: '3px', color: 'var(--ink-soft)' }}>
                        The property owner has requested {reviewingRequest.requiredIdList?.length || reviewingRequest.requiredIdTypes?.length || 1} verification document(s) (<b>{reviewingRequest.requiredIdList?.map(i => i.name).join(', ') || reviewingRequest.requiredIdTypes?.join(', ') || 'Identity ID'}</b>). You will need to upload these alongside your physically signed lease agreement.
                      </div>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '12px',
                    color: 'var(--ink-soft)',
                    lineHeight: 1.5,
                  }}
                >
                  <b style={{ color: 'var(--ink)' }}>Process Guide:</b> When you accept this invitation, you will proceed to physical signature execution. You will download the agreement, sign it in ink, and upload your signed copy. Once the landlord approves your uploaded agreement, security deposit payment unlocks to finalize move-in.
                </div>
              </div>

              <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: '10px' }}>
                <button
                  type="button"
                  className="btn secondary btn-mobile-full"
                  onClick={() => {
                    handleDeclineRequest(reviewingRequest);
                    setReviewingRequest(null);
                  }}
                  style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <XCircle size={15} /> Decline Offer
                </button>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn secondary btn-mobile-full"
                    onClick={() => setReviewingRequest(null)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn brass btn-mobile-full"
                    onClick={() => {
                      handleAcceptRequest(reviewingRequest);
                      setReviewingRequest(null);
                    }}
                    style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle size={16} /> Accept & Proceed to Physical Signature
                  </button>
                </div>
              </div>
            </div>

            {/* LIGHTBOX MODAL: FULL RESOLUTION MEDIA VIEWER */}
            {lightboxItem && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(3, 7, 18, 0.94)',
                  zIndex: 2000,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                }}
                onClick={(e) => { e.stopPropagation(); setLightboxItem(null); }}
              >
                {/* Lightbox Head */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    left: '24px',
                    right: '24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 2001,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ color: '#FFF' }}>
                    <span
                      style={{
                        background: 'var(--brass)',
                        color: '#0F172A',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        marginRight: '8px',
                      }}
                    >
                      {lightboxItem.categoryLabel}
                    </span>
                    <b style={{ fontSize: '15px' }}>{lightboxItem.title}</b>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLightboxItem(null)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.15)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '50%',
                      width: '36px',
                      height: '36px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Lightbox Image */}
                <div
                  style={{
                    maxWidth: '92vw',
                    maxHeight: '82vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={lightboxItem.url}
                    alt={lightboxItem.title}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '82vh',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* SECTION 2: Active Tenancy or Concluded Tenancy / Unassigned Resident View */}
      {myUnits.length === 0 ? (
        completedMoveOut ? (
          /* Concluded Tenancy View: tenant successfully vacated and deposit refunded */
          <div>
            {/* Concluded Tenancy Key Metrics Grid */}
            <div className="grid grid-3" style={{ marginBottom: '20px' }}>
              <div className="stat">
                <div className="num" style={{ color: 'var(--ink)' }}>{pastCurrency}0</div>
                <div className="lbl">Monthly Rent</div>
                <div className="delta" style={{ color: '#2E7D32', fontWeight: 600 }}>✓ No Active Rent Due</div>
              </div>

              <div className="stat">
                <div className="num" style={{ color: 'var(--ink)' }}>{pastCurrency}0</div>
                <div className="lbl">Security Deposit Held</div>
                <div className="delta" style={{ color: '#2E7D32', fontWeight: 600 }}>
                  ✓ {pastCurrency}{Number(completedMoveOut.finalRefundAmount !== undefined ? completedMoveOut.finalRefundAmount : (completedMoveOut.deposit || 0)).toLocaleString('en-IN')} Refunded
                </div>
              </div>

              <div className="stat">
                <div className="num">0</div>
                <div className="lbl">Active Maintenance Requests</div>
                <div className="delta">All resident requests closed</div>
              </div>
            </div>

            {/* Handover & Clearance Overview */}
            <div className="section-title">Past Tenancy Concluded</div>
            <div className="panel" style={{ marginBottom: '20px' }}>
              {((pastUnit?.images && pastUnit.images[0]) || pastUnit?.image || (pastProperty?.images && pastProperty.images[0])) && (
                <div
                  style={{
                    height: '140px',
                    backgroundImage: `url(${(pastUnit?.images && pastUnit.images[0]) || pastUnit?.image || pastProperty?.images[0]})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderTopLeftRadius: 'var(--radius)',
                    borderTopRightRadius: 'var(--radius)',
                    position: 'relative',
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Unit {completedMoveOut.unit} Residence
                  </div>
                </div>
              )}
              <div className="panel-body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2E7D32', fontWeight: 700, fontSize: '15px' }}>
                    <CheckCircle2 size={20} />
                    Unit {completedMoveOut.unit} Handover Completed & Settled
                  </div>
                  <span className="badge green" style={{ fontSize: '12px', padding: '4px 10px' }}>
                    Vacated & Released
                  </span>
                </div>

                <div className="kv">
                  <span className="k">Property:</span>
                  <b>{pastProperty?.name || pastUnit?.propertyName || 'Residential Complex'}</b>
                </div>
                <div className="kv">
                  <span className="k">Assigned Unit:</span>
                  <span>Unit {completedMoveOut.unit} {pastUnit?.unitType ? `(${pastUnit.unitType})` : ''}</span>
                </div>
                <div className="kv">
                  <span className="k">Security Deposit Refund:</span>
                  <b style={{ color: '#2E7D32' }}>
                    {pastCurrency}{Number(completedMoveOut.finalRefundAmount !== undefined ? completedMoveOut.finalRefundAmount : (completedMoveOut.deposit || 0)).toLocaleString('en-IN')} (Settled)
                  </b>
                </div>
                <div className="kv">
                  <span className="k">Lease Status:</span>
                  <span>Terminated upon final handover & refund clearance</span>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <Link
                    to="/tenant/lease"
                    className="btn brass btn-mobile-full"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                  >
                    <FileText size={15} /> View Clearance Certificate & Settlement
                  </Link>
                  <Link
                    to="/tenant/payments"
                    className="btn secondary btn-mobile-full"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                  >
                    <CreditCard size={15} /> Payment History & Receipts
                  </Link>
                </div>
              </div>
            </div>

            {/* Resident Profile Box */}
            <div
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: 'var(--teal-primary)' }}>
                Your Registered Resident Profile
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><b style={{ color: 'var(--ink)' }}>Full Name:</b> {tenantName}</div>
                <div><b style={{ color: 'var(--ink)' }}>Email:</b> {user?.email}</div>
                <div><b style={{ color: 'var(--ink)' }}>Phone:</b> {user?.phone || 'Not specified'}</div>
                <div><b style={{ color: 'var(--ink)' }}>Resident ID:</b> <code style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', color: 'var(--ink)' }}>{user?.id}</code></div>
              </div>
            </div>
          </div>
        ) : (
          /* Brand New Resident Onboarding View (No past leases, waiting for invitation) */
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '36px 24px',
              textAlign: 'center',
              maxWidth: '840px',
              margin: '20px auto',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--teal-light)',
                color: 'var(--teal-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Home size={28} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
              Welcome to Propithub, {tenantName}!
            </h2>

            <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: '1.6', marginBottom: '20px' }}>
              Your tenant resident account is active. When a property owner sends you a tenancy invitation, it will appear right here for your review and one-click acceptance.
            </p>

            <div
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '16px',
                textAlign: 'left',
                display: 'inline-block',
                maxWidth: '520px',
                width: '100%',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: 'var(--teal-primary)' }}>
                Your Registered Resident Profile
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>
                  <b style={{ color: 'var(--ink)' }}>Full Name:</b> {tenantName}
                </div>
                <div>
                  <b style={{ color: 'var(--ink)' }}>Email:</b> {user?.email}
                </div>
                <div>
                  <b style={{ color: 'var(--ink)' }}>Phone:</b> {user?.phone || 'Not specified'}
                </div>
                <div>
                  <b style={{ color: 'var(--ink)' }}>Resident ID:</b> <code style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', color: 'var(--ink)' }}>{user?.id}</code>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              💡 <b style={{ color: 'var(--ink)' }}>Tip for residents:</b> Share your registered email (<code style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', color: 'var(--ink)' }}>{user?.email}</code>) with your property owner so they can search and send your tenancy invitation directly.
            </div>
          </div>
        )
      ) : (
        /* Active Resident Tenancy View */
        <div>
          {/* Multi-Property Switcher if resident rents multiple units */}
          {myUnits.length > 1 && (
            <div
              className="panel"
              style={{
                marginBottom: '16px',
                background: 'var(--ledger-soft)',
                border: '1px solid var(--ledger)',
              }}
            >
              <div
                className="panel-body"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--ledger)' }}>Multi-Property Resident:</span>
                  <span style={{ fontSize: '13px' }}>
                    You rent {myUnits.length} units. Select active unit:
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {myUnits.map((u) => {
                    const pName = u.propertyName || state.properties.find((p) => p.id === u.propertyId)?.name || 'Residence';
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`btn small ${selectedUnitId === u.id ? 'brass' : 'secondary'}`}
                        onClick={() => setSelectedUnitId(u.id)}
                      >
                        Unit {u.unitNumber} • {pName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Key Metrics Grid */}
          <div className="grid grid-3">
            <div className="stat">
              <div className="num">
                {activeCurrency}{(Number(activeRent) || 0).toLocaleString()}
              </div>
              <div className="lbl">Monthly Rent</div>
              <div className="delta">Due on 1st of each month</div>
            </div>

            <div className="stat">
              <div className="num">
                {activeCurrency}{(Number(activeDeposit) || 0).toLocaleString()}
              </div>
              <div className="lbl">
                {(() => {
                  const depInv = currentAgreement?.depositInvoiceId
                    ? state.invoices.find((i) => i.id === currentAgreement.depositInvoiceId)
                    : state.invoices.find((i) => i.leaseAgreementId === currentAgreement?.id && i.invoiceType === 'deposit');
                  const isPaid = currentAgreement?.depositStatus === 'paid' || depInv?.status === 'paid';
                  return isPaid ? 'Security Deposit Held' : 'Security Deposit';
                })()}
              </div>
              <div className="delta">
                {(() => {
                  const depInv = currentAgreement?.depositInvoiceId
                    ? state.invoices.find((i) => i.id === currentAgreement.depositInvoiceId)
                    : state.invoices.find((i) => i.leaseAgreementId === currentAgreement?.id && i.invoiceType === 'deposit');
                  const isPaid = currentAgreement?.depositStatus === 'paid' || depInv?.status === 'paid';
                  if (isPaid) return 'Protected under custody';
                  if (depInv?.status === 'sent') return 'Invoice issued — awaiting payment';
                  return 'Due after owner approves signed lease';
                })()}
              </div>
            </div>

            <div className="stat">
              <div className="num">
                {myTickets.filter((t) => t.status !== 'resolved').length}
              </div>
              <div className="lbl">Active Maintenance Requests</div>
              <div className="delta">Tracked in resident portal</div>
            </div>
          </div>

          {/* Active Tenancy Details */}
          <div className="section-title">Active Tenancy Details</div>
          <div className="panel">
            {((currentUnit?.images && currentUnit.images[0]) || currentUnit?.image || (currentProperty?.images && currentProperty.images[0])) && (
              <div
                style={{
                  height: '140px',
                  backgroundImage: `url(${(currentUnit?.images && currentUnit.images[0]) || currentUnit?.image || currentProperty?.images[0]})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderTopLeftRadius: 'var(--radius)',
                  borderTopRightRadius: 'var(--radius)',
                  position: 'relative',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'flex-end',
                }}
              >
                <div
                  style={{
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Unit {currentUnit?.unitNumber} Residence
                </div>
              </div>
            )}
            <div className="panel-body">
              <div className="kv">
                <span className="k">Property:</span>
                <b>{currentProperty?.name || currentUnit?.propertyName || '—'}</b>
              </div>
              <div className="kv">
                <span className="k">Address:</span>
                <span>
                  {typeof currentProperty?.address === 'string'
                    ? currentProperty.address
                    : currentProperty?.address?.formattedAddress || currentProperty?.address?.street || '—'}
                </span>
              </div>
              <div className="kv">
                <span className="k">Assigned Unit:</span>
                <b>
                  Unit {currentUnit?.unitNumber} {currentUnit?.unitType ? `(${currentUnit.unitType})` : ''}
                </b>
              </div>
              {currentUnit?.furnishing && (
                <div className="kv">
                  <span className="k">Furnishing Status:</span>
                  <span>{currentUnit.furnishing}</span>
                </div>
              )}
              {(currentAgreement?.start || currentAgreement?.end) && (
                <div className="kv">
                  <span className="k">Lease Period:</span>
                  <span>
                    {currentAgreement.start || '—'}
                    {currentAgreement.end ? ` → ${currentAgreement.end}` : ''}
                  </span>
                </div>
              )}
              {currentAgreement?.rent && (
                <div className="kv">
                  <span className="k">Agreed Rent:</span>
                  <b>{activeCurrency}{(Number(currentAgreement.rent) || 0).toLocaleString()} / mo</b>
                </div>
              )}
              {(currentAgreement?.ownerId || currentAgreement?.ownerName) && (() => {
                const ownerUser = state.users?.find((u) => u.id === currentAgreement?.ownerId);
                const ownerName = currentAgreement?.ownerName || ownerUser?.displayName || (ownerUser as any)?.name || '—';
                return (
                  <div className="kv">
                    <span className="k">Landlord:</span>
                    <span>{ownerName}</span>
                  </div>
                );
              })()}
              {currentProperty?.amenities && currentProperty.amenities.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Building Amenities:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {currentProperty.amenities.map((am) => (
                      <span key={am} className="badge grey" style={{ fontSize: '11px' }}>
                        ✓ {am}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>


        </div>
      )}

      {/* Deposit Settlement Review & Dispute Modal */}
      {settlementToReview && (
        <DepositSettlementReviewModal
          settlement={settlementToReview}
          onClose={() => setSettlementToReview(null)}
        />
      )}
    </div>
  );
};
