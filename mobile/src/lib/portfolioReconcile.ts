/**
 * SINGLE SOURCE OF TRUTH (mobile mirror of web `src/lib/portfolioSelectors.ts`).
 * Derives unit status, property occupancy and tenant assignment from agreements,
 * tenancy requests and move-outs so every mobile screen agrees with the web app,
 * even when stored Firestore fields are stale.
 */

const clean = (s?: string) => (s || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

export const unitMatches = (target: any, unit: any): boolean => {
  if (target.propertyId && unit.propertyId && target.propertyId !== unit.propertyId) return false;
  if (target.unitId && unit.id && target.unitId === unit.id) return true;
  if (target.unit && unit.id && target.unit === unit.id) return true;
  const t = clean(target.unitNumber || target.unit);
  const u = clean(unit.unitNumber || unit.id);
  if (!t || !u || t !== u) return false;
  return !['unit', 'unassigned', 'unassigned unit', 'all', 'undefined', 'null'].includes(t);
};

export const isSettled = (m: any) =>
  m.status === 'refund_completed' || m.status === 'settled' || Boolean(m.tenantConfirmedReceipt);

export type EffectiveUnitStatus = 'occupied' | 'reserved' | 'maintenance' | 'vacant';

export function resolveEffectiveUnitStatus(
  unit: any,
  agreements: any[] = [],
  tenancyRequests: any[] = [],
  moveouts: any[] = []
): EffectiveUnitStatus {
  if (unit.status === 'maintenance') return 'maintenance';

  // Check if a move-out for this unit has completed or settled
  const hasSettledMoveout = moveouts.some((m) => isSettled(m) && unitMatches({ unit: m.unit, propertyId: m.propertyId }, unit));

  const forUnit = agreements.filter((a) => unitMatches(a, unit));

  // Check active/signed agreement for this unit (excluding agreements concluded by a settled moveout)
  const activeAg = forUnit.find((a) => {
    if (a.status !== 'active' && (a.status as string) !== 'signed') return false;
    if (hasSettledMoveout) {
      const matchMo = moveouts.find((m) => isSettled(m) && (m.agreementId === a.id || (m as any).leaseAgreementId === a.id || unitMatches({ unit: m.unit, propertyId: m.propertyId }, unit)));
      if (matchMo) {
        const moTime = new Date((matchMo as any).settledAt || (matchMo as any).tenantConfirmedAt || (matchMo as any).updatedAt || matchMo.moveOutDate || (matchMo as any).createdAt || 0).getTime();
        const agTime = new Date(a.createdAt || a.start || 0).getTime();
        if (moTime > 0 && agTime <= moTime) return false;
        if (!agTime || moTime <= 0) return false;
      }
    }
    return true;
  });

  if (activeAg) return 'occupied';

  const pendingAgreement = forUnit.some((a) =>
    ['awaiting_tenant_signature', 'pending_countersign', 'pending_deposit', 'pending_approval', 'awaiting_tenant_upload'].includes(a.status)
  );
  const pendingRequest = tenancyRequests.some((r) => r.status === 'pending' && unitMatches(r, unit));
  const terminatedOnly = forUnit.some((a) => a.status === 'terminated');

  const tenancyConcluded = (hasSettledMoveout || terminatedOnly) && !pendingAgreement && !pendingRequest;
  if (unit.status === 'vacant' || tenancyConcluded) return 'vacant';
  if (unit.status === 'reserved' || pendingAgreement || pendingRequest) return 'reserved';
  if (unit.status === 'occupied') return 'occupied';
  return 'vacant';
}

export function isDepositPayment(
  p: any,
  invoices: any[] = []
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

export function reconcilePortfolio(input: {
  units: any[];
  properties: any[];
  tenants: any[];
  agreements: any[];
  invoices?: any[];
  payments?: any[];
  tenancyRequests?: any[];
  moveouts?: any[];
  moveOuts?: any[];
}) {
  const { tenancyRequests = [] } = input;
  const moveOuts = input.moveOuts || input.moveouts || [];

  // 1. Reconcile Agreements: Mark concluded agreements as terminated
  const changedAgreements: any[] = [];
  const agreements = (input.agreements || []).map((a) => {
    if (a.status === 'terminated' || a.status === 'cancelled') return a;
    const aUnit = clean(a.unit);
    const hasConcludedMoveout = moveOuts.some((m) => {
      if (!isSettled(m)) return false;
      if (m.agreementId === a.id || (m as any).leaseAgreementId === a.id) return true;
      const matchesUnit = clean(m.unit) === aUnit;
      const matchesProp = !m.propertyId || !a.propertyId || m.propertyId === a.propertyId;
      const matchesTenant = !a.tenantId || !m.tenantId || m.tenantId === a.tenantId;
      return matchesUnit && matchesProp && matchesTenant;
    });
    if (hasConcludedMoveout) {
      const terminated = { ...a, status: 'terminated', depositStatus: 'refunded' };
      changedAgreements.push(terminated);
      return terminated;
    }
    return a;
  });

  // 2. Reconcile Units
  const changedUnits: any[] = [];
  const units = input.units.map((u) => {
    const eff = resolveEffectiveUnitStatus(u, agreements, tenancyRequests, moveOuts);
    if (eff === 'vacant' && (u.status !== 'vacant' || u.tenant || u.currentTenantId)) {
      const fixed = { ...u, status: 'vacant', tenant: null, currentTenantId: null };
      changedUnits.push(fixed);
      return fixed;
    }
    return u;
  });

  // 3. Reconcile Properties
  const changedProperties: any[] = [];
  const properties = input.properties.map((p) => {
    const propUnits = units.filter((u) => u.propertyId === p.id);
    if (propUnits.length === 0) return p;
    const occ = propUnits.filter(
      (u) => resolveEffectiveUnitStatus(u, agreements, tenancyRequests, moveOuts) === 'occupied'
    ).length;
    if (p.occupied !== occ) {
      const fixed = { ...p, occupied: occ };
      changedProperties.push(fixed);
      return fixed;
    }
    return p;
  });

  // 4. Reconcile Tenants
  const changedTenants: any[] = [];
  const tenants = input.tenants.map((t) => {
    if (!t.unit || t.unit === 'Unassigned' || t.unit === 'Pending') return t;
    const tUnit = clean(t.unit);
    const mine = agreements.filter(
      (a) =>
        clean(a.unit) === tUnit &&
        (!a.propertyId || !t.propertyId || a.propertyId === t.propertyId) &&
        (a.tenantId === t.id ||
          (t.email && a.tenantEmail && String(a.tenantEmail).toLowerCase() === String(t.email).toLowerCase()) ||
          (t.name && a.tenant === t.name))
    );
    const hasLiveAg = mine.some((a) => !['terminated', 'cancelled', 'expired', 'rejected'].includes(a.status));
    const hasTerminated = mine.some((a) => a.status === 'terminated');
    const hasSettledMoveout = moveOuts.some(
      (m) =>
        isSettled(m) &&
        clean(m.unit) === tUnit &&
        (!m.propertyId || !t.propertyId || m.propertyId === t.propertyId) &&
        (!m.tenantId || m.tenantId === t.id)
    );
    const hasPendingReq = tenancyRequests.some(
      (r) => (r.status === 'pending' || r.status === 'accepted') && clean(r.unitNumber) === tUnit && r.tenantId === t.id
    );
    if (!hasLiveAg && !hasPendingReq && (hasTerminated || hasSettledMoveout)) {
      const fixed = { ...t, unit: 'Unassigned', rent: 0, deposit: 0 };
      changedTenants.push(fixed);
      return fixed;
    }
    return t;
  });

  // 5. Reconcile Invoices: Void unpaid rent or deposit invoices for concluded tenancies
  const changedInvoices: any[] = [];
  const invoices = (input.invoices || []).map((inv) => {
    if (inv.status === 'paid' || inv.status === 'void') return inv;
    const invUnit = clean(inv.unit);
    const matchingAg = agreements.find((a) => a.id === inv.leaseAgreementId);
    const isAgTerminated = matchingAg && (matchingAg.status === 'terminated' || matchingAg.status === 'cancelled');
    const hasConcludedMoveout = moveOuts.some((m) => {
      if (!isSettled(m)) return false;
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
        status: 'void',
        notes: inv.notes ? `${inv.notes} — Voided upon tenancy conclusion.` : 'Voided upon tenancy conclusion.',
      };
      changedInvoices.push(voided);
      return voided;
    }
    return inv;
  });

  // 6. Reconcile Payments: Deduplicate duplicate refunds and duplicate deposit inflows
  const deletedPaymentIds: string[] = [];
  const rawPayments = input.payments || [];
  const seenRefundKeys = new Map<string, any>();
  const seenDepositInflowKeys = new Map<string, any>();
  const payments: any[] = [];

  rawPayments.forEach((p) => {
    const isOutflowRefund = p.direction === 'outflow' || p.type === 'deposit_refund' || (p.notes && /refund/i.test(p.notes));
    const isDepositInflow = isDepositPayment(p, input.invoices) && p.direction !== 'outflow';

    if (isOutflowRefund) {
      const cleanSettleId = p.settlementId ? p.settlementId.replace(/^DEP-SETTLE-/i, '') : '';
      const cleanClaimId = p.cashClaimId ? p.cashClaimId.replace(/^CSH-/i, '') : '';
      const cleanRefInv = p.invoiceId && p.invoiceId.startsWith('REF-') ? p.invoiceId.replace(/^REF-/i, '').replace(/^DEP-SETTLE-/i, '') : '';
      const cleanTxId = p.id ? p.id.replace(/^TXN-REF-/i, '').replace(/^TXN-CSH-/i, '') : '';

      const settleKey = cleanSettleId ? `settle:${cleanSettleId}` : '';
      const claimKey = cleanClaimId ? `claim:${cleanClaimId}` : '';
      const refInvKey = cleanRefInv ? `settle:${cleanRefInv}` : '';
      const txKey = cleanTxId ? `settle:${cleanTxId}` : '';
      const fallbackKey = `outflow:${clean(p.unit)}_${p.tenantId || ''}_${p.amount || 0}`;

      const candidateKeys = [settleKey, claimKey, refInvKey, txKey, fallbackKey].filter(Boolean);
      let existing: any;
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
          const idx = payments.findIndex((item) => item.id === existing.id);
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
