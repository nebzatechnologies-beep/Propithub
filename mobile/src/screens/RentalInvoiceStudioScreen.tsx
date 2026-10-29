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
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileInvoice } from '../types';

export const RentalInvoiceStudioScreen: React.FC<{ onBack?: () => void; onSuccess?: () => void }> = ({
  onBack,
  onSuccess,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, saveInvoice } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, getSymbol, viewCurrency } = useMobileCurrency();

  const myProperties = useMemo(() => {
    return new Set(state.properties.filter((p) => p.ownerId === user.id).map((p) => p.id));
  }, [state.properties, user.id]);

  const occupiedUnits = useMemo(() => {
    return state.units.filter(
      (u) =>
        u.status === 'occupied' &&
        (u.ownerId === user.id || (u.propertyId && myProperties.has(u.propertyId)))
    );
  }, [state.units, user.id, myProperties]);

  const [selectedUnitId, setSelectedUnitId] = useState(occupiedUnits[0]?.id || '');
  const selectedUnit = occupiedUnits.find((u) => u.id === selectedUnitId) || occupiedUnits[0] || null;
  const unitCurrency = selectedUnit?.currency || viewCurrency;

  const matchedTenant = useMemo(() => {
    if (!selectedUnit) return null;
    return (
      state.tenants.find((t) => selectedUnit.currentTenantId && t.id === selectedUnit.currentTenantId) ||
      state.tenants.find((t) => t.unit === selectedUnit.unitNumber && (!selectedUnit.propertyId || t.propertyId === selectedUnit.propertyId)) ||
      null
    );
  }, [state.tenants, selectedUnit]);

  // Line items & sub-meters
  const [baseRent, setBaseRent] = useState(selectedUnit ? selectedUnit.rent.toString() : (viewCurrency === 'INR' ? '28000' : '2200'));
  const [societyDues, setSocietyDues] = useState('1500');
  const [waterCharges, setWaterCharges] = useState('350');
  const [parkingFee, setParkingFee] = useState('500');
  const [lateFee, setLateFee] = useState('0');

  // Electricity Sub-Meter
  const [prevReading, setPrevReading] = useState('1420');
  const [currReading, setCurrReading] = useState('1610');
  const [ratePerKwh, setRatePerKwh] = useState('9.5');

  const [dueDate, setDueDate] = useState('2024-11-05');
  const [notes, setNotes] = useState('Rent & sub-meter utilities for November 2024 billing cycle.');

  // Computations
  const prevNum = parseFloat(prevReading) || 0;
  const currNum = parseFloat(currReading) || 0;
  const unitsConsumed = Math.max(0, currNum - prevNum);
  const rateNum = parseFloat(ratePerKwh) || 0;
  const electricityTotal = Math.round(unitsConsumed * rateNum);

  const rentNum = parseInt(baseRent, 10) || 0;
  const societyNum = parseInt(societyDues, 10) || 0;
  const waterNum = parseInt(waterCharges, 10) || 0;
  const parkingNum = parseInt(parkingFee, 10) || 0;
  const lateFeeNum = parseInt(lateFee, 10) || 0;

  const grandTotal = rentNum + societyNum + waterNum + parkingNum + electricityTotal + lateFeeNum;

  const handleGenerateInvoice = () => {
    if (!selectedUnit) {
      Alert.alert('No Unit Selected', 'Please select a valid occupied unit to issue an invoice.');
      return;
    }

    const tenantName = matchedTenant?.name || selectedUnit?.tenant || '';
    if (!tenantName || tenantName.trim().toLowerCase() === 'resident') {
      Alert.alert(
        'Tenant Required',
        'Cannot dispatch invoice without an assigned tenant name. Please verify the resident details for this unit before issuing an invoice.'
      );
      return;
    }

    const invId = `INV-${Date.now().toString().slice(-6)}`;
    const itemsList = [
      { description: `Base Monthly Rent (${selectedUnit.unitNumber})`, amount: rentNum },
      { description: `Electricity (${unitsConsumed} kWh @ ${getSymbol(unitCurrency)}${rateNum}/unit)`, amount: electricityTotal },
      { description: 'Society Maintenance Charges', amount: societyNum },
      { description: 'Water & Sewage Sub-charges', amount: waterNum },
      { description: 'Dedicated Parking Space', amount: parkingNum },
    ];
    if (lateFeeNum > 0) {
      itemsList.push({ description: 'Late Payment Penalty Surcharge', amount: lateFeeNum });
    }

    const newInvoice: MobileInvoice = {
      id: invId,
      ownerId: user.id,
      landlordName: user.displayName || (user as any).name || 'Property Owner',
      landlordEmail: user.email || '',
      tenant: tenantName.trim(),
      tenantId: matchedTenant?.id || selectedUnit?.currentTenantId || '',
      tenantEmail: matchedTenant?.email || '',
      unit: selectedUnit.unitNumber,
      propertyName: selectedUnit.propertyName,
      propertyId: selectedUnit.propertyId,
      amount: rentNum,
      tax: 0,
      total: grandTotal,
      due: dueDate,
      status: 'sent',
      currency: unitCurrency,
      type: 'rent',
      lateFeeApplied: lateFeeNum,
      items: itemsList,
      meterReadings: {
        electricityCurrent: currNum,
        electricityPrevious: prevNum,
        ratePerKwh: rateNum,
        waterCharges: waterNum,
      },
      createdAt: new Date().toISOString(),
    };

    saveInvoice(newInvoice);
    Alert.alert(
      'Invoice Dispatched! 💳',
      `Invoice ${invId} for ${format(grandTotal, unitCurrency)} has been sent to ${newInvoice.tenant}.`
    );
    if (onSuccess) onSuccess();
    else if (onBack) onBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="credit-card" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Invoice Studio</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Target Resident & Apartment</Text>

          <Text style={styles.inputLabel}>Select Occupied Unit</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginVertical: 6 }}>
            {state.units.map((u) => {
              const isSelected = u.id === selectedUnit?.id;
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.unitChip, isSelected && styles.unitChipActive]}
                  onPress={() => {
                    setSelectedUnitId(u.id);
                    setBaseRent(u.rent.toString());
                  }}
                >
                  <Text style={[styles.unitChipTitle, isSelected && styles.unitChipTitleActive]}>
                    Unit {u.unitNumber}
                  </Text>
                  <Text style={[styles.unitChipSub, isSelected && styles.unitChipSubActive]}>
                    {u.tenant || 'Vacant'} • {u.propertyName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.residentBox}>
            <Ionicons name="person-circle-outline" size={24} color="#10B981" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.residentName}>{matchedTenant?.name || selectedUnit?.tenant || 'Resident'}</Text>
              <Text style={styles.residentSub}>
                {selectedUnit?.propertyName} • Unit {selectedUnit?.unitNumber} ({selectedUnit?.unitType})
              </Text>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.cardTitle}>2. Electricity Sub-Meter Computation</Text>

          <View style={styles.meterContainer}>
            <View style={styles.meterHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="lightning-bolt" size={18} color="#F59E0B" />
                <Text style={styles.meterTitle}>Sub-Meter: {selectedUnit?.electricityMeter || 'MTR-101'}</Text>
              </View>
              <Text style={styles.unitsPill}>{unitsConsumed} kWh Consumed</Text>
            </View>

            <View style={styles.grid3}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Prev (kWh)</Text>
                <TextInput
                  style={styles.input}
                  value={prevReading}
                  onChangeText={setPrevReading}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Current (kWh)</Text>
                <TextInput
                  style={styles.input}
                  value={currReading}
                  onChangeText={setCurrReading}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Rate/kWh ({unitCurrency})</Text>
                <TextInput
                  style={styles.input}
                  value={ratePerKwh}
                  onChangeText={setRatePerKwh}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.meterResultRow}>
              <Text style={styles.meterResultText}>
                {unitsConsumed} kWh × {getSymbol(unitCurrency)}{rateNum}
              </Text>
              <Text style={styles.meterResultTotal}>
                = {format(electricityTotal, unitCurrency)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.cardTitle}>3. Itemized Charges</Text>

          <View style={styles.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Base Rent ({getSymbol(unitCurrency)})</Text>
              <TextInput
                style={styles.input}
                value={baseRent}
                onChangeText={setBaseRent}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Society Dues</Text>
              <TextInput
                style={styles.input}
                value={societyDues}
                onChangeText={setSocietyDues}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Water Charges</Text>
              <TextInput
                style={styles.input}
                value={waterCharges}
                onChangeText={setWaterCharges}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Dedicated Parking</Text>
              <TextInput
                style={styles.input}
                value={parkingFee}
                onChangeText={setParkingFee}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Late Fee Surcharge ({getSymbol(unitCurrency)})</Text>
              <TextInput
                style={styles.input}
                value={lateFee}
                onChangeText={setLateFee}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Payment Due Date</Text>
              <TextInput
                style={styles.input}
                value={dueDate}
                onChangeText={setDueDate}
              />
            </View>
          </View>

          {/* Grand Total Summary Box */}
          <View style={styles.totalBox}>
            <View>
              <Text style={styles.totalLabel}>TOTAL INVOICE PAYABLE</Text>
              <Text style={styles.totalSub}>Itemized rent + metered power + dues</Text>
            </View>
            <Text style={styles.totalAmount}>
              {format(grandTotal, unitCurrency)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.dispatchBtn}
            onPress={handleGenerateInvoice}
            activeOpacity={0.85}
          >
            <Text style={styles.dispatchBtnText}>
              ✓ Dispatch Invoice ({format(grandTotal, unitCurrency)})
            </Text>
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
  residentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 6,
  },
  residentName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  residentSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    marginVertical: 14,
  },
  meterContainer: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  meterTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginLeft: 4,
  },
  unitsPill: {
    backgroundColor: '#F59E0B',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  grid2: {
    flexDirection: 'row',
    gap: 10,
  },
  grid3: {
    flexDirection: 'row',
    gap: 8,
  },
  meterResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FEF3C7',
  },
  meterResultText: {
    fontSize: 11,
    color: '#92400E',
  },
  meterResultTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 16,
    marginBottom: 14,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
  },
  totalSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10B981',
  },
  dispatchBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
  },
  dispatchBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
