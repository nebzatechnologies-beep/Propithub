import React, { useMemo, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileAgreement } from '../types';
import { isSingleUnitProperty } from '../lib/propertyTypes';

export const LeaseDraftingBuilderScreen: React.FC<{ onBack?: () => void; onSuccess?: () => void }> = ({
  onBack,
  onSuccess,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, saveAgreement } = useMobileAppData();
  const { user } = useMobileAuth();
  const { viewCurrency } = useMobileCurrency();

  const [refreshing, setRefreshing] = useState(false);

  const effectiveOwnerId = useMemo(() => {
    if (user?.role === 'manager') return user?.ownerId || '';
    return user?.ownerId || user?.id || '';
  }, [user]);

  const properties = useMemo(() => {
    const allProps = state.properties || [];
    const owned = effectiveOwnerId
      ? allProps.filter((p) => p.ownerId === effectiveOwnerId)
      : [];
    if (user?.role === 'manager') {
      const assignedIds = user?.assignedProperties || (user?.propertyId ? [user.propertyId] : []);
      if (assignedIds.length > 0) {
        return owned.filter((p) => assignedIds.includes(p.id));
      }
    }
    return owned;
  }, [state.properties, effectiveOwnerId, user]);

  const getVacantUnitsForProperty = useCallback(
    (propertyId?: string) => {
      if (!propertyId) return [];
      return (state.units || []).filter((u) => {
        if (u.propertyId !== propertyId) return false;
        if (u.status === 'occupied' || u.status === 'reserved') return false;
        if (u.tenant || u.currentTenantId) return false;
        const hasActiveAg = (state.agreements || []).some(
          (a) =>
            (a.status === 'active' ||
              a.status === 'pending_deposit' ||
              a.status === 'pending_approval' ||
              a.status === 'awaiting_tenant_signature' ||
              a.status === 'awaiting_tenant_upload') &&
            (!u.propertyId || !a.propertyId || a.propertyId === u.propertyId) &&
            (a.unit === u.unitNumber || a.unit === u.id)
        );
        return !hasActiveAg;
      });
    },
    [state.units, state.agreements]
  );

  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id || '');
  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) || properties[0],
    [properties, selectedPropertyId]
  );

  const unitsInProp = useMemo(
    () => getVacantUnitsForProperty(selectedProperty?.id),
    [getVacantUnitsForProperty, selectedProperty?.id]
  );

  const isSingleAsset = selectedProperty ? isSingleUnitProperty(selectedProperty) : false;
  const [leaseScope, setLeaseScope] = useState<'unit' | 'master'>(isSingleAsset ? 'master' : 'unit');
  const [selectedUnitNum, setSelectedUnitNum] = useState(
    isSingleAsset ? 'Entire Property (Master Tenancy)' : (unitsInProp[0]?.unitNumber || '')
  );
  const selectedUnit = unitsInProp.find((u) => u.unitNumber === selectedUnitNum) || unitsInProp[0];

  const [tenantName, setTenantName] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');

  const [rent, setRent] = useState(selectedUnit?.rent ? String(selectedUnit.rent) : '');
  const [deposit, setDeposit] = useState(
    selectedUnit?.deposit !== undefined && selectedUnit?.deposit !== null
      ? String(selectedUnit.deposit)
      : selectedUnit?.rent
        ? String(selectedUnit.rent * 2)
        : ''
  );
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]
  );
  const [escalation, setEscalation] = useState('5');
  const [lockInMonths, setLockInMonths] = useState('6');
  const [noticeDays, setNoticeDays] = useState('30');
  const [customClause, setCustomClause] = useState('');
  const [clauses, setClauses] = useState<string[]>([
    'Tenant responsible for electricity meter billing and utility maintenance.',
    'No structural alterations or wall drilling without prior landlord approval.',
    'Painting restoration fee applies if property returned with damages beyond ordinary wear.',
  ]);

  useEffect(() => {
    if (!selectedPropertyId && properties[0]?.id) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  useEffect(() => {
    let mounted = true;
    const loadPrefill = async () => {
      try {
        const raw = await AsyncStorage.getItem('propithub_mobile_lease_prefill');
        if (!raw) return;
        await AsyncStorage.removeItem('propithub_mobile_lease_prefill');
        if (!mounted) return;
        const data = JSON.parse(raw);
        if (data.propertyId) setSelectedPropertyId(data.propertyId);
        if (data.isSingleAsset) {
          setLeaseScope('master');
          setSelectedUnitNum('Entire Property (Master Tenancy)');
        } else if (data.unitNumber) {
          setLeaseScope('unit');
          setSelectedUnitNum(data.unitNumber);
        }
        if (data.tenantName) setTenantName(data.tenantName);
        if (data.tenantEmail) setTenantEmail(data.tenantEmail);
        if (data.tenantPhone) setTenantPhone(data.tenantPhone);
        if (data.rent) setRent(String(data.rent));
        if (data.deposit !== undefined && data.deposit !== null) setDeposit(String(data.deposit));
        if (data.startDate) setStartDate(data.startDate);
        if (data.endDate) setEndDate(data.endDate);
      } catch {
        // ignore prefill errors
      }
    };
    loadPrefill();
    return () => {
      mounted = false;
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 450);
  }, []);

  const handleAddClause = () => {
    if (customClause.trim()) {
      setClauses([...clauses, customClause.trim()]);
      setCustomClause('');
    }
  };

  const handleRemoveClause = (idx: number) => {
    setClauses(clauses.filter((_, i) => i !== idx));
  };

  const handleGenerateAgreement = () => {
    if (!selectedProperty) {
      Alert.alert('No Property Selected', 'Please select an owned property first.');
      return;
    }
    if (leaseScope === 'unit' && !selectedUnit) {
      Alert.alert('No Vacant Unit', 'Please select a vacant unit before drafting a lease.');
      return;
    }
    if (!tenantName.trim()) {
      Alert.alert('Required', 'Please enter tenant legal name.');
      return;
    }

    const parsedRent = Number(rent);
    if (!Number.isFinite(parsedRent) || parsedRent <= 0) {
      Alert.alert('Invalid Rent', 'Please enter a valid monthly rent amount greater than 0.');
      return;
    }

    const parsedDeposit = deposit.trim() === '' ? 0 : Number(deposit);
    if (!Number.isFinite(parsedDeposit) || parsedDeposit < 0) {
      Alert.alert('Invalid Deposit', 'Security deposit must be a valid non-negative number.');
      return;
    }

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      Alert.alert('Invalid Dates', 'Please enter valid Start and End dates (End Date must be after Start Date).');
      return;
    }

    const parsedEsc = Number(escalation);
    const parsedLockIn = Number(lockInMonths);
    const parsedNotice = Number(noticeDays);

    const cleanEmail = tenantEmail.trim().toLowerCase();
    const cleanPhone = tenantPhone.trim();
    const matchedUser = (state.users || []).find(
      (u) =>
        (cleanEmail && u.email?.toLowerCase() === cleanEmail) ||
        (cleanPhone && u.phone && u.phone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, ''))
    );
    const matchedTenant = (state.tenants || []).find(
      (t) =>
        t.ownerId === (selectedProperty.ownerId || effectiveOwnerId) &&
        ((cleanEmail && t.email?.toLowerCase() === cleanEmail) ||
          (cleanPhone && t.phone && t.phone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '')))
    );
    const resolvedTenantId = matchedUser?.id || matchedTenant?.id || '';

    const agrId = `AGR-DRAFT-${Date.now().toString().slice(-6)}`;
    const isMaster = leaseScope === 'master';
    const finalUnit = isMaster ? 'Entire Property (Master Tenancy)' : (selectedUnit?.unitNumber || selectedUnitNum);

    const newAgr: MobileAgreement = {
      id: agrId,
      ownerId: selectedProperty.ownerId || effectiveOwnerId,
      ownerName: user?.displayName || 'Property Owner',
      propertyId: selectedProperty.id,
      propertyName: selectedProperty.name,
      unit: finalUnit,
      unitId: isMaster ? undefined : selectedUnit?.id,
      tenant: tenantName.trim(),
      tenantId: resolvedTenantId,
      tenantEmail: cleanEmail || undefined,
      tenantPhone: cleanPhone || undefined,
      start: startDate,
      end: endDate,
      rent: parsedRent,
      deposit: parsedDeposit,
      currency: selectedProperty.currency || viewCurrency,
      escalationPercent: Number.isFinite(parsedEsc) && parsedEsc >= 0 ? parsedEsc : 5,
      lockInMonths: Number.isFinite(parsedLockIn) && parsedLockIn >= 0 ? parsedLockIn : 6,
      noticePeriodDays: Number.isFinite(parsedNotice) && parsedNotice >= 0 ? parsedNotice : 30,
      status: 'draft',
      isDraft: true,
      draftSavedAt: new Date().toISOString(),
      executionMode: (isMaster ? 'master_bulk_lease' : 'digital_dispatch') as any,
      specialClauses: clauses,
      createdAt: new Date().toISOString(),
    };

    saveAgreement(newAgr);
    Alert.alert(
      'Lease Draft Saved',
      `Draft ${agrId} for ${finalUnit} has been saved to your Lease Drafts. Open Leasing Hub to dispatch for signature or record execution.`
    );
    if (onSuccess) onSuccess();
    else if (onBack) onBack();
  };

  const headerNode = (
    <>
      <ScreenStatusBar />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <PropithubIcon size={18} />
          </View>
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Draft Lease</Text>
          </View>
        </View>
      </View>
    </>
  );

  return (
    <ScreenContainer
      scrollable
      refreshing={refreshing}
      onRefresh={handleRefresh}
      header={headerNode}
      contentContainerStyle={styles.content}
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Property & Apartment Selection</Text>

        <Text style={styles.inputLabel}>Select Building</Text>
        {properties.length === 0 ? (
          <Text style={styles.emptyHelperText}>
            No properties found for your account. Add a property before drafting a lease.
          </Text>
        ) : (
          <View style={styles.pickerRow}>
            {properties.map((p) => {
              const isSelected = p.id === selectedProperty?.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.pickerChip, isSelected && styles.pickerChipActive]}
                  onPress={() => {
                    setSelectedPropertyId(p.id);
                    const isSingle = isSingleUnitProperty(p);
                    const vacantUnits = getVacantUnitsForProperty(p.id);
                    if (isSingle) {
                      setLeaseScope('master');
                      setSelectedUnitNum('Entire Property (Master Tenancy)');
                      const propRent =
                        vacantUnits.reduce((s, u) => s + (u.rent || 0), 0) ||
                        (p as any).monthlyRent ||
                        0;
                      setRent(propRent > 0 ? String(propRent) : '');
                      setDeposit(propRent > 0 ? String(propRent * 2) : '');
                    } else {
                      setLeaseScope('unit');
                      if (vacantUnits[0]) {
                        setSelectedUnitNum(vacantUnits[0].unitNumber);
                        setRent(vacantUnits[0].rent ? String(vacantUnits[0].rent) : '');
                        setDeposit(
                          vacantUnits[0].deposit !== undefined && vacantUnits[0].deposit !== null
                            ? String(vacantUnits[0].deposit)
                            : ''
                        );
                      } else {
                        setSelectedUnitNum('');
                        setRent('');
                        setDeposit('');
                      }
                    }
                  }}
                >
                  <Text
                    style={[styles.pickerChipText, isSelected && styles.pickerChipTextActive]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Lease Scope: Unit vs Master / Bulk Tenancy */}
        <View style={styles.scopeSwitcherRow}>
          <TouchableOpacity
            style={[styles.scopeBtn, leaseScope === 'unit' && styles.scopeBtnActive]}
            onPress={() => {
              setLeaseScope('unit');
              if (unitsInProp[0]) {
                setSelectedUnitNum(unitsInProp[0].unitNumber);
                setRent(unitsInProp[0].rent ? String(unitsInProp[0].rent) : '');
                setDeposit(
                  unitsInProp[0].deposit !== undefined && unitsInProp[0].deposit !== null
                    ? String(unitsInProp[0].deposit)
                    : ''
                );
              } else {
                setSelectedUnitNum('');
              }
            }}
          >
            <Ionicons
              name="grid-outline"
              size={13}
              color={leaseScope === 'unit' ? colors.primaryText : colors.inkSoft}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.scopeBtnText, leaseScope === 'unit' && styles.scopeBtnTextActive]} numberOfLines={1}>
              Individual Unit
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.scopeBtn, leaseScope === 'master' && styles.scopeBtnActive]}
            onPress={() => {
              setLeaseScope('master');
              setSelectedUnitNum('Entire Property (Master Tenancy)');
              const totalRent =
                unitsInProp.reduce((s, u) => s + (u.rent || 0), 0) ||
                (selectedProperty as any)?.monthlyRent ||
                0;
              setRent(totalRent > 0 ? String(totalRent) : '');
              setDeposit(totalRent > 0 ? String(totalRent * 2) : '');
            }}
          >
            <MaterialCommunityIcons
              name="home-group"
              size={15}
              color={leaseScope === 'master' ? colors.primaryText : colors.inkSoft}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.scopeBtnText, leaseScope === 'master' && styles.scopeBtnTextActive]} numberOfLines={1}>
              Master / Bulk Lease
            </Text>
          </TouchableOpacity>
        </View>

        {leaseScope === 'master' ? (
          <View
            style={[
              styles.masterLeaseNotice,
              {
                backgroundColor: isDark ? colors.surfaceSunken : '#F0FDF4',
                borderColor: isDark ? colors.line : '#BBF7D0',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="shield-crown" size={18} color={colors.primaryText} />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.primaryText, flex: 1 }}>
                Bulk Master Tenancy Mode Active
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.inkSoft, marginTop: 4 }}>
              Leasing {selectedProperty?.name || 'Property'} as an entire standalone asset / master corporate lease. Covers all leasable units under one overarching contract.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.inputLabel}>Select Vacant Unit ({unitsInProp.length} available)</Text>
            {unitsInProp.length === 0 ? (
              <Text style={styles.emptyHelperText}>
                No vacant units available in this property. All units are currently occupied or reserved.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginVertical: 6 }}>
                {unitsInProp.map((u) => {
                  const isSelected = u.unitNumber === selectedUnitNum;
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.unitChip, isSelected && styles.unitChipActive]}
                      onPress={() => {
                        setSelectedUnitNum(u.unitNumber);
                        setRent(u.rent ? String(u.rent) : '');
                        setDeposit(
                          u.deposit !== undefined && u.deposit !== null ? String(u.deposit) : ''
                        );
                      }}
                    >
                      <Text style={[styles.unitChipTitle, isSelected && styles.unitChipTitleActive]} numberOfLines={1}>
                        Unit {u.unitNumber}
                      </Text>
                      <Text style={[styles.unitChipSub, isSelected && styles.unitChipSubActive]} numberOfLines={1}>
                        {u.unitType} • Vacant
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}

        <View style={styles.divider} />
        <Text style={styles.cardTitle}>2. Tenant Information</Text>

        <Text style={styles.inputLabel}>Tenant Full Legal Name *</Text>
        <TextInput
          style={styles.input}
          value={tenantName}
          onChangeText={setTenantName}
          placeholder="e.g. Full Name"
          placeholderTextColor={colors.inkSoft}
        />

        <View style={styles.grid2}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={tenantEmail}
              onChangeText={setTenantEmail}
              placeholder="tenant@email.com"
              placeholderTextColor={colors.inkSoft}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={tenantPhone}
              onChangeText={setTenantPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.inkSoft}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.cardTitle}>3. Financial & Escalation Terms</Text>

        <View style={styles.grid2}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel} numberOfLines={1}>
              Monthly Rent ({selectedProperty?.currency || viewCurrency}) *
            </Text>
            <TextInput
              style={styles.input}
              value={rent}
              onChangeText={setRent}
              placeholder="e.g. 2500"
              placeholderTextColor={colors.inkSoft}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel} numberOfLines={1}>Security Deposit</Text>
            <TextInput
              style={styles.input}
              value={deposit}
              onChangeText={setDeposit}
              placeholder="e.g. 5000"
              placeholderTextColor={colors.inkSoft}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel} numberOfLines={1}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.inkSoft}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel} numberOfLines={1}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.inkSoft}
            />
          </View>
        </View>

        <View style={styles.grid3}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel} numberOfLines={1}>Escalation (%)</Text>
            <TextInput
              style={styles.input}
              value={escalation}
              onChangeText={setEscalation}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel} numberOfLines={1}>Lock-in (Mo)</Text>
            <TextInput
              style={styles.input}
              value={lockInMonths}
              onChangeText={setLockInMonths}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inputLabel} numberOfLines={1}>Notice (Days)</Text>
            <TextInput
              style={styles.input}
              value={noticeDays}
              onChangeText={setNoticeDays}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.cardTitle}>4. Standard & Custom Legal Clauses</Text>

        {clauses.map((clause, idx) => (
          <View key={idx} style={styles.clauseRow}>
            <Text style={styles.clauseBullet}>§{idx + 1}</Text>
            <Text style={styles.clauseText}>{clause}</Text>
            <TouchableOpacity onPress={() => handleRemoveClause(idx)}>
              <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addClauseRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={customClause}
            onChangeText={setCustomClause}
            placeholder="Add custom condition (e.g. 1 reserved parking bay)..."
            placeholderTextColor={colors.inkSoft}
          />
          <TouchableOpacity style={styles.addClauseBtn} onPress={handleAddClause}>
            <Text style={styles.addClauseBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.generateBtn}
          onPress={handleGenerateAgreement}
          activeOpacity={0.85}
        >
          <Text style={styles.generateBtnText}>Save Lease Draft</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 8,
  },
  emptyHelperText: {
    fontSize: 13,
    color: colors.inkSoft,
    marginVertical: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.navy,
    backgroundColor: colors.surface,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
  },
  pickerChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pickerChipText: {
    fontSize: 12,
    color: colors.inkSoft,
    fontWeight: '500',
  },
  pickerChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
  },
  unitChipActive: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    borderColor: colors.primary,
  },
  unitChipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  unitChipTitleActive: {
    color: colors.primaryText,
  },
  unitChipSub: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 1,
  },
  unitChipSubActive: {
    color: colors.primaryText,
  },
  grid2: {
    flexDirection: 'row',
    gap: 10,
  },
  grid3: {
    flexDirection: 'row',
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    marginVertical: 14,
  },
  clauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 6,
    gap: 8,
  },
  clauseBullet: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  clauseText: {
    fontSize: 12,
    color: colors.navy,
    flex: 1,
  },
  addClauseRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  addClauseBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addClauseBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  generateBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scopeSwitcherRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  scopeBtnActive: {
    borderColor: colors.primaryText,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
  },
  scopeBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  scopeBtnTextActive: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  masterLeaseNotice: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
});
