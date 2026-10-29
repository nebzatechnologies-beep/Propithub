import React, { useMemo, useState } from 'react';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileAgreement } from '../types';

export const LeaseDraftingBuilderScreen: React.FC<{ onBack?: () => void; onSuccess?: () => void }> = ({
  onBack,
  onSuccess,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, saveAgreement } = useMobileAppData();
  const { user } = useMobileAuth();
  const { viewCurrency } = useMobileCurrency();

  const properties = state.properties;
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id || '');
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) || properties[0];

  const unitsInProp = state.units.filter((u) => {
    if (u.propertyId !== selectedProperty?.id) return false;
    if (u.status === 'occupied') return false;
    if (u.tenant || u.currentTenantId) return false;
    const hasActiveAg = (state.agreements || []).some(
      (a) =>
        (a.status === 'active' || a.status === 'pending_deposit') &&
        (!u.propertyId || !a.propertyId || a.propertyId === u.propertyId) &&
        (a.unit === u.unitNumber || a.unit === u.id)
    );
    return !hasActiveAg;
  });
  const [selectedUnitNum, setSelectedUnitNum] = useState(unitsInProp[0]?.unitNumber || '');
  const selectedUnit = unitsInProp.find((u) => u.unitNumber === selectedUnitNum) || unitsInProp[0];

  const [tenantName, setTenantName] = useState(selectedUnit?.tenant || '');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');

  const [rent, setRent] = useState(selectedUnit?.rent ? selectedUnit.rent.toString() : '');
  const [deposit, setDeposit] = useState(
    selectedUnit?.deposit ? selectedUnit.deposit.toString() : (selectedUnit?.rent ? (selectedUnit.rent * 2).toString() : '')
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
    if (!tenantName.trim()) {
      Alert.alert('Required', 'Please enter tenant name.');
      return;
    }
    const agrId = `AGR-${Date.now().toString().slice(-6)}`;
    const newAgr: MobileAgreement = {
      id: agrId,
      ownerId: user.id,
      ownerName: user.displayName || 'Property Owner',
      propertyId: selectedProperty?.id || '',
      propertyName: selectedProperty?.name || 'Property Premises',
      unit: selectedUnitNum,
      tenant: tenantName.trim(),
      tenantId: `tenant-${Date.now().toString().slice(-4)}`,
      tenantEmail: tenantEmail.trim(),
      tenantPhone: tenantPhone.trim(),
      start: startDate,
      end: endDate,

      rent: parseInt(rent, 10) || 28000,
      deposit: parseInt(deposit, 10) || 56000,
      currency: selectedProperty?.currency || viewCurrency,
      escalationPercent: parseInt(escalation, 10) || 5,
      lockInMonths: parseInt(lockInMonths, 10) || 6,
      noticePeriodDays: parseInt(noticeDays, 10) || 30,
      status: 'active',
      executionMode: 'digital_dispatch',
      specialClauses: clauses,
      tenantSignedAt: new Date().toISOString(),
      ownerSignedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    saveAgreement(newAgr);
    Alert.alert(
      'Agreement Executed & Signed! 📄',
      `Contract ${agrId} for Unit ${selectedUnitNum} has been recorded and unit occupancy updated.`
    );
    if (onSuccess) onSuccess();
    else if (onBack) onBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="file-text" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Lease Drafting Studio</Text>
          </View>
        </View>
        <View style={styles.stampBadge}>
          <Text style={styles.stampBadgeText}>E-STAMP VERIFIED</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Property & Apartment Selection</Text>

          <Text style={styles.inputLabel}>Select Building</Text>
          <View style={styles.pickerRow}>
            {properties.map((p) => {
              const isSelected = p.id === selectedProperty?.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.pickerChip, isSelected && styles.pickerChipActive]}
                  onPress={() => {
                    setSelectedPropertyId(p.id);
                    const units = state.units.filter((u) => u.propertyId === p.id);
                    if (units[0]) {
                      setSelectedUnitNum(units[0].unitNumber);
                      setRent(units[0].rent.toString());
                      setDeposit(units[0].deposit.toString());
                    }
                  }}
                >
                  <Text style={[styles.pickerChipText, isSelected && styles.pickerChipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.inputLabel}>Select Vacant Unit ({unitsInProp.length} available)</Text>
          {unitsInProp.length === 0 ? (
            <Text style={{ fontSize: 13, color: '#94A3B8', marginVertical: 8 }}>
              No vacant units available in this property. All units are currently occupied.
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
                      setRent(u.rent.toString());
                      setDeposit(u.deposit.toString());
                    }}
                  >
                    <Text style={[styles.unitChipTitle, isSelected && styles.unitChipTitleActive]}>
                      Unit {u.unitNumber}
                    </Text>
                    <Text style={[styles.unitChipSub, isSelected && styles.unitChipSubActive]}>
                      {u.unitType} • Vacant
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.divider} />
          <Text style={styles.cardTitle}>2. Tenant Information</Text>

          <Text style={styles.inputLabel}>Tenant Full Legal Name *</Text>
          <TextInput
            style={styles.input}
            value={tenantName}
            onChangeText={setTenantName}
            placeholder="e.g. Full Name"
          />

          <View style={styles.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={tenantEmail}
                onChangeText={setTenantEmail}
                placeholder="tenant@email.com"
                keyboardType="email-address"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={tenantPhone}
                onChangeText={setTenantPhone}
                placeholder="+91 98765 43210"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.cardTitle}>3. Financial & Escalation Terms</Text>

          <View style={styles.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Monthly Rent ({selectedProperty?.currency || viewCurrency})</Text>
              <TextInput
                style={styles.input}
                value={rent}
                onChangeText={setRent}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Security Deposit</Text>
              <TextInput
                style={styles.input}
                value={deposit}
                onChangeText={setDeposit}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Start Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>End Date (11 Months)</Text>
              <TextInput
                style={styles.input}
                value={endDate}
                onChangeText={setEndDate}
              />
            </View>
          </View>

          <View style={styles.grid3}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Annual Escalation</Text>
              <TextInput
                style={styles.input}
                value={escalation}
                onChangeText={setEscalation}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Lock-in Period</Text>
              <TextInput
                style={styles.input}
                value={lockInMonths}
                onChangeText={setLockInMonths}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Notice Days</Text>
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
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addClauseRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={customClause}
              onChangeText={setCustomClause}
              placeholder="Add custom condition (e.g. 1 reserved parking bay)..."
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
            <Text style={styles.generateBtnText}>✓ Generate & Activate Lease</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  headerSub: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  stampBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  stampBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  scroll: {
    flex: 1,
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
    backgroundColor: '#10B981',
    borderColor: '#10B981',
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
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  unitChipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  unitChipTitleActive: {
    color: '#059669',
  },
  unitChipSub: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 1,
  },
  unitChipSubActive: {
    color: '#059669',
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
    color: '#10B981',
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
    backgroundColor: '#10B981',
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
    backgroundColor: '#10B981',
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
});
