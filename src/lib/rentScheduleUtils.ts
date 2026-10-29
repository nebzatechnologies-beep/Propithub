import { Agreement, Invoice, OwnerSettings, PaymentTransaction, Property, TenantRecord } from '../types';
import { DEFAULT_CURRENCY } from './currencyService';

export interface RentCycleItem {
  id: string; // unique key e.g. "rent_cycle_prop-1_A-101_2026-10-01"
  cycleNumber: number; // 1, 2, 3...
  cycleLabel: string; // e.g. "Month 1 (Move-in)" or "Month 3"
  monthName: string; // e.g. "October 2026"
  dueDate: string; // YYYY-MM-DD
  amount: number; // Real agreement rent
  currency: string;
  propertyName: string;
  propertyId: string;
  unitNumber: string;
  isMoveInMonth: boolean;
  isRenewalCycle?: boolean;
  percentageIncrease?: number;
  status: 'paid' | 'pending_confirmation' | 'due_now' | 'due_soon' | 'overdue' | 'upcoming';
  invoiceId?: string;
  invoiceStatus?: string;
  paidAt?: string;
  paymentMethod?: string;
  transactionRef?: string;
  isDepositPending?: boolean;
  depositAmount?: number;
  depositInvoiceId?: string;
}

export interface RentScheduleResult {
  currentDueItem: RentCycleItem | null;
  upcomingDues: RentCycleItem[];
  historyDues: RentCycleItem[];
  totalCyclesCount: number;
  paidCyclesCount: number;
  pendingCyclesCount: number;
}

/**
 * Builds an exact, real-data monthly rent schedule from agreement start date to end date,
 * cross-referencing real invoices and payment transactions on file.
 * Dynamically resolves reminder threshold from agreement or owner settings (default: 10 days prior).
 */
export function buildRentSchedule(
  agreement: Agreement | undefined | null,
  properties: Property[],
  invoices: Invoice[],
  payments: PaymentTransaction[],
  tenantRecord?: TenantRecord | undefined | null,
  ownerSettings?: OwnerSettings | Record<string, OwnerSettings> | undefined | null,
  isVacated?: boolean
): RentScheduleResult {
  // If resident is vacated without active agreement, return empty schedule immediately
  if (isVacated && !agreement) {
    return {
      currentDueItem: null,
      upcomingDues: [],
      historyDues: [],
      totalCyclesCount: 0,
      paidCyclesCount: 0,
      pendingCyclesCount: 0,
    };
  }

  // If no agreement and tenant is unassigned or no lease start, return empty
  if (!agreement && (!tenantRecord?.unit || tenantRecord?.unit === 'Unassigned' || !tenantRecord?.leaseStart)) {
    return {
      currentDueItem: null,
      upcomingDues: [],
      historyDues: [],
      totalCyclesCount: 0,
      paidCyclesCount: 0,
      pendingCyclesCount: 0,
    };
  }

  const effectiveStart = agreement?.start || tenantRecord?.leaseStart;
  if (!effectiveStart) {
    return {
      currentDueItem: null,
      upcomingDues: [],
      historyDues: [],
      totalCyclesCount: 0,
      paidCyclesCount: 0,
      pendingCyclesCount: 0,
    };
  }

  const effectivePropId = agreement?.propertyId || tenantRecord?.propertyId;
  const prop = properties.find((p) => p.id === effectivePropId || (tenantRecord?.propertyName && p.name === tenantRecord.propertyName));
  const propertyName = prop?.name || tenantRecord?.propertyName || 'Assigned Property';
  const currency = agreement?.currency || prop?.currency || tenantRecord?.currency || DEFAULT_CURRENCY;
  const monthlyRent = Number(agreement?.rent || tenantRecord?.rent) || 0;
  const dueDay = Math.min(Math.max(Number(agreement?.rentDueDay) || 1, 1), 28);
  const effectiveUnit = agreement?.unit || tenantRecord?.unit || '';
  const effectiveTenantId = agreement?.tenantId || tenantRecord?.id || '';

  const startDate = new Date(effectiveStart);
  const effectiveEnd = agreement?.renewalTerms?.newLeaseEnd || agreement?.end || tenantRecord?.leaseEnd;
  const endDate = effectiveEnd ? new Date(effectiveEnd) : new Date(startDate.getTime() + 365 * 86400000);

  // If start date is invalid, fallback
  if (isNaN(startDate.getTime())) {
    return {
      currentDueItem: null,
      upcomingDues: [],
      historyDues: [],
      totalCyclesCount: 0,
      paidCyclesCount: 0,
      pendingCyclesCount: 0,
    };
  }

  const cycles: RentCycleItem[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Resolve reminder window: Agreement override -> Owner Settings -> System Default: 10 days prior
  let resolvedOwnerSettings: OwnerSettings | undefined = undefined;
  if (ownerSettings) {
    if ('ownerId' in ownerSettings) {
      resolvedOwnerSettings = ownerSettings as OwnerSettings;
    } else {
      const targetOwnerId = agreement?.ownerId || tenantRecord?.ownerId;
      if (targetOwnerId && (ownerSettings as Record<string, OwnerSettings>)[targetOwnerId]) {
        resolvedOwnerSettings = (ownerSettings as Record<string, OwnerSettings>)[targetOwnerId];
      }
    }
  }

  const reminderDaysPrior = Math.max(
    1,
    Number(
      agreement?.rentReminderDaysPrior ??
      resolvedOwnerSettings?.rentReminderDaysPrior ??
      resolvedOwnerSettings?.rentalReminderConfig?.daysPrior ??
      10
    )
  );

  const effectiveAgreementId = agreement?.id || `tenancy_${effectiveTenantId}_${effectiveUnit}`;

  // Check if this tenancy requires a move-in security deposit that has not yet been paid
  const isDepositPending = Boolean(
    agreement &&
    (agreement.status === 'pending_deposit' || agreement.depositStatus === 'unpaid' || (!agreement.depositStatus && (agreement.deposit || 0) > 0)) &&
    agreement.depositStatus !== 'paid' &&
    !invoices.some(
      (inv) =>
        (inv.invoiceType === 'deposit' || (inv as any).type === 'deposit' || inv.id === agreement.depositInvoiceId) &&
        inv.status === 'paid' &&
        (inv.leaseAgreementId === agreement.id || inv.unit === effectiveUnit || inv.id === agreement.depositInvoiceId)
    )
  );

  // Filter real rent invoices and rent payments for this agreement or unit
  const relatedInvoices = invoices.filter(
    (inv) =>
      (inv.invoiceType === 'rent' || (inv as any).type === 'rent') &&
      ((agreement?.id && (inv.leaseAgreementId === agreement.id || inv.id.includes(agreement.id))) ||
        (effectiveUnit &&
          (inv.unit === effectiveUnit || inv.unit?.toLowerCase() === effectiveUnit.toLowerCase()) &&
          (inv.tenantId === effectiveTenantId || (agreement?.tenant && inv.tenant === agreement.tenant))))
  );

  const relatedPayments = payments.filter(
    (p) =>
      (p.type === 'rent' || (!(p.type === 'deposit') && !(p as any).invoiceType?.includes('deposit') && !p.notes?.toLowerCase().includes('deposit'))) &&
      ((effectiveUnit && (p.unit === effectiveUnit || p.unit?.toLowerCase() === effectiveUnit.toLowerCase())) ||
        (effectiveTenantId && p.tenantId === effectiveTenantId))
  );

  let cursorYear = startDate.getFullYear();
  let cursorMonth = startDate.getMonth();
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth();

  let cycleIndex = 1;

  while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
    const cycleDate = new Date(cursorYear, cursorMonth, dueDay);
    const yyyy = cycleDate.getFullYear();
    const mm = String(cycleDate.getMonth() + 1).padStart(2, '0');
    const dd = String(cycleDate.getDate()).padStart(2, '0');
    const dueDateStr = `${yyyy}-${mm}-${dd}`;
    const monthName = cycleDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const isMoveIn = cycleIndex === 1;

    // Determine cycle rent based on renewal terms effective date
    let cycleAmount = monthlyRent;
    let isRenewal = false;
    let percentIncrease: number | undefined = undefined;

    if (agreement?.renewalTerms?.effectiveDate) {
      const renewalEffective = new Date(agreement.renewalTerms.effectiveDate);
      renewalEffective.setHours(0, 0, 0, 0);
      if (cycleDate >= renewalEffective) {
        cycleAmount = Number(agreement.renewalTerms.newRent) || monthlyRent;
        isRenewal = true;
        percentIncrease = agreement.renewalTerms.percentageIncrease;
      } else if (agreement.renewalTerms.previousRent) {
        cycleAmount = Number(agreement.renewalTerms.previousRent);
      }
    }

    // Check for matched real invoice by leaseAgreementId, dueDate, or matching month
    const matchingInv = relatedInvoices.find((inv) => {
      if (inv.due === dueDateStr) return true;
      if (inv.items?.some((it) => it.description?.toLowerCase().includes(monthName.toLowerCase()))) return true;
      if (isMoveIn && (inv.notes?.toLowerCase().includes('first month') || inv.items?.some((it) => it.description?.toLowerCase().includes('month 1')))) return true;
      return false;
    });

    // Check for matched payment
    const matchingPay = relatedPayments.find((p) => {
      if (matchingInv && (p.invoiceId === matchingInv.id || matchingInv.receiptNumber === p.id || p.id === `PAY-${matchingInv.id}`)) return true;
      if (p.date && p.date.startsWith(`${yyyy}-${mm}`)) return true;
      if (isMoveIn && (p.notes?.toLowerCase().includes('first month') || p.notes?.toLowerCase().includes('move-in') || p.notes?.toLowerCase().includes('m1'))) return true;
      return false;
    });

    let status: RentCycleItem['status'] = 'upcoming';
    let paidAt: string | undefined = undefined;
    let paymentMethod: string | undefined = undefined;
    let transactionRef: string | undefined = undefined;

    if (matchingInv?.status === 'paid' || matchingPay?.status === 'paid') {
      status = 'paid';
      paidAt = matchingPay?.date || matchingInv?.paidAt || dueDateStr;
      paymentMethod = matchingPay?.method || matchingInv?.paymentMethodUsed || 'DIRECT_SETTLEMENT';
      transactionRef = matchingPay?.id || matchingInv?.id;
    } else if (matchingInv?.status === 'pending_confirmation' || matchingPay?.status === 'pending_confirmation') {
      status = 'pending_confirmation';
      transactionRef = matchingPay?.id || matchingInv?.id;
    } else {
      // Determine due state relative to today
      const diffDays = Math.round((cycleDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
      if (diffDays < 0) {
        status = 'overdue';
      } else if (diffDays <= 2) {
        status = 'due_now';
      } else if (diffDays <= reminderDaysPrior) {
        status = 'due_soon';
      } else {
        status = 'upcoming';
      }
    }

    cycles.push({
      id: `cycle_${effectiveAgreementId}_${dueDateStr}`,
      cycleNumber: cycleIndex,
      cycleLabel: isMoveIn ? 'Month 1 (Move-in)' : isRenewal ? `Month ${cycleIndex} (Renewed)` : `Month ${cycleIndex}`,
      monthName,
      dueDate: dueDateStr,
      amount: cycleAmount,
      currency,
      propertyName,
      propertyId: effectivePropId || '',
      unitNumber: effectiveUnit,
      isMoveInMonth: isMoveIn,
      isRenewalCycle: isRenewal,
      percentageIncrease: percentIncrease,
      status,
      invoiceId: matchingInv?.id,
      invoiceStatus: matchingInv?.status,
      paidAt,
      paymentMethod,
      transactionRef,
      isDepositPending: isDepositPending && status !== 'paid',
      depositAmount: agreement?.deposit,
      depositInvoiceId: agreement?.depositInvoiceId,
    });

    cycleIndex++;
    cursorMonth++;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear++;
    }

    // Guard against runaway loop
    if (cycleIndex > 48) break;
  }

  const isTenancyConcluded = Boolean(
    isVacated ||
    agreement?.status === 'terminated' ||
    (!agreement && tenantRecord?.unit === 'Unassigned')
  );

  const historyDues = cycles
    .filter((c) => c.status === 'paid')
    .sort((a, b) => (b.paidAt || b.dueDate).localeCompare(a.paidAt || a.dueDate));

  const upcomingDues = isTenancyConcluded
    ? []
    : cycles
        .filter((c) => c.status !== 'paid')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Current due item is the first unpaid item (strictly null if tenancy is vacated/concluded)
  const currentDueItem = isTenancyConcluded ? null : (upcomingDues[0] || null);

  return {
    currentDueItem,
    upcomingDues,
    historyDues,
    totalCyclesCount: isTenancyConcluded ? historyDues.length : cycles.length,
    paidCyclesCount: historyDues.length,
    pendingCyclesCount: isTenancyConcluded ? 0 : upcomingDues.length,
  };
}
