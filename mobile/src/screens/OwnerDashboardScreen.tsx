import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { normalizeCurrencyCode, getCurrencySymbol } from '../lib/currencyService';
import { MobileProperty, MobilePaymentTransaction } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { getOwnerReminders, isInvoiceForVacatedTenancy, DashboardReminder } from '../lib/reminders';
import { usePlanLimits } from '../hooks/usePlanLimits';

interface OwnerDashboardScreenProps {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

// Canonical currency normalizer supporting all global currencies
const normalizeCurrency = (raw?: string): { code: string; symbol: string; label: string } => {
  if (!raw) return { code: 'USD', symbol: '$', label: 'USD ($)' };
  const code = normalizeCurrencyCode(raw);
  const symbol = getCurrencySymbol(code);
  return { code, symbol, label: `${code} (${symbol})` };
};

export const OwnerDashboardScreen: React.FC<OwnerDashboardScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, logCommunication, saveUnit } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, setViewCurrency, convert } = useMobileCurrency();
  const { isTrial, daysLeft } = usePlanLimits();
  const ownerId = user?.id || '';

  // 1. Filter States (matching Web: property & currency filters)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [nudgeSentIds, setNudgeSentIds] = useState<string[]>([]);

  // 2. Base entities for this owner
  const activeProperties = useMemo(() => {
    if (!ownerId) return [];
    return state.properties.filter((p) => p.ownerId === ownerId);
  }, [state.properties, ownerId]);

  const activePropertyIds = useMemo(
    () => new Set(activeProperties.map((p) => p.id)),
    [activeProperties]
  );

  const myUnits = useMemo(() => {
    if (!ownerId) return [];
    return state.units.filter(
      (u) => (u.propertyId && activePropertyIds.has(u.propertyId)) || u.ownerId === ownerId
    );
  }, [state.units, activePropertyIds, ownerId]);

  const myTickets = useMemo(() => {
    if (!ownerId) return [];
    return state.tickets.filter((t) => t.ownerId === ownerId);
  }, [state.tickets, ownerId]);

  // 3. Helper to resolve currency of a property (scans property -> child unit)
  const getPropertyCurrency = (prop: MobileProperty): { code: string; symbol: string; label: string } => {
    if (prop.currency) return normalizeCurrency(prop.currency);
    const u = myUnits.find((unit) => unit.propertyId === prop.id && unit.currency);
    if (u?.currency) return normalizeCurrency(u.currency);
    return { code: 'USD', symbol: '$', label: 'USD ($)' };
  };

  // 4. Helper to resolve currency of a payment transaction (scans payment -> invoice -> unit -> property)
  const getPaymentCurrency = (p: MobilePaymentTransaction): { code: string; symbol: string; label: string } => {
    if ((p as any).currency) return normalizeCurrency((p as any).currency);

    if (p.invoiceId) {
      const inv = state.invoices.find((i) => i.id === p.invoiceId);
      if (inv) {
        if ((inv as any).currency) return normalizeCurrency((inv as any).currency);
        if (inv.propertyId) {
          const prop = activeProperties.find((pr) => pr.id === inv.propertyId);
          if (prop) return getPropertyCurrency(prop);
        }
      }
    }

    if (p.unit) {
      const unitObj = myUnits.find((u) => u.id === p.unit || u.unitNumber === p.unit);
      if (unitObj?.currency) return normalizeCurrency(unitObj.currency);
      if (unitObj?.propertyId) {
        const prop = activeProperties.find((pr) => pr.id === unitObj.propertyId);
        if (prop) return getPropertyCurrency(prop);
      }
    }

    const defaultProp = activeProperties[0];
    return defaultProp ? getPropertyCurrency(defaultProp) : { code: 'USD', symbol: '$', label: 'USD ($)' };
  };

  // 5. Discover all distinct currencies actively used in this owner's portfolio
  const portfolioCurrencies = useMemo(() => {
    const map = new Map<string, { code: string; symbol: string; label: string }>();
    activeProperties.forEach((p) => {
      const curr = getPropertyCurrency(p);
      map.set(curr.code, curr);
    });
    myUnits.forEach((u) => {
      if (u.currency) {
        const curr = normalizeCurrency(u.currency);
        map.set(curr.code, curr);
      }
    });
    if (map.size === 0) {
      map.set('USD', { code: 'USD', symbol: '$', label: 'USD ($)' });
    }
    return Array.from(map.values());
  }, [activeProperties, myUnits]);

  const isMultiCurrency = portfolioCurrencies.length > 1;

  // Active primary currency resolution for display labels
  const primaryCurr = useMemo(() => {
    if (selectedCurrency !== 'all') {
      const match = portfolioCurrencies.find((c) => c.code === selectedCurrency);
      if (match) return match;
      return normalizeCurrency(selectedCurrency);
    }
    const viewMatch = portfolioCurrencies.find((c) => c.code === viewCurrency);
    if (viewMatch) return viewMatch;
    return normalizeCurrency(viewCurrency);
  }, [selectedCurrency, portfolioCurrencies, viewCurrency]);
  const primarySymbol = primaryCurr.symbol;

  const selectedPropertyName = useMemo(() => {
    if (selectedPropertyId === 'all') return `All Properties (${activeProperties.length})`;
    const prop = activeProperties.find((p) => p.id === selectedPropertyId);
    return prop ? prop.name : 'All Properties';
  }, [selectedPropertyId, activeProperties]);

  // 6. Filtered properties, units, and payments based on active filters
  const filteredProperties = useMemo(() => {
    return activeProperties.filter((p) => {
      if (selectedPropertyId !== 'all' && p.id !== selectedPropertyId) return false;
      if (selectedCurrency !== 'all') {
        const curr = getPropertyCurrency(p);
        if (curr.code !== selectedCurrency) return false;
      }
      return true;
    });
  }, [activeProperties, selectedPropertyId, selectedCurrency]);

  const filteredUnits = useMemo(() => {
    const validPropIds = new Set(filteredProperties.map((p) => p.id));
    return myUnits.filter((u) => {
      if (selectedPropertyId !== 'all' && u.propertyId !== selectedPropertyId) return false;
      if (selectedCurrency !== 'all') {
        const prop = activeProperties.find((p) => p.id === u.propertyId);
        const curr = normalizeCurrency(u.currency || prop?.currency);
        if (curr.code !== selectedCurrency) return false;
      }
      return validPropIds.has(u.propertyId);
    });
  }, [myUnits, filteredProperties, selectedPropertyId, selectedCurrency, activeProperties]);

  const filteredPayments = useMemo(() => {
    if (!ownerId) return [];
    return state.payments.filter((p) => {
      if (p.ownerId !== ownerId) return false;
      const curr = getPaymentCurrency(p);
      if (selectedCurrency !== 'all' && curr.code !== selectedCurrency) return false;

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
  }, [state.payments, ownerId, selectedCurrency, selectedPropertyId, myUnits, state.invoices]);

  // 7. Unit Breakdown counts synchronized with active agreements & invitations (H-5 parity)
  const unitStatusMap = useMemo(() => {
    const map = new Map<string, 'occupied' | 'reserved' | 'vacant' | 'maintenance'>();

    filteredUnits.forEach((u) => {
      if (u.status === 'maintenance') {
        map.set(u.id, 'maintenance');
        return;
      }

      // Check active lease agreements
      const hasActiveAgreement = (state.agreements || []).some(
        (a) =>
          a.status === 'active' &&
          (a.unit === u.unitNumber || a.unitId === u.id) &&
          (a.ownerId === ownerId || (u.propertyId && a.propertyId === u.propertyId))
      );

      if (hasActiveAgreement || u.status === 'occupied') {
        map.set(u.id, 'occupied');
        return;
      }

      // Check pending invitations or signature
      const hasPendingOffer =
        (state.tenancyRequests || []).some(
          (r) =>
            r.status === 'pending' &&
            (r.unitNumber === u.unitNumber || r.unitId === u.id)
        ) ||
        (state.agreements || []).some(
          (a) =>
            (a.status === 'awaiting_tenant_signature' ||
              a.status === 'pending_approval' ||
              a.status === 'pending_deposit') &&
            (a.unit === u.unitNumber || a.unitId === u.id)
        );

      if (hasPendingOffer || u.status === 'reserved') {
        map.set(u.id, 'reserved');
        return;
      }

      map.set(u.id, 'vacant');
    });

    return map;
  }, [filteredUnits, state.agreements, state.tenancyRequests, ownerId]);

  const occupiedUnits = useMemo(
    () => filteredUnits.filter((u) => unitStatusMap.get(u.id) === 'occupied'),
    [filteredUnits, unitStatusMap]
  );
  const vacantUnits = useMemo(
    () => filteredUnits.filter((u) => unitStatusMap.get(u.id) === 'vacant'),
    [filteredUnits, unitStatusMap]
  );
  const reservedUnits = useMemo(
    () => filteredUnits.filter((u) => unitStatusMap.get(u.id) === 'reserved'),
    [filteredUnits, unitStatusMap]
  );
  const maintenanceUnits = useMemo(
    () => filteredUnits.filter((u) => unitStatusMap.get(u.id) === 'maintenance'),
    [filteredUnits, unitStatusMap]
  );

  const totalUnitsCount = filteredUnits.length;
  const occupiedCount = occupiedUnits.length;
  const occupancyRate = totalUnitsCount > 0 ? Math.round((occupiedCount / totalUnitsCount) * 100) : 0;

  // Real paid payments & total rent collected
  const realPaidPayments = useMemo(
    () => filteredPayments.filter((p) => p.status === 'paid'),
    [filteredPayments]
  );
  const realCollectedAmount = useMemo(
    () => realPaidPayments.reduce((acc, p) => {
      const pCurr = getPaymentCurrency(p).code;
      return acc + convert(p.amount || 0, pCurr, primaryCurr.code);
    }, 0),
    [realPaidPayments, convert, primaryCurr.code]
  );

  // Real monthly rent roll from occupied units & active agreements
  const realMonthlyRentRoll = useMemo(
    () => occupiedUnits.reduce((acc, u) => {
      const matchingAgr = (state.agreements || []).find(
        (a) => a.status === 'active' && (a.unit === u.unitNumber || a.unitId === u.id)
      );
      const effectiveRent = matchingAgr?.rent || u.rent || 0;
      const uCurr = normalizeCurrency(matchingAgr?.currency || u.currency || 'USD').code;
      return acc + convert(effectiveRent, uCurr, primaryCurr.code);
    }, 0),
    [occupiedUnits, state.agreements, convert, primaryCurr.code]
  );

  // Overdue rent calculation
  const overdueInvoices = useMemo(() => {
    if (!ownerId) return [];
    return state.invoices.filter((inv) => {
      if (inv.status !== 'overdue') return false;
      if (inv.ownerId !== ownerId) return false;
      if (selectedPropertyId !== 'all' && inv.propertyId !== selectedPropertyId) return false;
      if (selectedCurrency !== 'all') {
        const invCurr = normalizeCurrency(inv.currency).code;
        if (invCurr !== selectedCurrency) return false;
      }
      if (isInvoiceForVacatedTenancy(inv, state, myUnits)) return false;
      return true;
    });
  }, [state.invoices, state.moveOuts, state.depositSettlements, state.agreements, state.units, myUnits, ownerId, selectedPropertyId, selectedCurrency]);

  const realOverdueAmount = useMemo(
    () => overdueInvoices.reduce((sum, inv) => {
      const invCurr = normalizeCurrency(inv.currency || 'USD').code;
      return sum + convert(inv.total || inv.amount || 0, invCurr, primaryCurr.code);
    }, 0),
    [overdueInvoices, convert, primaryCurr.code]
  );

  // Maintenance tickets
  const activeTickets = useMemo(() => {
    return myTickets.filter((t) => {
      const matchStatus = t.status === 'open' || t.status === 'in_progress' || t.status === 'assigned';
      if (!matchStatus) return false;
      if (selectedPropertyId !== 'all') return t.propertyId === selectedPropertyId;
      return true;
    });
  }, [myTickets, selectedPropertyId]);

  const resolvedTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
  }, [myTickets]);

  // Real-time automated reminders & action hub matching web getOwnerReminders
  const ownerReminders = useMemo(() => {
    return getOwnerReminders(state, ownerId, selectedPropertyId, selectedCurrency);
  }, [state, ownerId, selectedPropertyId, selectedCurrency]);

  // Real 6 Months Revenue Timeline (calculated from actual paid payments)
  const monthlyRevenueData = useMemo(() => {
    const months: { label: string; key: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short' });
      months.push({ label, key, amount: 0 });
    }

    filteredPayments.forEach((p) => {
      if (p.status === 'paid' && p.date) {
        const pMonth = p.date.substring(0, 7);
        const match = months.find((m) => m.key === pMonth);
        if (match) {
          match.amount += p.amount || 0;
        }
      }
    });

    const maxVal = Math.max(...months.map((m) => m.amount), 1);
    return { months, maxVal };
  }, [filteredPayments]);

  const formatChartVal = (amount: number) => {
    if (amount === 0) return '—';
    if (primaryCurr.code === 'INR') {
      if (amount >= 10000000) return `${primarySymbol}${(amount / 10000000).toFixed(1)}Cr`;
      if (amount >= 100000) return `${primarySymbol}${(amount / 100000).toFixed(1)}L`;
      if (amount >= 1000) return `${primarySymbol}${(amount / 1000).toFixed(1)}k`;
      return `${primarySymbol}${amount.toLocaleString('en-IN')}`;
    }
    if (amount >= 1000000000) return `${primarySymbol}${(amount / 1000000000).toFixed(1)}B`;
    if (amount >= 1000000) return `${primarySymbol}${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${primarySymbol}${(amount / 1000).toFixed(1)}k`;
    return `${primarySymbol}${amount.toLocaleString('en-US')}`;
  };

  // 1-Click Rent Payment Reminder Nudge to Delinquent Tenants
  const handleSendNudge = async (reminder: DashboardReminder) => {
    setNudgeSentIds((prev) => [...prev, reminder.id]);

    const delinquentInvoices = (state.invoices || []).filter(
      (inv) =>
        inv.status === 'overdue' &&
        (inv.ownerId === ownerId || (inv.propertyId && activePropertyIds.has(inv.propertyId))) &&
        !isInvoiceForVacatedTenancy(inv, state, myUnits)
    );

    const targetTenantIds = new Set<string>();
    delinquentInvoices.forEach((inv) => {
      if (inv.tenantId) targetTenantIds.add(inv.tenantId);
      const targetTenant = state.tenants.find(
        (t) =>
          (inv.tenantId && t.id === inv.tenantId) ||
          ((!inv.propertyId || !t.propertyId || t.propertyId === inv.propertyId) &&
            (t.unit === inv.unit || (t.unitsRented && t.unitsRented.includes(inv.unit))))
      );

      logCommunication({
        type: 'RENT_OVERDUE_NUDGE',
        category: 'rent',
        title: 'Rent Payment Overdue Notice',
        body: `Rent payment of ${format(inv.total || inv.amount || 0, inv.currency || primaryCurr.code)} for Unit ${inv.unit} is past due. Please settle immediately through your Propithub portal.`,
        channels: ['in_app', 'email', 'sms'],
        recipientId: inv.tenantId || targetTenant?.id || '',
        recipientName: inv.tenant || targetTenant?.name || 'Resident',
        recipientRole: 'tenant',
        recipientContact: {
          email: targetTenant?.email,
          phone: targetTenant?.phone,
        },
        senderId: ownerId,
        senderName: user?.displayName || 'Property Owner',
        senderRole: 'owner',
        unitNumber: inv.unit,
        propertyName: inv.propertyName,
        relatedEntityId: inv.id,
        deliveryStatus: {
          inApp: 'delivered',
          email: targetTenant?.email ? 'delivered' : 'skipped',
          sms: targetTenant?.phone ? 'delivered' : 'skipped',
        },
      }).catch(console.warn);
    });

    Alert.alert(
      'Payment Reminders Dispatched ✓',
      `Multi-channel reminder (In-App, Email & SMS) dispatched to ${targetTenantIds.size || delinquentInvoices.length || 1} resident(s).`,
      [
        {
          text: 'View in Ledger',
          onPress: () => onNavigate?.('financial_ledger'),
        },
        { text: 'Done', style: 'cancel' },
      ]
    );
  };

  // 1-Click Publish Vacant Unlisted Units to Public Market Directory
  const handlePublishUnits = async (reminder: DashboardReminder) => {
    const unlistedVacantUnits = myUnits.filter((u) => u.status === 'vacant' && !u.isListedPublicly);

    Alert.alert(
      'Publish Units to Market 📢',
      unlistedVacantUnits.length > 0
        ? `Publish ${unlistedVacantUnits.length} vacant unit(s) (${unlistedVacantUnits.map((u) => u.unitNumber).join(', ')}) to the public directory now?`
        : 'All vacant units are already published, or you can manage them in your portfolio.',
      [
        {
          text: 'View in Portfolio',
          onPress: () => onNavigate?.('property_portfolio'),
        },
        ...(unlistedVacantUnits.length > 0
          ? [
              {
                text: 'Publish Now ✓',
                onPress: async () => {
                  for (const u of unlistedVacantUnits) {
                    await saveUnit({ ...u, isListedPublicly: true });
                  }
                  Alert.alert(
                    'Units Live on Market! 🎉',
                    `${unlistedVacantUnits.length} vacant unit(s) are now publicly listed. Prospective tenants can browse and apply.`,
                    [
                      {
                        text: 'View Properties',
                        onPress: () => onNavigate?.('property_portfolio'),
                      },
                      { text: 'Done', style: 'cancel' as const },
                    ]
                  );
                },
              },
            ]
          : []),
      ]
    );
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const isFilterActive = selectedPropertyId !== 'all' || selectedCurrency !== 'all';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Propithub"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Urgent Pre-Expiry Warning Banner (<= 3 days left) */}
          {isTrial && daysLeft <= 3 && daysLeft > 0 && (
            <TouchableOpacity
              style={styles.trialWarningBanner}
              onPress={() => onNavigate?.('owner_plan_subscription')}
              activeOpacity={0.88}
            >
              <View style={styles.trialWarningLeft}>
                <Feather name="alert-triangle" size={16} color="#DC2626" style={{ marginRight: 8 }} />
                <Text style={styles.trialWarningText} numberOfLines={2}>
                  {daysLeft === 1
                    ? 'Your Free Trial ends today! Upgrade now to maintain full portfolio access.'
                    : `Only ${daysLeft} days left in your Free Trial. Tap to choose your subscription plan.`}
                </Text>
              </View>
              <View style={styles.trialWarningBtn}>
                <Text style={styles.trialWarningBtnText}>Upgrade</Text>
                <Feather name="chevron-right" size={13} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}

          {/* Modern Minimal Filter Pills (Single Horizontal Row) */}
          <TourTarget id="owner-radar-controls" style={styles.controlsRow}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                { backgroundColor: colors.surface, borderColor: colors.line },
                selectedPropertyId !== 'all' && (isDark ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' } : styles.filterPillActive),
              ]}
              onPress={() => setShowPropertyPicker(true)}
              activeOpacity={0.8}
            >
              <Feather
                name="layers"
                size={13}
                color={selectedPropertyId !== 'all' ? (isDark ? '#34D399' : '#059669') : colors.inkSoft}
              />
              <Text
                style={[
                  styles.filterPillText,
                  { color: colors.navy },
                  selectedPropertyId !== 'all' && (isDark ? { color: '#34D399' } : styles.filterPillTextActive),
                ]}
                numberOfLines={1}
              >
                {selectedPropertyId === 'all' ? 'All Properties' : selectedPropertyName}
              </Text>
              <Ionicons
                name="chevron-down"
                size={13}
                color={selectedPropertyId !== 'all' ? (isDark ? '#34D399' : '#059669') : colors.inkSoft}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                { backgroundColor: colors.surface, borderColor: colors.line },
                selectedCurrency !== 'all' && (isDark ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' } : styles.filterPillActive),
              ]}
              onPress={() => setShowCurrencyPicker(true)}
              activeOpacity={0.8}
            >
              {selectedCurrency === 'all' && (
                <Feather
                  name="dollar-sign"
                  size={13}
                  color={colors.inkSoft}
                />
              )}
              <Text
                style={[
                  styles.filterPillText,
                  { color: colors.navy },
                  selectedCurrency !== 'all' && (isDark ? { color: '#34D399' } : styles.filterPillTextActive),
                ]}
                numberOfLines={1}
              >
                {selectedCurrency === 'all'
                  ? `Currency (${primaryCurr.code})`
                  : `${primaryCurr.symbol} ${selectedCurrency}`}
              </Text>
              <Ionicons
                name="chevron-down"
                size={13}
                color={selectedCurrency !== 'all' ? (isDark ? '#34D399' : '#059669') : colors.inkSoft}
              />
            </TouchableOpacity>
          </TourTarget>

          <TourTarget id="owner-kpi-grid">
            {/* 1. Hero Revenue Card (Clean Single-Focus Metric: Label + Value Only) */}
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={[styles.heroLabel, { color: colors.inkSoft }]}>Total Rent Collected</Text>
              <Text style={[styles.heroAmount, { color: isDark ? '#34D399' : '#059669' }]}>
                {format(realCollectedAmount, primaryCurr.code)}
              </Text>
            </View>

            {/* 2. Clean 3-Column Metrics Strip (Label + Single Text Value Only) */}
            <View style={[styles.statsStripCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.statColumn}>
                <Text style={[styles.statColLabel, { color: colors.inkSoft }]}>Expected Rent</Text>
                <Text style={[styles.statColValue, { color: colors.navy }]} numberOfLines={1}>
                  {format(realMonthlyRentRoll, primaryCurr.code)}
                </Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: colors.line }]} />

              <View style={styles.statColumn}>
                <Text style={[styles.statColLabel, { color: colors.inkSoft }]}>Occupancy</Text>
                <Text style={[styles.statColValue, { color: colors.navy }]}>{occupancyRate}%</Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: colors.line }]} />

              <TouchableOpacity
                style={styles.statColumn}
                onPress={() => onNavigate?.('owner_maintenance_dispatch')}
                activeOpacity={0.75}
              >
                <Text style={[styles.statColLabel, { color: colors.inkSoft }]}>Repairs</Text>
                <Text
                  style={[
                    styles.statColValue,
                    { color: activeTickets.length > 0 ? (isDark ? '#F87171' : '#EF4444') : colors.navy },
                  ]}
                >
                  {activeTickets.length}
                </Text>
              </TouchableOpacity>
            </View>
          </TourTarget>

          {/* Sleek Priority Actions Hub (Compact & Glanceable) */}
          {ownerReminders.length > 0 && (
            <View style={styles.remindersSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={styles.pulseDot} />
                  <Text style={[styles.sectionHeading, { color: colors.navy }]}>Priority Actions</Text>
                </View>
                <View style={[styles.remindersCountBadge, isDark && { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                  <Text style={[styles.remindersCountText, isDark && { color: '#FBBF24' }]}>{ownerReminders.length} pending</Text>
                </View>
              </View>

              {ownerReminders.map((rem) => {
                const isUrgent = rem.severity === 'urgent';
                const isSent = nudgeSentIds.includes(rem.id);

                return (
                  <View
                    key={rem.id}
                    style={[
                      styles.reminderCard,
                      { backgroundColor: colors.surface, borderColor: colors.line },
                      isUrgent && (isDark ? { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' } : styles.reminderCardUrgent),
                    ]}
                  >
                    <View style={styles.reminderCardLeft}>
                      <View
                        style={[
                          styles.reminderIconBox,
                          isUrgent ? styles.iconBoxUrgent : styles.iconBoxWarning,
                        ]}
                      >
                        <Feather
                          name={isUrgent ? 'alert-circle' : 'zap'}
                          size={15}
                          color={isUrgent ? '#DC2626' : '#D97706'}
                        />
                      </View>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.reminderTitle, { color: colors.navy }]} numberOfLines={1}>
                          {rem.title}
                        </Text>
                        <Text style={[styles.reminderDesc, { color: colors.inkSoft }]} numberOfLines={1}>
                          {rem.description.replace(/Rent payment of [^.]+settle immediately through your Propithub portal\./i, 'Overdue payment settlement pending')}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.reminderActionBtn,
                        isUrgent && { backgroundColor: '#DC2626' },
                        isSent && { backgroundColor: '#10B981' },
                      ]}
                      onPress={() => {
                        if (rem.actionType === 'nudge') {
                          handleSendNudge(rem);
                        } else if (rem.actionType === 'publish_units' || rem.id.startsWith('owner_unlisted_units')) {
                          handlePublishUnits(rem);
                        } else if (rem.actionScreen) {
                          onNavigate?.(rem.actionScreen);
                        }
                      }}
                      disabled={isSent}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.reminderActionBtnText}>
                        {isSent ? 'Sent ✓' : rem.actionLabel}
                      </Text>
                      {!isSent && (
                        <Feather
                          name="arrow-right"
                          size={11}
                          color="#FFFFFF"
                          style={{ marginLeft: 4 }}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* ROW 2: REAL RENT INFLOW HISTORY + REAL UNIT OCCUPANCY STATUS */}
          {/* Section 1: Rent Collection Inflow (Last 6 Months) */}
          <View style={[styles.consistCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.consistCardHeader}>
              <View>
                <Text style={[styles.consistCardTitle, { color: colors.navy }]}>Rent Collection Inflow</Text>
              </View>
              <View style={styles.inflowTotalBadge}>
                <Text style={[styles.inflowTotalLabel, { color: colors.inkSoft }]}>Total Inflow:</Text>
                <Text style={[styles.inflowTotalValue, { color: isDark ? '#34D399' : '#059669' }]}>
                  {format(realCollectedAmount, primaryCurr.code)}
                </Text>
              </View>
            </View>

            <View style={styles.barChartContainer}>
              {monthlyRevenueData.months.map((item) => {
                const heightPercent =
                  monthlyRevenueData.maxVal > 0 && item.amount > 0
                    ? Math.max(12, Math.round((item.amount / monthlyRevenueData.maxVal) * 85))
                    : 4;
                return (
                  <View key={item.key} style={styles.barColumn}>
                    <Text style={[styles.barValueText, { color: colors.inkSoft }]}>{formatChartVal(item.amount)}</Text>
                    <View style={[styles.barSlot, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: heightPercent,
                            backgroundColor: item.amount > 0 ? '#059669' : (isDark ? '#334155' : '#E2E8F0'),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barMonthText, { color: colors.inkSoft }]}>{item.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Section 2: Unit Inventory Status (Real breakdown of managed units) */}
          <View style={[styles.consistCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.consistCardHeader}>
              <View>
                <Text style={[styles.consistCardTitle, { color: colors.navy }]}>Unit Inventory Status</Text>
              </View>
            </View>

            <View style={styles.inventoryBreakdownList}>
              {/* 1. Occupied */}
              <View style={styles.inventoryItem}>
                <View style={styles.inventoryItemHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                    <Text style={[styles.statusName, { color: colors.navy }]}>Occupied</Text>
                  </View>
                  <Text style={[styles.statusCount, { color: colors.inkSoft }]}>
                    {occupiedCount} unit{occupiedCount === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((occupiedCount / totalUnitsCount) * 100) : 0}%)
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        backgroundColor: '#10B981',
                        width: `${totalUnitsCount > 0 ? Math.round((occupiedCount / totalUnitsCount) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* 2. Vacant */}
              <View style={styles.inventoryItem}>
                <View style={styles.inventoryItemHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.statusDot, { backgroundColor: '#3B82F6' }]} />
                    <Text style={[styles.statusName, { color: colors.navy }]}>Vacant (Available)</Text>
                  </View>
                  <Text style={[styles.statusCount, { color: colors.inkSoft }]}>
                    {vacantUnits.length} unit{vacantUnits.length === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((vacantUnits.length / totalUnitsCount) * 100) : 0}%)
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        backgroundColor: '#3B82F6',
                        width: `${totalUnitsCount > 0 ? Math.round((vacantUnits.length / totalUnitsCount) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* 3. Reserved */}
              <View style={styles.inventoryItem}>
                <View style={styles.inventoryItemHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={[styles.statusName, { color: colors.navy }]}>Reserved (Lease Pending)</Text>
                  </View>
                  <Text style={[styles.statusCount, { color: colors.inkSoft }]}>
                    {reservedUnits.length} unit{reservedUnits.length === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((reservedUnits.length / totalUnitsCount) * 100) : 0}%)
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        backgroundColor: '#F59E0B',
                        width: `${totalUnitsCount > 0 ? Math.round((reservedUnits.length / totalUnitsCount) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* 4. Maintenance */}
              <View style={styles.inventoryItem}>
                <View style={styles.inventoryItemHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={[styles.statusName, { color: colors.navy }]}>Maintenance</Text>
                  </View>
                  <Text style={[styles.statusCount, { color: colors.inkSoft }]}>
                    {maintenanceUnits.length} unit{maintenanceUnits.length === 1 ? '' : 's'} ({totalUnitsCount > 0 ? Math.round((maintenanceUnits.length / totalUnitsCount) * 100) : 0}%)
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        backgroundColor: '#EF4444',
                        width: `${totalUnitsCount > 0 ? Math.round((maintenanceUnits.length / totalUnitsCount) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* SECTION: YOUR PROPERTIES WITH CURRENCY PILLS (Web Exact Match) */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeading, { color: colors.navy }]}>
              Your Properties ({filteredProperties.length})
            </Text>
            <TouchableOpacity
              onPress={() => onNavigate?.('property_portfolio')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={styles.sectionLink}>Manage Units</Text>
              <Feather name="arrow-right" size={13} color="#059669" />
            </TouchableOpacity>
          </View>

          {filteredProperties.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Feather name="home" size={28} color="#94A3B8" />
              <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Properties Found</Text>
              <Text style={[styles.emptySub, { color: colors.inkSoft }]}>No properties match current filter criteria.</Text>
            </View>
          ) : (
            filteredProperties.map((p) => {
              const curr = getPropertyCurrency(p);
              const propUnits = myUnits.filter((u) => u.propertyId === p.id);
              const totalUnits = propUnits.length > 0 ? propUnits.length : (p.unitCount || 1);
              const occupiedPropCount = propUnits.length > 0
                ? propUnits.filter((u) => u.status === 'occupied').length
                : (p.occupied || 0);
              const isFull = totalUnits > 0 && occupiedPropCount >= totalUnits;
              const occupancyPercent = Math.round((occupiedPropCount / totalUnits) * 100);

              const formattedAddress = typeof p.address === 'string' ? p.address : p.address.formattedAddress;

              return (
                <View key={p.id} style={[styles.propertyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <View style={styles.propertyCardTop}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.propertyNameText, { color: colors.navy }]}>{p.name}</Text>
                      <Text style={[styles.propertyAddressText, { color: colors.inkSoft }]}>{formattedAddress}</Text>
                    </View>
                    <View style={[styles.currBadge, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                      <Text style={[styles.currBadgeText, isDark && { color: '#34D399' }]}>
                        {curr.symbol} {curr.code}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.propertyCardDivider, { backgroundColor: colors.line }]} />

                  <View style={styles.propertyCardBottom}>
                    <View>
                      <Text style={[styles.unitsLabel, { color: colors.inkSoft }]}>Units & Occupancy</Text>
                      <View
                        style={[
                          styles.occupancyBadge,
                          isFull
                            ? styles.occupancyBadgeGreen
                            : occupiedPropCount > 0
                            ? styles.occupancyBadgeBlue
                            : styles.occupancyBadgeAmber,
                        ]}
                      >
                        <Text
                          style={[
                            styles.occupancyBadgeText,
                            isFull
                              ? { color: '#059669' }
                              : occupiedPropCount > 0
                              ? { color: '#2563EB' }
                              : { color: '#B45309' },
                          ]}
                        >
                          {occupiedPropCount}/{totalUnits} occupied ({occupancyPercent}%)
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.manageUnitsBtn}
                      onPress={() => onNavigate?.('property_portfolio')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.manageUnitsBtnText}>Manage Units</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Property Selector Modal */}
      <Modal visible={showPropertyPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>Select Property Scope</Text>
              <TouchableOpacity onPress={() => setShowPropertyPicker(false)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  selectedPropertyId === 'all' && (isDark ? { backgroundColor: 'rgba(16, 185, 129, 0.15)' } : styles.modalItemActive),
                ]}
                onPress={() => {
                  setSelectedPropertyId('all');
                  setShowPropertyPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.modalItemText,
                    { color: colors.ink },
                    selectedPropertyId === 'all' && styles.modalItemTextActive,
                  ]}
                >
                  All Properties ({activeProperties.length})
                </Text>
                {selectedPropertyId === 'all' && (
                  <Ionicons name="checkmark" size={18} color="#059669" />
                )}
              </TouchableOpacity>
              {activeProperties.map((p) => {
                const curr = getPropertyCurrency(p);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.modalItem,
                      selectedPropertyId === p.id && (isDark ? { backgroundColor: 'rgba(16, 185, 129, 0.15)' } : styles.modalItemActive),
                    ]}
                    onPress={() => {
                      setSelectedPropertyId(p.id);
                      setShowPropertyPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        { color: colors.ink },
                        selectedPropertyId === p.id && styles.modalItemTextActive,
                      ]}
                    >
                      {p.name} — {curr.code} ({curr.symbol})
                    </Text>
                    {selectedPropertyId === p.id && (
                      <Ionicons name="checkmark" size={18} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Currency Selector Modal */}
      <Modal visible={showCurrencyPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>Select Operating Currency</Text>
              <TouchableOpacity onPress={() => setShowCurrencyPicker(false)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  selectedCurrency === 'all' && (isDark ? { backgroundColor: 'rgba(16, 185, 129, 0.15)' } : styles.modalItemActive),
                ]}
                onPress={() => {
                  setSelectedCurrency('all');
                  setShowCurrencyPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.modalItemText,
                    { color: colors.ink },
                    selectedCurrency === 'all' && styles.modalItemTextActive,
                  ]}
                >
                  All Currencies (Default {viewCurrency})
                </Text>
                {selectedCurrency === 'all' && (
                  <Ionicons name="checkmark" size={18} color="#059669" />
                )}
              </TouchableOpacity>

              {['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD', 'AUD', 'SGD'].map((cCode) => {
                const isSel = selectedCurrency === cCode || (selectedCurrency === 'all' && primaryCurr.code === cCode);
                const sym = getCurrencySymbol(cCode);
                return (
                  <TouchableOpacity
                    key={cCode}
                    style={[
                      styles.modalItem,
                      selectedCurrency === cCode && (isDark ? { backgroundColor: 'rgba(16, 185, 129, 0.15)' } : styles.modalItemActive),
                    ]}
                    onPress={() => {
                      setSelectedCurrency(cCode);
                      setViewCurrency(cCode);
                      setShowCurrencyPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        { color: colors.ink },
                        selectedCurrency === cCode && styles.modalItemTextActive,
                      ]}
                    >
                      {sym} {cCode} ({sym})
                    </Text>
                    {selectedCurrency === cCode && (
                      <Ionicons name="checkmark" size={18} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    mainContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28,
    },
    // Modern Filter Pill Row
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    },
    filterPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 7,
      gap: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.02,
      shadowRadius: 3,
      elevation: 1,
    },
    filterPillActive: {
      borderColor: isDark ? '#10B981' : 'rgba(16, 185, 129, 0.4)',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    filterPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
      flexShrink: 1,
    },
    filterPillTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    clearFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 4,
    },
    clearFilterText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#EF4444',
    },
    // Section Headers & Indicators
    remindersSection: {
      marginBottom: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      marginTop: 4,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.navy,
      letterSpacing: -0.2,
    },
    sectionLink: {
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    pulseDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: '#D97706',
    },
    remindersCountBadge: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7',
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 12,
    },
    remindersCountText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    // Priority Action Cards (Glanceable & Compact)
    reminderCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.02,
      shadowRadius: 6,
      elevation: 2,
    },
    reminderCardUrgent: {
      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FFFBFB',
    },
    reminderCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 10,
    },
    reminderIconBox: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBoxUrgent: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
    },
    iconBoxWarning: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7',
    },
    reminderTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    reminderDesc: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    reminderActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#059669',
      borderRadius: 20,
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    reminderActionBtnText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    // 1. Hero Revenue Card (Modern Single-Focus Metric)
    heroCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 20,
      paddingVertical: 18,
      paddingHorizontal: 20,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.03,
      shadowRadius: 8,
      elevation: 2,
    },
    heroLabel: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: -0.1,
      marginBottom: 6,
    },
    heroAmount: {
      fontSize: 34,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#059669',
      letterSpacing: -0.8,
    },
    // 2. Clean 3-Column Metrics Strip (Simple Single Text, No Truncation)
    statsStripCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.02,
      shadowRadius: 6,
      elevation: 2,
    },
    statColumn: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    statColLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.inkSoft,
      marginBottom: 4,
      letterSpacing: -0.1,
    },
    statColValue: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.navy,
      letterSpacing: -0.4,
    },
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.line,
    },
    // Clean Consistent Cards & Chart
    consistCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.03,
      shadowRadius: 8,
      elevation: 2,
    },
    consistCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    consistCardTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.navy,
      letterSpacing: -0.2,
    },
    inflowTotalBadge: {
      alignItems: 'flex-end',
    },
    inflowTotalLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.inkSoft,
      textTransform: 'uppercase',
    },
    inflowTotalValue: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#059669',
    },
    barChartContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 130,
      paddingTop: 10,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
      height: '100%',
      justifyContent: 'flex-end',
    },
    barValueText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.inkSoft,
      marginBottom: 4,
    },
    barSlot: {
      width: '55%',
      maxWidth: 22,
      height: 80,
      justifyContent: 'flex-end',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 6,
      overflow: 'hidden',
    },
    barFill: {
      width: '100%',
      borderRadius: 6,
    },
    barMonthText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
      marginTop: 8,
    },
    inventoryBreakdownList: {
      gap: 12,
    },
    inventoryItem: {
      gap: 5,
    },
    inventoryItemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    statusName: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.ink,
    },
    statusCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    progressTrack: {
      width: '100%',
      height: 6,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      borderRadius: 3,
    },
    // Clean Modern Property Cards
    propertyCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.03,
      shadowRadius: 8,
      elevation: 2,
    },
    propertyCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    propertyNameText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.navy,
      letterSpacing: -0.2,
    },
    propertyAddressText: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    currBadge: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    currBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    propertyCardDivider: {
      height: 1,
      backgroundColor: colors.line,
      marginVertical: 12,
    },
    propertyCardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    unitsLabel: {
      fontSize: 11,
      color: colors.inkSoft,
      marginBottom: 3,
      fontWeight: '500',
    },
    occupancyBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    occupancyBadgeGreen: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
    },
    occupancyBadgeBlue: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
    },
    occupancyBadgeAmber: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    },
    occupancyBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    manageUnitsBtn: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    manageUnitsBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
      textAlign: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.line,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    modalTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
    },
    modalItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    modalItemActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    modalItemText: {
      fontSize: 13,
      color: colors.ink,
    },
    modalItemTextActive: {
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    trialWarningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
      borderRadius: 14,
      padding: 12,
      marginBottom: 14,
    },
    trialWarningLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 10,
    },
    trialWarningText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: isDark ? '#FCA5A5' : '#991B1B',
      lineHeight: 18,
      flex: 1,
    },
    trialWarningBtn: {
      backgroundColor: '#DC2626',
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    trialWarningBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
  });
