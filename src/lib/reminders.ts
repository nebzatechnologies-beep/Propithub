import { UserProfile, Property, Unit, PaymentTransaction, Invoice, Agreement, Ticket, PlatformSupportTicket } from '../types';
import { AppState } from './store';
import { DEFAULT_CURRENCY , DEFAULT_CURRENCY_SYMBOL } from './currencyService';

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
  actionLink: string;
  actionType?: 'navigate' | 'nudge' | 'modal' | 'settle';
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

// Helper to normalize currency symbol and code
export const resolveCurrency = (raw?: string): { code: string; symbol: string } => {
  if (!raw) return { code: DEFAULT_CURRENCY, symbol: DEFAULT_CURRENCY_SYMBOL };
  const upper = raw.trim().toUpperCase();
  if (upper === '$' || upper === 'USD') return { code: 'USD', symbol: '$' };
  if (upper === '£' || upper === 'GBP') return { code: 'GBP', symbol: '£' };
  if (upper === 'AED') return { code: 'AED', symbol: 'AED ' };
  if (upper === 'EUR' || upper === '€') return { code: 'EUR', symbol: '€' };
  if (upper === '₹' || upper === 'INR') return { code: 'INR', symbol: '₹' };
  return { code: upper, symbol: raw.trim() };
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
 * Compute real-time reminders for Tenant Dashboard
 */
export const getTenantReminders = (state: AppState, user: UserProfile | null): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];
  const tenantEmail = user.email?.toLowerCase() || '';
  const tenantName = user.displayName?.toLowerCase() || '';
  const tenantId = user.id;

  const cleanU = (s?: string) => (s || '').toLowerCase().replace(/unit\s*|apt\s*|flat\s*|#|-/gi, '').trim();

  // Active units for this tenant
  const myUnits = (state.units || []).filter((u) => {
    const isMatch =
      u.currentTenantId === tenantId ||
      (tenantEmail && u.tenant?.toLowerCase() === tenantEmail);
    return isMatch && (u.status === 'occupied' || u.status === 'reserved');
  });

  // 0. Pending Tenancy Invitations Awaiting Response
  const seenInvitationKeys = new Set<string>();
  const pendingInvitations = (state.tenancyRequests || []).filter(
    (r) =>
      r.status === 'pending' &&
      ((tenantId && r.tenantId === tenantId) ||
        (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail))
  );

  pendingInvitations.forEach((r) => {
    // Deduplicate invitations
    if (seenInvitationKeys.has(r.id)) return;
    seenInvitationKeys.add(r.id);

    // If an agreement for this exact unit and property has already been signed or progressed, suppress the initial invitation alert
    const hasProgressedAgreement = (state.agreements || []).some(
      (a) =>
        (!r.propertyId || !a.propertyId || r.propertyId === a.propertyId) &&
        (cleanU(a.unit) === cleanU(r.unitNumber) || a.unit === r.unitId) &&
        (a.tenantId === tenantId || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) &&
        a.status !== 'draft' &&
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
      actionLink: '/tenant/dashboard',
      category: 'lease',
      unitNumber: r.unitNumber,
      propertyName: r.propertyName,
    });
  });

  // 1. Check for Overdue or Upcoming Rent Invoices
  // Strictly match invoices that belong to this tenant
  const myInvoices = (state.invoices || []).filter((inv) => {
    if (inv.status === 'void' || inv.status === 'cancelled') return false;

    // Exclude invoices for units with completed move-outs or terminated settlements
    const isVacatedUnit = (() => {
      if (inv.leaseAgreementId) {
        const ag = (state.agreements || []).find((a) => a.id === inv.leaseAgreementId);
        if (ag && ag.status === 'terminated') return true;
        if (
          (state.moveouts || []).some(
            (m) =>
              (m.status === 'refund_completed' || m.status === 'settled') &&
              ((m as any).agreementId === inv.leaseAgreementId || (m as any).leaseAgreementId === inv.leaseAgreementId)
          ) ||
          (state.depositSettlements || []).some(
            (s) => (s.status === 'refunded' || (s as any).status === 'settled') && s.agreementId === inv.leaseAgreementId
          )
        ) {
          return true;
        }
      }

      const hasSettledMoveoutForUnit = (state.moveouts || []).some((m) => {
        const isDone = m.status === 'refund_completed' || m.status === 'settled';
        if (!isDone) return false;
        const matchesUnit = cleanU(m.unit) === cleanU(inv.unit) || (m as any).unitId === inv.unit;
        const matchesProp = !inv.propertyId || !((m as any).propertyId) || (m as any).propertyId === inv.propertyId;
        const matchesTenant = m.tenantId === tenantId || (tenantEmail && (m.tenant?.toLowerCase() === tenantEmail || (m as any).tenantEmail?.toLowerCase() === tenantEmail));
        if (!matchesUnit || !matchesProp || !matchesTenant) return false;
        const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.refundDate || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const invTime = new Date((inv as any).createdAt || inv.issueDate || inv.due || 0).getTime();
        if (moTime > 0 && invTime > moTime) {
          return false; // Newer invoice for re-entry!
        }
        return true;
      }) ||
      (state.depositSettlements || []).some((s) => {
        const isDone = s.status === 'refunded' || (s as any).status === 'settled';
        if (!isDone) return false;
        const matchesUnit = cleanU(s.unit) === cleanU(inv.unit);
        const matchesProp = !inv.propertyId || !s.propertyId || s.propertyId === inv.propertyId;
        const matchesTenant = s.tenantId === tenantId || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail);
        if (!matchesUnit || !matchesProp || !matchesTenant) return false;
        const sTime = new Date(s.disbursedAt || (s as any).updatedAt || s.createdAt || 0).getTime();
        const invTime = new Date((inv as any).createdAt || inv.issueDate || inv.due || 0).getTime();
        if (sTime > 0 && invTime > sTime) {
          return false; // Newer invoice for re-entry!
        }
        return true;
      });

      if (hasSettledMoveoutForUnit) return true;

      const unitObj = (state.units || []).find((u) => cleanU(u.unitNumber) === cleanU(inv.unit) || u.id === inv.unit);
      if (unitObj && unitObj.status === 'vacant') {
        return true;
      }
      return false;
    })();
    if (isVacatedUnit) return false;

    // Direct tenant ID match
    if (tenantId && inv.tenantId === tenantId) return true;
    // Direct tenant email match
    if (tenantEmail && (inv.tenantEmail?.toLowerCase() === tenantEmail || inv.tenant?.toLowerCase() === tenantEmail)) return true;
    // Unit match ONLY if the invoice has no tenantId or matches this tenant, and belongs to tenant's unit property
    const matchingUnit = myUnits.find(
      (u) =>
        (cleanU(u.unitNumber) === cleanU(inv.unit) || u.id === inv.unit) &&
        (!inv.propertyId || inv.propertyId === u.propertyId)
    );
    if (matchingUnit && (!inv.tenantId || inv.tenantId === tenantId)) return true;
    return false;
  });

  // Deduplicate rent reminders so multiple redundant/identical invoices for the same unit, property, and due date only produce ONE notice
  const seenRentCycleKeys = new Set<string>();

  // Sort invoices: prioritize canonical/earlier invoices
  const sortedInvoices = [...myInvoices].sort((a, b) => {
    const dateA = new Date(a.due || 0).getTime();
    const dateB = new Date(b.due || 0).getTime();
    return dateA - dateB;
  });

  sortedInvoices.forEach((inv) => {
    if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'void') return;

    const unitObj = myUnits.find((u) => u.unitNumber === inv.unit || u.id === inv.unit);
    const prop = state.properties?.find((p) => p.id === inv.propertyId || p.id === unitObj?.propertyId);
    const propKey = inv.propertyId || prop?.id || inv.propertyName || prop?.name || 'unknown_prop';
    const cycleKey = `${inv.unit}_${propKey}_${inv.due}_${inv.amount}`;

    if (seenRentCycleKeys.has(cycleKey)) {
      // Redundant duplicate invoice for identical cycle — skip duplicate alert
      return;
    }
    seenRentCycleKeys.add(cycleKey);

    const daysUntilDue = getDaysDifference(inv.due);
    const curr = resolveCurrency(unitObj?.currency || prop?.currency);

    // Resolve reminder days prior (Agreement override -> Owner Settings -> Default: 10 days)
    const matchingAg = (state.agreements || []).find(
      (a) =>
        (inv.leaseAgreementId && a.id === inv.leaseAgreementId) ||
        (a.unit === inv.unit && (a.status === 'active' || a.status === 'signed'))
    );
    const ownerId = matchingAg?.ownerId || prop?.ownerId || '';
    const ownerSettings = ownerId ? state.ownerSettings?.[ownerId] : undefined;
    const reminderDays = Math.max(
      1,
      Number(
        matchingAg?.rentReminderDaysPrior ??
        ownerSettings?.rentReminderDaysPrior ??
        ownerSettings?.rentalReminderConfig?.daysPrior ??
        10
      )
    );

    // Overdue Rent (Urgent)
    if (inv.status === 'overdue' || (daysUntilDue !== null && daysUntilDue < 0)) {
      const overdueDays = Math.abs(daysUntilDue || 1);
      reminders.push({
        id: `tenant_overdue_${inv.id}`,
        title: `Overdue Rent: Unit ${inv.unit}`,
        description: `Rent payment of ${curr.symbol}${(inv.total || inv.amount).toLocaleString()} is ${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue. Please settle promptly to avoid late fee penalties.`,
        severity: 'urgent',
        icon: 'alert-triangle',
        actionLabel: 'Settle Overdue Rent',
        actionLink: '/tenant/payments',
        category: 'rent',
        dueDate: inv.due,
        unitNumber: inv.unit,
        propertyName: inv.propertyName || prop?.name,
        amount: inv.total || inv.amount,
        currency: curr.symbol,
      });
    }
    // Rent Due Soon (within owner-configured threshold or 10-day default)
    else if (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= reminderDays) {
      reminders.push({
        id: `tenant_due_soon_${inv.id}`,
        title: `Rent Due in ${daysUntilDue === 0 ? 'Today' : `${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`}: Unit ${inv.unit}`,
        description: `Invoice ${inv.id} for ${curr.symbol}${(inv.total || inv.amount).toLocaleString()} is due on ${inv.due}. One-click settlement is available.`,
        severity: daysUntilDue <= 2 ? 'warning' : 'info',
        icon: 'clock',
        actionLabel: 'Pay Rent Now',
        actionLink: '/tenant/payments',
        category: 'rent',
        dueDate: inv.due,
        unitNumber: inv.unit,
        propertyName: inv.propertyName || prop?.name,
        amount: inv.total || inv.amount,
        currency: curr.symbol,
      });
    }
  });

  // 2. Lease Agreements Lifecycle Reminders
  const myAgreements = (state.agreements || []).filter((a) => {
    // 1. Direct verified tenant ID match
    if (tenantId && a.tenantId === tenantId) return true;

    // 2. Direct verified tenant email match
    if (
      tenantEmail &&
      (a.tenantEmail?.toLowerCase() === tenantEmail || (a.tenant && a.tenant.toLowerCase() === tenantEmail))
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
      // Must not belong to an explicitly different tenant
      const isOtherTenant =
        (a.tenantId && a.tenantId !== tenantId) ||
        (a.tenantEmail && tenantEmail && a.tenantEmail.toLowerCase() !== tenantEmail);
      if (!isOtherTenant) {
        if (tenantName && a.tenant && a.tenant.toLowerCase() === tenantName) return true;
        if (!a.tenantId && !a.tenantEmail) return true;
      }
    }

    return false;
  });

  // Track unique agreement notices to prevent duplicate alerts for the same unit & property
  const seenAgreementKeys = new Set<string>();

  // Sort agreements so newer / more advanced statuses take precedence
  const sortedAgreements = [...myAgreements].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.start || 0).getTime();
    const timeB = new Date(b.createdAt || b.start || 0).getTime();
    return timeB - timeA;
  });

  sortedAgreements.forEach((a) => {
    if (a.status === 'terminated' || a.status === 'rejected') return;
    const propKey = a.propertyId || 'unknown_prop';
    const agreementKey = `${cleanU(a.unit)}_${propKey}_${a.status}`;
    if (seenAgreementKeys.has(agreementKey)) {
      return;
    }
    seenAgreementKeys.add(agreementKey);

    const isAgreementVacated =
      (state.moveouts || []).some((m) => {
        const isDone = m.status === 'refund_completed' || m.status === 'settled';
        if (!isDone) return false;
        if (m.agreementId === a.id) return true;
        const matchesUnit = cleanU(m.unit) === cleanU(a.unit);
        const matchesTenant = m.tenantId === tenantId || (tenantEmail && m.tenant?.toLowerCase() === tenantEmail);
        if (!matchesUnit || !matchesTenant) return false;
        const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.refundDate || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const agTime = new Date(a.createdAt || a.start || 0).getTime();
        if (moTime > 0 && agTime > moTime) {
          return false; // Newer agreement for re-entry!
        }
        return true;
      }) ||
      (state.depositSettlements || []).some((s) => {
        const isDone = s.status === 'refunded' || (s as any).status === 'settled';
        if (!isDone) return false;
        if (s.agreementId === a.id) return true;
        const matchesUnit = cleanU(s.unit) === cleanU(a.unit);
        const matchesTenant = s.tenantId === tenantId || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail);
        if (!matchesUnit || !matchesTenant) return false;
        const sTime = new Date(s.disbursedAt || (s as any).updatedAt || s.createdAt || 0).getTime();
        const agTime = new Date(a.createdAt || a.start || 0).getTime();
        if (sTime > 0 && agTime > sTime) {
          return false; // Newer agreement for re-entry!
        }
        return true;
      });
    if (isAgreementVacated) return;

    const prop = (state.properties || []).find((p) => p.id === a.propertyId);
    const curr = resolveCurrency(prop?.currency);

    // Physical Signature Required (Gated: only if invitation accepted)
    if (a.status === 'awaiting_tenant_signature' || a.status === 'awaiting_tenant_upload') {
      const pendingInvitation = (state.tenancyRequests || []).find(
        (r) =>
          r.status === 'pending' &&
          (r.tenantId === tenantId || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail)) &&
          (!r.propertyId || !a.propertyId || r.propertyId === a.propertyId) &&
          (cleanU(r.unitNumber) === cleanU(a.unit) || r.unitId === a.unit)
      );

      if (!pendingInvitation) {
        reminders.push({
          id: `tenant_sign_${a.id}`,
          title: `Lease Agreement Awaiting Your Signature`,
          description: `Tenancy agreement for Unit ${a.unit} is ready for execution. Please sign and upload your copy to formalize the lease.`,
          severity: 'warning',
          icon: 'file-text',
          actionLabel: 'Review & Sign Lease',
          actionLink: '/tenant/lease',
          category: 'lease',
          unitNumber: a.unit,
          propertyName: prop?.name || undefined,
        });
      }
    }

    // Signed Copy Under Landlord Review
    if (a.status === 'pending_approval') {
      reminders.push({
        id: `tenant_under_review_${a.id}`,
        title: `Signed Lease Under Landlord Review: Unit ${a.unit}`,
        description: `Your signed document has been submitted. Your landlord is reviewing the agreement to approve and unlock your security deposit payment.`,
        severity: 'info',
        icon: 'clock',
        actionLabel: 'View Lease Status',
        actionLink: '/tenant/lease',
        category: 'lease',
        unitNumber: a.unit,
        propertyName: prop?.name || undefined,
      });
    }

    // Cross-reference linked deposit invoice defensively
    const depInv = (state.invoices || []).find(
      (inv) =>
        (inv.leaseAgreementId === a.id ||
          inv.id === a.depositInvoiceId ||
          ((inv.invoiceType === 'deposit' || inv.type === 'deposit') &&
            (!a.propertyId || !inv.propertyId || inv.propertyId === a.propertyId) &&
            (cleanU(inv.unit) === cleanU(a.unit) || inv.unit === a.unit))) &&
        (inv.invoiceType === 'deposit' || inv.type === 'deposit')
    );
    const isDepositSettled = a.depositStatus === 'paid' || depInv?.status === 'paid';

    // Security Deposit Unlocked & Ready for Settlement
    if (
      (a.status === 'pending_deposit' || (a.status === 'active' && a.depositStatus === 'unpaid')) &&
      !isDepositSettled
    ) {
      reminders.push({
        id: `tenant_deposit_${a.id}`,
        title: `Move-In Security Deposit Due: Unit ${a.unit}`,
        description: `Your landlord has approved your lease! Settle your refundable security deposit of ${curr.symbol}${(a.deposit || 0).toLocaleString()} to finalize move-in and receive keys.`,
        severity: 'urgent',
        icon: 'credit-card',
        actionLabel: 'Settle Deposit Online',
        actionLink: '/tenant/payments',
        category: 'deposit',
        unitNumber: a.unit,
        propertyName: prop?.name || undefined,
        amount: a.deposit,
        currency: curr.symbol,
      });
    }



    // Lease Expiring in Next 60 Days
    if (a.status === 'active' || a.status === 'signed') {
      const daysLeft = getDaysDifference(a.end);
      if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 60) {
        reminders.push({
          id: `tenant_lease_expiry_${a.id}`,
          title: `Lease Renewal Notice: Unit ${a.unit}`,
          description: `Your tenancy term concludes in ${daysLeft} days (on ${a.end}). Review lease details to request extension or coordinate move-out.`,
          severity: daysLeft <= 15 ? 'warning' : 'info',
          icon: 'calendar',
          actionLabel: 'View Lease & Renewal Options',
          actionLink: '/tenant/lease',
          category: 'lease',
          dueDate: a.end,
          unitNumber: a.unit,
          propertyName: prop?.name || undefined,
        });
      }
    }
  });

  // 3. Move-Out Inspection & Refund Status
  const myMoveouts = (state.moveouts || []).filter(
    (m) =>
      (tenantId && m.tenantId === tenantId) ||
      (tenantEmail && (m as any).tenantEmail?.toLowerCase() === tenantEmail)
  );

  myMoveouts.forEach((m) => {
    if (m.status === 'inspection_scheduled') {
      reminders.push({
        id: `tenant_inspection_${m.id}`,
        title: `Move-Out Inspection on ${m.inspectionDate || 'Upcoming Date'}`,
        description: `Inspection for Unit ${m.unit} is scheduled with your landlord. Review checklist and coordinate keys handover.`,
        severity: 'info',
        icon: 'calendar',
        actionLabel: 'View Move-Out Checklist',
        actionLink: '/tenant/lease',
        category: 'occupancy',
        unitNumber: m.unit,
      });
    } else if (m.status === 'refund_completed' && m.completedAt) {
      const daysSinceRefund = getDaysDifference(m.completedAt);
      if (daysSinceRefund !== null && Math.abs(daysSinceRefund) <= 7) {
        reminders.push({
          id: `tenant_refund_done_${m.id}`,
          title: `Security Deposit Refund Disbursed`,
          description: `Final deposit refund settlement of ${m.currency || DEFAULT_CURRENCY_SYMBOL}${(m.finalRefundAmount || m.deposit || 0).toLocaleString()} for Unit ${m.unit} has been processed.`,
          severity: 'positive',
          icon: 'credit-card',
          actionLabel: 'View Payout Receipt',
          actionLink: '/tenant/payments',
          category: 'deposit',
          unitNumber: m.unit,
        });
      }
    }
  });

  // 4. In-Progress Maintenance Tickets
  const activeTickets = (state.tickets || []).filter(
    (t) =>
      (t.tenantId === tenantId || (tenantEmail && (t as any).tenantEmail?.toLowerCase() === tenantEmail)) &&
      t.status === 'in_progress'
  );

  if (activeTickets.length > 0) {
    const firstTicket = activeTickets[0];
    reminders.push({
      id: `tenant_ticket_${firstTicket.id}`,
      title: `Maintenance Update: ${firstTicket.issue}`,
      description: `Ticket #${firstTicket.id} is marked IN PROGRESS. Landlord contractor has been assigned for resolution.`,
      severity: 'positive',
      icon: 'tool',
      actionLabel: 'View Ticket Progress',
      actionLink: '/tenant/support',
      category: 'maintenance',
      unitNumber: firstTicket.unit,
    });
  }

  // 5. Resolved Maintenance Work Awaiting Resident Rating
  const unratedResolved = (state.tickets || []).filter(
    (t) =>
      (t.tenantId === tenantId || (tenantEmail && (t as any).tenantEmail?.toLowerCase() === tenantEmail)) &&
      t.status === 'resolved' &&
      !(t as any).rating
  );

  if (unratedResolved.length > 0) {
    const firstUnrated = unratedResolved[0];
    reminders.push({
      id: `tenant_rate_ticket_${firstUnrated.id}`,
      title: `Work Completed: Rate Technician (${firstUnrated.issue})`,
      description: `Repair for Unit ${firstUnrated.unit} was marked complete by ${firstUnrated.assignedTo || 'technician'}. Submit feedback to finalize ticket.`,
      severity: 'info',
      icon: 'tool',
      actionLabel: 'Rate Technician',
      actionLink: '/tenant/support',
      category: 'maintenance',
      unitNumber: firstUnrated.unit,
    });
  }

  // Sort by priority: urgent -> warning -> info -> positive
  const priorityOrder: Record<ReminderSeverity, number> = {
    urgent: 1,
    warning: 2,
    info: 3,
    positive: 4,
  };

  // Deduplicate any identical reminders across sections
  const seenReminderKeys = new Set<string>();
  const uniqueReminders = reminders.filter((r) => {
    const key = `${r.title}::${r.unitNumber || ''}::${r.propertyName || ''}::${r.category}`;
    if (seenReminderKeys.has(key)) return false;
    seenReminderKeys.add(key);
    return true;
  });

  return uniqueReminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Compute real-time reminders for Owner Dashboard
 */
export const getOwnerReminders = (
  state: AppState,
  ownerId: string,
  filterPropertyId = 'all',
  filterCurrency = 'all'
): DashboardReminder[] => {
  if (!ownerId) return [];

  const myProperties = (state.properties || []).filter((p) => p.ownerId === ownerId);
  // Brand new owner or owner with 0 properties has no active portfolio — return clean slate
  if (myProperties.length === 0) return [];

  const myPropertyIds = new Set(myProperties.map((p) => p.id));
  const myUnits = (state.units || []).filter(
    (u) => (u.ownerId && u.ownerId === ownerId) || (u.propertyId && myPropertyIds.has(u.propertyId))
  );

  // Helper to test if a property matches the active filter
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

  // 1. Overdue Tenant Payments (Urgent)
  const overduePayments = (state.payments || []).filter((p) => {
    if (p.status !== 'overdue') return false;
    const unitObj = myUnits.find((u) => u.id === p.unit || u.unitNumber === p.unit);
    const prop = myProperties.find((pr) => pr.id === (p.propertyId || unitObj?.propertyId));
    if (!prop) return false;
    if (p.ownerId && p.ownerId !== ownerId) return false;

    // Exclude payments for units where move-out is concluded, deposit settled, or unit is vacant
    const isMoveOutSettled =
      (state.moveouts || []).some(
        (m) =>
          (m.status === 'refund_completed' || m.status === 'settled') &&
          (m.unit === p.unit || (m as any).unitId === p.unit) &&
          (!p.propertyId || !((m as any).propertyId) || (m as any).propertyId === p.propertyId)
      ) ||
      (state.depositSettlements || []).some(
        (s) =>
          (s.status === 'refunded' || (s.status as string) === 'settled') &&
          s.unit === p.unit &&
          (!p.propertyId || !s.propertyId || s.propertyId === p.propertyId)
      );
    if (isMoveOutSettled) return false;

    // Exclude if unit is currently vacant
    if (unitObj && unitObj.status === 'vacant') return false;

    return matchesFilter(prop.id, unitObj?.currency || prop.currency);
  });

  if (overduePayments.length > 0) {
    // Group overdue amounts by currency
    const overdueSummaryMap: Record<string, { total: number; symbol: string; count: number }> = {};
    overduePayments.forEach((p) => {
      const unitObj = myUnits.find((u) => u.id === p.unit || u.unitNumber === p.unit);
      const prop = myProperties.find((pr) => pr.id === (p.propertyId || unitObj?.propertyId));
      const curr = resolveCurrency(unitObj?.currency || prop?.currency);
      if (!overdueSummaryMap[curr.code]) {
        overdueSummaryMap[curr.code] = { total: 0, symbol: curr.symbol, count: 0 };
      }
      overdueSummaryMap[curr.code].total += p.amount;
      overdueSummaryMap[curr.code].count += 1;
    });

    const breakdownStr = Object.values(overdueSummaryMap)
      .map((item) => `${item.symbol}${item.total.toLocaleString()}`)
      .join(' + ');

    reminders.push({
      id: 'owner_overdue_delinquencies',
      title: `${overduePayments.length} Tenant Payment${overduePayments.length > 1 ? 's' : ''} Overdue`,
      description: `Outstanding overdue balance across portfolio totals ${breakdownStr}. Send 1-click payment reminders to delinquent tenants.`,
      severity: 'urgent',
      icon: 'alert-triangle',
      actionLabel: 'Send Reminders to Tenants',
      actionLink: '/owner/payments',
      actionType: 'nudge',
      category: 'rent',
    });
  }

  // 2. Signed Lease Agreements Awaiting Owner Review & Approval (Urgent)
  const pendingApprovalAgreements = (state.agreements || []).filter((a) => {
    if (a.status !== 'pending_approval') return false;
    if (a.ownerId !== ownerId && !myPropertyIds.has(a.propertyId)) return false;
    const prop = myProperties.find((pr) => pr.id === a.propertyId);
    if (!prop) return false;
    return matchesFilter(prop.id, prop.currency);
  });

  pendingApprovalAgreements.forEach((a) => {
    const prop = myProperties.find((pr) => pr.id === a.propertyId);
    reminders.push({
      id: `owner_approve_lease_${a.id}`,
      title: `Signed Lease Uploaded: Unit ${a.unit}`,
      description: `${a.tenant} has signed and uploaded their lease agreement for Unit ${a.unit} (${prop?.name || 'Property'}). Review and approve document to unlock security deposit payment.`,
      severity: 'urgent',
      icon: 'file-text',
      actionLabel: 'Review & Approve Lease',
      actionLink: '/owner/leasing',
      category: 'approval',
      unitNumber: a.unit,
      propertyName: prop?.name,
    });
  });

  // 4. Offline Payment Proofs Pending Confirmation
  const pendingProofs = (state.payments || []).filter((p) => {
    if (p.status !== 'pending_confirmation') return false;
    const unitObj = myUnits.find((u) => u.id === p.unit || u.unitNumber === p.unit);
    const prop = myProperties.find((pr) => pr.id === (p.propertyId || unitObj?.propertyId));
    if (!prop) return false;
    if (p.ownerId && p.ownerId !== ownerId) return false;
    return matchesFilter(prop.id, unitObj?.currency || prop.currency);
  });

  if (pendingProofs.length > 0) {
    reminders.push({
      id: 'owner_pending_proofs',
      title: `${pendingProofs.length} Offline Payment Proof${pendingProofs.length > 1 ? 's' : ''} Awaiting Verification`,
      description: `Residents have submitted bank transfer receipts. Verify funds in your bank account and approve to issue official settled receipts.`,
      severity: 'warning',
      icon: 'credit-card',
      actionLabel: 'Review & Verify Proofs',
      actionLink: '/owner/payments',
      category: 'approval',
    });
  }

  // 5. Tenant Move-Out / Vacate Notices Received
  const pendingMoveouts = (state.moveouts || []).filter((m) => {
    if (m.status !== 'requested') return false;
    const unitObj = myUnits.find((u) => u.id === m.unit || u.unitNumber === m.unit);
    const prop = myProperties.find((pr) => pr.id === ((m as any).propertyId || unitObj?.propertyId));
    if (!prop) return false;
    if (m.ownerId && m.ownerId !== ownerId && !myPropertyIds.has(prop.id)) return false;
    return matchesFilter(prop.id, m.currency || prop.currency);
  });

  pendingMoveouts.forEach((m) => {
    reminders.push({
      id: `owner_moveout_notice_${m.id}`,
      title: `Move-Out Notice: Unit ${m.unit}`,
      description: `${m.tenant} submitted move-out notice effective ${m.moveOutDate}. Schedule inspection to coordinate security deposit refund settlement.`,
      severity: 'warning',
      icon: 'calendar',
      actionLabel: 'Schedule Move-Out Inspection',
      actionLink: '/owner/vacates',
      category: 'occupancy',
      unitNumber: m.unit,
    });
  });

  // 6. Move-Out Inspections Completed & Deposit Refund Pending Settlement
  const inspectedMoveouts = (state.moveouts || []).filter((m) => {
    if (m.status !== 'inspected' && m.status !== 'refund_scheduled') return false;
    const unitObj = myUnits.find((u) => u.id === m.unit || u.unitNumber === m.unit);
    const prop = myProperties.find((pr) => pr.id === ((m as any).propertyId || unitObj?.propertyId));
    if (!prop) return false;
    if (m.ownerId && m.ownerId !== ownerId && !myPropertyIds.has(prop.id)) return false;
    return matchesFilter(prop.id, m.currency || prop.currency);
  });

  inspectedMoveouts.forEach((m) => {
    reminders.push({
      id: `owner_settle_refund_${m.id}`,
      title: `Deposit Refund Settlement Due: Unit ${m.unit}`,
      description: `Move-out inspection concluded for ${m.tenant}. Finalize deductions and disburse deposit refund to complete tenant checkout.`,
      severity: 'warning',
      icon: 'credit-card',
      actionLabel: 'Settle Deposit Refund',
      actionLink: '/owner/vacates',
      category: 'deposit',
      unitNumber: m.unit,
    });
  });

  // 7. Upcoming Rent Scheduled in next 5 days
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
      description: `Automated tenant billing cycle is scheduled for collection. Monitored through Propithub cloud trust ledger.`,
      severity: 'info',
      icon: 'clock',
      actionLabel: 'View Invoice Roll',
      actionLink: '/owner/payments',
      category: 'rent',
    });
  }

  // 8. Vacant Unlisted Units in Portfolio (Ready for Market)
  const unlistedVacantUnits = myUnits.filter((u) => {
    if (u.status !== 'vacant' || u.isListedPublicly) return false;
    const prop = myProperties.find((p) => p.id === u.propertyId);
    if (!prop) return false;
    return matchesFilter(u.propertyId, u.currency);
  });

  if (unlistedVacantUnits.length > 0) {
    const firstUnit = unlistedVacantUnits[0];
    const prop = myProperties.find((p) => p.id === firstUnit.propertyId);
    reminders.push({
      id: `owner_unlisted_units_${unlistedVacantUnits.length}`,
      title: `${unlistedVacantUnits.length} Vacant Unit${unlistedVacantUnits.length > 1 ? 's' : ''} Ready for Market`,
      description: `Unit ${firstUnit.unitNumber} (${prop?.name || 'Property'}) is vacant and unlisted. Publish to public directory to attract prospective tenants.`,
      severity: 'info',
      icon: 'bell',
      actionLabel: 'Publish Units to Market',
      actionLink: '/owner/properties',
      category: 'occupancy',
    });
  }

  // 9. Lease Agreements Expiring within 60 days
  const expiringLeases = (state.agreements || []).filter((a) => {
    if (a.status !== 'active' && a.status !== 'signed') return false;
    if (a.ownerId !== ownerId && !myPropertyIds.has(a.propertyId)) return false;
    const prop = myProperties.find((pr) => pr.id === a.propertyId);
    if (!prop) return false;
    if (!matchesFilter(prop.id, prop.currency)) return false;
    const days = getDaysDifference(a.end);
    return days !== null && days >= 0 && days <= 60;
  });

  if (expiringLeases.length > 0) {
    const firstLease = expiringLeases[0];
    const firstProp = myProperties.find((pr) => pr.id === firstLease.propertyId);
    const daysLeft = getDaysDifference(firstLease.end) || 0;
    reminders.push({
      id: `owner_expiring_leases_${expiringLeases.length}`,
      title: `${expiringLeases.length} Lease Agreement${expiringLeases.length > 1 ? 's' : ''} Expiring Soon`,
      description: `Unit ${firstLease.unit} (${firstProp?.name || 'Property'}) lease expires in ${daysLeft} days (on ${firstLease.end}). Proactively offer renewal terms or prepare unit for re-listing.`,
      severity: daysLeft <= 20 ? 'warning' : 'info',
      icon: 'calendar',
      actionLabel: 'Manage Lease Renewals',
      actionLink: '/owner/leasing',
      category: 'lease',
    });
  }

  // 10. Urgent Open Maintenance Tickets
  const urgentTickets = (state.tickets || []).filter((t) => {
    if (t.status === 'resolved' || t.priority !== 'High') return false;
    if (t.ownerId !== ownerId && (!t.propertyId || !myPropertyIds.has(t.propertyId))) return false;
    return true;
  });

  if (urgentTickets.length > 0) {
    const firstTicket = urgentTickets[0];
    reminders.push({
      id: `owner_urgent_ticket_${firstTicket.id}`,
      title: `High Priority Maintenance: ${firstTicket.issue} (Unit ${firstTicket.unit})`,
      description: `Critical repair request logged by tenant ${firstTicket.tenant || 'Resident'}. Immediate contractor assignment recommended.`,
      severity: 'urgent',
      icon: 'tool',
      actionLabel: 'Dispatch Contractor',
      actionLink: '/owner/maintenance',
      category: 'maintenance',
    });
  }

  // 11. SaaS Subscription Trial Expiry & Quota Alerts
  const ownerSettings = state.ownerSettings?.[ownerId];
  const hasPaidPlatformInvoice = (state.platformInvoices || []).some(
    (inv) => inv.ownerId === ownerId && inv.status === 'paid' && (!inv.periodEnd || new Date(inv.periodEnd).getTime() > Date.now())
  );
  if (!hasPaidPlatformInvoice && ownerSettings?.planStatus === 'trialing' && ownerSettings.trialEndsAt) {
    const trialDaysLeft = getDaysDifference(ownerSettings.trialEndsAt);
    if (trialDaysLeft !== null && trialDaysLeft <= 7) {
      reminders.push({
        id: 'owner_trial_expiring',
        title: `Free Trial Expiring in ${trialDaysLeft <= 0 ? 'Today' : `${trialDaysLeft} Day${trialDaysLeft > 1 ? 's' : ''}`}`,
        description: `Your Propithub workspace trial is concluding soon. Upgrade your plan to prevent lease and billing disruption.`,
        severity: trialDaysLeft <= 2 ? 'urgent' : 'warning',
        icon: 'clock',
        actionLabel: 'Upgrade Subscription',
        actionLink: '/owner/settings',
        category: 'subscription',
      });
    }
  }

  // 12. Outstanding Platform Invoices
  const openPlatformInvoices = (state.platformInvoices || []).filter(
    (inv) => inv.ownerId === ownerId && inv.status !== 'paid' && inv.status !== 'void'
  );
  if (openPlatformInvoices.length > 0) {
    const firstInv = openPlatformInvoices[0];
    const isOverdue = firstInv.status === 'overdue';
    reminders.push({
      id: `owner_saas_invoice_${firstInv.id}`,
      title: `Propithub Platform SaaS Invoice ${isOverdue ? 'Overdue' : 'Due'}: $${(firstInv.amount || 0).toLocaleString()}`,
      description: `Invoice ${firstInv.id} for your Propithub monthly tier is open. Settle online to maintain active features.`,
      severity: isOverdue ? 'urgent' : 'warning',
      icon: 'credit-card',
      actionLabel: 'Settle Platform Fee',
      actionLink: '/owner/settings',
      category: 'subscription',
      amount: firstInv.amount,
      currency: '$',
    });
  }

  // Sort by priority
  const priorityOrder: Record<ReminderSeverity, number> = {
    urgent: 1,
    warning: 2,
    info: 3,
    positive: 4,
  };

  return reminders.sort((a: DashboardReminder, b: DashboardReminder) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Compute real-time reminders for Property Manager Operations Desk & Bell
 */
export const getManagerReminders = (
  state: AppState,
  user: UserProfile | null
): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];
  const ownerId = user.ownerId || '';
  const ownerName = user.ownerName || '';

  // Scoped units and properties for this manager
  const myUnits = (state.units || []).filter((u) => (ownerId ? u.ownerId === ownerId : true));
  const myProperties = (state.properties || []).filter((p) => (ownerId ? p.ownerId === ownerId : true));
  const myPropertyIds = new Set(myProperties.map((p) => p.id));

  // 1. Unassigned or Open Maintenance Tickets awaiting dispatch
  const openTickets = (state.tickets || []).filter((t) => {
    if (t.status === 'resolved') return false;
    if (ownerId && t.ownerId && t.ownerId !== ownerId) return false;
    return t.status === 'open' || !t.assignedStaffId || !t.assignedTo;
  });

  openTickets.forEach((t) => {
    const isHigh = t.priority === 'High';
    reminders.push({
      id: `manager_ticket_open_${t.id}`,
      title: `${isHigh ? 'Urgent ' : ''}Maintenance Dispatch: Unit ${t.unit}`,
      description: `${t.tenant || 'Resident'} reported "${t.issue}". Assign a maintenance technician for inspection.`,
      severity: isHigh ? 'urgent' : 'warning',
      icon: 'tool',
      actionLabel: 'Dispatch Technician',
      actionLink: '/manager/maintenance',
      category: 'maintenance',
      unitNumber: t.unit,
    });
  });

  // 2. Critical in-progress repairs needing manager oversight
  const urgentInProgressTickets = (state.tickets || []).filter((t) => {
    if (t.status !== 'in_progress' || t.priority !== 'High') return false;
    if (ownerId && t.ownerId && t.ownerId !== ownerId) return false;
    return true;
  });

  urgentInProgressTickets.forEach((t) => {
    reminders.push({
      id: `manager_ticket_urgent_${t.id}`,
      title: `Critical Repair in Progress: Unit ${t.unit}`,
      description: `High-priority issue "${t.issue}" assigned to ${t.assignedTo || 'technician'}. Active oversight required.`,
      severity: 'urgent',
      icon: 'alert-triangle',
      actionLabel: 'View Ticket',
      actionLink: '/manager/maintenance',
      category: 'maintenance',
      unitNumber: t.unit,
    });
  });

  // 3. Signed Lease Agreements Awaiting Verification & Approval
  const pendingApprovalLeases = (state.agreements || []).filter((a) => {
    if (a.status !== 'pending_approval') return false;
    if (ownerId && a.ownerId && a.ownerId !== ownerId) return false;
    if (a.propertyId && myPropertyIds.size > 0 && !myPropertyIds.has(a.propertyId)) return false;
    return true;
  });

  pendingApprovalLeases.forEach((a) => {
    reminders.push({
      id: `manager_lease_approve_${a.id}`,
      title: `Signed Lease Awaiting Review: Unit ${a.unit}`,
      description: `${a.tenant || 'Tenant'} has signed and uploaded their agreement for Unit ${a.unit}. Verify documents to unlock move-in deposit.`,
      severity: 'urgent',
      icon: 'file-text',
      actionLabel: 'Review Lease',
      actionLink: '/manager/leasing',
      category: 'lease',
      unitNumber: a.unit,
    });
  });

  // 5. Vacant Unlisted Units
  const vacantUnlisted = myUnits.filter((u) => u.status === 'vacant' && !u.isListedPublicly);
  if (vacantUnlisted.length > 0) {
    const firstUnit = vacantUnlisted[0];
    reminders.push({
      id: `manager_vacant_${vacantUnlisted.length}`,
      title: `${vacantUnlisted.length} Vacant Unit${vacantUnlisted.length > 1 ? 's' : ''} Ready for Market`,
      description: `Unit ${firstUnit.unitNumber || firstUnit.id} is vacant and unlisted. Coordinate listing to minimize vacancy loss.`,
      severity: 'info',
      icon: 'bell',
      actionLabel: 'View Managed Units',
      actionLink: '/manager/properties',
      category: 'occupancy',
    });
  }

  // Priority sorting
  const priorityOrder: Record<ReminderSeverity, number> = {
    urgent: 1,
    warning: 2,
    info: 3,
    positive: 4,
  };

  return reminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Compute real-time reminders for Maintenance Staff Dashboard & Bell
 */
export const getStaffReminders = (
  state: AppState,
  user: UserProfile | null
): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];
  const staffId = user.id || '';
  const staffName = user.displayName?.toLowerCase() || '';

  // Tickets assigned to this staff member
  const myTickets = (state.tickets || []).filter((t) => {
    if (staffId && t.assignedStaffId === staffId) return true;
    if (staffName && t.assignedTo?.toLowerCase() === staffName) return true;
    return false;
  });

  // 1. Active work orders assigned to staff (open, assigned, or in_progress)
  const activeWorkOrders = myTickets.filter((t) => t.status !== 'resolved');

  activeWorkOrders.forEach((t) => {
    const isHigh = t.priority === 'High';
    reminders.push({
      id: `staff_ticket_job_${t.id}`,
      title: `${isHigh ? 'High Priority ' : ''}Work Order: ${t.issue}`,
      description: `Assigned for Unit ${t.unit}. Status: ${t.status === 'in_progress' ? 'In Progress' : 'Assigned'}. Site visit required.`,
      severity: isHigh ? 'urgent' : 'warning',
      icon: 'tool',
      actionLabel: 'Open Job Queue',
      actionLink: '/staff/dashboard',
      category: 'maintenance',
      unitNumber: t.unit,
    });
  });

  // 2. Task Fees with Payment Proof Submitted (pending staff confirmation)
  const pendingProofPayments = myTickets.filter(
    (t) => t.payment && t.payment.status === 'pending_approval'
  );

  pendingProofPayments.forEach((t) => {
    const payer = t.payment.payer === 'tenant' ? (t.tenant || 'Resident') : 'Property Owner';
    const ticketCurr = (t as any).currency || (t.propertyId ? state.properties.find((p) => p.id === t.propertyId)?.currency : null) || DEFAULT_CURRENCY;
    reminders.push({
      id: `staff_payment_pending_${t.id}`,
      title: `Task Fee Submitted: Unit ${t.unit}`,
      description: `${payer} submitted payment proof for ${ticketCurr}${(t.payment.amount || 0).toLocaleString()} (${t.issue}). Confirm receipt to settle.`,
      severity: 'warning',
      icon: 'credit-card',
      actionLabel: 'Confirm Payment',
      actionLink: '/staff/payments',
      category: 'approval',
      unitNumber: t.unit,
      amount: t.payment.amount || 0,
    });
  });

  // 3. Completed Jobs Awaiting Task Fee Payment
  const awaitingPaymentTickets = myTickets.filter(
    (t) => t.status === 'resolved' && t.payment && t.payment.status === 'awaiting_payment'
  );

  if (awaitingPaymentTickets.length > 0) {
    const totalAwaiting = awaitingPaymentTickets.reduce((sum, t) => sum + (t.payment.amount || 0), 0);
    const feeCurrency = (awaitingPaymentTickets[0] as any)?.currency || state.properties[0]?.currency || DEFAULT_CURRENCY;
    reminders.push({
      id: `staff_fees_awaiting_${awaitingPaymentTickets.length}`,
      title: `${awaitingPaymentTickets.length} Task Fee${awaitingPaymentTickets.length > 1 ? 's' : ''} Awaiting Payment (${feeCurrency}${totalAwaiting.toLocaleString()})`,
      description: `Completed jobs have outstanding technician payments. Send 1-click reminders to collect fees.`,
      severity: 'info',
      icon: 'clock',
      actionLabel: 'View Task Payments',
      actionLink: '/staff/payments',
      category: 'rent',
    });
  }

  // Priority sorting
  const priorityOrder: Record<ReminderSeverity, number> = {
    urgent: 1,
    warning: 2,
    info: 3,
    positive: 4,
  };

  return reminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

/**
 * Compute real-time reminders for Superadmin Console & Notification Bell
 */
export const getSuperadminReminders = (
  state: AppState,
  user: UserProfile | null
): DashboardReminder[] => {
  if (!user) return [];
  const reminders: DashboardReminder[] = [];

  // 1. Overdue Platform SaaS Invoices from Landlords / Owners
  const overduePlatformInvoices = (state.platformInvoices || []).filter((inv) => inv.status === 'overdue');
  if (overduePlatformInvoices.length > 0) {
    const totalOverdue = overduePlatformInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    reminders.push({
      id: `superadmin_overdue_saas_${overduePlatformInvoices.length}`,
      title: `${overduePlatformInvoices.length} Landlord Platform Invoice${overduePlatformInvoices.length > 1 ? 's' : ''} Overdue ($${totalOverdue.toLocaleString()})`,
      description: `Subscription fee payments are delinquent across platform. Dispatch 1-click billing reminders to affected owners.`,
      severity: 'urgent',
      icon: 'alert-triangle',
      actionLabel: 'Manage Platform Invoices',
      actionLink: '/superadmin/invoices',
      category: 'subscription',
      amount: totalOverdue,
      currency: '$',
    });
  }

  // 2. Landlord Trial Accounts Expiring within 5 days
  const trialingOwners = (state.users || []).filter((u) => {
    if (u.role !== 'owner') return false;
    const settings = state.ownerSettings?.[u.id];
    if (settings?.planStatus === 'trialing' && settings.trialEndsAt) {
      const days = getDaysDifference(settings.trialEndsAt);
      return days !== null && days >= 0 && days <= 5;
    }
    return false;
  });

  if (trialingOwners.length > 0) {
    reminders.push({
      id: `superadmin_trials_expiring_${trialingOwners.length}`,
      title: `${trialingOwners.length} Landlord Trial${trialingOwners.length > 1 ? 's' : ''} Expiring Soon`,
      description: `Owners nearing trial conclusion. Follow up to facilitate subscription conversion.`,
      severity: 'warning',
      icon: 'clock',
      actionLabel: 'Review Trial Users',
      actionLink: '/superadmin/users',
      category: 'subscription',
    });
  }

  // 3. Unresolved Helpdesk Disputes Escalated to Superadmin
  const escalatedTickets = (state.platformSupport || []).filter(
    (t: PlatformSupportTicket) => t.status !== 'resolved' && (t.priority === 'urgent' || (t as any).escalatedToAdmin)
  );

  if (escalatedTickets.length > 0) {
    reminders.push({
      id: `superadmin_escalated_tickets_${escalatedTickets.length}`,
      title: `${escalatedTickets.length} Escalated Helpdesk Ticket${escalatedTickets.length > 1 ? 's' : ''} Awaiting Admin Action`,
      description: `Platform members requested operational mediation. Resolve tickets to ensure SLA compliance.`,
      severity: 'urgent',
      icon: 'tool',
      actionLabel: 'Open Helpdesk Console',
      actionLink: '/superadmin/support',
      category: 'compliance',
    });
  }

  // 4. API Integration Verification Warnings (Mock or Disconnected)
  const isStripeConfigured = state.platformGateways?.stripe?.connected || state.platformGateways?.stripe?.secretKey;
  const isTwilioConfigured = state.commsConfig?.twilioConnected || state.commsConfig?.twilioAuthToken;
  if (!isStripeConfigured || !isTwilioConfigured) {
    reminders.push({
      id: 'superadmin_gateway_unconnected',
      title: 'Payment or SMS Gateways Incomplete',
      description: 'Configure Twilio or Stripe production API keys to enable live automated SMS and gateway collections.',
      severity: 'info',
      icon: 'bell',
      actionLabel: 'Configure API Keys',
      actionLink: '/superadmin/connections',
      category: 'approval',
    });
  }

  const priorityOrder: Record<ReminderSeverity, number> = {
    urgent: 1,
    warning: 2,
    info: 3,
    positive: 4,
  };

  return reminders.sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);
};

