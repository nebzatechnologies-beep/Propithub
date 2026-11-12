import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Agreement, TenancyRequest, Unit, DepositSettlement, Announcement, Invoice, TenantRecord, PaymentTransaction } from '../../types';
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
  ExternalLink,
} from 'lucide-react';
import { getTenantReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';
import { DepositSettlementReviewModal } from '../../components/common/DepositSettlementReviewModal';
import { AddressDisplay } from '../../components/common/AddressDisplay';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol, normalizeCurrencyCode } from '../../lib/currencyService';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyAmount, getTableCurrencyHeader } from '../../components/common/CurrencyAmount';

export const TenantDashboardPage: React.FC = () => {
  const { state, updateState, showToast, saveAgreement, saveInvoice, saveUnit, saveTenant, saveTenancyRequest, acknowledgeAnnouncement, confirmCashClaim, rejectCashClaim, confirmRefundReceipt } = useAppData();
  const { user } = useAuth();
  const { viewCurrency, convert, format } = useCurrency();
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

  // Match by tenantId (primary) or email fallback.
  // Display-name fallback removed — two tenants sharing the same display name would
  // see each other's reviews without this guard.
  const myTenantReviews = (state.reviews?.tenants || []).filter(
    (r: any) =>
      (user?.id && r.tenantId === user.id) ||
      (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)
  );

  // Build a set of unitIds that have a real active agreement or invitation tied to this tenant
  const myAgreementUnitIds = useMemo(() => {
    const unitIds = new Set<string>();
    state.agreements
      .filter(
        (a) =>
          a.status !== 'terminated' &&
          ((user?.id && a.tenantId === user.id) ||
            (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
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

    // Also include units from accepted tenancy invitations (strict: exclude 'pending' invitations)
    (state.tenancyRequests || [])
      .filter(
        (r) =>
          r.status === 'accepted' &&
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
      const byEmail = Boolean(tenantEmail) && u.tenant?.toLowerCase() === tenantEmail;
      // An email-only match is only trusted if there is a real agreement or invitation for that unit
      const isTenantMatch = byId || (byEmail && myAgreementUnitIds.has(u.id));
      if (!isTenantMatch) return false;

      // Must be actively occupied or reserved
      if (u.status !== 'occupied' && u.status !== 'reserved') return false;

      const normUnitStr = (s?: string) => (s || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const uClean = normUnitStr(u.unitNumber || u.id);

      // 1. Move-Out Conclusion Gate:
      // If a move-out for this tenant & unit was completed/settled, or if all agreements are terminated,
      // exclude it unless there is a genuinely newer active agreement created after the move-out!
      const completedMo = (state.moveouts || []).find(
        (m) =>
          (!m.propertyId || !u.propertyId || m.propertyId === u.propertyId) &&
          (m.tenantId === user?.id || (tenantEmail && m.tenant?.toLowerCase() === tenantEmail)) &&
          (normUnitStr(m.unit) === uClean) &&
          (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt)
      );

      const completedSettlement = (state.depositSettlements || []).find(
        (s) =>
          (!s.propertyId || !u.propertyId || s.propertyId === u.propertyId) &&
          (s.tenantId === user?.id || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail)) &&
          (normUnitStr(s.unit) === uClean) &&
          (s.status === 'refunded' || Boolean(s.tenantConfirmedReceipt))
      );

      const unitAgreements = state.agreements.filter(
        (a) =>
          (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
          (normUnitStr(a.unit) === uClean) &&
          (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
      );
      const hasAgreements = unitAgreements.length > 0;
      const allAgreementsTerminated = hasAgreements && unitAgreements.every((a) => a.status === 'terminated');

      const moTime = completedSettlement
        ? new Date(completedSettlement.disbursedAt || (completedSettlement as any).updatedAt || completedSettlement.createdAt || 0).getTime()
        : completedMo
        ? new Date((completedMo as any).completedAt || (completedMo as any).tenantConfirmedAt || completedMo.moveOutDate || 0).getTime()
        : 0;

      const hasNewerActiveAgreement = state.agreements.some((a) => {
        if (!(!a.propertyId || !u.propertyId || a.propertyId === u.propertyId)) return false;
        if (normUnitStr(a.unit) !== uClean) return false;
        if (!(a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))) return false;
        if (a.status === 'terminated') return false;
        if (moTime > 0) {
          const agTime = new Date((a as any).createdAt || a.start || 0).getTime();
          return agTime > moTime;
        }
        return a.status === 'active' || a.status === 'signed' || a.status === 'pending_deposit';
      });

      if ((completedMo || completedSettlement || allAgreementsTerminated) && !hasNewerActiveAgreement) {
        return false;
      }

      // If tenant explicitly declined an invitation for this unit, exclude it unless there is a subsequent active agreement
      const hasDeclinedReq = (state.tenancyRequests || []).some(
        (r) =>
          (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId) &&
          (normUnitStr(r.unitId) === uClean || normUnitStr(r.unitNumber) === uClean) &&
          (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)) &&
          r.status === 'declined'
      );

      // If tenant has an active / non-terminated agreement or fresh pending request for this unit, it IS active!
      const hasActiveAgreementForUnit = state.agreements.some(
        (a) =>
          (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
          (normUnitStr(a.unit) === uClean) &&
          (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) &&
          a.status !== 'terminated'
      );

      if (hasDeclinedReq && !hasActiveAgreementForUnit) {
        return false;
      }

      const hasPendingReqForUnit = (state.tenancyRequests || []).some(
        (r) =>
          (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId) &&
          (normUnitStr(r.unitId) === uClean || normUnitStr(r.unitNumber) === uClean) &&
          (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)) &&
          (r.status === 'pending' || r.status === 'accepted')
      );
      if (hasActiveAgreementForUnit || hasPendingReqForUnit) {
        return true;
      }

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

  // Active lease status: does the resident have active assigned units, an active non-terminated agreement, or fresh onboarding request?
  const hasActiveOrPendingLease = useMemo(() => {
    if (myUnits.length > 0) return true;

    const normUnitStr = (s?: string) => (s || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

    // Check if there is an active agreement that is NOT terminated and NOT concluded by moveout
    const hasActiveAg = state.agreements.some((a) => {
      const matchTenant =
        (user?.id && a.tenantId === user.id) ||
        (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail);
      if (!matchTenant || a.status === 'terminated') return false;

      const aUnitClean = normUnitStr(a.unit);
      const isConcludedByMoveout = (state.moveouts || []).some(
        (m) =>
          normUnitStr(m.unit) === aUnitClean &&
          (m.tenantId === user?.id || (tenantEmail && m.tenant?.toLowerCase() === tenantEmail)) &&
          (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt)
      );
      return !isConcludedByMoveout;
    });

    if (hasActiveAg) return true;

    // Check if there is a real fresh pending request (excluding ones where tenancy was already concluded)
    const hasPendingReq = (state.tenancyRequests || []).some((r) => {
      const matchTenant =
        (user?.id && r.tenantId === user.id) ||
        (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail);
      if (!matchTenant) return false;
      if (r.status !== 'pending' && r.status !== 'accepted') return false;

      const rUnitClean = normUnitStr(r.unitNumber || r.unitId);
      const isConcludedByMoveout = (state.moveouts || []).some(
        (m) =>
          normUnitStr(m.unit) === rUnitClean &&
          (m.tenantId === user?.id || (tenantEmail && m.tenant?.toLowerCase() === tenantEmail)) &&
          (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt)
      );
      if (isConcludedByMoveout) return false;

      const isConcludedByAg = state.agreements.some(
        (a) =>
          normUnitStr(a.unit) === rUnitClean &&
          (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) &&
          a.status === 'terminated'
      );
      if (isConcludedByAg) return false;

      return true;
    });

    return hasPendingReq;
  }, [myUnits.length, state.agreements, state.moveouts, state.tenancyRequests, user?.id, tenantEmail]);

  // Concluded Move-Out record (only if resident has NO active or pending lease context)
  const completedMoveOut = useMemo(() => {
    if (hasActiveOrPendingLease) return undefined;
    return (state.moveouts || []).find(
      (m) =>
        (m.tenantId === user?.id || (tenantEmail && m.tenant?.toLowerCase() === tenantEmail)) &&
        (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt)
    );
  }, [hasActiveOrPendingLease, state.moveouts, user?.id, tenantEmail]);

  // Active Building Announcements for Tenant
  // Strict Owner & Property Isolation:
  // Tenants only see announcements for properties where they have an ACTIVE lease, occupied unit, or accepted request.
  // Prospective tenants holding pending invitations or vacated tenants NEVER receive building notices.
  const myAnnouncements = useMemo(() => {
    const activePropertyIds = new Set<string>();
    const activeOwnerIds = new Set<string>();

    // 1. Units actively occupied by current tenant
    myUnits.forEach((u) => {
      if (u.propertyId) activePropertyIds.add(u.propertyId);
      if (u.ownerId) activeOwnerIds.add(u.ownerId);
      const p = (state.properties || []).find((prop) => prop.id === u.propertyId);
      if (p?.ownerId) activeOwnerIds.add(p.ownerId);
    });

    // 2. Active, non-terminated agreements
    (state.agreements || []).forEach((ag) => {
      const isMe =
        (user?.id && ag.tenantId === user.id) ||
        (tenantEmail && (ag.tenantEmail?.toLowerCase() === tenantEmail || ag.tenant?.toLowerCase() === tenantEmail));
      const isActive =
        ag.status === 'active' ||
        (ag.status as string) === 'signed' ||
        (ag.status !== 'terminated' && (ag.status as string) !== 'cancelled' && ag.status !== 'rejected' && ag.status !== 'draft');
      if (isMe && isActive) {
        if (ag.propertyId) activePropertyIds.add(ag.propertyId);
        if (ag.ownerId) activeOwnerIds.add(ag.ownerId);
        const p = (state.properties || []).find((prop) => prop.id === ag.propertyId);
        if (p?.ownerId) activeOwnerIds.add(p.ownerId);
      }
    });

    // 3. Accepted tenancy requests ONLY (strictly exclude 'pending', 'declined', or 'cancelled')
    (state.tenancyRequests || []).forEach((r) => {
      const isMe =
        (user?.id && r.tenantId === user.id) ||
        (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail);
      if (isMe && r.status === 'accepted') {
        if (r.propertyId) activePropertyIds.add(r.propertyId);
        if (r.ownerId) activeOwnerIds.add(r.ownerId);
      }
    });

    // 4. Tenant records with verified active presence (not unaccepted invitee records)
    (state.tenants || []).forEach((t) => {
      const isMe =
        (user?.id && (t.id === user.id || (t as any).userId === user.id)) ||
        (tenantEmail && t.email?.toLowerCase() === tenantEmail);
      if (isMe && t.propertyId) {
        const hasActivePresence =
          activePropertyIds.has(t.propertyId) ||
          myUnits.some((u) => u.propertyId === t.propertyId) ||
          (state.agreements || []).some(
            (ag) =>
              ((user?.id && ag.tenantId === user.id) || (tenantEmail && (ag.tenantEmail?.toLowerCase() === tenantEmail || ag.tenant?.toLowerCase() === tenantEmail))) &&
              ag.propertyId === t.propertyId &&
              (ag.status === 'active' || (ag.status as string) === 'signed')
          );
        if (hasActivePresence) {
          activePropertyIds.add(t.propertyId);
          if (t.ownerId) activeOwnerIds.add(t.ownerId);
        }
      }
    });

    const userIds = new Set<string>();
    if (user?.id) userIds.add(user.id);
    if ((user as any)?.uid) userIds.add((user as any).uid);
    (state.tenants || []).forEach((t) => {
      if (
        (tenantEmail && t.email && t.email.toLowerCase() === tenantEmail) ||
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
        if (!a.targetScope?.targetRoles?.includes('tenant')) return false;

        const isSystemAnnouncement = a.ownerId === 'system' || a.ownerId === 'superadmin' || (a.category as string) === 'system';

        // Strict Owner & Residency Isolation:
        // Platform-wide system announcements can be seen by any tenant.
        // Landlord announcements require the tenant to have an active residency and match the landlord ID.
        if (!isSystemAnnouncement) {
          if (activePropertyIds.size === 0) return false;
          if (!a.ownerId || !activeOwnerIds.has(a.ownerId)) return false;
        }

        // If targeted to specific recipients, ensure current tenant is targeted
        if (
          a.targetScope?.mode === 'specific_people' ||
          (a.targetScope?.targetUserIds && a.targetScope.targetUserIds.length > 0)
        ) {
          const targeted = a.targetScope.targetUserIds || [];
          const isTargeted = targeted.some((tid) => userIds.has(tid));
          if (!isTargeted) return false;
        }

        // Collect all explicit property IDs targeted by this announcement
        const targetPropIds = new Set<string>();
        if (Array.isArray(a.targetScope?.propertyIds)) {
          a.targetScope.propertyIds.forEach((pid) => pid && targetPropIds.add(pid));
        }
        if (a.propertyId && a.propertyId !== 'all') {
          targetPropIds.add(a.propertyId);
        }

        // Strict Property Isolation:
        // If specific properties are targeted, tenant MUST reside in at least one of those exact property IDs
        if (targetPropIds.size > 0) {
          return Array.from(targetPropIds).some((pId) => activePropertyIds.has(pId));
        }

        // Broadcast to all properties of this owner:
        // Only visible if owner explicitly enabled allProperties and tenant actively resides in this owner's portfolio
        if (a.targetScope?.allProperties) {
          return activePropertyIds.size > 0 && activeOwnerIds.has(a.ownerId);
        }

        return false;
      })
      .sort((a: Announcement, b: Announcement) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
      });
  }, [state.announcements, state.tenants, state.agreements, state.tenancyRequests, state.properties, myUnits, user, tenantEmail]);

  const [respondingReqId, setRespondingReqId] = useState<string | null>(null);
  const [ackingNoticeId, setAckingNoticeId] = useState<string | null>(null);
  const [justAckedIds, setJustAckedIds] = useState<Set<string>>(new Set());
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(new Set());
  const [showAllNeedsYou, setShowAllNeedsYou] = useState<boolean>(false);

  const STORAGE_DISMISSED_KEY = 'propithub_dismissed_reminders';
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_DISMISSED_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [snoozedReminderIds, setSnoozedReminderIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('propithub_snoozed_reminders');
      if (!stored) return [];
      const parsed: Record<string, number> = JSON.parse(stored);
      const now = Date.now();
      return Object.keys(parsed).filter((id) => parsed[id] > now);
    } catch {
      return [];
    }
  });

  const handleDismissReminder = (reminderId: string) => {
    try {
      const stored = localStorage.getItem(STORAGE_DISMISSED_KEY);
      const parsed: string[] = stored ? JSON.parse(stored) : [];
      if (!parsed.includes(reminderId)) {
        parsed.push(reminderId);
        localStorage.setItem(STORAGE_DISMISSED_KEY, JSON.stringify(parsed));
      }
    } catch (e) {
      console.warn('Failed to save dismissed reminder', e);
    }
    setDismissedReminderIds((prev) => [...prev, reminderId]);
    showToast('✓ Reminder dismissed.');
  };

  const handleSnoozeReminder = (reminderId: string) => {
    const expireAt = Date.now() + 24 * 60 * 60 * 1000;
    try {
      const stored = localStorage.getItem('propithub_snoozed_reminders');
      const parsed: Record<string, number> = stored ? JSON.parse(stored) : {};
      parsed[reminderId] = expireAt;
      localStorage.setItem('propithub_snoozed_reminders', JSON.stringify(parsed));
      setSnoozedReminderIds((prev) => [...prev, reminderId]);
      showToast('✓ Reminder snoozed for 24 hours.');
    } catch {
      handleDismissReminder(reminderId);
    }
  };

  const handleTenantAcknowledge = async (announcementId: string) => {
    setAckingNoticeId(announcementId);
    try {
      // Use the currently selected unit (not always myUnits[0]) so multi-property tenants
      // get the correct property attributed on their acknowledgement record.
      const ackUnit =
        (selectedUnitId && myUnits.find((u) => u.id === selectedUnitId)) ||
        myUnits[0];
      await acknowledgeAnnouncement(announcementId, {
        tenantId: user?.id || '',
        tenantName,
        tenantEmail,
        unitNumber: ackUnit?.unitNumber,
        propertyId: ackUnit?.propertyId,
        propertyName: ackUnit?.propertyName,
        acknowledgedAt: new Date().toISOString(),
      });
      setJustAckedIds((prev) => new Set(prev).add(announcementId));
      showToast('✓ Notice acknowledged. Thank you!');

      // Smoothly dismiss the acknowledged notice after a brief confirmation grace period
      setTimeout(() => {
        setDismissedNoticeIds((prev) => new Set(prev).add(announcementId));
      }, 1500);
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

  // Active cash refund claims awaiting confirmation by this tenant (strictly scoped to this resident)
  const pendingRefundClaimsForMe = (state.cashClaims || []).filter((c) => {
    const isPending = c.status === 'pending_confirmation' || (c as any).status === 'pending';
    if (!isPending || c.claimedByRole !== 'owner') return false;

    // Strict tenant scoping: must match auth user ID or verified tenant record ID
    const isMyTenant = Boolean(
      (user?.id && c.tenantId === user.id) ||
      (tenantRecord?.id && c.tenantId === tenantRecord.id)
    );
    if (!isMyTenant) return false;

    // If claim carries a propertyId, also verify it matches this tenant's property
    if (c.propertyId && myUnits.length > 0) {
      const isMyProperty = myUnits.some((u) => !u.propertyId || u.propertyId === c.propertyId);
      if (!isMyProperty) return false;
    }

    return true;
  });
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
    const normUnit = (s?: string) => (s || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
    const moUnitClean = normUnit(completedMoveOut.unit);
    const dirtyUnit = state.units.find(
      (u) =>
        (normUnit(u.unitNumber) === moUnitClean || normUnit(u.id) === moUnitClean) &&
        (u.status === 'occupied' || u.status === 'reserved' || u.tenant || u.currentTenantId)
    );
    if (dirtyUnit) {
      // Guard: do not clean if dirtyUnit has a genuinely newer active agreement created AFTER this moveout
      const moTime = new Date((completedMoveOut as any).completedAt || (completedMoveOut as any).tenantConfirmedAt || completedMoveOut.moveOutDate || 0).getTime();
      const isReoccupied = state.agreements.some(
        (a) =>
          normUnit(a.unit) === moUnitClean &&
          a.status !== 'terminated' &&
          new Date((a as any).createdAt || a.start || 0).getTime() > moTime
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
  }, [completedMoveOut, hasActiveOrPendingLease, state.units, state.agreements, saveUnit, updateState]);

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
  const rawContractCurrency = currentAgreement?.currency || currentUnit?.currency || currentProperty?.currency || tenantRecord?.currency || 'USD';
  const activeCurrency = getCurrencySymbol(rawContractCurrency) || DEFAULT_CURRENCY_SYMBOL;
  const isDifferentCurrency = Boolean(viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(rawContractCurrency));
  const convertedRent = isDifferentCurrency ? convert(Number(activeRent) || 0, rawContractCurrency, viewCurrency) : null;
  const convertedDeposit = isDifferentCurrency ? convert(Number(activeDeposit) || 0, rawContractCurrency, viewCurrency) : null;

  const displayCurrencyCode = viewCurrency || rawContractCurrency;
  const displayCurrencySymbol = getCurrencySymbol(displayCurrencyCode) || DEFAULT_CURRENCY_SYMBOL;
  const displayRentAmount = isDifferentCurrency && convertedRent !== null ? Math.round(convertedRent) : (Number(activeRent) || 0);
  const displayDepositAmount = isDifferentCurrency && convertedDeposit !== null ? Math.round(convertedDeposit) : (Number(activeDeposit) || 0);

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
      depositStatus: req.offlineDepositCollected ? 'paid' : (req.depositStatus || 'unpaid'),
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

      const isDepositPrepaid = Boolean(req.offlineDepositCollected);
      const updatedPayments = [...prev.payments];
      if (isDepositPrepaid && req.deposit > 0) {
        const depTx: PaymentTransaction = {
          id: `TXN-DEP-${Date.now().toString().slice(-6)}`,
          ownerId: req.ownerId,
          propertyId: req.propertyId,
          tenant: user?.displayName || req.tenantName,
          tenantId: user?.id || req.tenantId,
          unit: req.unitNumber,
          amount: req.deposit,
          date: new Date().toISOString().split('T')[0],
          dueDate: req.leaseStart || new Date().toISOString().split('T')[0],
          status: 'paid',
          method: req.offlineDepositRef || 'Offline Cash/Wire',
          type: 'deposit',
          currency: req.currency || DEFAULT_CURRENCY,
          notes: 'Security deposit collected offline as confirmed during invitation dispatch.',
        };
        updatedPayments.unshift(depTx);
      }

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
        payments: updatedPayments,
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
    <div style={{ width: '100%' }}>
      {(currentUnit || currentProperty) && myUnits.length <= 1 && (
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '14px' }}>
          {currentUnit?.unitNumber ? `Unit ${currentUnit.unitNumber}` : ''}
          {currentUnit?.unitNumber && (currentProperty?.name || currentUnit?.propertyName) ? ' · ' : ''}
          {currentProperty?.name || currentUnit?.propertyName || ''}
        </div>
      )}

      {/* Multi-Property Switcher if resident rents multiple units */}
      {myUnits.length > 1 && (
        <div
          style={{
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {myUnits.map((u) => {
            const pName = u.propertyName || state.properties.find((p) => p.id === u.propertyId)?.name || 'Residence';
            return (
              <button
                key={u.id}
                type="button"
                className={`btn small ${selectedUnitId === u.id ? 'brass' : 'secondary'}`}
                onClick={() => setSelectedUnitId(u.id)}
              >
                Unit {u.unitNumber} · {pName}
              </button>
            );
          })}
        </div>
      )}

      {/* Preserved Archive Banner for Decoupled Tenants */}
      {((tenantRecord as any)?.status === 'unmanaged_archive' || (state.agreements || []).some((a) => (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) && (a.status as string) === 'unmanaged_archive')) && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid #BFDBFE',
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '18px',
            fontSize: '13px',
            color: '#1E40AF',
          }}
        >
          <b>Archived Tenancy:</b> Your signed lease agreements, vouchers, and payment history remain accessible in read-only mode.
        </div>
      )}

      {/* Primary Rent / Payment Status Banner + Quick Actions (when active unit exists) */}
      {myUnits.length > 0 && (() => {
        const myUnitPayments = (state.payments || []).filter(
          (p) =>
            (p.unit === currentUnit?.unitNumber || p.unit === currentUnit?.id) &&
            (p.tenantId === user?.id || (tenantEmail && (p as any).tenantEmail?.toLowerCase() === tenantEmail) || p.tenant?.toLowerCase() === tenantName.toLowerCase())
        );
        const pendingPayment = myUnitPayments.find((p) => p.status === 'pending_confirmation');
        const overduePayment = myUnitPayments.find((p) => p.status === 'overdue');
        const depInv = currentAgreement?.depositInvoiceId
          ? state.invoices.find((i) => i.id === currentAgreement.depositInvoiceId)
          : state.invoices.find((i) => i.leaseAgreementId === currentAgreement?.id && i.invoiceType === 'deposit');
        const isDepositPending = depInv && depInv.status !== 'paid' && currentAgreement?.depositStatus !== 'paid';

        const formatBannerAmount = (rawAmt: number, srcCurrency?: string) => {
          const src = srcCurrency || rawContractCurrency;
          if (viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(src)) {
            const converted = Math.round(convert(rawAmt, src, viewCurrency));
            return `${displayCurrencySymbol}${converted.toLocaleString()}`;
          }
          return `${getCurrencySymbol(src)}${rawAmt.toLocaleString()}`;
        };

        let bannerLabel = 'Next rent due';
        let bannerAmount = `${displayCurrencySymbol}${displayRentAmount.toLocaleString()}`;
        let bannerDesc = 'Due on the 1st of the month.';
        let bannerBg = '#ECFDF5';
        let bannerBorder = '#D1FAE5';

        if (pendingPayment) {
          bannerLabel = 'Waiting on your landlord';
          const pAmount = Number(pendingPayment.amount) || Number(activeRent) || 0;
          bannerAmount = formatBannerAmount(pAmount, pendingPayment.currency);
          bannerDesc = 'Your proof of payment was sent. You will get a receipt when it is confirmed.';
          bannerBg = '#ECFDF5';
          bannerBorder = '#D1FAE5';
        } else if (overduePayment) {
          bannerLabel = 'Payment overdue';
          const oAmount = Number(overduePayment.amount) || Number(activeRent) || 0;
          bannerAmount = formatBannerAmount(oAmount, overduePayment.currency);
          bannerDesc = `Overdue since ${overduePayment.dueDate || 'this cycle'}.`;
          bannerBg = '#FEF2F2';
          bannerBorder = '#FECACA';
        } else if (isDepositPending) {
          bannerLabel = 'Security deposit due';
          bannerAmount = `${displayCurrencySymbol}${displayDepositAmount.toLocaleString()}`;
          bannerDesc = 'Pay your security deposit to activate your lease.';
          bannerBg = '#FFFBEB';
          bannerBorder = '#FDE68A';
        } else if (currentAgreement?.status === 'terminated' || !currentAgreement || currentAgreement?.status !== 'active') {
          bannerLabel = 'Tenancy Status';
          bannerAmount = 'No Active Rent Due';
          bannerDesc = currentAgreement?.status === 'terminated' ? 'Your lease for this unit has concluded.' : 'No active lease or upcoming payment.';
          bannerBg = '#F8FAFC';
          bannerBorder = '#E2E8F0';
        }

        return (
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                background: bannerBg,
                border: `1px solid ${bannerBorder}`,
                borderRadius: '12px',
                padding: '22px 24px',
                marginBottom: '14px',
              }}
            >
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>
                {bannerLabel}
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.5px', marginBottom: '4px' }}>
                {bannerAmount}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                {bannerDesc}
              </div>
            </div>

            {/* Quick Action Pills */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => navigate('/tenant/support')}
                style={{ borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'var(--surface)' }}
              >
                Report a problem
              </button>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => navigate('/tenant/lease')}
                style={{ borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'var(--surface)' }}
              >
                My lease
              </button>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => navigate('/tenant/payments')}
                style={{ borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'var(--surface)' }}
              >
                All payments
              </button>
            </div>
          </div>
        );
      })()}

      {/* Unified "Needs you" Section (Invitations, Unacknowledged Announcements, Cash Claims, Settlements, Automated Reminders) */}
      {(() => {
        const unackedAnnouncements = myAnnouncements.filter((a) => {
          if (!a.requireAcknowledgment) return false;
          if (dismissedNoticeIds.has(a.id)) return false;
          const isAckedByArr = (a.acknowledgedBy || []).some((id) => user?.id && id === user.id);
          const isAckedByObj = (a.acknowledgments || []).some(
            (ack) => (user?.id && ack.tenantId === user.id) || ((ack as any).tenantEmail && tenantEmail && (ack as any).tenantEmail.toLowerCase() === tenantEmail)
          );
          return !isAckedByArr && !isAckedByObj && !justAckedIds.has(a.id);
        });

        // Filter out invitation reminders (already rendered via myPendingRequests with rich Accept/Decline actions)
        // and any reminders dismissed or snoozed by the resident
        const activeRemindersForNeedsYou = (tenantReminders || []).filter((r) => {
          if (r.id.startsWith('tenant_invitation_')) return false;
          if (dismissedReminderIds.includes(r.id) || snoozedReminderIds.includes(r.id)) return false;
          return true;
        });

        const allNeedsYouCards: React.ReactNode[] = [];

        // 1. Unacknowledged Announcements
        unackedAnnouncements.forEach((a) => {
          allNeedsYouCards.push(
            <div
              key={`ack-${a.id}`}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
                <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{a.title}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '12px', paddingLeft: '16px' }}>
                {a.body} {a.authorName ? `· ${a.authorName}` : ''}
              </div>
              <div style={{ paddingLeft: '16px' }}>
                <button
                  type="button"
                  className="btn brass small"
                  onClick={() => handleTenantAcknowledge(a.id)}
                  disabled={ackingNoticeId === a.id}
                  style={{ borderRadius: '8px', padding: '6px 14px', fontSize: '12.5px', fontWeight: 600 }}
                >
                  {ackingNoticeId === a.id ? 'Saving...' : 'Acknowledge'}
                </button>
              </div>
            </div>
          );
        });

        // 2. Pending Tenancy Invitations
        myPendingRequests.forEach((req) => {
          allNeedsYouCards.push(
            <div
              key={`req-${req.id}`}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '18px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                  <span style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--ink)' }}>
                    Lease offer: {req.propertyName} · Unit {req.unitNumber}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', paddingLeft: '16px' }}>
                  {getCurrencySymbol(req.currency)}{(req.rent ?? 0).toLocaleString()}/mo · Deposit {getCurrencySymbol(req.currency)}{(req.deposit ?? 0).toLocaleString()} · From {req.ownerName}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingLeft: '16px' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => openReviewModal(req)}
                  style={{ borderRadius: '8px', fontSize: '12.5px', fontWeight: 600 }}
                >
                  Review details
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  disabled={respondingReqId === req.id}
                  onClick={() => handleDeclineRequest(req)}
                  style={{ borderRadius: '8px', fontSize: '12.5px', color: 'var(--danger)' }}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="btn brass small"
                  onClick={() => handleAcceptRequest(req)}
                  disabled={respondingReqId === req.id}
                  style={{ borderRadius: '8px', fontSize: '12.5px', fontWeight: 600 }}
                >
                  {respondingReqId === req.id ? 'Accepting...' : 'Accept'}
                </button>
              </div>
            </div>
          );
        });

        // 3. Cash Handover Claims
        pendingRefundClaimsForMe.forEach((c) => {
          allNeedsYouCards.push(
            <div
              key={`claim-${c.id}`}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                    Cash refund reported: {getCurrencySymbol(c.currency)}{(Number(c.amount) || 0).toLocaleString('en-IN')}
                    {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(c.currency || 'INR') && (
                      <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 500, marginLeft: '6px' }}>
                        (~{getCurrencySymbol(viewCurrency)}{Math.round(convert(Number(c.amount) || 0, c.currency || 'INR', viewCurrency)).toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', paddingLeft: '16px' }}>
                  Unit {c.unit} · {c.handoverDate} · Reported by {c.claimedByName}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', paddingLeft: '16px' }}>
                <button
                  type="button"
                  className="btn brass small"
                  onClick={() => confirmCashClaim(c.id)}
                  style={{ borderRadius: '8px', fontSize: '12.5px', fontWeight: 600 }}
                >
                  Confirm received
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  style={{ borderRadius: '8px', fontSize: '12.5px', color: 'var(--danger)' }}
                  onClick={async () => {
                    const reason = window.prompt('Reason for declining:');
                    if (reason && reason.trim()) {
                      await rejectCashClaim(c.id, reason.trim());
                    }
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          );
        });

        // 4. Deposit Settlements
        mySettlements.forEach((settlement) => {
          const grossDeposit = Number(settlement.grossDepositHeld ?? (settlement as any).deposit ?? 0);
          const netRefund = Number(settlement.netRefundableAmount ?? (settlement as any).netRefund ?? grossDeposit);
          const currency = settlement.currency || DEFAULT_CURRENCY;
          allNeedsYouCards.push(
            <div
              key={`settlement-${settlement.id}`}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                    Move-out deposit settlement · {getCurrencySymbol(currency)}{netRefund.toLocaleString('en-IN')}
                    {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(currency) && (
                      <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 500, marginLeft: '6px' }}>
                        (~{getCurrencySymbol(viewCurrency)}{Math.round(convert(netRefund, currency, viewCurrency)).toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', paddingLeft: '16px' }}>
                  Unit {settlement.unit} · {settlement.propertyName}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', paddingLeft: '16px' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => downloadDepositSettlementPdf(settlement)}
                  style={{ borderRadius: '8px', fontSize: '12.5px' }}
                >
                  PDF
                </button>
                <button
                  type="button"
                  className="btn brass small"
                  onClick={() => setSettlementToReview(settlement)}
                  style={{ borderRadius: '8px', fontSize: '12.5px', fontWeight: 600 }}
                >
                  Review settlement
                </button>
              </div>
            </div>
          );
        });

        // 5. Automated Lifecycle & Action Reminders (Lease Signature, Renewal, Inspection, Ticket Rating, Overdue/Due Rent)
        activeRemindersForNeedsYou.forEach((rem) => {
          const dotColor =
            rem.severity === 'urgent'
              ? '#DC2626'
              : rem.severity === 'warning'
              ? '#D97706'
              : rem.severity === 'positive'
              ? '#10B981'
              : '#3B82F6';

          allNeedsYouCards.push(
            <div
              key={`rem-${rem.id}`}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ flex: '1 1 280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                    {rem.title}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', paddingLeft: '16px' }}>
                  {rem.description}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px' }}>
                <button
                  type="button"
                  className="btn brass small"
                  onClick={() => navigate(rem.actionLink)}
                  style={{ borderRadius: '8px', fontSize: '12.5px', fontWeight: 600 }}
                >
                  {rem.actionLabel}
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => handleSnoozeReminder(rem.id)}
                  title="Snooze for 24 hours"
                  style={{ borderRadius: '8px', padding: '6px 8px', color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center' }}
                >
                  <Clock size={13} />
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => handleDismissReminder(rem.id)}
                  title="Dismiss reminder"
                  style={{ borderRadius: '8px', padding: '6px 8px', color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center' }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          );
        });

        if (allNeedsYouCards.length === 0) return null;

        const topTwoCards = allNeedsYouCards.slice(0, 2);
        const extraCards = allNeedsYouCards.slice(2);

        return (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Needs you</span>
                {allNeedsYouCards.length > 1 && (
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '1px 8px',
                      borderRadius: '999px',
                      background: 'var(--surface-sunken)',
                      color: 'var(--ink-soft)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    {allNeedsYouCards.length}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topTwoCards}
            </div>

            {extraCards.length > 0 && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: showAllNeedsYou ? '1fr' : '0fr',
                    opacity: showAllNeedsYou ? 1 : 0,
                    marginTop: showAllNeedsYou ? '10px' : '0px',
                    transition: 'grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease, margin-top 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {extraCards}
                  </div>
                </div>

                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setShowAllNeedsYou((prev) => !prev)}
                    style={{
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: 'var(--ink-soft)',
                      background: 'var(--surface)',
                    }}
                  >
                    {showAllNeedsYou ? 'Show less ▴' : `Show ${extraCards.length} more ▾`}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink-soft)', flexWrap: 'wrap' }}>
                        <MapPin size={15} color="var(--brass)" style={{ flexShrink: 0 }} />
                        <AddressDisplay address={targetProp?.address} fallback="Property Address on File" />
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
                      <CurrencyAmount amount={reviewingRequest.rent} currency={reviewingRequest.currency} />
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink-soft)' }}> / mo</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>Due 1st of each month</div>
                  </div>

                  <div style={{ padding: '12px', background: '#FAF9F5', border: '1px solid var(--line)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Security Deposit</div>
                    <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--ink)', marginTop: '2px' }}>
                      <CurrencyAmount amount={reviewingRequest.deposit} currency={reviewingRequest.currency} />
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
              </div>

              <div className="stat">
                <div className="num" style={{ color: 'var(--ink)' }}>{pastCurrency}0</div>
                <div className="lbl">Security Deposit Held</div>
              </div>

              <div className="stat">
                <div className="num">0</div>
                <div className="lbl">Active Maintenance Requests</div>
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
          myPendingRequests.length === 0 && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                padding: '32px 24px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                No active lease yet
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '16px' }}>
                Share your email (<b>{user?.email}</b>) with your landlord to receive a lease invitation, or browse available homes.
              </div>
              <button
                type="button"
                className="btn brass small"
                onClick={() => navigate('/homes')}
                style={{ borderRadius: '8px', padding: '8px 16px', fontWeight: 600 }}
              >
                Browse homes
              </button>
            </div>
          )
        )
      ) : (
        /* Active Resident Tenancy View */
        <div>
          {/* 3 Clean Summary Stat Cards */}
          <div className="grid grid-3" style={{ gap: '16px', marginBottom: '24px' }}>
            <div className="stat" style={{ borderRadius: '12px', padding: '20px 22px' }}>
              <div className="num" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink)' }}>
                {displayCurrencySymbol}{displayRentAmount.toLocaleString()}
              </div>
              <div className="lbl" style={{ marginTop: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                Monthly rent
              </div>
              {isDifferentCurrency && (
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                  Base: {getCurrencySymbol(rawContractCurrency)}{(Number(activeRent) || 0).toLocaleString()} {rawContractCurrency}
                </div>
              )}
            </div>

            <div className="stat" style={{ borderRadius: '12px', padding: '20px 22px' }}>
              <div className="num" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink)' }}>
                {displayCurrencySymbol}{displayDepositAmount.toLocaleString()}
              </div>
              <div className="lbl" style={{ marginTop: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                Security deposit
              </div>
              {isDifferentCurrency && (
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                  Base: {getCurrencySymbol(rawContractCurrency)}{(Number(activeDeposit) || 0).toLocaleString()} {rawContractCurrency}
                </div>
              )}
            </div>

            <div className="stat" style={{ borderRadius: '12px', padding: '20px 22px' }}>
              <div className="num" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink)' }}>
                {myTickets.filter((t) => t.status !== 'resolved').length}
              </div>
              <div className="lbl" style={{ marginTop: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                Open repairs
              </div>
            </div>
          </div>

          {/* Notices from your landlord */}
          {(() => {
            const visibleNotices = myAnnouncements.filter((a) => {
              if (dismissedNoticeIds.has(a.id)) return false;
              const isAckedByArr = (a.acknowledgedBy || []).some((id) => user?.id && id === user.id);
              const isAckedByObj = (a.acknowledgments || []).some(
                (ack) => (user?.id && ack.tenantId === user.id) || ((ack as any).tenantEmail && tenantEmail && (ack as any).tenantEmail.toLowerCase() === tenantEmail)
              );
              const hasAcked = isAckedByArr || isAckedByObj || justAckedIds.has(a.id);
              // If it requires acknowledgment and is NOT yet acknowledged, it's already shown in "Needs you" above
              if (a.requireAcknowledgment && !hasAcked) return false;
              return true;
            });

            if (visibleNotices.length === 0) return null;

            return (
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '22px 24px',
                  marginBottom: '24px',
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                  Notices from your landlord
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {visibleNotices.map((a, idx) => (
                    <div
                      key={a.id}
                      style={{
                        paddingBottom: idx < visibleNotices.length - 1 ? '16px' : 0,
                        borderBottom: idx < visibleNotices.length - 1 ? '1px solid var(--line)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{a.title}</span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: 'var(--surface-sunken)',
                            color: 'var(--ink-soft)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {a.priority || 'Standard'}
                        </span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.5, marginBottom: '4px' }}>
                        {a.body}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                        {a.authorName || 'Landlord'} · {new Date(a.publishedAt || a.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
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
