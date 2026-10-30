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
  // Check active/signed agreement for this specific property and unit
  const activeAgreement = agreements.find(
    (a) =>
      (!a.propertyId || !unit.propertyId || a.propertyId === unit.propertyId) &&
      (a.unitId === unit.id || (a.unit && (a.unit === unit.unitNumber || a.unit === unit.id))) &&
      (a.status === 'active' || a.status === 'signed')
  );

  // Check pending signature or approval agreement
  const pendingAgreement = !activeAgreement
    ? agreements.find(
        (a) =>
          (!a.propertyId || !unit.propertyId || a.propertyId === unit.propertyId) &&
          (a.unitId === unit.id || (a.unit && (a.unit === unit.unitNumber || a.unit === unit.id))) &&
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
      (!r.propertyId || !unit.propertyId || r.propertyId === unit.propertyId) &&
      (r.unitId === unit.id || (r.unitNumber && (r.unitNumber === unit.unitNumber || r.unitNumber === unit.id))) &&
      r.status === 'pending'
  );

  let effectiveStatus: 'occupied' | 'reserved' | 'maintenance' | 'vacant' = 'vacant';

  if (unit.status === 'maintenance') {
    effectiveStatus = 'maintenance';
  } else if (unit.status === 'reserved' || pendingAgreement || pendingRequest) {
    // If unit is reserved or has a pending invitation/signing, it is strictly Reserved, not Occupied
    effectiveStatus = 'reserved';
  } else if (activeAgreement || unit.status === 'occupied') {
    // If marked occupied on unit model, verify it isn't explicitly terminated without a tenant
    const hasTerminatedAgreementOnly =
      agreements.some((a) => (!a.propertyId || !unit.propertyId || a.propertyId === unit.propertyId) && (a.unitId === unit.id || a.unit === unit.unitNumber) && a.status === 'terminated') &&
      !agreements.some((a) => (!a.propertyId || !unit.propertyId || a.propertyId === unit.propertyId) && (a.unitId === unit.id || a.unit === unit.unitNumber) && (a.status === 'active' || a.status === 'signed'));

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

