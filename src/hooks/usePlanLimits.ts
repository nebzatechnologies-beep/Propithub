import { useState } from 'react';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { Plan } from '../types';
import { loadCachedTrialDays } from '../lib/store';

export type ResourceQuotaType = 'properties' | 'units' | 'tenants' | 'managers' | 'staff';

export function findMatchingPlan(
  plans: Plan[],
  planId?: string,
  planName?: string,
  isTrial: boolean = false
): Plan {
  if (!plans || plans.length === 0) {
    return {
      id: 'starter',
      name: 'Starter',
      price: 29,
      properties: 1,
      units: 5,
      tenants: 5,
      managers: 0,
      staff: 1,
      owners: 0,
    };
  }

  // 1. Direct ID match
  if (planId) {
    const byId = plans.find((p) => p.id.toLowerCase() === planId.toLowerCase());
    if (byId) return byId;
  }

  const rawName = (planName || '').trim();
  if (rawName) {
    // 2. Exact match
    const exact = plans.find(
      (p) =>
        p.name.toLowerCase() === rawName.toLowerCase() ||
        p.id.toLowerCase() === rawName.toLowerCase()
    );
    if (exact) return exact;

    // 3. Normalized stripped match (removes "Tier", "Plan", "Subscription")
    const clean = rawName
      .replace(/\b(tier|plan|subscription)\b/gi, '')
      .trim()
      .toLowerCase();

    if (clean) {
      const byClean = plans.find(
        (p) =>
          p.name.toLowerCase() === clean ||
          p.id.toLowerCase() === clean
      );
      if (byClean) return byClean;

      // 4. Typo tolerance: "stater", "stat", "start" -> Starter
      if (/^stat|^start/i.test(clean)) {
        const starter = plans.find((p) => /start/i.test(p.id) || /start/i.test(p.name));
        if (starter) return starter;
      }

      // "grow" -> Growth
      if (/^grow/i.test(clean)) {
        const growth = plans.find((p) => /grow/i.test(p.id) || /grow/i.test(p.name));
        if (growth) return growth;
      }

      // "enter" -> Enterprise
      if (/^enter/i.test(clean)) {
        const enterprise = plans.find((p) => /enter/i.test(p.id) || /enter/i.test(p.name));
        if (enterprise) return enterprise;
      }

      // 5. Substring inclusion
      const partial = plans.find(
        (p) =>
          p.name.toLowerCase().includes(clean) ||
          clean.includes(p.name.toLowerCase())
      );
      if (partial) return partial;
    }
  }

  // 6. Free trial fallback
  if (isTrial) {
    const trialPlan = plans.find((p) => p.isTrialOnly || p.id === 'free_trial');
    if (trialPlan) return trialPlan;
  }

  // 7. Non-trial fallback: first non-archived commercial plan
  const commercial = plans.find((p) => !p.isTrialOnly && p.id !== 'free_trial' && !p.isArchived);
  return commercial || plans[0];
}

export function usePlanLimits(explicitOwnerId?: string) {
  const { state } = useAppData();
  const { user } = useAuth();

  const userFromState = state.users.find(
    (u) => (user?.id && u.id === user.id) || (user?.email && u.email?.toLowerCase() === user.email.toLowerCase())
  );

  const isSubordinate = user?.role === 'manager' || user?.role === 'staff' || userFromState?.role === 'manager' || userFromState?.role === 'staff';
  const subordinateParentId =
    explicitOwnerId ||
    user?.ownerId ||
    userFromState?.ownerId ||
    (isSubordinate
      ? state.propertyManagers?.find((m: any) => m.id === user?.id || (user?.email && m.email?.toLowerCase() === user.email.toLowerCase()))?.ownerId ||
        state.staff?.find((s: any) => s.id === user?.id || (user?.email && s.email?.toLowerCase() === user.email.toLowerCase()))?.ownerId
      : undefined);

  const resolvedOwnerId = subordinateParentId || user?.id || userFromState?.id || '';

  const ownerUserFromState = state.users.find(
    (u) => (resolvedOwnerId && u.id === resolvedOwnerId) || (!isSubordinate && user?.email && u.email?.toLowerCase() === user.email.toLowerCase())
  );

  const ownerSettings =
    (resolvedOwnerId ? state.ownerSettings[resolvedOwnerId] : undefined) ||
    (ownerUserFromState?.id ? state.ownerSettings[ownerUserFromState.id] : undefined);

  // 1. Detect any settled platform invoices for this owner
  const myPaidInvoices = (state.platformInvoices || []).filter(
    (inv) =>
      inv.status === 'paid' &&
      ((resolvedOwnerId && inv.ownerId === resolvedOwnerId) ||
       (ownerUserFromState?.id && inv.ownerId === ownerUserFromState.id) ||
       (ownerUserFromState?.email && inv.ownerEmail?.toLowerCase() === ownerUserFromState.email.toLowerCase()))
  );

  const latestPaidInvoice = myPaidInvoices.length > 0
    ? [...myPaidInvoices].sort((a, b) => new Date(b.paidAt || b.issueDate).getTime() - new Date(a.paidAt || a.issueDate).getTime())[0]
    : null;

  const hasPaidInvoice = Boolean(latestPaidInvoice);
  const isPaidInvoiceUnexpired = Boolean(
    latestPaidInvoice &&
    (!latestPaidInvoice.periodEnd || new Date(latestPaidInvoice.periodEnd).getTime() > Date.now())
  );

  const hasActivePaidSubscription =
    (ownerSettings?.planStatus === 'active' && (!ownerSettings?.subscriptionEndsAt || new Date(ownerSettings.subscriptionEndsAt).getTime() > Date.now())) ||
    isPaidInvoiceUnexpired;

  const cachedTrialDays = loadCachedTrialDays();
  const dynamicTrialDays = typeof state.defaultTrialDays === 'number'
    ? state.defaultTrialDays
    : (cachedTrialDays !== null ? cachedTrialDays : 14);

  const isTrial = !hasActivePaidSubscription &&
    dynamicTrialDays > 0 &&
    (ownerSettings?.planStatus === 'trialing' || (!ownerSettings?.planStatus && !hasPaidInvoice));

  const trialEnds = isTrial && ownerSettings?.trialEndsAt ? new Date(ownerSettings.trialEndsAt) : null;
  const daysLeft = isTrial && trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : (isTrial ? dynamicTrialDays : 0);

  const isSubscriptionExpired = Boolean(
    (ownerSettings?.planStatus === 'active' &&
      ownerSettings?.subscriptionEndsAt &&
      new Date(ownerSettings.subscriptionEndsAt).getTime() <= Date.now()) ||
    (hasPaidInvoice && !isPaidInvoiceUnexpired)
  );

  const isExpired = !hasActivePaidSubscription && (
    ownerSettings
      ? ownerSettings.planStatus === 'expired' ||
        (dynamicTrialDays === 0 && ownerSettings.planStatus !== 'active') ||
        (ownerSettings.trialEndsAt && new Date(ownerSettings.trialEndsAt).getTime() <= Date.now()) ||
        isSubscriptionExpired
      : (hasPaidInvoice ? false : dynamicTrialDays === 0)
  );

  // Authoritative plan name: paid invoice takes first priority, then ownerSettings, then user plan
  const activePlanCandidate =
    (hasActivePaidSubscription ? (latestPaidInvoice?.planName || ownerSettings?.planName) : undefined) ||
    ownerSettings?.planName ||
    (ownerUserFromState?.plan && ownerUserFromState.plan !== 'Free Trial' ? ownerUserFromState.plan : undefined) ||
    (!isSubordinate && user?.plan && user.plan !== 'Free Trial' ? user.plan : undefined) ||
    state.ownerPlan;

  const currentPlan = findMatchingPlan(
    state.plans,
    latestPaidInvoice?.planId || ownerSettings?.planId,
    activePlanCandidate || (isTrial ? 'Free Trial' : 'Starter'),
    isTrial
  );

  const currentPlanName = isTrial
    ? 'Free Trial'
    : (currentPlan?.name || activePlanCandidate || 'Starter');

  const propertiesUsed = resolvedOwnerId ? state.properties.filter((p) => p.ownerId === resolvedOwnerId).length : 0;
  const unitsUsed = resolvedOwnerId ? state.units.filter((u) => u.ownerId === resolvedOwnerId).length : 0;
  const tenantsUsed = resolvedOwnerId ? state.tenants.filter((t) => t.ownerId === resolvedOwnerId).length : 0;
  const managersUsed = resolvedOwnerId ? (state.propertyManagers || []).filter((m: any) => m.ownerId === resolvedOwnerId).length : 0;
  const staffUsed = resolvedOwnerId ? (state.staff || []).filter((s: any) => s.ownerId === resolvedOwnerId).length : 0;

  const maxProperties = currentPlan ? currentPlan.properties : 999;
  const maxUnits = currentPlan ? currentPlan.units : 9999;
  const maxTenants = currentPlan ? currentPlan.tenants : 9999;
  const maxManagers = currentPlan?.managers ?? 0;
  const maxStaff = currentPlan?.staff ?? 0;

  const isPropertiesFull = maxProperties < 999 && propertiesUsed >= maxProperties;
  const isUnitsFull = maxUnits < 9999 && unitsUsed >= maxUnits;
  const isTenantsFull = maxTenants < 9999 && tenantsUsed >= maxTenants;
  const isManagersFull = managersUsed >= maxManagers;
  const isStaffFull = staffUsed >= maxStaff;

  const [limitModalResource, setLimitModalResource] = useState<ResourceQuotaType | null>(null);

  const openLimitModal = (type: ResourceQuotaType) => {
    setLimitModalResource(type);
  };

  const closeLimitModal = () => {
    setLimitModalResource(null);
  };

  const checkAndRun = (type: ResourceQuotaType, action: () => void) => {
    if (type === 'properties' && isPropertiesFull) {
      openLimitModal('properties');
      return false;
    }
    if (type === 'units' && isUnitsFull) {
      openLimitModal('units');
      return false;
    }
    if (type === 'tenants' && isTenantsFull) {
      openLimitModal('tenants');
      return false;
    }
    if (type === 'managers' && isManagersFull) {
      openLimitModal('managers');
      return false;
    }
    if (type === 'staff' && isStaffFull) {
      openLimitModal('staff');
      return false;
    }
    action();
    return true;
  };

  const isInitialTrialDropout = Boolean(
    isExpired &&
    !hasPaidInvoice &&
    (ownerSettings?.isInitialTrial !== false)
  );

  const purgeScheduledAt =
    ownerSettings?.purgeScheduledAt ||
    (ownerSettings?.trialEndsAt
      ? new Date(new Date(ownerSettings.trialEndsAt).getTime() + 15 * 86400000).toISOString()
      : null);

  const purgeDaysLeft = purgeScheduledAt
    ? Math.max(0, Math.ceil((new Date(purgeScheduledAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    ownerId: resolvedOwnerId,
    ownerSettings,
    hasActivePaidSubscription,
    isTrial,
    trialEnds,
    daysLeft,
    isExpired,
    isInitialTrialDropout,
    purgeScheduledAt,
    purgeDaysLeft,
    currentPlan,
    currentPlanName,
    usage: {
      properties: { used: propertiesUsed, max: maxProperties, isFull: isPropertiesFull },
      units: { used: unitsUsed, max: maxUnits, isFull: isUnitsFull },
      tenants: { used: tenantsUsed, max: maxTenants, isFull: isTenantsFull },
      managers: { used: managersUsed, max: maxManagers, isFull: isManagersFull },
      staff: { used: staffUsed, max: maxStaff, isFull: isStaffFull },
    },
    limitModalResource,
    openLimitModal,
    closeLimitModal,
    checkAndRun,
  };
}
