import { Property, Unit, Agreement, TenancyRequest, MoveOut, Invoice, PaymentTransaction } from '../types';

export interface UnitOccupancyInfo {
  unit: Unit;
  effectiveStatus: 'occupied' | 'reserved' | 'maintenance' | 'vacant';
  activeAgreement?: Agreement;
  pendingRequest?: TenancyRequest;
  monthlyRent: number;
  currency: string;
}

export interface PropertyPortfolioMetrics {
  totalUnits: number;
  occupiedCount: number;
  reservedCount: number;
  vacantCount: number;
  maintenanceCount: number;
  occupancyRate: number;
  monthlyRentRoll: number;
}

/**
 * Strictly checks whether an agreement, move-out, or tenancy request belongs to a specific unit.
 * Prevents loose property-wide or generic ("Unit") bleed across different units.
 */
export function matchesUnitRelational(
  target: { unitId?: string; unit?: string; unitNumber?: string; propertyId?: string },
  unit: Unit
): boolean {
  if (target.propertyId && unit.propertyId && target.propertyId !== unit.propertyId) {
    return false;
  }
  // Primary key match: exact unitId
  if (target.unitId && unit.id && target.unitId === unit.id) {
    return true;
  }
  if (target.unit && unit.id && target.unit === unit.id) {
    return true;
  }
  // Exact or normalized unitNumber match (e.g., "Unit 101" === "101")
  const clean = (s?: string) => (s || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
  const targetClean = clean(target.unitNumber || target.unit);
  const unitClean = clean(unit.unitNumber || unit.id);
  if (targetClean && unitClean && targetClean === unitClean) {
    const genericWords = new Set(['unit', 'unassigned', 'unassigned unit', 'all', 'undefined', 'null']);
    if (!genericWords.has(targetClean)) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether a transaction is a security deposit (held in trust custody)
 * rather than operational rental income. Fiduciary deposits must not inflate rent metrics.
 */
export function isDepositPayment(
  p: { type?: string; id?: string; invoiceId?: string; notes?: string; settlementId?: string; cashClaimId?: string; direction?: string },
  invoices: Array<{ id: string; invoiceType?: string; type?: string }> = []
): boolean {
  if (!p) return false;
  if (p.type === 'deposit' || p.type === 'deposit_refund') return true;
  if (p.id && (p.id.startsWith('TXN-DEP') || p.id.startsWith('DEP-') || p.id.startsWith('TXN-REF') || p.id.startsWith('REF-'))) return true;
  if (p.invoiceId) {
    if (p.invoiceId.startsWith('DEP-') || p.invoiceId.startsWith('REF-')) return true;
    const inv = invoices.find((i) => i.id === p.invoiceId);
    if (inv?.invoiceType === 'deposit' || inv?.type === 'deposit') return true;
  }
  if (p.notes && /deposit/i.test(p.notes)) return true;
  if (Boolean(p.settlementId)) return true;
  if (p.cashClaimId && /deposit/i.test(p.cashClaimId)) return true;
  if (p.direction === 'outflow' && (p.notes && /refund|settle|deposit/i.test(p.notes))) return true;
  return false;
}

/**
 * Resolves the true relational status of a unit based on active agreements,
 * pending requests, move-outs, and current unit status (implements H-5, H-6, H-7, H-8).
 */
export function resolveUnitOccupancy(
  unit: Unit,
  agreements: Agreement[] = [],
  tenancyRequests: TenancyRequest[] = [],
  moveouts: MoveOut[] = []
): UnitOccupancyInfo {
  // Check if a move-out for this unit has completed or settled
  const hasSettledMoveout = (moveouts || []).some(
    (m) =>
      (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt) &&
      matchesUnitRelational({ unit: m.unit, propertyId: m.propertyId }, unit)
  );

  // Check active/signed agreement for this specific property and unit (excluding agreements concluded by a settled moveout)
  const activeAgreement = agreements.find((a) => {
    if (a.status !== 'active' && (a.status as string) !== 'signed') return false;
    if (!matchesUnitRelational(a, unit)) return false;
    // If a concluded move-out exists for this unit or agreement, check if agreement was created after it
    if (hasSettledMoveout) {
      const matchMo = (moveouts || []).find(
        (m) =>
          (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt) &&
          (m.agreementId === a.id || (m as any).leaseAgreementId === a.id || matchesUnitRelational({ unit: m.unit, propertyId: m.propertyId }, unit))
      );
      if (matchMo) {
        const moTime = new Date((matchMo as any).settledAt || (matchMo as any).tenantConfirmedAt || (matchMo as any).updatedAt || matchMo.moveOutDate || (matchMo as any).createdAt || 0).getTime();
        const agTime = new Date(a.createdAt || a.start || 0).getTime();
        if (moTime > 0 && agTime <= moTime) return false;
        if (!agTime || moTime <= 0) return false;
      }
    }
    return true;
  });

  // Check pending signature or approval agreement
  const pendingAgreement = !activeAgreement
    ? agreements.find(
        (a) =>
          (a.status === 'awaiting_tenant_signature' ||
            a.status === 'pending_countersign' ||
            a.status === 'pending_deposit' ||
            a.status === 'pending_approval' ||
            a.status === 'awaiting_tenant_upload') &&
          matchesUnitRelational(a, unit)
      )
    : undefined;

  // Check pending tenancy request strictly bound to this unit
  const pendingRequest = tenancyRequests.find(
    (r) => r.status === 'pending' && matchesUnitRelational(r, unit)
  );

  let effectiveStatus: 'occupied' | 'reserved' | 'maintenance' | 'vacant' = 'vacant';

  if (unit.status === 'maintenance') {
    // 1. Maintenance holds highest priority
    effectiveStatus = 'maintenance';
  } else if (activeAgreement) {
    // 2. Active executed lease holds priority
    effectiveStatus = 'occupied';
  } else {
    // 3. No active executed lease
    const hasTerminatedAgreementOnly =
      agreements.some((a) => matchesUnitRelational(a, unit) && a.status === 'terminated') &&
      !agreements.some((a) => matchesUnitRelational(a, unit) && (a.status === 'active' || a.status === 'signed'));

    // A concluded tenancy frees the unit, unless a NEW pending agreement/request re-reserved it.
    const tenancyConcluded = (hasSettledMoveout || hasTerminatedAgreementOnly) && !pendingAgreement && !pendingRequest;

    if (unit.status === 'vacant' || tenancyConcluded) {
      effectiveStatus = 'vacant';
    } else if (unit.status === 'reserved' || pendingAgreement || pendingRequest) {
      // Reserved pending digital signature/deposit when not actively occupied
      effectiveStatus = 'reserved';
    } else if (unit.status === 'occupied' && Boolean(unit.tenant || unit.currentTenantId)) {
      effectiveStatus = 'occupied';
    } else if (unit.status === 'occupied') {
      effectiveStatus = 'occupied';
    } else {
      effectiveStatus = 'vacant';
    }
  }

  const monthlyRent = activeAgreement?.rent || unit.rent || 0;
  const currency = unit.currency || activeAgreement?.currency || 'USD';

  return {
    unit,
    effectiveStatus,
    activeAgreement,
    pendingRequest,
    monthlyRent,
    currency,
  };
}

/**
 * Calculates portfolio-wide or per-property metrics with guaranteed cross-screen consistency (H-5).
 */
export function calculatePortfolioMetrics(
  units: Unit[],
  agreements: Agreement[] = [],
  tenancyRequests: TenancyRequest[] = [],
  convertFn?: (amount: number, from: string, to: string) => number,
  targetCurrency?: string,
  moveouts?: MoveOut[]
): PropertyPortfolioMetrics {
  let occupiedCount = 0;
  let reservedCount = 0;
  let vacantCount = 0;
  let maintenanceCount = 0;
  let monthlyRentRoll = 0;

  units.forEach((u) => {
    const resolved = resolveUnitOccupancy(u, agreements, tenancyRequests, moveouts);
    switch (resolved.effectiveStatus) {
      case 'occupied':
        occupiedCount++;
        const amount = resolved.monthlyRent;
        if (convertFn && targetCurrency) {
          monthlyRentRoll += convertFn(amount, resolved.currency, targetCurrency);
        } else {
          monthlyRentRoll += amount;
        }
        break;
      case 'reserved':
        reservedCount++;
        break;
      case 'maintenance':
        maintenanceCount++;
        break;
      case 'vacant':
      default:
        vacantCount++;
        break;
    }
  });

  const totalUnits = units.length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;

  return {
    totalUnits,
    occupiedCount,
    reservedCount,
    vacantCount,
    maintenanceCount,
    occupancyRate,
    monthlyRentRoll,
  };
}


/**
 * SINGLE SOURCE OF TRUTH for tenancy-derived state (units, property occupancy, tenant assignment,
 * voiding concluded unpaid invoices, and deduplicating financial transactions).
 * Pure function: returns reconciled arrays plus the exact records that differ from what is stored,
 * so callers can (a) display consistent data on every screen and (b) persist the fixes to Firestore.
 */
export function reconcilePortfolio<
  U extends Unit,
  P extends Property,
  T extends { id: string; name?: string; email?: string; unit?: string; propertyId?: string; rent?: number; deposit?: number },
  I extends { id: string; unit?: string; propertyId?: string; tenantId?: string; leaseAgreementId?: string; status: string; notes?: string; amount?: number; total?: number },
  Y extends { id: string; unit?: string; propertyId?: string; tenantId?: string; amount?: number; direction?: string; status?: string; type?: string; invoiceId?: string; settlementId?: string; cashClaimId?: string; date?: string; notes?: string }
>(input: {
  units: U[];
  properties: P[];
  tenants: T[];
  agreements: Agreement[];
  invoices?: I[];
  payments?: Y[];
  tenancyRequests?: TenancyRequest[];
  moveouts?: MoveOut[];
  moveOuts?: MoveOut[];
}): {
  units: U[];
  properties: P[];
  tenants: T[];
  agreements: Agreement[];
  invoices: I[];
  payments: Y[];
  changedUnits: U[];
  changedProperties: P[];
  changedTenants: T[];
  changedAgreements: Agreement[];
  changedInvoices: I[];
  deletedPaymentIds: string[];
} {
  const { tenancyRequests = [] } = input;
  const moveouts = input.moveouts || input.moveOuts || [];
  const clean = (s?: string) => (s || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

  // Reconcile Agreements: Conclude/terminate agreements tied to settled move-outs
  const changedAgreements: Agreement[] = [];
  const agreements = (input.agreements || []).map((a) => {
    if ((a.status as string) === 'terminated' || (a.status as string) === 'cancelled') return a;
    const aUnit = clean(a.unit);
    const hasConcludedMoveout = moveouts.some((m) => {
      const isDone = m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt;
      if (!isDone) return false;
      if (m.agreementId === a.id || (m as any).leaseAgreementId === a.id) return true;
      const matchesUnit = clean(m.unit) === aUnit;
      const matchesProp = !m.propertyId || !a.propertyId || m.propertyId === a.propertyId;
      const matchesTenant = !a.tenantId || !m.tenantId || m.tenantId === a.tenantId;
      return matchesUnit && matchesProp && matchesTenant;
    });
    if (hasConcludedMoveout) {
      const terminated = { ...a, status: 'terminated' as const, depositStatus: 'refunded' as const };
      changedAgreements.push(terminated);
      return terminated;
    }
    return a;
  });

  const changedUnits: U[] = [];
  const units = input.units.map((u) => {
    const info = resolveUnitOccupancy(u, agreements, tenancyRequests, moveouts);
    if (info.effectiveStatus === 'vacant' && (u.status !== 'vacant' || u.tenant || u.currentTenantId)) {
      const fixed = { ...u, status: 'vacant' as const, tenant: null, currentTenantId: null } as U;
      changedUnits.push(fixed);
      return fixed;
    }
    return u;
  });

  const changedProperties: P[] = [];
  const properties = input.properties.map((p) => {
    const propUnits = units.filter((u) => u.propertyId === p.id);
    if (propUnits.length === 0) return p;
    const occ = propUnits.filter(
      (u) => resolveUnitOccupancy(u, agreements, tenancyRequests, moveouts).effectiveStatus === 'occupied'
    ).length;
    if (p.occupied !== occ) {
      const fixed = { ...p, occupied: occ } as P;
      changedProperties.push(fixed);
      return fixed;
    }
    return p;
  });

  const changedTenants: T[] = [];
  const tenants = input.tenants.map((t) => {
    if (!t.unit || t.unit === 'Unassigned' || t.unit === 'Pending') return t;
    const tUnit = clean(t.unit);
    const sameTenant = (a: Agreement) =>
      (a as any).tenantId === t.id ||
      (t.email && (a as any).tenantEmail && String((a as any).tenantEmail).toLowerCase() === t.email.toLowerCase()) ||
      (t.name && a.tenant === t.name);
    const forThisUnit = (a: Agreement) =>
      clean(a.unit) === tUnit && (!a.propertyId || !t.propertyId || a.propertyId === t.propertyId);

    const mine = agreements.filter((a) => forThisUnit(a) && sameTenant(a));
    const hasLiveAg = mine.some((a) => !['terminated', 'cancelled', 'expired', 'rejected'].includes(a.status as string));
    const hasTerminated = mine.some((a) => a.status === 'terminated');
    const hasSettledMoveout = moveouts.some(
      (m) =>
        (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt) &&
        clean(m.unit) === tUnit &&
        (!m.propertyId || !t.propertyId || m.propertyId === t.propertyId) &&
        (!m.tenantId || m.tenantId === t.id)
    );
    const hasPendingReq = tenancyRequests.some(
      (r) => (r.status === 'pending' || r.status === 'accepted') && clean(r.unitNumber) === tUnit && (r as any).tenantId === t.id
    );
    if (!hasLiveAg && !hasPendingReq && (hasTerminated || hasSettledMoveout)) {
      const fixed = { ...t, unit: 'Unassigned', rent: 0, deposit: 0 } as T;
      changedTenants.push(fixed);
      return fixed;
    }
    return t;
  });

  // Reconcile Invoices: Void unpaid rent or deposit invoices for concluded tenancies
  const changedInvoices: I[] = [];
  const invoices = (input.invoices || []).map((inv) => {
    if (inv.status === 'paid' || inv.status === 'void') return inv;
    const invUnit = clean(inv.unit);
    const matchingAg = agreements.find((a) => a.id === inv.leaseAgreementId);
    const isAgTerminated = matchingAg && ((matchingAg.status as string) === 'terminated' || (matchingAg.status as string) === 'cancelled');
    const hasConcludedMoveout = moveouts.some((m) => {
      const isDone = m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt;
      if (!isDone) return false;
      if (m.id === inv.leaseAgreementId || (m as any).agreementId === inv.leaseAgreementId) return true;
      const matchesUnit = clean(m.unit) === invUnit;
      const matchesProp = !m.propertyId || !inv.propertyId || m.propertyId === inv.propertyId;
      const matchesTenant = !inv.tenantId || m.tenantId === inv.tenantId;
      return matchesUnit && matchesProp && matchesTenant;
    });

    const hasActiveLeaseForUnit = agreements.some(
      (a) =>
        (a.status === 'active' || (a.status as string) === 'signed') &&
        clean(a.unit) === invUnit &&
        (!a.propertyId || !inv.propertyId || a.propertyId === inv.propertyId)
    );

    if ((isAgTerminated || hasConcludedMoveout) && !hasActiveLeaseForUnit) {
      const voided = {
        ...inv,
        status: 'void' as const,
        notes: inv.notes ? `${inv.notes} — Voided upon tenancy conclusion.` : 'Voided upon tenancy conclusion.',
      } as I;
      changedInvoices.push(voided);
      return voided;
    }
    return inv;
  });

  // Reconcile Payments: Deduplicate duplicate deposit inflows and duplicate deposit refund outflows
  const deletedPaymentIds: string[] = [];
  const rawPayments = input.payments || [];
  const seenRefundKeys = new Map<string, Y>();
  const seenDepositInflowKeys = new Map<string, Y>();
  const payments: Y[] = [];

  rawPayments.forEach((p) => {
    const isOutflowRefund = p.direction === 'outflow' || p.type === 'deposit_refund' || (p.notes && /refund/i.test(p.notes));
    const isDepositInflow = (p.type === 'deposit' || (p.id && (p.id.startsWith('TXN-DEP') || p.id.startsWith('DEP-')))) && p.direction !== 'outflow';

    if (isOutflowRefund) {
      const cleanSettleId = p.settlementId ? p.settlementId.replace(/^DEP-SETTLE-/i, '') : '';
      const cleanClaimId = p.cashClaimId ? p.cashClaimId.replace(/^CSH-/i, '') : '';
      const cleanRefInv = p.invoiceId && p.invoiceId.startsWith('REF-') ? p.invoiceId.replace(/^REF-/i, '').replace(/^DEP-SETTLE-/i, '') : '';
      const cleanTxId = p.id ? p.id.replace(/^TXN-REF-/i, '').replace(/^TXN-CSH-/i, '') : '';

      const settleKey = cleanSettleId ? `settle:${cleanSettleId}` : '';
      const claimKey = cleanClaimId ? `claim:${cleanClaimId}` : '';
      const refInvKey = cleanRefInv ? `settle:${cleanRefInv}` : ''; // normalize to settle namespace for cross-matching!
      const txKey = cleanTxId ? `settle:${cleanTxId}` : '';
      const fallbackKey = `outflow:${clean(p.unit)}_${p.tenantId || ''}_${p.amount || 0}`;

      const candidateKeys = [settleKey, claimKey, refInvKey, txKey, fallbackKey].filter(Boolean);
      let existing: Y | undefined;
      for (const k of candidateKeys) {
        if (seenRefundKeys.has(k)) {
          existing = seenRefundKeys.get(k);
          break;
        }
      }

      if (existing) {
        const isCurrentBetter = Boolean(p.cashClaimId || (p.id && p.id.startsWith('TXN-CSH')) || (p.status === 'paid' && existing.status !== 'paid'));
        const winner = isCurrentBetter ? p : existing;
        const loser = isCurrentBetter ? existing : p;

        deletedPaymentIds.push(loser.id);
        if (isCurrentBetter) {
          const idx = payments.findIndex((item) => item.id === existing!.id);
          if (idx >= 0) payments[idx] = p;
        }
        candidateKeys.forEach((k) => seenRefundKeys.set(k, winner));
        return;
      } else {
        candidateKeys.forEach((k) => seenRefundKeys.set(k, p));
        payments.push(p);
        return;
      }
    }

    if (isDepositInflow && p.status === 'paid') {
      const depKey = `dep_in:${p.invoiceId || ''}_${clean(p.unit)}_${p.tenantId || ''}_${p.amount || 0}`;
      const existingDep = seenDepositInflowKeys.get(depKey);
      if (existingDep) {
        deletedPaymentIds.push(p.id);
        return;
      }
      seenDepositInflowKeys.set(depKey, p);
      payments.push(p);
      return;
    }

    payments.push(p);
  });

  return {
    units,
    properties,
    tenants,
    agreements,
    invoices,
    payments,
    changedUnits,
    changedProperties,
    changedTenants,
    changedAgreements,
    changedInvoices,
    deletedPaymentIds,
  };
}
