import { MobileInvoice, MobileLateFeeSettings } from '../types';

export interface MobileLateFeeCalculationResult {
  isOverdue: boolean;
  daysLate: number;
  graceDays: number;
  billableDays: number;
  accruedLateFee: number;
  isWaived: boolean;
  waivedReason?: string;
  ruleDescription: string;
}

/**
 * Calculates late fee for a mobile invoice based on its due date, amount, and late fee settings.
 */
export function calculateMobileInvoiceLateFee(
  invoice: MobileInvoice,
  settings?: MobileLateFeeSettings,
  asOfDate: Date = new Date()
): MobileLateFeeCalculationResult {
  const defaultGrace = settings?.graceDays ?? 5;

  // 1. Check if late fee has been explicitly waived
  if (invoice.lateFeeWaived) {
    return {
      isOverdue: false,
      daysLate: 0,
      graceDays: defaultGrace,
      billableDays: 0,
      accruedLateFee: 0,
      isWaived: true,
      waivedReason: invoice.lateFeeWaivedReason || 'Waived by Property Owner',
      ruleDescription: 'Late fee waived by landlord',
    };
  }

  // 2. If invoice is already settled / paid, return the frozen lateFeeApplied if present
  if (invoice.status === 'paid' && typeof invoice.lateFeeApplied === 'number') {
    return {
      isOverdue: false,
      daysLate: 0,
      graceDays: defaultGrace,
      billableDays: 0,
      accruedLateFee: invoice.lateFeeApplied,
      isWaived: false,
      ruleDescription: invoice.lateFeeCalculation || `Settled late penalty: ${invoice.lateFeeApplied}`,
    };
  }

  // 3. If settings are disabled or absent
  if (!settings || !settings.enabled) {
    return {
      isOverdue: false,
      daysLate: 0,
      graceDays: defaultGrace,
      billableDays: 0,
      accruedLateFee: 0,
      isWaived: false,
      ruleDescription: 'Late fee policy disabled',
    };
  }

  // 4. Validate due date
  if (!invoice.due) {
    return {
      isOverdue: false,
      daysLate: 0,
      graceDays: defaultGrace,
      billableDays: 0,
      accruedLateFee: 0,
      isWaived: false,
      ruleDescription: 'No due date specified',
    };
  }

  const dueDate = new Date(invoice.due);
  dueDate.setHours(0, 0, 0, 0);

  const checkDate = new Date(asOfDate);
  checkDate.setHours(0, 0, 0, 0);

  const diffTime = checkDate.getTime() - dueDate.getTime();
  const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // If today is on or before due date, not overdue
  if (daysDiff <= 0) {
    return {
      isOverdue: false,
      daysLate: 0,
      graceDays: defaultGrace,
      billableDays: 0,
      accruedLateFee: 0,
      isWaived: false,
      ruleDescription: 'Within regular payment window',
    };
  }

  const daysLate = daysDiff;
  const graceDays = defaultGrace;

  // If within grace period
  if (daysLate <= graceDays) {
    return {
      isOverdue: true,
      daysLate,
      graceDays,
      billableDays: 0,
      accruedLateFee: 0,
      isWaived: false,
      ruleDescription: `Overdue by ${daysLate} day(s), within ${graceDays}-day grace period`,
    };
  }

  // Past grace period: calculate fee
  const billableDays = daysLate - graceDays;
  const rentAmount = invoice.amount || 0;
  let accruedLateFee = 0;
  let ruleDescription = '';

  const feeType = (settings.type as string) || 'percent';
  if (feeType === 'daily_fixed') {
    const rawFee = billableDays * settings.value;
    accruedLateFee = settings.cap ? Math.min(rawFee, settings.cap) : rawFee;
    ruleDescription = `${billableDays} billable day(s) @ ${settings.value}/day (Grace: ${graceDays}d)`;
  } else if (feeType === 'fixed_once' || feeType === 'flat') {
    accruedLateFee = settings.value;
    ruleDescription = `Flat late fee of ${settings.value} (Grace: ${graceDays}d)`;
  } else if (feeType === 'percent_monthly' || feeType === 'percent') {
    const pctFee = Math.round(rentAmount * (settings.value / 100));
    accruedLateFee = settings.cap ? Math.min(pctFee, settings.cap) : pctFee;
    ruleDescription = `${settings.value}% penalty on base ${rentAmount} (Grace: ${graceDays}d)`;
  } else {
    accruedLateFee = settings.value;
    ruleDescription = `Late penalty of ${settings.value}`;
  }

  return {
    isOverdue: true,
    daysLate,
    graceDays,
    billableDays,
    accruedLateFee,
    isWaived: false,
    ruleDescription,
  };
}

/**
 * Returns comprehensive payable breakdown for a mobile invoice including base amount, tax, and accrued late fee.
 */
export function getMobileInvoicePayableBreakdown(
  invoice: MobileInvoice,
  settings?: MobileLateFeeSettings,
  asOfDate: Date = new Date()
) {
  const baseAmount = invoice.amount || 0;
  const tax = invoice.tax || 0;
  const lateFeeResult = calculateMobileInvoiceLateFee(invoice, settings, asOfDate);
  const lateFee = lateFeeResult.accruedLateFee;
  const total = baseAmount + tax + lateFee;

  return {
    baseAmount,
    tax,
    lateFee,
    total,
    isOverdue: lateFeeResult.isOverdue,
    daysLate: lateFeeResult.daysLate,
    graceDays: lateFeeResult.graceDays,
    billableDays: lateFeeResult.billableDays,
    isWaived: lateFeeResult.isWaived,
    ruleDescription: lateFeeResult.ruleDescription,
  };
}
