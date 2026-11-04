import { Property, Unit, Agreement, TenancyRequest, MoveOut } from '../types';

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
 * Resolves the true relational status of a unit based on active agreements,
 * pending requests, move-outs, and current unit status (implements H-5, H-6, H-7, H-8).
 */
export function resolveUnitOccupancy(
  unit: Unit,
  agreements: Agreement[] = [],
  tenancyRequests: TenancyRequest[] = [],
  moveouts: MoveOut[] = []
): UnitOccupancyInfo {
  // Check active/signed agreement for this specific property and unit
  const activeAgreement = agreements.find(
    (a) => (a.status === 'active' || a.status === 'signed') && matchesUnitRelational(a, unit)
  );

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

  // Check if a move-out for this unit has completed or settled
  const hasSettledMoveout = (moveouts || []).some(
    (m) =>
      (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt) &&
      matchesUnitRelational({ unit: m.unit, propertyId: m.propertyId }, unit)
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

    if (unit.status === 'vacant' || hasSettledMoveout || hasTerminatedAgreementOnly) {
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

