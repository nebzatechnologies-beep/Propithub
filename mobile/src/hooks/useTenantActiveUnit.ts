import { useMemo } from 'react';
import { useMobileAppData, MobileAppState } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import {
  MobileUnit,
  MobileAgreement,
  MobileProperty,
  MobileInvoice,
} from '../types';

/**
 * Resolves the true authoritative currency for an invoice by looking at the invoice itself,
 * its linked lease agreement, property, and unit.
 */
export function resolveInvoiceCurrency(
  inv: MobileInvoice | undefined | null,
  fallbackCurrency: string,
  state: MobileAppState
): string {
  if (inv?.currency && inv.currency.trim()) return inv.currency;
  if (inv?.leaseAgreementId) {
    const ag = state.agreements.find((a) => a.id === inv.leaseAgreementId);
    if (ag?.currency && ag.currency.trim()) return ag.currency;
  }
  if (inv?.propertyId) {
    const prop = state.properties.find((p) => p.id === inv.propertyId);
    if (prop?.currency && prop.currency.trim()) return prop.currency;
  }
  if (inv?.unit) {
    const unit = state.units.find(
      (u) =>
        (u.id === inv.unit || u.unitNumber === inv.unit) &&
        (!inv.propertyId || u.propertyId === inv.propertyId)
    );
    if (unit?.currency && unit.currency.trim()) return unit.currency;

    // Check agreement by agreementId OR unit scoped to propertyId
    const agByUnit = state.agreements.find(
      (a) =>
        ((inv.agreementId && a.id === inv.agreementId) ||
          ((a.unit === inv.unit || a.id === inv.unit) &&
            (!inv.propertyId || !a.propertyId || a.propertyId === inv.propertyId))) &&
        a.status !== 'terminated'
    );
    if (agByUnit?.currency && agByUnit.currency.trim()) return agByUnit.currency;
  }
  return fallbackCurrency || 'USD';
}

export function useTenantActiveUnit() {
  const { state, selectedTenantUnitId, setSelectedTenantUnitId } = useMobileAppData();
  const { user } = useMobileAuth();
  const { viewCurrency } = useMobileCurrency();

  const userEmail = (user?.email || '').toLowerCase().trim();
  const userName = (user?.displayName || '').toLowerCase().trim();
  const userId = user?.id || '';

  // 1. Identify agreements belonging to this tenant
  const myAgreements = useMemo(() => {
    const rawList = state.agreements.filter((a) => {
      if (a.status === 'terminated' || a.status === 'cancelled') return false;

      // Exclude agreements for units where move-out has concluded or refund was completed for this specific agreement
      const hasCompletedMoveOut = (state.moveOuts || []).some((m) => {
        const cleanMUnit = (m.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const cleanAUnit = (a.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const matchesUnit =
          (cleanMUnit && cleanAUnit && cleanMUnit === cleanAUnit) ||
          (m.unit && a.id && m.unit.toLowerCase().trim() === a.id.toLowerCase().trim());
        const matchesProp = !m.propertyId || !a.propertyId || m.propertyId === a.propertyId;
        const isCompleted =
          m.status === 'settled' ||
          m.status === 'refund_completed' ||
          Boolean(m.tenantConfirmedReceipt);

        if (!matchesUnit || !matchesProp || !isCompleted) return false;

        // If move-out explicitly references an agreement ID, only vacate that specific agreement
        if (m.agreementId || (m as any).leaseAgreementId) {
          return m.agreementId === a.id || (m as any).leaseAgreementId === a.id;
        }

        // A pending onboarding agreement is never a completed move-out
        if (
          a.status === 'awaiting_tenant_signature' ||
          a.status === 'awaiting_tenant_upload' ||
          a.status === 'draft' ||
          a.status === 'pending_approval' ||
          a.status === 'pending_deposit'
        ) {
          return false;
        }

        const moTime = new Date((m as any).settledAt || (m as any).tenantConfirmedAt || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const agTime = new Date((a as any).createdAt || (a as any).ownerSignedUploadedAt || (a as any).initialUploadedAt || a.start || 0).getTime();

        // If agreement was explicitly created AFTER the move out concluded, it is a new re-onboarded lease
        if (moTime > 0 && agTime > moTime) {
          return false;
        }

        // Otherwise, this completed move-out concludes the agreement
        return true;
      });
      if (hasCompletedMoveOut) return false;

      const matchId = Boolean(userId && a.tenantId === userId);
      const matchEmail = Boolean(userEmail && a.tenantEmail?.toLowerCase().trim() === userEmail);
      return matchId || matchEmail;
    });

    // Deduplicate per property and unit: prioritize active/pending_deposit onboarding over old records
    const byUnit = new Map<string, MobileAgreement>();
    const statusRank = (ag: MobileAgreement) => {
      const s = ag.status;
      const cleanU = (ag.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const isInvitePending = (state.tenancyRequests || []).some(
        (r) =>
          r.status === 'pending' &&
          (r.tenantId === userId || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
          ((r.unitNumber && (r.unitNumber || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanU) || r.unitId === ag.unit)
      );
      if (isInvitePending) return 30; // Offer pending acceptance
      if (s === 'active') return 100;
      if (s === 'pending_deposit') return 90;
      if (s === 'pending_approval' || (s as any) === 'awaiting_owner_signature') return 80;
      if (s === 'awaiting_tenant_upload' || s === 'awaiting_tenant_signature') return 70;
      if (s === 'draft') return 50;
      return 10;
    };

    rawList.forEach((ag) => {
      const cleanUnit = (ag.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const uKey = `${(ag.propertyId || '').toLowerCase()}_${cleanUnit}`;
      const existing = byUnit.get(uKey);
      if (!existing) {
        byUnit.set(uKey, ag);
      } else {
        const rankDiff = statusRank(ag) - statusRank(existing);
        if (rankDiff > 0) {
          byUnit.set(uKey, ag);
        } else if (rankDiff === 0) {
          const existingEnd = new Date(ag.end || ag.createdAt || 0).getTime();
          const curEnd = new Date(existing.end || existing.createdAt || 0).getTime();
          if (existingEnd > curEnd) {
            byUnit.set(uKey, ag);
          }
        }
      }
    });
    return Array.from(byUnit.values());
  }, [state.agreements, state.moveOuts, state.tenancyRequests, userId, userEmail]);

  // Set of agreement unit identifiers
  const myAgreementUnitSet = useMemo(() => {
    const set = new Set<string>();
    myAgreements.forEach((a) => {
      if (a.unit) set.add(a.unit.toLowerCase().trim());
    });
    return set;
  }, [myAgreements]);

  // Tenant records belonging to this resident
  const myTenantRecords = useMemo(() => {
    return state.tenants.filter((t) => {
      const matchId = Boolean(userId && t.id === userId);
      const matchEmail = Boolean(userEmail && t.email?.toLowerCase().trim() === userEmail);
      return matchId || matchEmail;
    });
  }, [state.tenants, userId, userEmail]);

  const isGenericName = (n?: string) => {
    if (!n) return true;
    const s = n.trim().toLowerCase();
    return s === 'resident' || s === 'tenant' || s === 'user' || s === 'guest' || s === 'admin';
  };

  // 2. Resolve all units belonging to this tenant
  const myUnits = useMemo(() => {
    const list: MobileUnit[] = [];
    const seenKeys = new Set<string>();

    const makeKey = (propId: string, unitNum: string) => `${propId || ''}_${unitNum}`.toLowerCase();

    // Pass 1: Units matched directly in state.units
    state.units.forEach((u) => {
      const matchId = Boolean(userId && u.currentTenantId === userId);
      const matchEmail = Boolean(userEmail && u.tenant?.toLowerCase().trim() === userEmail);

      // Match through verified agreement for this specific property
      const matchAgreement = myAgreements.some(
        (a) =>
          (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
          (a.unit.toLowerCase().trim() === u.unitNumber.toLowerCase().trim() || a.unit === u.id)
      );

      // Match through tenant record for this specific property
      const matchTenantRecord = myTenantRecords.some(
        (t) =>
          (!t.propertyId || !u.propertyId || t.propertyId === u.propertyId) &&
          (t.unit?.toLowerCase().trim() === u.unitNumber.toLowerCase().trim() ||
            t.unit === u.id ||
            (t.unitsRented && t.unitsRented.some((r) => r.toLowerCase().trim() === u.unitNumber.toLowerCase().trim())))
      );

      if (matchId || matchEmail || matchAgreement || matchTenantRecord) {
        // Exclude if unit is vacant
        if (u.status !== 'occupied' && u.status !== 'reserved') {
          return;
        }

        const cleanUNum = (u.unitNumber || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

        // Check if there is a pending unaccepted tenancy request for this unit
        const hasPendingReqForUnit = (state.tenancyRequests || []).some(
          (r) =>
            (r.tenantId === userId || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
            (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId) &&
            (r.unitId === u.id || (r.unitNumber && (r.unitNumber || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanUNum)) &&
            r.status === 'pending'
        );

        // Exclude if tenancy request was declined or cancelled and there is no active agreement
        const isReqDeclinedOrCancelled = (state.tenancyRequests || []).some(
          (r) =>
            (r.tenantId === userId || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
            (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId) &&
            (r.unitId === u.id || (r.unitNumber && (r.unitNumber || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanUNum)) &&
            (r.status === 'declined' || r.status === 'cancelled')
        );
        const hasActiveAgForUnit = myAgreements.some(
          (a) =>
            a.status !== 'terminated' &&
            a.status !== 'cancelled' &&
            !hasPendingReqForUnit &&
            (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
            ((a as any).unitId === u.id || a.unit === u.id || (a.unit && (a.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanUNum))
        );
        if (isReqDeclinedOrCancelled && !hasActiveAgForUnit) {
          return;
        }

        // Must have an active agreement OR an accepted or pending tenancy request
        const hasAcceptedReqForUnit = (state.tenancyRequests || []).some(
          (r) =>
            (r.tenantId === userId || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
            (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId) &&
            (r.unitId === u.id || (r.unitNumber && (r.unitNumber || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanUNum)) &&
            r.status === 'accepted'
        );

        if (!hasActiveAgForUnit && !hasAcceptedReqForUnit && !hasPendingReqForUnit) {
          return;
        }

        // Exclude settled or refund-completed move-out unless tenant currently has a newer active agreement for this unit
        const hasCompletedMoveOut = (state.moveOuts || []).some((m) => {
          const cleanMUnit = (m.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
          const cleanUUnit = (u.unitNumber || u.id || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
          const matchesUnit = cleanMUnit === cleanUUnit || m.unit === u.unitNumber || m.unit === u.id;
          const matchesProp = !m.propertyId || !u.propertyId || m.propertyId === u.propertyId;
          const isCompleted =
            m.status === 'settled' ||
            m.status === 'refund_completed' ||
            Boolean(m.tenantConfirmedReceipt);
          return matchesUnit && matchesProp && isCompleted;
        });

        if (!hasCompletedMoveOut || hasActiveAgForUnit) {
          const key = makeKey(u.propertyId, u.unitNumber);
          if (!seenKeys.has(key)) {
            const prop = state.properties.find((p) => p.id === u.propertyId);
            const guaranteedId =
              u.id && u.propertyId && !u.id.startsWith(`${u.propertyId}_`) && !u.id.startsWith(`unit-${u.propertyId}`)
                ? `${u.propertyId}_${u.id}`
                : (u.id || `${u.propertyId || 'prop'}_${u.unitNumber}`);
            list.push({
              ...u,
              id: guaranteedId,
              status: hasPendingReqForUnit ? 'reserved' : u.status,
              propertyName: u.propertyName || prop?.name || 'Property',
            });
            seenKeys.add(key);
            seenKeys.add(guaranteedId.toLowerCase());
            seenKeys.add(u.id.toLowerCase());
          }
        }
      }
    });

    // Pass 2: Agreements for units not yet in state.units
    myAgreements.forEach((ag) => {
      const key = makeKey(ag.propertyId || '', ag.unit);
      if (!seenKeys.has(key)) {
        const cleanAgU = (ag.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const hasPendingReqForAg = (state.tenancyRequests || []).some(
          (r) =>
            (r.tenantId === userId || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
            (!r.propertyId || !ag.propertyId || r.propertyId === ag.propertyId) &&
            (r.unitId === (ag as any).unitId || r.unitId === ag.unit || (r.unitNumber && (r.unitNumber || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanAgU)) &&
            r.status === 'pending'
        );
        const prop = state.properties.find((p) => p.id === ag.propertyId);
        list.push({
          id: `virtual-${ag.id || `${ag.propertyId || ''}-${ag.unit}`}`,
          propertyId: ag.propertyId || '',
          propertyName: ag.propertyName || prop?.name || 'Property',
          ownerId: ag.ownerId || '',
          unitNumber: ag.unit,
          unitType: 'Apartment',
          floor: '1',
          areaSqFt: 850,
          furnishing: 'Semi-Furnished',
          rent: ag.rent,
          deposit: ag.deposit,
          status: hasPendingReqForAg ? 'reserved' : ag.status === 'active' ? 'occupied' : 'reserved',
          isListedPublicly: false,
          tenant: ag.tenant,
          currentTenantId: ag.tenantId,
          currency: ag.currency || prop?.currency || viewCurrency || 'USD',
        });
        seenKeys.add(key);
      }
    });

    // Pass 3: Multi-property resident records (checks t.unit AND all t.unitsRented)
    myTenantRecords.forEach((t) => {
      const unitsToCheck = [
        ...(t.unit && t.unit !== 'Pending' ? [t.unit] : []),
        ...(t.unitsRented || []),
      ];
      unitsToCheck.forEach((uNum) => {
        const hasActiveAgForUNum = myAgreements.some(
          (a) =>
            a.status !== 'terminated' &&
            a.status !== 'cancelled' &&
            (!a.propertyId || !t.propertyId || a.propertyId === t.propertyId) &&
            (a.unit?.toLowerCase().trim() === uNum.toLowerCase().trim() || a.unit === uNum)
        );
        const hasPendingReqForUNum = (state.tenancyRequests || []).some(
          (r) =>
            (r.tenantId === userId || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
            (!r.propertyId || !t.propertyId || r.propertyId === t.propertyId) &&
            (r.unitNumber?.toLowerCase().trim() === uNum.toLowerCase().trim() || r.unitId === uNum) &&
            (r.status === 'pending' || r.status === 'accepted')
        );

        // Exclude units where move-out is concluded unless currently covered by an active/pending lease or request
        const hasCompletedMoveOut = (state.moveOuts || []).some(
          (m) =>
            (m.tenantId === userId || (userEmail && m.tenantName?.toLowerCase().trim() === userEmail)) &&
            (!m.propertyId || !t.propertyId || m.propertyId === t.propertyId) &&
            m.unit?.toLowerCase().trim() === uNum.toLowerCase().trim() &&
            (m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt))
        );
        if (hasCompletedMoveOut && !hasActiveAgForUNum && !hasPendingReqForUNum) return;

        const key = makeKey(t.propertyId || '', uNum);
        if (!seenKeys.has(key)) {
          const prop = state.properties.find((p) => p.id === t.propertyId);
          list.push({
            id: `tenant-unit-${t.id}-${t.propertyId || ''}-${uNum}`,
            propertyId: t.propertyId || '',
            propertyName: t.propertyName || prop?.name || 'Property',
            ownerId: t.ownerId || '',
            unitNumber: uNum,
            unitType: 'Apartment',
            floor: '1',
            areaSqFt: 850,
            furnishing: 'Semi-Furnished',
            rent: t.rent || 0,
            deposit: t.deposit || 0,
            status: 'occupied',
            isListedPublicly: false,
            tenant: t.name,
            currentTenantId: t.id,
            currency: t.currency || prop?.currency || viewCurrency || 'USD',
          });
          seenKeys.add(key);
        }
      });
    });

    // Prioritize units with active agreement or pending onboarding
    list.sort((a, b) => {
      const getUnitScore = (u: MobileUnit) => {
        const ag = myAgreements.find(
          (item) =>
            (item.unit === u.unitNumber || item.unit === u.id) &&
            (!item.propertyId || !u.propertyId || item.propertyId === u.propertyId)
        );
        if (!ag) return 0;
        if (ag.status === 'pending_deposit') return 5;
        if (ag.status === 'active') return 4;
        if (ag.status === 'pending_approval' || (ag as any).status === 'awaiting_owner_signature') return 3;
        if (ag.status === 'awaiting_tenant_upload' || ag.status === 'awaiting_tenant_signature') return 2;
        return 1;
      };
      return getUnitScore(b) - getUnitScore(a);
    });

    return list;
  }, [
    state.units,
    state.moveOuts,
    state.properties,
    myAgreements,
    myTenantRecords,
    userId,
    userEmail,
    userName,
    viewCurrency,
  ]);

  // 3. Resolve active unit
  const activeUnit = useMemo(() => {
    if (selectedTenantUnitId) {
      const foundById = myUnits.find((u) => u.id === selectedTenantUnitId || u.id.endsWith(`_${selectedTenantUnitId}`));
      if (foundById) return foundById;

      const foundByComposite = myUnits.find(
        (u) =>
          `${u.propertyId || ''}_${u.unitNumber}`.toLowerCase() === selectedTenantUnitId.toLowerCase() ||
          `${u.propertyId || ''}_${u.id}`.toLowerCase() === selectedTenantUnitId.toLowerCase()
      );
      if (foundByComposite) return foundByComposite;

      const foundByUnitNum = myUnits.find(
        (u) => u.unitNumber.toLowerCase() === selectedTenantUnitId.toLowerCase()
      );
      if (foundByUnitNum) return foundByUnitNum;
    }
    return myUnits[0] || null;
  }, [selectedTenantUnitId, myUnits]);

  // 4. Resolve active agreement strictly for this unit
  const activeAgreement = useMemo(() => {
    if (!activeUnit) return myAgreements[0] || null;
    const cleanUnitNum = activeUnit.unitNumber.toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

    return (
      myAgreements.find((a) => {
        const agUnitNum = a.unit.toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const unitMatch =
          a.unit.toLowerCase() === activeUnit.unitNumber.toLowerCase() ||
          a.unit.toLowerCase() === activeUnit.id.toLowerCase() ||
          agUnitNum === cleanUnitNum;

        const propMatch =
          !activeUnit.propertyId ||
          !a.propertyId ||
          a.propertyId === activeUnit.propertyId ||
          (Boolean(activeUnit.propertyName && a.propertyName) &&
            activeUnit.propertyName.toLowerCase().trim() === a.propertyName.toLowerCase().trim());

        return unitMatch && propMatch;
      }) || myAgreements[0] || null
    );
  }, [myAgreements, activeUnit]);

  // 5. Resolve active property strictly from active unit and its agreement
  const activeProperty = useMemo(() => {
    if (activeUnit?.propertyId) {
      const p = state.properties.find((prop) => prop.id === activeUnit.propertyId);
      if (p) return p;
    }
    if (activeAgreement?.propertyId) {
      const p = state.properties.find((prop) => prop.id === activeAgreement.propertyId);
      if (p) return p;
    }
    const propName = (activeUnit?.propertyName || activeAgreement?.propertyName || '').trim().toLowerCase();
    if (propName) {
      const p = state.properties.find(
        (prop) => prop.name.trim().toLowerCase() === propName ||
                  prop.name.trim().toLowerCase().includes(propName) ||
                  propName.includes(prop.name.trim().toLowerCase())
      );
      if (p) return p;
    }
    return null;
  }, [state.properties, activeAgreement, activeUnit]);

  // 6. Authoritative currency
  const activeCurrency = useMemo(() => {
    return (
      activeAgreement?.currency ||
      activeProperty?.currency ||
      activeUnit?.currency ||
      viewCurrency ||
      'USD'
    );
  }, [activeAgreement, activeProperty, activeUnit, viewCurrency]);

  // 7. Authoritative financial metrics
  const activeRent = activeAgreement?.rent || activeUnit?.rent || 0;
  const activeDeposit = activeAgreement?.deposit || activeUnit?.deposit || 0;

  // 8. Invoices for active unit (and tenant)
  const unitInvoices = useMemo(() => {
    return state.invoices.filter((inv) => {
      if (inv.status === 'cancelled' || (inv as any).status === 'void' || (inv as any).status === 'refunded') return false;

      // Exclude if unit has completed move out and no active tenancy exists
      const hasActiveLeaseForUnit = myAgreements.some(
        (a) =>
          a.status !== 'terminated' &&
          a.status !== 'cancelled' &&
          (a.unit?.toLowerCase().trim() === inv.unit?.toLowerCase().trim() || a.id === inv.leaseAgreementId) &&
          (!inv.propertyId || !a.propertyId || inv.propertyId === a.propertyId)
      );
      const isUnitVacated =
        !hasActiveLeaseForUnit &&
        (state.moveOuts || []).some(
          (m) =>
            m.unit?.toLowerCase().trim() === inv.unit?.toLowerCase().trim() &&
            (!inv.propertyId || !m.propertyId || inv.propertyId === m.propertyId) &&
            (m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt))
        );
      if (isUnitVacated) return false;

      // Exclude past invoices belonging to a vacated tenancy
      const isPastVacatedInvoice = (state.moveOuts || []).some((m) => {
        const matchesUnit =
          (m.unit && inv.unit && m.unit.toLowerCase().trim() === inv.unit.toLowerCase().trim()) ||
          (activeUnit && m.unit && m.unit.toLowerCase().trim() === activeUnit.unitNumber.toLowerCase().trim());
        const matchesProp = !m.propertyId || !inv.propertyId || m.propertyId === inv.propertyId;
        const isCompleted =
          m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt);
        if (!matchesUnit || !matchesProp || !isCompleted) return false;

        if (inv.leaseAgreementId && activeAgreement && inv.leaseAgreementId !== activeAgreement.id) {
          return true;
        }

        const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const invDueTime = new Date(inv.due || inv.createdAt || 0).getTime();
        const agStartTime = activeAgreement ? new Date(activeAgreement.start || 0).getTime() : 0;

        if (moTime > 0 && invDueTime <= moTime) return true;
        if (agStartTime > 0 && invDueTime < agStartTime) return true;

        return false;
      });
      if (isPastVacatedInvoice) return false;

      const isTenant =
        (userId && inv.tenantId === userId) ||
        (userEmail && inv.tenantEmail?.toLowerCase().trim() === userEmail) ||
        (userName && inv.tenant.toLowerCase().trim() === userName);

      if (!activeUnit) return isTenant;

      const isUnit =
        (inv.unit.toLowerCase() === activeUnit.unitNumber.toLowerCase() ||
         inv.unit.toLowerCase() === activeUnit.id.toLowerCase() ||
         (Boolean(activeAgreement) && inv.leaseAgreementId === activeAgreement?.id)) &&
        (!inv.propertyId || !activeUnit.propertyId || inv.propertyId === activeUnit.propertyId);

      return isTenant && isUnit;
    });
  }, [state.invoices, state.moveOuts, myAgreements, activeUnit, activeAgreement, userId, userEmail, userName]);

  // All pending invoices for this tenant across their portfolio
  const allTenantPendingInvoices = useMemo(() => {
    return state.invoices.filter((inv) => {
      if (inv.status === 'paid' || inv.status === 'cancelled' || (inv as any).status === 'void' || (inv as any).status === 'refunded') return false;

      // Exclude if unit has completed move out and no active tenancy exists
      const hasActiveLeaseForUnit = myAgreements.some(
        (a) =>
          a.status !== 'terminated' &&
          a.status !== 'cancelled' &&
          (a.unit?.toLowerCase().trim() === inv.unit?.toLowerCase().trim() || a.id === inv.leaseAgreementId) &&
          (!inv.propertyId || !a.propertyId || inv.propertyId === a.propertyId)
      );
      const isUnitVacated =
        !hasActiveLeaseForUnit &&
        (state.moveOuts || []).some(
          (m) =>
            m.unit?.toLowerCase().trim() === inv.unit?.toLowerCase().trim() &&
            (!inv.propertyId || !m.propertyId || inv.propertyId === m.propertyId) &&
            (m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt))
        );
      if (isUnitVacated) return false;

      // Exclude past invoices belonging to a vacated tenancy
      const isPastVacatedInvoice = (state.moveOuts || []).some((m) => {
        const matchesUnit = m.unit && inv.unit && m.unit.toLowerCase().trim() === inv.unit.toLowerCase().trim();
        const matchesProp = !m.propertyId || !inv.propertyId || m.propertyId === inv.propertyId;
        const isCompleted =
          m.status === 'settled' || m.status === 'refund_completed' || Boolean(m.tenantConfirmedReceipt);
        if (!matchesUnit || !matchesProp || !isCompleted) return false;

        const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const invDueTime = new Date(inv.due || inv.createdAt || 0).getTime();
        if (moTime > 0 && invDueTime <= moTime) return true;

        return false;
      });
      if (isPastVacatedInvoice) return false;

      const isTenant =
        (userId && inv.tenantId === userId) ||
        (userEmail && inv.tenantEmail?.toLowerCase().trim() === userEmail) ||
        (userName && inv.tenant.toLowerCase().trim() === userName);
      return isTenant && (inv.status === 'sent' || inv.status === 'overdue');
    });
  }, [state.invoices, state.moveOuts, myAgreements, userId, userEmail, userName]);

  // Pending invoices for active unit only
  const activeUnitPendingInvoices = useMemo(() => {
    return unitInvoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue');
  }, [unitInvoices]);

  return {
    state,
    myUnits,
    isMultiUnit: myUnits.length > 1,
    activeUnit,
    activeAgreement,
    activeProperty,
    activeCurrency,
    activeRent,
    activeDeposit,
    unitInvoices,
    activeUnitPendingInvoices,
    allTenantPendingInvoices,
    selectedTenantUnitId: activeUnit?.id || null,
    setSelectedTenantUnitId,
  };
}
