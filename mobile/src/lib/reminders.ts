import {
  MobileProperty,
  MobileUnit,
  MobilePaymentTransaction,
  MobileInvoice,
  MobileAgreement,
  MobileTicket,
  MobileMoveOut,
  MobileUserProfile,
  MobileTenancyRequest,
  MobilePlatformSupportTicket,
  MobileDispute,
} from '../types';
import type { MobileAppState } from '../context/MobileAppDataContext';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, normalizeCurrencyCode, getCurrencySymbol } from './currencyService';

export type ReminderSeverity = 'urgent' | 'warning' | 'info' | 'positive';
export type ReminderChannel = 'in_app' | 'email' | 'sms' | 'push';
export type ReminderCategory =
  | 'rent'
  | 'deposit'
  | 'lease'
  | 'maintenance'
  | 'approval'
  | 'occupancy'
  | 'subscription'
  | 'compliance';

export interface DashboardReminder {
  id: string;
  title: string;
  description: string;
  severity: ReminderSeverity;
  icon: 'alert-triangle' | 'clock' | 'calendar' | 'credit-card' | 'file-text' | 'tool' | 'bell';
  actionLabel: string;
  actionScreen: string;
  actionLink?: string;
  actionType?: 'navigate' | 'nudge' | 'modal' | 'settle' | 'publish_units';
  category: ReminderCategory;
  dueDate?: string;
  unitNumber?: string;
  propertyName?: string;
  amount?: number;
  currency?: string;
  targetTenantId?: string;
  channels?: ReminderChannel[];
  targetUserId?: string;
  targetUserRole?: 'tenant' | 'owner' | 'manager' | 'staff' | 'superadmin';
  metadata?: Record<string, any>;
  snoozedUntil?: string;
  dismissedAt?: string;
}

// Canonical currency normalizer supporting all global currencies
export const resolveCurrency = (raw?: string): { code: string; symbol: string } => {
  if (!raw) return { code: DEFAULT_CURRENCY, symbol: DEFAULT_CURRENCY_SYMBOL };
  const code = normalizeCurrencyCode(raw);
  const symbol = getCurrencySymbol(code);
  return { code, symbol };
};

// Calculate difference in days between two date strings (target - today)
export const getDaysDifference = (targetDateStr?: string): number | null => {
  if (!targetDateStr) return null;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDateStr);
    target.setHours(0, 0, 0, 0);
    if (isNaN(target.getTime())) return null;
    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
};

/**
 * Priority order for sorting reminders
 */
const priorityOrder: Record<ReminderSeverity, number> = {
  urgent: 1,
  warning: 2,
  info: 3,
  positive: 4,
};

/**
 * Compute real-time reminders for Tenant Dashboard matching web getTenantReminders
 */
export const getTenantReminders = (
  state: MobileAppState,
  user: MobileUserProfile | null
): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];
  const tenantEmail = user.email?.toLowerCase().trim() || '';
  const tenantName = user.displayName?.toLowerCase().trim() || '';
  const tenantId = user.id;

  const cleanU = (s?: string) => (s || '').toLowerCase().replace(/unit\s*|apt\s*|flat\s*|#|-/gi, '').trim();

  // Active units for this tenant
  const myUnits = (state.units || []).filter((u) => {
    const isMatch =
      u.currentTenantId === tenantId ||
      (tenantEmail && u.tenant?.toLowerCase().trim() === tenantEmail);
    return isMatch && (u.status === 'occupied' || u.status === 'reserved');
  });

  // 0. Pending Tenancy Invitations Awaiting Response
  const seenInvitationKeys = new Set<string>();
  const pendingInvitations = (state.tenancyRequests || []).filter(
    (r) =>
      r.status === 'pending' &&
      ((tenantId && r.tenantId === tenantId) ||
        (tenantEmail && r.tenantEmail?.toLowerCase().trim() === tenantEmail))
  );

  pendingInvitations.forEach((r) => {
    if (seenInvitationKeys.has(r.id)) return;
    seenInvitationKeys.add(r.id);

    // Suppress invitation if agreement has already progressed past pending
    const hasProgressedAgreement = (state.agreements || []).some(
      (a) =>
        (!r.propertyId || !a.propertyId || r.propertyId === a.propertyId) &&
        (cleanU(a.unit) === cleanU(r.unitNumber) || a.unit === r.unitId) &&
        (a.tenantId === tenantId || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) &&
        a.status !== 'draft' &&
        !a.isDraft &&
        a.status !== 'terminated'
    );
    if (hasProgressedAgreement) return;

    reminders.push({
      id: `tenant_invitation_${r.id}`,
      title: `Tenancy Offer Received: Unit ${r.unitNumber}`,
      description: `Landlord ${r.ownerName} sent you a tenancy offer for Unit ${r.unitNumber} (${r.propertyName}). Review terms and respond to formalize move-in.`,
      severity: 'warning',
      icon: 'file-text',
      actionLabel: 'Review Offer & Respond',
      actionScreen: 'tenant_dashboard',
      actionType: 'modal',
      category: 'lease',
      unitNumber: r.unitNumber,
      propertyName: r.propertyName,
      channels: ['in_app', 'email', 'sms'],
    });
  });

  // 1. Check for Overdue or Upcoming Rent Invoices
  const myInvoices = (state.invoices || []).filter((inv) => {
    if (inv.status === 'paid' || inv.status === 'cancelled' || (inv as any).status === 'void' || (inv as any).status === 'refunded') {
      return false;
    }

    // Negative guard: if invoice has a different tenantId or tenantEmail, ignore it
    if (inv.tenantId && tenantId && inv.tenantId !== tenantId) return false;
    if (inv.tenantEmail && tenantEmail && inv.tenantEmail.toLowerCase().trim() !== tenantEmail) return false;

    // Direct tenant match strictly by unique ID or verified email
    const matchTenant =
      Boolean(inv.tenantId && inv.tenantId === tenantId) ||
      Boolean(tenantEmail && ((inv.tenantEmail && inv.tenantEmail.toLowerCase().trim() === tenantEmail) || (inv.tenant && inv.tenant.toLowerCase().trim() === tenantEmail))) ||
      (!inv.tenantId && myUnits.some((u) => (!inv.propertyId || inv.propertyId === u.propertyId) && (cleanU(u.unitNumber) === cleanU(inv.unit) || u.id === inv.unit)));

    if (!matchTenant) return false;

    // Check if invoice belongs to a previous vacated tenancy
    const isPastVacatedInvoice = (state.moveOuts || []).some((m) => {
      const cleanMUnit = (m.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const cleanInvUnit = (inv.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const unitMatches = !inv.unit || (cleanMUnit && cleanInvUnit && cleanMUnit === cleanInvUnit);
      const isCompleted = m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt);
      if (!unitMatches || !isCompleted) return false;

      const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
      const invDueTime = new Date(inv.due || (inv as any).createdAt || 0).getTime();

      // If the invoice was due on or before the move out, it belongs to the previous tenancy
      if (moTime > 0 && invDueTime > 0 && invDueTime <= moTime) return true;

      return false;
    });
    if (isPastVacatedInvoice) return false;

    // If tenant has an agreement (active or onboarding), invoices due prior to agreement start date belong to past lease
    const curAg = (state.agreements || []).find(
      (a) =>
        a.status !== 'terminated' &&
        a.status !== 'cancelled' &&
        a.status !== 'expired' &&
        ((a.unit && inv.unit && a.unit.toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === inv.unit.toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim()) ||
         (inv.leaseAgreementId && a.id === inv.leaseAgreementId))
    );
    if (curAg) {
      if (inv.leaseAgreementId && inv.leaseAgreementId !== curAg.id) return false;
      const agStartTime = new Date(curAg.start || curAg.createdAt || 0).getTime();
      const invDueTime = new Date(inv.due || 0).getTime();
      if (agStartTime > 0 && invDueTime > 0 && invDueTime < agStartTime) return false;
    }

    return true;
  });

  myInvoices.forEach((inv) => {
    if (inv.status === 'paid' || inv.status === 'cancelled' || (inv as any).status === 'void' || (inv as any).status === 'refunded') return;

    const prop = (state.properties || []).find((p) => p.id === inv.propertyId);
    const curr = resolveCurrency(inv.currency || prop?.currency);
    const daysUntilDue = getDaysDifference(inv.due);
    const ownerId = inv.ownerId || prop?.ownerId;
    const ownerSettings = ownerId ? state.ownerSettings?.[ownerId] : undefined;
    const reminderLeadDays = Number(ownerSettings?.rentReminderDaysPrior ?? ownerSettings?.rentalReminderConfig?.daysPrior ?? 10);
    const isReminderEnabled = ownerSettings?.rentalReminderConfig?.enabled !== false;

    // Overdue Rent
    if (inv.status === 'overdue' || (daysUntilDue !== null && daysUntilDue < 0)) {
      reminders.push({
        id: `tenant_overdue_${inv.id}`,
        title: `Rent Overdue: Unit ${inv.unit}`,
        description: `Invoice ${inv.id} for ${curr.symbol}${(inv.total || inv.amount).toLocaleString()} was due on ${inv.due}. Clear balance to maintain good tenancy standing.`,
        severity: 'urgent',
        icon: 'alert-triangle',
        actionLabel: 'Pay Rent Now',
        actionScreen: 'tenant_payments',
        actionType: 'navigate',
        category: 'rent',
        dueDate: inv.due,
        unitNumber: inv.unit,
        propertyName: inv.propertyName || prop?.name,
        amount: inv.total || inv.amount,
        currency: curr.symbol,
        channels: ['in_app', 'email', 'sms'],
      });
    }
    // Rent Due Soon (within owner-customized lead-time days, default 10)
    else if (isReminderEnabled && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= reminderLeadDays) {
      reminders.push({
        id: `tenant_due_soon_${inv.id}`,
        title: `Rent Due in ${daysUntilDue === 0 ? 'Today' : `${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`}: Unit ${inv.unit}`,
        description: `Invoice ${inv.id} for ${curr.symbol}${(inv.total || inv.amount).toLocaleString()} is due on ${inv.due}. One-click settlement is available.`,
        severity: daysUntilDue <= 2 ? 'warning' : 'info',
        icon: 'clock',
        actionLabel: 'Pay Rent Now',
        actionScreen: 'tenant_payments',
        actionType: 'navigate',
        category: 'rent',
        dueDate: inv.due,
        unitNumber: inv.unit,
        propertyName: inv.propertyName || prop?.name,
        amount: inv.total || inv.amount,
        currency: curr.symbol,
        channels: ['in_app', 'email'],
      });
    }
  });

  // 2. Lease Agreements Lifecycle Reminders (Strictly Unique ID & Email)
  const seenAgreementKeys = new Set<string>();
  const myAgreements = (state.agreements || []).filter((a) => {
    if (a.isDraft || a.status === 'draft' || a.status === 'terminated' || a.status === 'cancelled') {
      return false;
    }
    // 1. Direct verified tenant ID match
    if (tenantId && a.tenantId === tenantId) return true;
    // 2. Direct verified tenant email match
    if (
      tenantEmail &&
      (a.tenantEmail?.toLowerCase().trim() === tenantEmail || a.tenant?.toLowerCase().trim() === tenantEmail)
    ) {
      return true;
    }
    // 3. Fallback unit match: ONLY if agreement belongs to one of the tenant's units on the EXACT property
    const matchingUnit = myUnits.find(
      (u) =>
        (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
        (cleanU(u.unitNumber) === cleanU(a.unit) || u.id === a.unit)
    );
    if (matchingUnit) {
      const isOtherTenant =
        (a.tenantId && a.tenantId !== tenantId) ||
        (a.tenantEmail && tenantEmail && a.tenantEmail.toLowerCase().trim() !== tenantEmail);
      if (!isOtherTenant) {
        if (!a.tenantId && !a.tenantEmail) return true;
      }
    }
    return false;
  });

  myAgreements.forEach((a) => {
    if (seenAgreementKeys.has(a.id)) return;
    seenAgreementKeys.add(a.id);
    const prop = (state.properties || []).find((p) => p.id === a.propertyId);
    const curr = resolveCurrency(prop?.currency);

    // Signature Required
    if (a.status === 'awaiting_tenant_signature' || (a as any).status === 'awaiting_tenant_upload') {
      reminders.push({
        id: `tenant_sign_${a.id}`,
        title: `Lease Agreement Awaiting Your Signature`,
        description: `Tenancy agreement for Unit ${a.unit} is ready for execution. Please sign and upload your copy to formalize the lease.`,
        severity: 'warning',
        icon: 'file-text',
        actionLabel: 'Review & Sign Lease',
        actionScreen: 'tenant_lease',
        category: 'lease',
        unitNumber: a.unit,
        propertyName: prop?.name,
        channels: ['in_app', 'email', 'sms'],
      });
    }

    // Signed Copy Under Landlord Review
    if ((a as any).status === 'pending_approval') {
      reminders.push({
        id: `tenant_under_review_${a.id}`,
        title: `Signed Lease Under Review: Unit ${a.unit}`,
        description: `Your signed document has been submitted. Landlord is reviewing agreement to unlock security deposit settlement.`,
        severity: 'info',
        icon: 'clock',
        actionLabel: 'View Lease Status',
        actionScreen: 'tenant_lease',
        category: 'lease',
        unitNumber: a.unit,
        propertyName: prop?.name,
      });
    }

    // Security Deposit Unlocked & Ready for Settlement
    const isDepositSettled = a.depositStatus === 'paid';
    if (
      (a.status === 'pending_deposit' || (a.status === 'active' && a.depositStatus === 'unpaid')) &&
      !isDepositSettled &&
      (a.deposit || 0) > 0
    ) {
      reminders.push({
        id: `tenant_deposit_${a.id}`,
        title: `Move-In Security Deposit Due: Unit ${a.unit}`,
        description: `Your signed lease has been approved! Settle your refundable security deposit of ${curr.symbol}${(a.deposit || 0).toLocaleString()} to finalize move-in.`,
        severity: 'urgent',
        icon: 'credit-card',
        actionLabel: 'Settle Deposit Online',
        actionScreen: 'tenant_payments',
        category: 'deposit',
        unitNumber: a.unit,
        propertyName: prop?.name,
        amount: a.deposit,
        currency: curr.symbol,
        channels: ['in_app', 'email', 'sms'],
      });
    }

    // Lease Expiring in Next 60 Days
    if (a.status === 'active' || (a as any).status === 'signed') {
      const daysLeft = getDaysDifference(a.end);
      if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 60) {
        reminders.push({
          id: `tenant_lease_expiry_${a.id}`,
          title: `Lease Renewal Notice: Unit ${a.unit}`,
          description: `Your tenancy term concludes in ${daysLeft} days (on ${a.end}). Review lease details to request extension or coordinate move-out.`,
          severity: daysLeft <= 15 ? 'warning' : 'info',
          icon: 'calendar',
          actionLabel: 'View Lease & Renewal Options',
          actionScreen: 'tenant_lease',
          category: 'lease',
          dueDate: a.end,
          unitNumber: a.unit,
          propertyName: prop?.name,
          channels: ['in_app', 'email'],
        });
      }
    }
  });

  // 3. Move-Out Inspection & Refund Status (Strictly Unique ID & Email)
  const myMoveouts = (state.moveOuts || []).filter(
    (m) =>
      Boolean(tenantId && m.tenantId === tenantId) ||
      Boolean(tenantEmail && ((m as any).tenantEmail?.toLowerCase().trim() === tenantEmail || m.tenantName?.toLowerCase().trim() === tenantEmail))
  );

  myMoveouts.forEach((m) => {
    if (m.status === 'inspection_scheduled') {
      reminders.push({
        id: `tenant_inspection_${m.id}`,
        title: `Move-Out Inspection on ${m.moveOutDate || 'Upcoming Date'}`,
        description: `Inspection for Unit ${m.unit} is scheduled with your landlord. Review checklist and coordinate keys handover.`,
        severity: 'info',
        icon: 'calendar',
        actionLabel: 'View Move-Out Checklist',
        actionScreen: 'tenant_lease',
        category: 'occupancy',
        unitNumber: m.unit,
      });
    } else if (m.status === 'awaiting_tenant_approval' || (m as any).settlementStatus === 'awaiting_tenant_approval') {
      reminders.push({
        id: `tenant_settle_approval_${m.id}`,
        title: `Action Required: Review & Claim Deposit Refund (Unit ${m.unit})`,
        description: `Inspection finalized. Deductions itemized for Unit ${m.unit}. Review deductions and claim your net refund.`,
        severity: 'urgent',
        icon: 'alert-triangle',
        actionLabel: 'Review & Claim',
        actionScreen: 'tenant_lease',
        category: 'deposit',
        unitNumber: m.unit,
        amount: m.netRefundAmount,
        currency: m.currency || DEFAULT_CURRENCY_SYMBOL,
        channels: ['in_app', 'email', 'sms'],
      });
    } else if (
      (m.status === 'refund_completed' || m.status === 'settled') &&
      !m.tenantConfirmedReceipt
    ) {
      reminders.push({
        id: `tenant_confirm_refund_${m.id}`,
        title: `⚡ Refund Disbursed • Unit ${m.unit}`,
        description: `Landlord has disbursed ${m.currency || DEFAULT_CURRENCY_SYMBOL}${(m.netRefundAmount || m.depositHeld || 0).toLocaleString()} deposit refund. Please confirm receipt.`,
        severity: 'urgent',
        icon: 'credit-card',
        actionLabel: 'Confirm Receipt',
        actionScreen: 'tenant_lease',
        category: 'deposit',
        unitNumber: m.unit,
        amount: m.netRefundAmount,
        currency: m.currency || DEFAULT_CURRENCY_SYMBOL,
        channels: ['in_app', 'email', 'sms'],
      });
    }
  });

  // 4. In-Progress Maintenance Tickets
  const activeTickets = (state.tickets || []).filter(
    (t) =>
      (t.tenantId === tenantId || (tenantEmail && (t.tenantEmail?.toLowerCase().trim() === tenantEmail || t.tenant?.toLowerCase().trim() === tenantName))) &&
      t.status === 'in_progress'
  );

  if (activeTickets.length > 0) {
    const firstTicket = activeTickets[0];
    reminders.push({
      id: `tenant_ticket_${firstTicket.id}`,
      title: `Maintenance Update: ${firstTicket.issue}`,
      description: `Ticket #${firstTicket.id} is IN PROGRESS. Landlord contractor has been assigned for resolution.`,
      severity: 'positive',
      icon: 'tool',
      actionLabel: 'View Ticket Progress',
      actionScreen: 'tenant_support',
      category: 'maintenance',
      unitNumber: firstTicket.unit,
    });
  }

  // 5. Resolved Maintenance Work Awaiting Resident Rating
  const unratedResolved = (state.tickets || []).filter(
    (t) =>
      (t.tenantId === tenantId || (tenantEmail && (t.tenantEmail?.toLowerCase().trim() === tenantEmail || t.tenant?.toLowerCase().trim() === tenantName))) &&
      t.status === 'resolved' &&
      !t.rating
  );

  if (unratedResolved.length > 0) {
    const firstUnrated = unratedResolved[0];
    reminders.push({
      id: `tenant_rate_ticket_${firstUnrated.id}`,
      title: `Work Completed: Rate Technician (${firstUnrated.issue})`,
      description: `Repair for Unit ${firstUnrated.unit} was marked complete by ${firstUnrated.assignedStaffName || 'technician'}. Submit feedback to finalize ticket.`,
      severity: 'info',
      icon: 'tool',
      actionLabel: 'Rate Technician',
      actionScreen: 'tenant_support',
      category: 'maintenance',
      unitNumber: firstUnrated.unit,
    });
  }

  // Final deduplication by reminder ID or action category + unit
  const seenReminderKeys = new Set<string>();
  const deduplicatedReminders = reminders.filter((rem) => {
    if (seenReminderKeys.has(rem.id)) return false;
    seenReminderKeys.add(rem.id);
    return true;
  });

  return deduplicatedReminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Helper to determine if an invoice belongs to a tenant or unit that has vacated.
 * Excludes:
 * 1. Concluded move-outs (settled, refund_completed, tenantConfirmedReceipt, or notice/departure concluded)
 * 2. Units marked vacant or currently occupied by a different tenant
 * 3. Lease agreements that are terminated, expired, or cancelled
 * 4. Tenant records marked vacated/inactive or where the unit is no longer leased
 */
export const isInvoiceForVacatedTenancy = (
  inv: MobileInvoice,
  state: MobileAppState,
  myUnits: MobileUnit[] = []
): boolean => {
  const invUnit = (inv.unit || (inv as any).unitId || '').trim().toLowerCase();
  const invTenantId = inv.tenantId || '';
  const invTenantName = (inv.tenant || '').trim().toLowerCase();
  const invTenantEmail = ((inv as any).tenantEmail || '').trim().toLowerCase();

  const cleanInvUnit = invUnit.replace(/^(unit|apt|flat|#)\s*/i, '').trim();

  // If the invoice belongs to an active lease agreement, it is never for a vacated tenancy
  const hasActiveAgreement = (state.agreements || []).some(
    (a) =>
      (a.status === 'active' || a.status === 'pending_deposit') &&
      (a.id === inv.leaseAgreementId ||
        ((!inv.propertyId || !a.propertyId || a.propertyId === inv.propertyId) &&
          (a.unit.trim().toLowerCase() === invUnit ||
            a.unit.trim().toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanInvUnit)))
  );
  if (hasActiveAgreement) return false;

  // 1. Move-Out checks
  const isMoveOutVacated = (state.moveOuts || []).some((m) => {
    if (inv.propertyId && (m as any).propertyId && inv.propertyId !== (m as any).propertyId) {
      return false;
    }
    const mUnit = (m.unit || '').trim().toLowerCase();
    const cleanMUnit = mUnit.replace(/^(unit|apt|flat|#)\s*/i, '').trim();
    const mTenantId = m.tenantId || '';
    const mTenantName = (m.tenantName || m.tenant || '').trim().toLowerCase();
    const mTenantEmail = ((m as any).tenantEmail || '').trim().toLowerCase();

    const unitMatches = Boolean(
      (invUnit && mUnit && (invUnit === mUnit || invUnit.includes(mUnit) || mUnit.includes(invUnit))) ||
      (cleanInvUnit && cleanMUnit && cleanInvUnit === cleanMUnit)
    );
    const tenantMatches = Boolean(
      (invTenantId && mTenantId && invTenantId === mTenantId) ||
      (invTenantName && mTenantName && (invTenantName === mTenantName || invTenantName.includes(mTenantName) || mTenantName.includes(invTenantName))) ||
      (invTenantEmail && mTenantEmail && invTenantEmail === mTenantEmail)
    );

    if (!unitMatches && !tenantMatches) return false;

    // Concluded / settled move-out or refund completed or receipt confirmed
    if (
      m.status === 'settled' ||
      m.status === 'refund_completed' ||
      Boolean(m.tenantConfirmedReceipt) ||
      ['settlement_pending', 'refund_scheduled', 'awaiting_tenant_approval'].includes(m.status)
    ) {
      return true;
    }

    return false;
  });
  if (isMoveOutVacated) return true;

  // 1b. Deposit Settlement checks
  const isSettlementVacated = (state.depositSettlements || []).some((s) => {
    const sUnit = (s.unit || '').trim().toLowerCase();
    const cleanSUnit = sUnit.replace(/^(unit|apt|flat|#)\s*/i, '').trim();
    const sTenantId = s.tenantId || '';
    const unitMatches = Boolean(
      (invUnit && sUnit && (invUnit === sUnit || invUnit.includes(sUnit) || sUnit.includes(invUnit))) ||
      (cleanInvUnit && cleanSUnit && cleanInvUnit === cleanSUnit)
    );
    const tenantMatches = Boolean(invTenantId && sTenantId && invTenantId === sTenantId);
    if (!unitMatches && !tenantMatches) return false;
    return s.status === 'refunded' || s.status === 'approved' || Boolean(s.tenantConfirmedReceipt) || Boolean(s.disbursedAt);
  });
  if (isSettlementVacated) return true;

  // 2. Unit Occupancy checks
  const matchingUnit = myUnits.find((u) => {
    const uNum = (u.unitNumber || u.id || '').trim().toLowerCase();
    return uNum === invUnit || u.id === inv.unit || u.id === (inv as any).unitId;
  }) || (state.units || []).find((u) => {
    const uNum = (u.unitNumber || u.id || '').trim().toLowerCase();
    return uNum === invUnit || u.id === inv.unit || u.id === (inv as any).unitId;
  });

  if (matchingUnit) {
    if (matchingUnit.status === 'vacant') return true;
    if (invTenantId && matchingUnit.currentTenantId && matchingUnit.currentTenantId !== invTenantId) {
      return true;
    }
    if (invTenantName && matchingUnit.tenant && matchingUnit.tenant.trim().toLowerCase() !== invTenantName) {
      return true;
    }
  }

  // 3. Lease Agreement checks
  const linkedAgId = inv.leaseAgreementId || (inv as any).agreementId;
  if (linkedAgId) {
    const linkedAg = (state.agreements || []).find((a) => a.id === linkedAgId);
    if (linkedAg && (linkedAg.status === 'terminated' || linkedAg.status === 'expired' || linkedAg.status === 'cancelled')) {
      return true;
    }
  }

  if (invUnit) {
    const tenantAgreements = (state.agreements || []).filter((a) => {
      const aUnit = (a.unit || a.unitId || '').trim().toLowerCase();
      const unitMatches = aUnit === invUnit || aUnit.includes(invUnit) || invUnit.includes(aUnit);
      const tenantMatches =
        (invTenantId && a.tenantId === invTenantId) ||
        (invTenantName && (a.tenant || (a as any).tenantName)?.trim().toLowerCase() === invTenantName);
      return unitMatches && tenantMatches;
    });

    if (tenantAgreements.length > 0) {
      const hasActiveLease = tenantAgreements.some(
        (a) => a.status === 'active' || a.status === 'pending_deposit'
      );
      if (!hasActiveLease) return true;
    }
  }

  // 4. Tenant Record status check
  const tenantRec = (state.tenants || []).find(
    (t) =>
      (invTenantId && t.id === invTenantId) ||
      (invTenantName && t.name?.trim().toLowerCase() === invTenantName)
  );
  if (tenantRec) {
    if ((tenantRec as any).status === 'vacated' || (tenantRec as any).status === 'inactive') {
      return true;
    }
    if (
      tenantRec.unitsRented &&
      tenantRec.unitsRented.length > 0 &&
      invUnit &&
      !tenantRec.unitsRented.some((u) => u.trim().toLowerCase() === invUnit) &&
      tenantRec.unit &&
      tenantRec.unit.trim().toLowerCase() !== invUnit
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Compute real-time reminders for Owner Dashboard matching web getOwnerReminders
 */
export const getOwnerReminders = (
  state: MobileAppState,
  ownerId: string,
  filterPropertyId = 'all',
  filterCurrency = 'all'
): DashboardReminder[] => {
  if (!ownerId) return [];

  const myProperties = (state.properties || []).filter((p) => p.ownerId === ownerId);
  if (myProperties.length === 0) return [];

  const myPropertyIds = new Set(myProperties.map((p) => p.id));
  const myUnits = (state.units || []).filter(
    (u) => u.ownerId === ownerId || (u.propertyId && myPropertyIds.has(u.propertyId))
  );

  const matchesFilter = (propId?: string, rawCurrency?: string): boolean => {
    if (!propId || !myPropertyIds.has(propId)) return false;
    if (filterPropertyId !== 'all' && propId !== filterPropertyId) return false;
    if (filterCurrency !== 'all') {
      const c = resolveCurrency(rawCurrency);
      if (c.code !== filterCurrency) return false;
    }
    return true;
  };

  const reminders: DashboardReminder[] = [];

  // 1. Overdue Tenant Invoices / Payments (Urgent)
  const overdueInvoices = (state.invoices || []).filter((inv) => {
    if (inv.status !== 'overdue') return false;
    if (inv.ownerId && inv.ownerId !== ownerId) return false;
    if (inv.propertyId && !myPropertyIds.has(inv.propertyId)) return false;

    // Exclude if invoice is for a vacated unit or departed tenant
    if (isInvoiceForVacatedTenancy(inv, state, myUnits)) return false;

    return matchesFilter(inv.propertyId, inv.currency);
  });

  if (overdueInvoices.length > 0) {
    const overdueSummaryMap: Record<string, { total: number; symbol: string; count: number }> = {};
    overdueInvoices.forEach((inv) => {
      const curr = resolveCurrency(inv.currency);
      if (!overdueSummaryMap[curr.code]) {
        overdueSummaryMap[curr.code] = { total: 0, symbol: curr.symbol, count: 0 };
      }
      overdueSummaryMap[curr.code].total += inv.total || inv.amount || 0;
      overdueSummaryMap[curr.code].count += 1;
    });

    const breakdownStr = Object.values(overdueSummaryMap)
      .map((item) => `${item.symbol}${item.total.toLocaleString()}`)
      .join(' + ');

    reminders.push({
      id: 'owner_overdue_delinquencies',
      title: `${overdueInvoices.length} Tenant Payment${overdueInvoices.length > 1 ? 's' : ''} Overdue`,
      description: `Outstanding overdue balance across portfolio totals ${breakdownStr}. Send 1-click payment reminders to delinquent tenants.`,
      severity: 'urgent',
      icon: 'alert-triangle',
      actionLabel: 'Send Reminders to Tenants',
      actionScreen: 'financial_ledger',
      actionType: 'nudge',
      category: 'rent',
      channels: ['in_app', 'email', 'sms'],
    });
  }

  // 2. Lease Agreements Awaiting Owner Approval
  const pendingAgreements = (state.agreements || []).filter((a) => {
    if (a.status !== 'awaiting_tenant_signature' && a.status !== 'draft' && (a as any).status !== 'pending_approval') return false;
    if (a.ownerId && a.ownerId !== ownerId && !myPropertyIds.has(a.propertyId || '')) return false;
    const prop = myProperties.find((pr) => pr.id === a.propertyId);
    if (!prop) return false;
    return matchesFilter(prop.id, prop.currency);
  });

  if (pendingAgreements.length > 0) {
    reminders.push({
      id: 'owner_pending_agreements',
      title: `${pendingAgreements.length} Agreement${pendingAgreements.length > 1 ? 's' : ''} Awaiting Finalization`,
      description: `Pending lease drafting and tenant signatures for ${pendingAgreements[0].unit || 'units'}. Finalize to formalize occupancy.`,
      severity: 'warning',
      icon: 'file-text',
      actionLabel: 'Review Agreements',
      actionScreen: 'leasing_hub',
      category: 'approval',
      channels: ['in_app', 'email'],
    });
  }

  // 3. Pending Offline Payment Transactions
  const pendingPayments = (state.payments || []).filter((p) => {
    if (p.status !== 'pending' && (p as any).status !== 'pending_confirmation') return false;
    if (p.ownerId && p.ownerId !== ownerId) return false;
    const unitObj = myUnits.find((u) => u.id === p.unit || u.unitNumber === p.unit);
    const prop = myProperties.find((pr) => pr.id === unitObj?.propertyId);
    if (prop && !matchesFilter(prop.id, prop.currency)) return false;
    return true;
  });

  if (pendingPayments.length > 0) {
    reminders.push({
      id: 'owner_pending_proofs',
      title: `${pendingPayments.length} Offline Payment${pendingPayments.length > 1 ? 's' : ''} Awaiting Verification`,
      description: `Pending offline payments recorded. Verify bank transfer funds and confirm settlement to issue official receipts.`,
      severity: 'warning',
      icon: 'credit-card',
      actionLabel: 'Review & Verify Proofs',
      actionScreen: 'financial_ledger',
      category: 'approval',
    });
  }

  // 4. Tenant Move-Out / Vacate Notices Received
  const pendingMoveouts = (state.moveOuts || []).filter((m) => {
    if (m.status !== 'notice_filed' && m.status !== 'inspection_scheduled' && (m as any).status !== 'requested') return false;
    const prop = myProperties.find((pr) => pr.id === m.propertyId);
    if (!prop) return false;
    return matchesFilter(prop.id, m.currency || prop.currency);
  });

  pendingMoveouts.forEach((m) => {
    reminders.push({
      id: `owner_moveout_notice_${m.id}`,
      title: `Move-Out Notice: Unit ${m.unit}`,
      description: `${m.tenantName} submitted move-out notice effective ${m.moveOutDate}. Schedule inspection to coordinate deposit refund settlement.`,
      severity: 'warning',
      icon: 'calendar',
      actionLabel: 'Schedule Inspection',
      actionScreen: 'vacates_moveout',
      category: 'occupancy',
      unitNumber: m.unit,
      channels: ['in_app', 'email'],
    });
  });

  // 5. Open High-Priority Maintenance Tickets
  const emergencyTickets = (state.tickets || []).filter((t) => {
    if (t.status === 'resolved' || t.status === 'closed') return false;
    if (t.ownerId && t.ownerId !== ownerId) return false;
    const prop = myProperties.find((pr) => pr.id === t.propertyId);
    if (t.propertyId && !prop) return false;
    if (prop && !matchesFilter(prop.id, prop.currency)) return false;
    return t.priority === 'High' || t.priority === 'Emergency';
  });

  if (emergencyTickets.length > 0) {
    reminders.push({
      id: 'owner_emergency_repairs',
      title: `${emergencyTickets.length} High-Priority Maintenance Ticket${emergencyTickets.length > 1 ? 's' : ''}`,
      description: `Critical repair requests require immediate technician dispatch and operational oversight.`,
      severity: 'urgent',
      icon: 'tool',
      actionLabel: 'Dispatch Technicians',
      actionScreen: 'owner_maintenance_dispatch',
      category: 'maintenance',
    });
  }

  // 6. Upcoming Rent Scheduled in Next 5 Days
  const upcomingInvoices = (state.invoices || []).filter((inv) => {
    if (inv.status === 'paid' || inv.status === 'cancelled') return false;
    if (inv.ownerId && inv.ownerId !== ownerId) return false;
    const prop = myProperties.find((pr) => pr.id === inv.propertyId);
    if (!prop) return false;
    if (!matchesFilter(prop.id, prop.currency)) return false;
    const days = getDaysDifference(inv.due);
    return days !== null && days >= 0 && days <= 5;
  });

  if (upcomingInvoices.length > 0) {
    const totalByCurr: Record<string, { total: number; symbol: string }> = {};
    upcomingInvoices.forEach((inv) => {
      const prop = myProperties.find((pr) => pr.id === inv.propertyId);
      const curr = resolveCurrency(prop?.currency);
      if (!totalByCurr[curr.code]) {
        totalByCurr[curr.code] = { total: 0, symbol: curr.symbol };
      }
      totalByCurr[curr.code].total += inv.total || inv.amount;
    });

    const sumStr = Object.values(totalByCurr)
      .map((it) => `${it.symbol}${it.total.toLocaleString()}`)
      .join(' + ');

    reminders.push({
      id: 'owner_upcoming_rent',
      title: `${upcomingInvoices.length} Invoices Due in Next 5 Days (${sumStr})`,
      description: `Automated tenant billing cycle is scheduled for collection through Propithub ledger.`,
      severity: 'info',
      icon: 'clock',
      actionLabel: 'View Inflow Ledger',
      actionScreen: 'financial_ledger',
      category: 'rent',
    });
  }

  // 7. Vacant Unlisted Units in Portfolio
  const unlistedVacantUnits = myUnits.filter((u) => {
    if (u.status !== 'vacant' || u.isListedPublicly) return false;
    const prop = myProperties.find((p) => p.id === u.propertyId);
    if (!prop) return false;
    return matchesFilter(u.propertyId, u.currency);
  });

  if (unlistedVacantUnits.length > 0) {
    const firstUnit = unlistedVacantUnits[0];
    reminders.push({
      id: `owner_unlisted_units_${unlistedVacantUnits.length}`,
      title: `${unlistedVacantUnits.length} Vacant Unit${unlistedVacantUnits.length > 1 ? 's' : ''} Ready for Market`,
      description: `Unit ${firstUnit.unitNumber} is vacant and unlisted. Publish to public directory to attract prospective tenants.`,
      severity: 'info',
      icon: 'bell',
      actionLabel: 'Publish Units to Market',
      actionScreen: 'property_portfolio',
      actionType: 'publish_units',
      category: 'occupancy',
    });
  }

  return reminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Compute real-time reminders for Property Manager Operations Desk
 */
export const getManagerReminders = (
  state: MobileAppState,
  user: MobileUserProfile | null
): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];
  const ownerId = user.ownerId || '';
  if (!ownerId && !user.assignedProperties?.length) return [];

  // 1. Open tickets awaiting dispatch
  const openTickets = (state.tickets || []).filter((t) => {
    if (t.status === 'resolved' || t.status === 'closed') return false;
    if (ownerId && t.ownerId !== ownerId) return false;
    if (user.assignedProperties?.length && t.propertyId && !user.assignedProperties.includes(t.propertyId)) return false;
    return t.status === 'open' || !t.assignedStaffId || !t.assignedStaffName;
  });

  openTickets.forEach((t) => {
    const isHigh = t.priority === 'High';
    reminders.push({
      id: `manager_ticket_open_${t.id}`,
      title: `${isHigh ? 'Urgent ' : ''}Maintenance Dispatch: Unit ${t.unit}`,
      description: `${t.tenant || 'Resident'} reported "${t.issue}". Assign a technician for inspection.`,
      severity: isHigh ? 'urgent' : 'warning',
      icon: 'tool',
      actionLabel: 'Dispatch Technician',
      actionScreen: 'manager_maintenance',
      category: 'maintenance',
      unitNumber: t.unit,
    });
  });

  // 2. Operational Disputes Awaiting Manager Response
  const pendingDisputes = (state.disputes || []).filter((d) => {
    if (d.status === 'resolved') return false;
    if (ownerId && d.ownerId !== ownerId) return false;
    if (user.assignedProperties?.length && d.propertyId && !user.assignedProperties.includes(d.propertyId)) return false;
    return d.status === 'filed' || d.status === 'under_review' || d.status === 'mediation_in_progress';
  });

  pendingDisputes.forEach((d) => {
    reminders.push({
      id: `manager_dispute_${d.id}`,
      title: `Dispute Awaiting Response: ${d.category || 'Tenant Dispute'}`,
      description: `Raised by ${d.raisedByName} regarding "${(d.statement || '').slice(0, 60)}". Provide operational resolution.`,
      severity: 'warning',
      icon: 'alert-triangle',
      actionLabel: 'Resolve Dispute',
      actionScreen: 'disputes_desk',
      category: 'approval',
    });
  });

  return reminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Compute real-time reminders for Maintenance Staff Dashboard
 */
export const getStaffReminders = (
  state: MobileAppState,
  user: MobileUserProfile | null
): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];
  const staffId = user.id || '';
  const staffName = user.displayName?.toLowerCase().trim() || '';

  const myTickets = (state.tickets || []).filter((t) => {
    if (staffId && t.assignedStaffId === staffId) return true;
    if (staffName && t.assignedStaffName?.toLowerCase().trim() === staffName) return true;
    return false;
  });

  const activeWorkOrders = myTickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed');
  activeWorkOrders.forEach((t) => {
    const isHigh = t.priority === 'High';
    reminders.push({
      id: `staff_ticket_job_${t.id}`,
      title: `${isHigh ? 'High Priority ' : ''}Work Order: ${t.issue}`,
      description: `Assigned for Unit ${t.unit}. Status: ${t.status === 'in_progress' ? 'In Progress' : 'Assigned'}. Site visit required.`,
      severity: isHigh ? 'urgent' : 'warning',
      icon: 'tool',
      actionLabel: 'Open Job Queue',
      actionScreen: 'staff_dashboard',
      category: 'maintenance',
      unitNumber: t.unit,
    });
  });

  return reminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Compute real-time reminders for Superadmin Console
 */
export const getSuperadminReminders = (
  state: MobileAppState,
  user: MobileUserProfile | null
): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];

  const overduePlatformInvoices = (state.platformInvoices || []).filter((inv) => {
    if (inv.status === 'paid') return false;
    const days = getDaysDifference(inv.dueDate);
    return days !== null && days < 0;
  });

  if (overduePlatformInvoices.length > 0) {
    const totalOverdue = overduePlatformInvoices.reduce((sum, inv) => sum + (inv.total || inv.amount || 0), 0);
    reminders.push({
      id: `superadmin_overdue_saas_${overduePlatformInvoices.length}`,
      title: `${overduePlatformInvoices.length} Landlord Platform Invoice${overduePlatformInvoices.length > 1 ? 's' : ''} Overdue ($${totalOverdue.toLocaleString()})`,
      description: `Subscription fee payments are delinquent across platform. Dispatch 1-click billing reminders.`,
      severity: 'urgent',
      icon: 'alert-triangle',
      actionLabel: 'Manage Platform Invoices',
      actionScreen: 'superadmin_invoices',
      category: 'subscription',
      amount: totalOverdue,
      currency: '$',
    });
  }

  const isTwilioConfigured = state.commsConfig?.twilioConnected || state.commsConfig?.twilioAuthToken;
  if (!isTwilioConfigured) {
    reminders.push({
      id: 'superadmin_comms_unconnected',
      title: 'SMS Gateway Credentials Incomplete',
      description: 'Configure Twilio API keys to enable live automated SMS dispatch to tenants and landlords.',
      severity: 'info',
      icon: 'bell',
      actionLabel: 'Configure Gateway',
      actionScreen: 'superadmin_connections',
      category: 'approval',
    });
  }

  return reminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};
