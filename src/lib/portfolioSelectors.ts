import { Property, Unit, Agreement, TenancyRequest } from '../types';

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
 * Resolves the true relational status of a unit based on active agreements,
 * pending requests, and current unit status (implements H-5, H-6, H-7, H-8).
 */
export function resolveUnitOccupancy(
  unit: Unit,
  agreements: Agreement[] = [],
  tenancyRequests: TenancyRequest[] = []
): UnitOccupancyInfo {
  // Check active/signed agreement
  const activeAgreement = agreements.find(
    (a) =>
      (a.unitId === unit.id || a.unit === unit.unitNumber) &&
      (a.status === 'active' || a.status === 'signed')
  );

  // Check pending signature or approval agreement
  const pendingAgreement = !activeAgreement
    ? agreements.find(
        (a) =>
          (a.unitId === unit.id || a.unit === unit.unitNumber) &&
          (a.status === 'awaiting_tenant_signature' ||
            a.status === 'pending_countersign' ||
            a.status === 'pending_deposit' ||
            a.status === 'pending_approval' ||
            a.status === 'awaiting_tenant_upload')
      )
    : undefined;

  // Check pending tenancy request
  const pendingRequest = tenancyRequests.find(
    (r) =>
      (r.unitId === unit.id || r.unitNumber === unit.unitNumber) &&
      r.status === 'pending'
  );

  let effectiveStatus: 'occupied' | 'reserved' | 'maintenance' | 'vacant' = 'vacant';

  if (unit.status === 'maintenance') {
    effectiveStatus = 'maintenance';
  } else if (activeAgreement) {
    effectiveStatus = 'occupied';
  } else if (pendingAgreement || pendingRequest || unit.status === 'reserved') {
    effectiveStatus = 'reserved';
  } else if (unit.status === 'occupied') {
    // If marked occupied on unit model, verify it isn't explicitly terminated without a tenant
    const hasTerminatedAgreementOnly =
      agreements.some((a) => (a.unitId === unit.id || a.unit === unit.unitNumber) && a.status === 'terminated') &&
      !agreements.some((a) => (a.unitId === unit.id || a.unit === unit.unitNumber) && (a.status === 'active' || a.status === 'signed'));

    if (hasTerminatedAgreementOnly && !unit.currentTenantId && !unit.tenant) {
      effectiveStatus = 'vacant';
    } else {
      effectiveStatus = 'occupied';
    }
  } else {
    effectiveStatus = 'vacant';
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
  targetCurrency?: string
): PropertyPortfolioMetrics {
  let occupiedCount = 0;
  let reservedCount = 0;
  let vacantCount = 0;
  let maintenanceCount = 0;
  let monthlyRentRoll = 0;

  units.forEach((u) => {
    const resolved = resolveUnitOccupancy(u, agreements, tenancyRequests);
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

