import React, { useMemo, useState } from 'react';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileInvoice, MobileInvoiceItem } from '../types';

export const DEFAULT_RENT_TERMS = `1. Payment is due strictly on or before the due date specified on this invoice.
2. Cheques / online NEFT / RTGS / UPI transfers are subject to bank clearance.
3. Late payments will incur a recurring late fee penalty as specified in the lease.
4. Any billing discrepancies must be reported to the landlord office within 3 days.`;

export const DEFAULT_DEPOSIT_TERMS = `1. Security Deposit Classification: 100% Refundable Security Deposit held in trust custody.
2. Custody & Non-Income Status: Funds remain trust assets and do not constitute rental income.
3. Move-Out Inspection: Deductions are strictly limited to verified unpaid arrears or damages.
4. Refund Disbursement: Remitted to tenant within 14 business days of checkout clearance.`;

export const RentalInvoiceStudioScreen: React.FC<{
  onBack?: () => void;
  onSuccess?: () => void;
  initialType?: 'rent' | 'deposit' | 'utility' | 'maintenance' | 'late_fee';
}> = ({ onBack, onSuccess, initialType = 'rent' }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, saveInvoice } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, getSymbol, viewCurrency } = useMobileCurrency();

  const [invoiceType, setInvoiceType] = useState<'rent' | 'deposit' | 'utility' | 'maintenance' | 'late_fee'>(initialType);

  // Active Tab: 'edit' or 'preview' (1-to-1 Web Parity)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const myProperties = useMemo(() => {
    return new Set(state.properties.filter((p) => p.ownerId === user.id).map((p) => p.id));
  }, [state.properties, user.id]);

  const occupiedUnits = useMemo(() => {
    const list = state.units.filter(
      (u) =>
        (u.ownerId === user.id || (u.propertyId && myProperties.has(u.propertyId)))
    );
    return list.length > 0 ? list : state.units;
  }, [state.units, user.id, myProperties]);

  const [selectedUnitId, setSelectedUnitId] = useState(occupiedUnits[0]?.id || '');
  const selectedUnit = occupiedUnits.find((u) => u.id === selectedUnitId) || occupiedUnits[0] || null;

  // Selected property
  const selectedProp = useMemo(() => {
    if (!selectedUnit) return null;
    return state.properties.find((p) => p.id === selectedUnit.propertyId || p.name === selectedUnit.propertyName) || null;
  }, [selectedUnit, state.properties]);

  // Automatic currency resolution synced to property / unit, with manual override option
  const autoCurrency = selectedUnit?.currency || selectedProp?.currency || viewCurrency;
  const [customCurrency, setCustomCurrency] = useState<string | null>(null);
  const effectiveCurrency = customCurrency || autoCurrency;

  const matchedTenant = useMemo(() => {
    if (!selectedUnit) return null;
    return (
      state.tenants.find((t) => selectedUnit.currentTenantId && t.id === selectedUnit.currentTenantId) ||
      state.tenants.find((t) => t.unit === selectedUnit.unitNumber && (!selectedUnit.propertyId || t.propertyId === selectedUnit.propertyId)) ||
      null
    );
  }, [state.tenants, selectedUnit]);

  // Pricing & Items
  const [baseRent, setBaseRent] = useState(
    selectedUnit ? selectedUnit.rent.toString() : (effectiveCurrency === 'INR' ? '28000' : '2200')
  );
  const [depositAmount, setDepositAmount] = useState(
    selectedUnit?.deposit ? selectedUnit.deposit.toString() : (selectedUnit?.rent ? (selectedUnit.rent * 2).toString() : '50000')
  );
  const [societyDues, setSocietyDues] = useState('0');
  const [waterCharges, setWaterCharges] = useState('0');
  const [parkingFee, setParkingFee] = useState('0');
  const [lateFee, setLateFee] = useState('0');
  const [taxPercent, setTaxPercent] = useState('0');
  const [discountAmt, setDiscountAmt] = useState('0');

  // Additional customizable line items
  const [extraItems, setExtraItems] = useState<MobileInvoiceItem[]>([]);
  const [newDesc, setNewDesc] = useState('');
  const [newAmt, setNewAmt] = useState('');

  // Electricity Sub-Meter
  const [prevReading, setPrevReading] = useState('0');
  const [currReading, setCurrReading] = useState('0');
  const [ratePerKwh, setRatePerKwh] = useState('0');

  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [notes, setNotes] = useState('Thank you for your prompt tenancy settlement.');

  // Computations
  const prevNum = parseFloat(prevReading) || 0;
  const currNum = parseFloat(currReading) || 0;
  const unitsConsumed = Math.max(0, currNum - prevNum);
  const rateNum = parseFloat(ratePerKwh) || 0;
  const electricityTotal = Math.round(unitsConsumed * rateNum);

  const rentNum = parseInt(baseRent, 10) || 0;
  const depositNum = parseInt(depositAmount, 10) || 0;
  const societyNum = parseInt(societyDues, 10) || 0;
  const waterNum = parseInt(waterCharges, 10) || 0;
  const parkingNum = parseInt(parkingFee, 10) || 0;
  const lateFeeNum = parseInt(lateFee, 10) || 0;
  const extraTotal = extraItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const taxPctNum = parseFloat(taxPercent) || 0;
  const discountNum = parseFloat(discountAmt) || 0;

  const subtotal =
    invoiceType === 'deposit'
      ? depositNum + extraTotal
      : invoiceType === 'utility'
      ? electricityTotal + waterNum + extraTotal
      : invoiceType === 'maintenance'
      ? societyNum + extraTotal
      : invoiceType === 'late_fee'
      ? lateFeeNum + extraTotal
      : rentNum + societyNum + waterNum + parkingNum + electricityTotal + lateFeeNum + extraTotal;

  const taxAmount = Math.round(Math.max(0, subtotal - discountNum) * (taxPctNum / 100));
  const grandTotal = Math.max(0, subtotal - discountNum + taxAmount);

  // Compiled items list
  const compiledItemsList = useMemo<MobileInvoiceItem[]>(() => {
    if (invoiceType === 'deposit') {
      return [
        {
          description: `100% Refundable Security Deposit — Unit ${selectedUnit?.unitNumber || 'Premises'}`,
          amount: depositNum,
        },
        ...extraItems,
      ];
    }
    const list: MobileInvoiceItem[] = [
      { description: `Base Monthly Rent (${selectedUnit?.unitNumber || 'Unit'})`, amount: rentNum },
      { description: `Electricity (${unitsConsumed} kWh @ ${getSymbol(effectiveCurrency)}${rateNum}/unit)`, amount: electricityTotal },
      { description: 'Society Maintenance Charges', amount: societyNum },
      { description: 'Water & Sewage Sub-charges', amount: waterNum },
      { description: 'Dedicated Parking Space', amount: parkingNum },
    ];
    if (lateFeeNum > 0) {
      list.push({ description: 'Late Payment Penalty Surcharge', amount: lateFeeNum });
    }
    return [...list, ...extraItems];
  }, [
    invoiceType,
    selectedUnit,
    depositNum,
    rentNum,
    unitsConsumed,
    effectiveCurrency,
    rateNum,
    electricityTotal,
    societyNum,
    waterNum,
    parkingNum,
    lateFeeNum,
    extraItems,
  ]);

  const handleAddExtraItem = () => {
    if (!newDesc.trim()) {
      Alert.alert('Required', 'Please enter a description for the line item.');
      return;
    }
    const amt = parseFloat(newAmt) || 0;
    if (amt <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }
    setExtraItems((prev) => [...prev, { description: newDesc.trim(), amount: amt }]);
    setNewDesc('');
    setNewAmt('');
  };

  const handleGenerateInvoice = (targetStatus: 'sent' | 'draft' = 'sent') => {
    if (!selectedUnit) {
      Alert.alert('No Unit Selected', 'Please select a valid unit to issue an invoice.');
      return;
    }

    const tenantName = matchedTenant?.name || selectedUnit?.tenant || '';
    if (!tenantName || tenantName.trim().toLowerCase() === 'resident') {
      Alert.alert(
        'Tenant Required',
        'Cannot dispatch invoice without an assigned tenant name. Please verify resident details before issuing.'
      );
      return;
    }

    const isDep = invoiceType === 'deposit';
    const invId = isDep ? `DEP-${Date.now().toString().slice(-6)}` : `INV-${Date.now().toString().slice(-6)}`;

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
      amount: subtotal,
      tax: taxAmount,
      discount: discountNum,
      total: grandTotal,
      due: dueDate,
      status: targetStatus,
      currency: effectiveCurrency,
      type: invoiceType,
      invoiceType: invoiceType,
      notes: notes.trim() || undefined,
      lateFeeApplied: isDep ? 0 : lateFeeNum,
      items: compiledItemsList,
      meterReadings: isDep
        ? undefined
        : {
            electricityCurrent: currNum,
            electricityPrevious: prevNum,
            ratePerKwh: rateNum,
            waterCharges: waterNum,
          },
      createdAt: new Date().toISOString(),
    } as MobileInvoice;

    saveInvoice(newInvoice);
    Alert.alert(
      targetStatus === 'draft' ? 'Draft Saved ✓' : isDep ? 'Deposit Voucher Dispatched! 🛡️' : 'Invoice Dispatched! 💳',
      `${isDep ? 'Security Deposit Voucher' : 'Invoice'} ${invId} for ${format(grandTotal, effectiveCurrency)} ${targetStatus === 'draft' ? 'saved as draft' : `has been sent to ${newInvoice.tenant}`}.`
    );
    if (onSuccess) onSuccess();
    else if (onBack) onBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={[styles.logoBadge, { backgroundColor: invoiceType === 'deposit' ? '#D97706' : '#10B981' }]}>
            <Feather name={invoiceType === 'deposit' ? 'shield' : 'file-text'} size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>
              {invoiceType === 'deposit' ? 'Security Deposit Studio' : 'Rental Invoice Studio'}
            </Text>
            <Text style={{ fontSize: 11, color: colors.inkSoft }}>
              {selectedProp?.name || 'Property Portfolio'} • {effectiveCurrency}
            </Text>
          </View>
        </View>
      </View>

      {/* Tab Switcher: 1-to-1 Web Parity (Edit vs Official Document Preview & Voucher) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'edit' && styles.tabItemActive]}
          onPress={() => setActiveTab('edit')}
          activeOpacity={0.8}
        >
          <Feather name="edit-3" size={14} color={activeTab === 'edit' ? colors.primary : colors.inkSoft} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'edit' && styles.tabTextActive]}>
            1. Configure Details
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'preview' && styles.tabItemActive]}
          onPress={() => setActiveTab('preview')}
          activeOpacity={0.8}
        >
          <Feather name="eye" size={14} color={activeTab === 'preview' ? colors.primary : colors.inkSoft} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'preview' && styles.tabTextActive]}>
            2. Document Preview & Voucher
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'edit' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Category Selector: All 5 Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
            {([
              { key: 'rent', label: 'Rent Invoice' },
              { key: 'deposit', label: 'Deposit Voucher' },
              { key: 'utility', label: 'Utility Bill' },
              { key: 'maintenance', label: 'Maintenance' },
              { key: 'late_fee', label: 'Late Fee' },
            ] as const).map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryBtn,
                  { flex: 0, paddingHorizontal: 14 },
                  invoiceType === cat.key && (cat.key === 'deposit' ? styles.categoryBtnDepositActive : styles.categoryBtnActive),
                ]}
                onPress={() => setInvoiceType(cat.key)}
              >
                <Text
                  style={[
                    styles.categoryBtnText,
                    invoiceType === cat.key && (cat.key === 'deposit' ? { color: '#B45309', fontWeight: '700' } : styles.categoryBtnTextActive),
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.cardTitle}>1. Target Resident & Apartment</Text>
              {/* Currency Selector Chips */}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {['₹', '$', '€', '£', 'AED'].map((sym) => (
                  <TouchableOpacity
                    key={sym}
                    style={[
                      styles.currChip,
                      effectiveCurrency === sym && styles.currChipActive,
                    ]}
                    onPress={() => setCustomCurrency(sym)}
                  >
                    <Text style={[styles.currChipText, effectiveCurrency === sym && styles.currChipTextActive]}>
                      {sym}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.inputLabel}>Select Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginVertical: 6 }}>
              {occupiedUnits.map((u) => {
                const isSelected = u.id === selectedUnit?.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.unitChip, isSelected && styles.unitChipActive]}
                    onPress={() => {
                      setSelectedUnitId(u.id);
                      setBaseRent(u.rent.toString());
                      if (u.deposit) setDepositAmount(u.deposit.toString());
                      setCustomCurrency(null); // auto-adopt unit property currency
                    }}
                  >
                    <Text style={[styles.unitChipTitle, isSelected && styles.unitChipTitleActive]}>
                      Unit {u.unitNumber}
                    </Text>
                    <Text style={[styles.unitChipSub, isSelected && styles.unitChipSubActive]}>
                      {u.tenant || 'Vacant'} • {u.propertyName} ({u.currency || '₹'})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.residentBox}>
              <Ionicons name="person-circle-outline" size={24} color={invoiceType === 'deposit' ? '#D97706' : '#10B981'} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.residentName}>{matchedTenant?.name || selectedUnit?.tenant || 'Resident'}</Text>
                <Text style={styles.residentSub}>
                  {selectedUnit?.propertyName} • Unit {selectedUnit?.unitNumber} ({selectedUnit?.unitType})
                </Text>
              </View>
            </View>

            {invoiceType === 'deposit' ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.cardTitle}>2. Security Deposit Custody Terms</Text>
                <View style={[styles.depositNotice, { backgroundColor: isDark ? colors.surfaceSunken : '#FEF3C7', borderColor: isDark ? colors.line : '#FDE68A' }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>
                    100% Refundable Security Deposit
                  </Text>
                  <Text style={{ fontSize: 11.5, color: '#B45309', marginTop: 3 }}>
                    Held in fiduciary trust custody. Non-taxable trust asset refundable within 14 business days of checkout clearance.
                  </Text>
                </View>

                <Text style={styles.inputLabel}>Security Deposit Amount ({getSymbol(effectiveCurrency)})</Text>
                <TextInput
                  style={styles.input}
                  value={depositAmount}
                  onChangeText={setDepositAmount}
                  keyboardType="numeric"
                />
              </>
            ) : (
              <>
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
                      <Text style={styles.inputLabel}>Rate/kWh ({effectiveCurrency})</Text>
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
                      {unitsConsumed} kWh × {getSymbol(effectiveCurrency)}{rateNum}
                    </Text>
                    <Text style={styles.meterResultTotal}>
                      = {format(electricityTotal, effectiveCurrency)}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />
                <Text style={styles.cardTitle}>3. Recurring Charges</Text>

                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Base Rent ({getSymbol(effectiveCurrency)})</Text>
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
                    <Text style={styles.inputLabel}>Late Fee Surcharge ({getSymbol(effectiveCurrency)})</Text>
                    <TextInput
                      style={styles.input}
                      value={lateFee}
                      onChangeText={setLateFee}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Payment Due Date</Text>
                    <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} />
                  </View>
                </View>
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.cardTitle}>4. Additional Itemized Charges</Text>

            {extraItems.map((item, idx) => (
              <View key={idx} style={styles.extraItemRow}>
                <Text style={styles.extraItemDesc}>{item.description}</Text>
                <Text style={styles.extraItemAmt}>+{format(item.amount, effectiveCurrency)}</Text>
                <TouchableOpacity onPress={() => setExtraItems((prev) => prev.filter((_, i) => i !== idx))}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.grid2}>
              <View style={{ flex: 2 }}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Move-in Cleaning, Wi-Fi"
                  placeholderTextColor={colors.inkSoft}
                  value={newDesc}
                  onChangeText={setNewDesc}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Amount"
                  placeholderTextColor={colors.inkSoft}
                  value={newAmt}
                  onChangeText={setNewAmt}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.addItemBtn} onPress={handleAddExtraItem} activeOpacity={0.8}>
              <Ionicons name="add" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.addItemBtnText}>+ Add Line Item</Text>
            </TouchableOpacity>

            {/* Tax & Discount Controls */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Tax (%)</Text>
                <TextInput
                  style={styles.input}
                  value={taxPercent}
                  onChangeText={setTaxPercent}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Discount ({getSymbol(effectiveCurrency)})</Text>
                <TextInput
                  style={styles.input}
                  value={discountAmt}
                  onChangeText={setDiscountAmt}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>
            </View>

            {/* Grand Total Summary Box */}
            <View style={styles.totalBox}>
              <View>
                <Text style={styles.totalLabel}>
                  {invoiceType === 'deposit' ? 'TOTAL DEPOSIT DUE' : 'TOTAL INVOICE PAYABLE'}
                </Text>
                <Text style={styles.totalSub}>
                  {invoiceType === 'deposit' ? '100% refundable escrow trust deposit' : 'Itemized rent + metered power + dues'}
                </Text>
              </View>
              <Text style={styles.totalAmount}>
                {format(grandTotal, effectiveCurrency)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.previewNavBtn}
                onPress={() => setActiveTab('preview')}
                activeOpacity={0.85}
              >
                <Feather name="eye" size={15} color={colors.navy} style={{ marginRight: 5 }} />
                <Text style={styles.previewNavBtnText}>Preview</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.previewNavBtn, { backgroundColor: colors.surfaceSunken }]}
                onPress={() => handleGenerateInvoice('draft')}
                activeOpacity={0.85}
              >
                <Text style={[styles.previewNavBtnText, { color: colors.ink }]}>Save Draft</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dispatchBtn, { flex: 1.5, backgroundColor: invoiceType === 'deposit' ? '#D97706' : '#10B981' }]}
                onPress={() => handleGenerateInvoice('sent')}
                activeOpacity={0.85}
              >
                <Text style={styles.dispatchBtnText}>
                  ✓ Dispatch ({format(grandTotal, effectiveCurrency)})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        /* OFFICIAL DOCUMENT & VOUCHER PREVIEW (1-to-1 Web Parity) */
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.voucherSheet, { backgroundColor: colors.surface }]}>
            {/* Voucher Header */}
            <View style={styles.voucherTop}>
              <View>
                <Text style={styles.voucherIssuer}>{selectedProp?.name || 'PROPERTY MANAGEMENT'}</Text>
                <Text style={styles.voucherSubIssuer}>Verified Property Administration</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={[styles.voucherBadge, { backgroundColor: invoiceType === 'deposit' ? '#FEF3C7' : '#DCFCE7' }]}>
                  <Text style={[styles.voucherBadgeText, { color: invoiceType === 'deposit' ? '#92400E' : '#166534' }]}>
                    {invoiceType === 'deposit' ? 'SECURITY DEPOSIT VOUCHER' : 'TAX INVOICE'}
                  </Text>
                </View>
                <Text style={styles.voucherIdText}>OFFICIAL RECEIPT DRAFT</Text>
              </View>
            </View>

            {/* Recipient & Schedule Box */}
            <View style={styles.voucherInfoGrid}>
              <View style={styles.voucherInfoCol}>
                <Text style={styles.voucherMetaLabel}>BILLED TO (RESIDENT):</Text>
                <Text style={styles.voucherMetaVal}>{matchedTenant?.name || selectedUnit?.tenant || 'Resident'}</Text>
                <Text style={styles.voucherMetaSub}>
                  Unit {selectedUnit?.unitNumber} • {selectedUnit?.propertyName}
                </Text>
                {matchedTenant?.email && <Text style={styles.voucherMetaSub}>{matchedTenant.email}</Text>}
              </View>

              <View style={styles.voucherInfoCol}>
                <Text style={styles.voucherMetaLabel}>INVOICE TIMELINE:</Text>
                <Text style={styles.voucherMetaVal}>Due: {dueDate}</Text>
                <Text style={styles.voucherMetaSub}>Issue Date: {new Date().toISOString().split('T')[0]}</Text>
                <Text style={styles.voucherMetaSub}>Status: Official Sent</Text>
              </View>
            </View>

            {/* Items Table */}
            <View style={styles.voucherTable}>
              <View style={styles.voucherTableHead}>
                <Text style={styles.voucherTableHeadText}>DESCRIPTION / ITEM DETAILS</Text>
                <Text style={styles.voucherTableHeadText}>AMOUNT ({effectiveCurrency})</Text>
              </View>

              {compiledItemsList.map((it, idx) => (
                <View key={idx} style={styles.voucherTableRow}>
                  <Text style={styles.voucherItemDesc}>{it.description}</Text>
                  <Text style={styles.voucherItemAmt}>{format(it.amount, effectiveCurrency)}</Text>
                </View>
              ))}
            </View>

            {/* Totals */}
            <View style={styles.voucherTotalsWrap}>
              <View style={styles.voucherTotalRow}>
                <Text style={styles.voucherTotalLabel}>Subtotal:</Text>
                <Text style={styles.voucherTotalVal}>{format(grandTotal, effectiveCurrency)}</Text>
              </View>
              <View style={[styles.voucherTotalRow, styles.voucherNetDueRow]}>
                <Text style={styles.voucherNetDueLabel}>Net Amount Due:</Text>
                <Text style={styles.voucherNetDueVal}>{format(grandTotal, effectiveCurrency)}</Text>
              </View>
            </View>

            {/* Terms and Conditions */}
            <View style={styles.voucherTermsBox}>
              <Text style={styles.voucherTermsTitle}>TERMS & CONDITIONS:</Text>
              <Text style={styles.voucherTermsText}>
                {invoiceType === 'deposit' ? DEFAULT_DEPOSIT_TERMS : DEFAULT_RENT_TERMS}
              </Text>
            </View>

            {/* Bottom Actions */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                style={styles.previewNavBtn}
                onPress={() => setActiveTab('edit')}
                activeOpacity={0.8}
              >
                <Feather name="arrow-left" size={15} color={colors.navy} style={{ marginRight: 5 }} />
                <Text style={styles.previewNavBtnText}>Edit Details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.previewNavBtn}
                onPress={() =>
                  Share.share({
                    title: `${invoiceType.toUpperCase()} — Unit ${selectedUnit?.unitNumber || ''}`,
                    message: `Invoice for ${matchedTenant?.name || selectedUnit?.tenant || 'Resident'} (Unit ${selectedUnit?.unitNumber || ''})\nTotal: ${format(grandTotal, effectiveCurrency)}\nDue: ${dueDate}\n${notes}`,
                  })
                }
                activeOpacity={0.85}
              >
                <Feather name="share-2" size={15} color={colors.navy} style={{ marginRight: 5 }} />
                <Text style={styles.previewNavBtnText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dispatchBtn, { flex: 2, backgroundColor: invoiceType === 'deposit' ? '#D97706' : '#10B981' }]}
                onPress={() => handleGenerateInvoice('sent')}
                activeOpacity={0.85}
              >
                <Text style={styles.dispatchBtnText}>
                  ✓ Save & Dispatch Voucher
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
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
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabItemActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
      paddingBottom: 36,
    },
    categoryRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    categoryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    categoryBtnActive: {
      borderColor: '#059669',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    },
    categoryBtnDepositActive: {
      borderColor: '#D97706',
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : '#FEF3C7',
    },
    categoryBtnText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    categoryBtnTextActive: {
      color: '#059669',
      fontWeight: '700',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    cardTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 8,
    },
    currChip: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    currChipActive: {
      borderColor: '#059669',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
    },
    currChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    currChipTextActive: {
      color: '#059669',
      fontWeight: '700',
    },
    inputLabel: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
      marginTop: 8,
      marginBottom: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.navy,
      backgroundColor: isDark ? colors.surfaceSunken : '#FAFAFA',
    },
    unitChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      marginRight: 8,
    },
    unitChipActive: {
      borderColor: '#059669',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    },
    unitChipTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    unitChipTitleActive: {
      color: '#059669',
    },
    unitChipSub: {
      fontSize: 10,
      color: colors.inkSoft,
      marginTop: 2,
    },
    unitChipSubActive: {
      color: '#059669',
    },
    residentBox: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderRadius: 8,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.line,
    },
    residentName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    residentSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    depositNotice: {
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 10,
    },
    divider: {
      height: 1,
      backgroundColor: colors.line,
      marginVertical: 14,
    },
    meterContainer: {
      backgroundColor: isDark ? colors.surfaceSunken : '#FFFBEB',
      borderWidth: 1,
      borderColor: isDark ? colors.line : '#FDE68A',
      borderRadius: 8,
      padding: 12,
    },
    meterHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    meterTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
      marginLeft: 4,
    },
    unitsPill: {
      fontSize: 11,
      fontWeight: '700',
      color: '#D97706',
    },
    grid2: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 6,
    },
    grid3: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 6,
    },
    meterResultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.line : '#FDE68A',
    },
    meterResultText: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    meterResultTotal: {
      fontSize: 13,
      fontWeight: '800',
      color: '#D97706',
    },
    extraItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    extraItemDesc: {
      fontSize: 12,
      color: colors.navy,
      flex: 1,
    },
    extraItemAmt: {
      fontSize: 12,
      fontWeight: '700',
      color: '#059669',
    },
    addItemBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#059669',
      paddingVertical: 7,
      borderRadius: 6,
      marginTop: 4,
      marginBottom: 10,
    },
    addItemBtnText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    totalBox: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      backgroundColor: isDark ? colors.surfaceSunken : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDark ? colors.line : '#BBF7D0',
      borderRadius: 8,
      marginTop: 10,
    },
    totalLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: '#166534',
    },
    totalSub: {
      fontSize: 10,
      color: '#15803D',
      marginTop: 2,
    },
    totalAmount: {
      fontSize: 16,
      fontWeight: '800',
      color: '#166534',
    },
    previewNavBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    previewNavBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    dispatchBtn: {
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dispatchBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },

    /* VOUCHER PREVIEW STYLES */
    voucherSheet: {
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    voucherTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      borderBottomWidth: 2,
      borderBottomColor: colors.line,
      paddingBottom: 12,
      marginBottom: 12,
    },
    voucherIssuer: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.navy,
    },
    voucherSubIssuer: {
      fontSize: 10.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    voucherBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    voucherBadgeText: {
      fontSize: 9.5,
      fontWeight: '800',
    },
    voucherIdText: {
      fontSize: 9.5,
      color: colors.inkSoft,
      marginTop: 3,
      fontWeight: '600',
    },
    voucherInfoGrid: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      padding: 10,
      borderRadius: 8,
      marginBottom: 12,
    },
    voucherInfoCol: {
      flex: 1,
    },
    voucherMetaLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.inkSoft,
      marginBottom: 2,
    },
    voucherMetaVal: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    voucherMetaSub: {
      fontSize: 10.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    voucherTable: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 12,
    },
    voucherTableHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    voucherTableHeadText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.inkSoft,
    },
    voucherTableRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    voucherItemDesc: {
      fontSize: 11.5,
      color: colors.navy,
      flex: 2,
    },
    voucherItemAmt: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.navy,
      textAlign: 'right',
      flex: 1,
    },
    voucherTotalsWrap: {
      alignItems: 'flex-end',
      marginBottom: 12,
    },
    voucherTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: 180,
      paddingVertical: 3,
    },
    voucherTotalLabel: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    voucherTotalVal: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    voucherNetDueRow: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 6,
      marginTop: 4,
    },
    voucherNetDueLabel: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.navy,
    },
    voucherNetDueVal: {
      fontSize: 14,
      fontWeight: '800',
      color: '#059669',
    },
    voucherTermsBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      padding: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
    },
    voucherTermsTitle: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.inkSoft,
      marginBottom: 4,
    },
    voucherTermsText: {
      fontSize: 9.5,
      color: colors.inkSoft,
      lineHeight: 14,
    },
  });
