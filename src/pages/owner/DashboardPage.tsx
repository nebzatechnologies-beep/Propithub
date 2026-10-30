import React, { useState, useMemo, useEffect } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { GLOBAL_CURRENCIES, CurrencyMeta, formatCurrencyLabel } from '../../lib/currencyService';
import { CurrencyConverterTrigger } from '../../components/common/CurrencyConverterTrigger';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CircleDollarSign,
  Building,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { PaymentTransaction, Property, InAppNotification } from '../../types';
import { getOwnerReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { resolveUnitOccupancy, calculatePortfolioMetrics } from '../../lib/portfolioSelectors';

// Helper to normalize any currency code or symbol into canonical code and display symbol
const normalizeCurrency = (raw?: string): { code: string; symbol: string; label: string } => {
  if (!raw) return { code: 'USD', symbol: '$', label: '$' };
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (upper === '$' || upper === 'USD') return { code: 'USD', symbol: '$', label: '$' };
  if (upper === '£' || upper === 'GBP') return { code: 'GBP', symbol: '£', label: '£' };
  if (upper === 'AED') return { code: 'AED', symbol: 'AED', label: 'AED' };
  if (upper === 'EUR' || upper === '€') return { code: 'EUR', symbol: '€', label: '€' };
  if (upper === '₹' || upper === 'INR') return { code: 'INR', symbol: '₹', label: '₹' };
  return { code: upper, symbol: trimmed, label: trimmed };
};

export const OwnerDashboardPage: React.FC = () => {
  const { state, updateState, showToast } = useAppData();
  const { user, isOwnerPlanActive } = useAuth();
  const { viewCurrency, setViewCurrency, convert, format, currencies, isLive } = useCurrency();
  const ownerId = user?.id || '';

  // 1. Base entities for this owner
  const myProperties = useMemo(
    () => state.properties.filter((p) => p.ownerId === ownerId),
    [state.properties, ownerId]
  );
  const myUnits = useMemo(
    () => state.units.filter((u) => (ownerId ? u.ownerId === ownerId : !u.ownerId)),
    [state.units, ownerId]
  );
  const myTickets = useMemo(
    () => state.tickets.filter((t) => t.ownerId === ownerId),
    [state.tickets, ownerId]
  );

  // 2. Filter states: property and display currency
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => viewCurrency || 'USD');

  // Synchronize selected currency when viewCurrency updates
  useEffect(() => {
    if (viewCurrency && selectedCurrency !== viewCurrency) {
      setSelectedCurrency(viewCurrency);
    }
  }, [viewCurrency]);

  const effectiveCurrency = selectedCurrency || viewCurrency || 'USD';
  const effectiveCurrencyMeta =
    GLOBAL_CURRENCIES.find((c) => c.code === effectiveCurrency) ||
    currencies.find((c) => c.code === effectiveCurrency) ||
    normalizeCurrency(effectiveCurrency);
  const effectiveSymbol = effectiveCurrencyMeta.symbol;

  // 3. Helper to resolve currency of a property
  const getPropertyCurrency = (prop: Property): { code: string; symbol: string; label: string } => {
    if (prop.currency) return normalizeCurrency(prop.currency);
    const u = myUnits.find((unit) => unit.propertyId === prop.id && unit.currency);
    if (u?.currency) return normalizeCurrency(u.currency);
    return { code: 'USD', symbol: '$', label: '$' };
  };

  // 4. Helper to resolve currency of a payment transaction
  const getPaymentCurrency = (p: PaymentTransaction): { code: string; symbol: string; label: string } => {
    if ((p as any).currency) return normalizeCurrency((p as any).currency);

    if (p.invoiceId) {
      const inv = state.invoices.find((i) => i.id === p.invoiceId);
      if (inv) {
        if ((inv as any).currency) return normalizeCurrency((inv as any).currency);
        if (inv.propertyId) {
          const prop = myProperties.find((pr) => pr.id === inv.propertyId);
          if (prop) return getPropertyCurrency(prop);
        }
      }
    }

    if (p.unit) {
      const unitObj = myUnits.find((u) => u.id === p.unit || u.unitNumber === p.unit);
      if (unitObj?.currency) return normalizeCurrency(unitObj.currency);
      if (unitObj?.propertyId) {
        const prop = myProperties.find((pr) => pr.id === unitObj.propertyId);
        if (prop) return getPropertyCurrency(prop);
      }
    }

    const defaultProp = myProperties[0];
    return defaultProp ? getPropertyCurrency(defaultProp) : { code: 'USD', symbol: '$', label: '$' };
  };

  // 5. Discover all distinct currencies actively configured in this owner's portfolio
  const portfolioCurrencies = useMemo(() => {
    const map = new Map<string, { code: string; symbol: string; label: string }>();
    myProperties.forEach((p) => {
      const curr = getPropertyCurrency(p);
      map.set(curr.code, curr);
    });
    myUnits.forEach((u) => {
      if (u.currency) {
        const curr = normalizeCurrency(u.currency);
        map.set(curr.code, curr);
      }
    });
    return Array.from(map.values());
  }, [myProperties, myUnits]);

  // Selectable quick pills combining portfolio currencies, major world currencies, and current active currency
  const selectablePills = useMemo(() => {
    const list: CurrencyMeta[] = [];
    const added = new Set<string>();

    portfolioCurrencies.forEach((c) => {
      const match = GLOBAL_CURRENCIES.find((g) => g.code === c.code);
      if (!added.has(c.code)) {
        added.add(c.code);
        list.push(match || { code: c.code, symbol: c.symbol, name: c.label, country: '', flag: '🌐' });
      }
    });

    ['USD', 'INR', 'AED', 'EUR', 'GBP'].forEach((code) => {
      if (!added.has(code)) {
        const match = GLOBAL_CURRENCIES.find((g) => g.code === code);
        if (match) {
          added.add(code);
          list.push(match);
        }
      }
    });

    if (!added.has(effectiveCurrency)) {
      const match =
        GLOBAL_CURRENCIES.find((g) => g.code === effectiveCurrency) ||
        currencies.find((g) => g.code === effectiveCurrency);
      if (match) {
        added.add(effectiveCurrency);
        list.push(match);
      }
    }

    return list;
  }, [portfolioCurrencies, effectiveCurrency, currencies]);

  // 6. Filtered properties, units, and payments based on property filter
  const filteredProperties = useMemo(() => {
    return myProperties.filter((p) => {
      if (selectedPropertyId !== 'all' && p.id !== selectedPropertyId) return false;
      return true;
    });
  }, [myProperties, selectedPropertyId]);

  const filteredUnits = useMemo(() => {
    const validPropIds = new Set(filteredProperties.map((p) => p.id));
    return myUnits.filter((u) => {
      if (selectedPropertyId !== 'all' && u.propertyId !== selectedPropertyId) return false;
      return validPropIds.has(u.propertyId);
    });
  }, [myUnits, filteredProperties, selectedPropertyId]);

  const filteredPayments = useMemo(() => {
    return state.payments.filter((p) => {
      if (p.ownerId !== ownerId) return false;

      if (selectedPropertyId !== 'all') {
        const matchingUnit = myUnits.find((u) => u.id === p.unit || u.unitNumber === p.unit);
        if (matchingUnit && matchingUnit.propertyId !== selectedPropertyId) return false;
        if (!matchingUnit && p.invoiceId) {
          const inv = state.invoices.find((i) => i.id === p.invoiceId);
          if (inv?.propertyId && inv.propertyId !== selectedPropertyId) return false;
        }
      }
      return true;
    });
  }, [state.payments, ownerId, selectedPropertyId, myUnits, state.invoices]);

  // Real-time automated reminders & action hub for landlord portfolio
  const ownerReminders = useMemo(() => {
    return getOwnerReminders(state, ownerId, selectedPropertyId, 'all');
  }, [state, ownerId, selectedPropertyId]);

  const isPlanExpired = !isOwnerPlanActive(ownerId);
  const isMultiCurrency = portfolioCurrencies.length > 1;

  // Real paid payments & total rent collected (converted into effectiveCurrency)
  const realPaidPayments = useMemo(
    () => filteredPayments.filter((p) => p.status === 'paid'),
    [filteredPayments]
  );
  const realCollectedAmount = useMemo(() => {
    return realPaidPayments.reduce((acc, p) => {
      const sourceCurr = getPaymentCurrency(p).code;
      return acc + convert(p.amount || 0, sourceCurr, effectiveCurrency);
    }, 0);
  }, [realPaidPayments, effectiveCurrency, convert]);

  // Real overdue & pending confirmation payments (converted into effectiveCurrency)
  const realOverduePayments = useMemo(
    () => filteredPayments.filter((p) => {
      if (p.status !== 'overdue') return false;
      const isVacated = (state.moveouts || []).some((m) => {
        const matchesUnit = m.unit === p.unit || (m as any).unitId === p.unit;
        if (!matchesUnit) return false;
        const isCompleted = m.status === 'refund_completed' || m.status === 'settled' || (m as any).tenantConfirmedReceipt;
        if (!isCompleted) return false;
        // If payment is tied to an active agreement, it is not vacated
        if ((p as any).leaseAgreementId) {
          const ag = state.agreements.find((a) => a.id === (p as any).leaseAgreementId);
          if (ag && ag.status !== 'terminated') return false;
          return (m as any).agreementId === (p as any).leaseAgreementId;
        }
        // If unit is currently occupied/reserved with an active tenancy, old moveout does not silence this payment
        const targetUnit = state.units.find((u) => u.unitNumber === p.unit || u.id === p.unit);
        if (targetUnit && (targetUnit.status === 'occupied' || targetUnit.status === 'reserved')) {
          return false;
        }
        return true;
      });
      if (isVacated) return false;
      return true;
    }),
    [filteredPayments, state.moveouts, state.agreements, state.units]
  );
  const realPendingPayments = useMemo(
    () => filteredPayments.filter((p) => p.status === 'pending_confirmation'),
    [filteredPayments]
  );
  const realOverdueAmount = useMemo(() => {
    return realOverduePayments.reduce((acc, p) => {
      const sourceCurr = getPaymentCurrency(p).code;
      return acc + convert(p.amount || 0, sourceCurr, effectiveCurrency);
    }, 0);
  }, [realOverduePayments, effectiveCurrency, convert]);

  const realPendingAmount = useMemo(() => {
    return realPendingPayments.reduce((acc, p) => {
      const sourceCurr = getPaymentCurrency(p).code;
      return acc + convert(p.amount || 0, sourceCurr, effectiveCurrency);
    }, 0);
  }, [realPendingPayments, effectiveCurrency, convert]);

  // Real occupancy counts and breakdowns computed via shared portfolio selector (H-5)
  const resolvedUnitInfos = useMemo(
    () => filteredUnits.map((u) => resolveUnitOccupancy(u, state.agreements, state.tenancyRequests)),
    [filteredUnits, state.agreements, state.tenancyRequests]
  );
  const occupiedUnits = useMemo(
    () => resolvedUnitInfos.filter((r) => r.effectiveStatus === 'occupied').map((r) => r.unit),
    [resolvedUnitInfos]
  );
  const vacantUnits = useMemo(
    () => resolvedUnitInfos.filter((r) => r.effectiveStatus === 'vacant').map((r) => r.unit),
    [resolvedUnitInfos]
  );
  const reservedUnits = useMemo(
    () => resolvedUnitInfos.filter((r) => r.effectiveStatus === 'reserved').map((r) => r.unit),
    [resolvedUnitInfos]
  );
  const maintenanceUnits = useMemo(
    () => resolvedUnitInfos.filter((r) => r.effectiveStatus === 'maintenance').map((r) => r.unit),
    [resolvedUnitInfos]
  );

  const totalUnitsCount = filteredUnits.length;
  const occupiedCount = occupiedUnits.length;
  const occupancyRate = totalUnitsCount > 0 ? Math.round((occupiedCount / totalUnitsCount) * 100) : 0;

  // Real monthly rent roll from occupied units (converted into effectiveCurrency using active agreement rent)
  const realMonthlyRentRoll = useMemo(() => {
    return resolvedUnitInfos
      .filter((r) => r.effectiveStatus === 'occupied')
      .reduce((acc, r) => {
        const prop = myProperties.find((p) => p.id === r.unit.propertyId);
        const sourceCurr = normalizeCurrency(r.currency || prop?.currency).code;
        return acc + convert(r.monthlyRent || 0, sourceCurr, effectiveCurrency);
      }, 0);
  }, [resolvedUnitInfos, myProperties, effectiveCurrency, convert]);

  // Real maintenance tickets
  const activeTickets = useMemo(
    () => myTickets.filter((t) => t.status !== 'resolved'),
    [myTickets]
  );
  const resolvedTickets = useMemo(
    () => myTickets.filter((t) => t.status === 'resolved'),
    [myTickets]
  );

  // Real last 6 months revenue timeline (converted into effectiveCurrency)
  const monthlyRevenueData = useMemo(() => {
    const months: { label: string; key: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short' });
      months.push({ label, key, amount: 0 });
    }

    realPaidPayments.forEach((p) => {
      if (p.date) {
        const pMonth = p.date.substring(0, 7);
        const match = months.find((m) => m.key === pMonth);
        if (match) {
          const sourceCurr = getPaymentCurrency(p).code;
          match.amount += convert(p.amount || 0, sourceCurr, effectiveCurrency);
        }
      }
    });

    const maxVal = Math.max(...months.map((m) => m.amount), 1);
    return { months, maxVal };
  }, [realPaidPayments, effectiveCurrency, convert]);

  const handleSendNudge = async (reminder: any) => {
    const delinquentInvoices = (state.invoices || []).filter(
      (inv) =>
        inv.ownerId === ownerId &&
        inv.status !== 'paid' &&
        inv.status !== 'cancelled' &&
        inv.status !== 'draft'
    );

    const targetTenantIds = new Set<string>();
    delinquentInvoices.forEach((inv) => {
      if (inv.tenantId) targetTenantIds.add(inv.tenantId);
    });

    if (reminder.targetTenantId) targetTenantIds.add(reminder.targetTenantId);

    const now = new Date().toISOString();
    const createdNotifs: InAppNotification[] = [];

    if (targetTenantIds.size > 0) {
      targetTenantIds.forEach((tId) => {
        const notif: InAppNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          userId: tId,
          title: 'Rent Payment Reminder',
          body: `Rent payment is overdue for your unit. Please review your active invoices and complete settlement.`,
          link: '/tenant/payments',
          isRead: false,
          createdAt: now,
        };
        createdNotifs.push(notif);
        if (isFirebaseConfigured) {
          setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
        }
      });
    } else {
      const notif: InAppNotification = {
        id: `notif_${Date.now()}`,
        userId: 'all_tenants',
        title: 'Rent Payment Reminder',
        body: `Rent payment is overdue for your unit. Please review your active invoices and complete settlement.`,
        link: '/tenant/payments',
        isRead: false,
        createdAt: now,
      };
      createdNotifs.push(notif);
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
      }
    }

    updateState((prev) => ({
      ...prev,
      notifications: [...createdNotifs, ...(prev.notifications || [])],
    }));

    showToast(`✓ Rent payment reminder dispatched to ${targetTenantIds.size || 1} resident(s).`);
  };

  return (
    <div>
      {/* Paywall Banner if expired */}
      {isPlanExpired && (
        <div className="paywall-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={24} />
            <div>
              <b>Subscription Expired or Past Due</b>
              <div style={{ fontSize: '12.5px', marginTop: '2px' }}>
                Your trial or plan has expired. Platform mutations are paused. (Tenants can still pay rent without disruption).
              </div>
            </div>
          </div>
          <Link to="/owner/plan" className="btn brass">
            Renew Plan
          </Link>
        </div>
      )}

      {/* PROPERTY & CURRENCY FILTER CARD (ALWAYS VISIBLE) */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Left: Property Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)' }}>
            <Building size={15} />
            Property:
          </div>
          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              border: '1px solid var(--line-strong)',
              borderRadius: '8px',
              background: '#fff',
              color: 'var(--ink)',
              fontWeight: 500,
              minWidth: '200px',
            }}
          >
            <option value="all">All Properties ({myProperties.length})</option>
            {myProperties.map((p) => {
              const curr = getPropertyCurrency(p);
              return (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCurrencyLabel(curr.code, curr.symbol)}
                </option>
              );
            })}
            {selectedPropertyId !== 'all' && (
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setSelectedPropertyId('all')}
                style={{ fontSize: '11.5px', padding: '4px 8px', marginLeft: '10px' }}
              >
                Reset Property
              </button>
            )}
          </select>
        </div>
      </div>

      {/* PORTFOLIO AUTOMATED REMINDERS & ACTION HUB */}
      <DashboardReminderHub
        reminders={ownerReminders}
        role="owner"
        title="Portfolio Action Hub & Reminders"
        onSendNudge={handleSendNudge}
      />

      {/* ROW 1: 4 REAL DATA KPI CARDS (ALL CONVERTED TO SELECTED CURRENCY) */}
      <div className="grid grid-4" data-tour="owner-kpi-grid" style={{ marginBottom: '20px' }}>
        {/* Card 1: Total Rent Collected */}
        <div className="consist-kpi-card">
          <div className="consist-kpi-label">Total Rent Collected</div>
          <div className="consist-kpi-value">
            {format(realCollectedAmount, effectiveCurrency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '6px' }}>
            {realPaidPayments.length} paid payment{realPaidPayments.length === 1 ? '' : 's'} recorded
            {realPaidPayments.some((p) => getPaymentCurrency(p).code !== effectiveCurrency) && (
              <span style={{ display: 'block', fontSize: '10.5px', color: isLive ? '#0D9488' : '#B45309', marginTop: '2px', fontWeight: 600 }}>
                {isLive
                  ? `✓ Converted to ${effectiveCurrency} at live rates`
                  : `Converted to ${effectiveCurrency} using cached rates (live rates unavailable)`}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Expected Monthly Rent Roll */}
        <div className="consist-kpi-card">
          <div className="consist-kpi-label">Expected Monthly Rent Roll</div>
          <div className="consist-kpi-value">
            {format(realMonthlyRentRoll, effectiveCurrency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '6px' }}>
            {realOverdueAmount > 0 ? (
              <span style={{ color: '#DC2626', fontWeight: 600 }}>
                {format(realOverdueAmount, effectiveCurrency)} overdue ({realOverduePayments.length})
              </span>
            ) : realPendingAmount > 0 ? (
              <span style={{ color: '#D97706', fontWeight: 600 }}>
                {format(realPendingAmount, effectiveCurrency)} pending confirmation
              </span>
            ) : (
              <span>From {occupiedCount} active occupied unit{occupiedCount === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>

        {/* Card 3: Portfolio Occupancy */}
        <div className="consist-kpi-card">
          <div className="consist-kpi-label">Portfolio Occupancy</div>
          <div className="consist-kpi-value">{occupancyRate}%</div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '6px' }}>
            {occupiedCount} of {totalUnitsCount} units occupied
          </div>
        </div>

        {/* Card 4: Maintenance Tickets */}
        <div className="consist-kpi-card">
          <div className="consist-kpi-label">Active Maintenance</div>
          <div className="consist-kpi-value">{activeTickets.length}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '6px' }}>
            {resolvedTickets.length} issues resolved all-time
          </div>
        </div>
      </div>

      {/* ROW 2: REAL RENT INFLOW HISTORY + REAL UNIT OCCUPANCY STATUS */}
      <div className="dashboard-charts-grid">
        {/* Left: Rent Inflow (Last 6 Months) */}
        <div className="consist-card">
          <div className="consist-card-header">
            <div>
              <div className="consist-card-title">Rent Collection Inflow</div>
              <div className="consist-card-subtitle">Actual monthly rent collected (converted to {effectiveCurrency === 'USD' ? '$' : effectiveCurrency})</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', background: 'var(--teal-primary)', borderRadius: '2px', display: 'inline-block' }} />
                <span style={{ color: 'var(--ink-soft)' }}>Total Inflow:</span>
                <b style={{ color: 'var(--ink)' }}>{format(realCollectedAmount, effectiveCurrency)}</b>
              </div>
            </div>
          </div>

          {/* Bar Chart Representation of 6-Month Real Inflow */}
          <div style={{ width: '100%', height: '220px', padding: '16px 8px 0', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', height: '170px', borderBottom: '1px solid var(--line)', paddingBottom: '8px', minWidth: '280px' }}>
              {monthlyRevenueData.months.map((m) => {
                const heightPct = monthlyRevenueData.maxVal > 0 ? Math.max((m.amount / monthlyRevenueData.maxVal) * 100, m.amount > 0 ? 8 : 2) : 2;
                return (
                  <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)', fontWeight: 600, marginBottom: '6px', whiteSpace: 'nowrap' }}>
                      {m.amount > 0 ? (
                        m.amount >= 1000
                          ? `${effectiveSymbol}${(m.amount / 1000).toFixed(1)}k`
                          : format(m.amount, effectiveCurrency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                      ) : '—'}
                    </div>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '38px',
                        height: `${heightPct}%`,
                        background: m.amount > 0 ? 'linear-gradient(180deg, var(--teal-primary) 0%, #0D9488 100%)' : '#E5E7EB',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                      title={`${m.label}: ${format(m.amount, effectiveCurrency)}`}
                    />
                  </div>
                );
              })}
            </div>
            {/* Month Labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingTop: '8px', minWidth: '280px' }}>
              {monthlyRevenueData.months.map((m) => (
                <div key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Unit Inventory & Status Breakdown (Replaces fake Session by Country) */}
        <div className="consist-card">
          <div className="consist-card-header">
            <div>
              <div className="consist-card-title">Unit Inventory Status</div>
              <div className="consist-card-subtitle">Real breakdown of {totalUnitsCount} managed unit{totalUnitsCount === 1 ? '' : 's'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
            {/* Occupied */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Occupied</span>
                </div>
                <b style={{ color: 'var(--ink)', fontSize: '12.5px' }}>
                  {occupiedCount} unit{occupiedCount === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((occupiedCount / totalUnitsCount) * 100) : 0}%)
                </b>
              </div>
              <div style={{ width: '100%', height: '7px', background: '#F1F3F5', borderRadius: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalUnitsCount > 0 ? Math.round((occupiedCount / totalUnitsCount) * 100) : 0}%`,
                    height: '100%',
                    background: '#10B981',
                    borderRadius: '10px',
                  }}
                />
              </div>
            </div>

            {/* Vacant */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3B82F6', display: 'inline-block' }} />
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Vacant (Available)</span>
                </div>
                <b style={{ color: 'var(--ink)', fontSize: '12.5px' }}>
                  {vacantUnits.length} unit{vacantUnits.length === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((vacantUnits.length / totalUnitsCount) * 100) : 0}%)
                </b>
              </div>
              <div style={{ width: '100%', height: '7px', background: '#F1F3F5', borderRadius: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalUnitsCount > 0 ? Math.round((vacantUnits.length / totalUnitsCount) * 100) : 0}%`,
                    height: '100%',
                    background: '#3B82F6',
                    borderRadius: '10px',
                  }}
                />
              </div>
            </div>

            {/* Reserved */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Reserved (Lease Pending)</span>
                </div>
                <b style={{ color: 'var(--ink)', fontSize: '12.5px' }}>
                  {reservedUnits.length} unit{reservedUnits.length === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((reservedUnits.length / totalUnitsCount) * 100) : 0}%)
                </b>
              </div>
              <div style={{ width: '100%', height: '7px', background: '#F1F3F5', borderRadius: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalUnitsCount > 0 ? Math.round((reservedUnits.length / totalUnitsCount) * 100) : 0}%`,
                    height: '100%',
                    background: '#F59E0B',
                    borderRadius: '10px',
                  }}
                />
              </div>
            </div>

            {/* Under Maintenance */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Maintenance</span>
                </div>
                <b style={{ color: 'var(--ink)', fontSize: '12.5px' }}>
                  {maintenanceUnits.length} unit{maintenanceUnits.length === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((maintenanceUnits.length / totalUnitsCount) * 100) : 0}%)
                </b>
              </div>
              <div style={{ width: '100%', height: '7px', background: '#F1F3F5', borderRadius: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalUnitsCount > 0 ? Math.round((maintenanceUnits.length / totalUnitsCount) * 100) : 0}%`,
                    height: '100%',
                    background: '#EF4444',
                    borderRadius: '10px',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: YOUR PROPERTIES WITH CURRENCY PILLS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '26px', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>
          Your Properties ({filteredProperties.length})
        </div>
        <Link to="/owner/properties" style={{ fontSize: '12.5px', color: 'var(--teal-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          Manage Properties &amp; Units <ArrowRight size={13} />
        </Link>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          <div className="desktop-table-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Location</th>
                    <th>Operating Currency</th>
                    <th>Units</th>
                    <th>Occupancy</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProperties.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-soft)' }}>
                        No properties found matching current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredProperties.map((p) => {
                      const curr = getPropertyCurrency(p);
                      const propUnits = myUnits.filter((u) => u.propertyId === p.id || (!u.propertyId && myProperties.length === 1));
                      const propMetrics = calculatePortfolioMetrics(propUnits, state.agreements, state.tenancyRequests);
                      const totalUnits = propMetrics.totalUnits > 0 ? propMetrics.totalUnits : (p.unitCount || 1);
                      const occupiedCount = propMetrics.totalUnits > 0 ? propMetrics.occupiedCount : (p.occupied || 0);
                      const isFull = totalUnits > 0 && occupiedCount >= totalUnits;
                      const occupancyPercent = propMetrics.totalUnits > 0 ? propMetrics.occupancyRate : (totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0);

                      return (
                        <tr key={p.id}>
                          <td>
                            <b>{p.name}</b>
                          </td>
                          <td style={{ color: 'var(--ink-soft)' }}>{p.address.formattedAddress}</td>
                          <td>
                            <span
                              className={`badge ${curr.code === 'USD' ? 'amber' : curr.code === 'GBP' ? 'red' : 'green'}`}
                              style={{ fontWeight: 600 }}
                            >
                              {formatCurrencyLabel(curr.code, curr.symbol)}
                            </span>
                          </td>
                          <td>{totalUnits} unit{totalUnits === 1 ? '' : 's'}</td>
                          <td>
                            <span
                              className={`badge ${isFull ? 'green' : occupiedCount > 0 ? 'blue' : 'amber'}`}
                              style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              {occupiedCount}/{totalUnits} occupied ({occupancyPercent}%)
                            </span>
                          </td>
                          <td>
                            <Link to="/owner/properties" className="btn secondary small">
                              Manage Units
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mobile-card-view" style={{ padding: '12px' }}>
            {filteredProperties.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-soft)' }}>
                No properties found matching current filter criteria.
              </div>
            ) : (
              filteredProperties.map((p) => {
                const curr = getPropertyCurrency(p);
                const propUnits = myUnits.filter((u) => u.propertyId === p.id || (!u.propertyId && myProperties.length === 1));
                const propMetrics = calculatePortfolioMetrics(propUnits, state.agreements, state.tenancyRequests);
                const totalUnits = propMetrics.totalUnits > 0 ? propMetrics.totalUnits : (p.unitCount || 1);
                const occupiedCount = propMetrics.totalUnits > 0 ? propMetrics.occupiedCount : (p.occupied || 0);
                const isFull = totalUnits > 0 && occupiedCount >= totalUnits;
                const occupancyPercent = propMetrics.totalUnits > 0 ? propMetrics.occupancyRate : (totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0);

                return (
                  <div key={p.id} className="staff-card" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                          {p.address.formattedAddress}
                        </div>
                      </div>
                      <span
                        className={`badge ${curr.code === 'USD' ? 'amber' : curr.code === 'GBP' ? 'red' : 'green'}`}
                        style={{ fontWeight: 600 }}
                      >
                        {formatCurrencyLabel(curr.code, curr.symbol)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Units &amp; Occupancy</span>
                      <span
                        className={`badge ${isFull ? 'green' : occupiedCount > 0 ? 'blue' : 'amber'}`}
                        style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        {occupiedCount}/{totalUnits} occupied ({occupancyPercent}%)
                      </span>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                      <Link to="/owner/properties" className="btn secondary small btn-mobile-full" style={{ textAlign: 'center' }}>
                        Manage Units
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
