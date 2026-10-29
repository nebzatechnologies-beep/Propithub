import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { MobileMoveOutCheckItem, MobileDispute } from '../types';

interface MoveOutInspectionChecklistScreenProps {
  moveOutId?: string;
  onBack?: () => void;
  onSuccess?: () => void;
}

export const MoveOutInspectionChecklistScreen: React.FC<MoveOutInspectionChecklistScreenProps> = ({
  moveOutId,
  onBack,
  onSuccess,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, updateMoveOut, createDepositSettlement, saveDispute } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, currencySymbol } = useMobileCurrency();

  const activeMoveOut = useMemo(() => {
    if (moveOutId) {
      const found = state.moveOuts.find((m) => m.id === moveOutId);
      if (found) return found;
    }
    // Scope to current authenticated user (tenant or owner)
    if (user.role === 'tenant') {
      const myMo = state.moveOuts.find(
        (m) => m.tenantId === user.id || (user.email && (m as any).tenantEmail?.toLowerCase() === user.email.toLowerCase())
      );
      if (myMo) return myMo;
    } else if (user.role === 'owner') {
      const ownerMo = state.moveOuts.find((m) =>
        state.properties.some((p) => p.ownerId === user.id && p.id === m.propertyId)
      );
      if (ownerMo) return ownerMo;
    }
    return state.moveOuts[0] || null;
  }, [state.moveOuts, moveOutId, state.properties, user]);


  const matchedAg = (state.agreements || []).find(
    (a) =>
      (activeMoveOut.agreementId && a.id === activeMoveOut.agreementId) ||
      ((!activeMoveOut.propertyId || !a.propertyId || a.propertyId === activeMoveOut.propertyId) && a.unit === activeMoveOut.unit)
  );
  const matchedUnit = (state.units || []).find(
    (u) =>
      (!activeMoveOut.propertyId || u.propertyId === activeMoveOut.propertyId) &&
      (u.unitNumber === activeMoveOut.unit || u.id === activeMoveOut.unit)
  );
  const matchedTenant = (state.tenants || []).find(
    (t) =>
      (activeMoveOut.tenantId && t.id === activeMoveOut.tenantId) ||
      ((!activeMoveOut.propertyId || !t.propertyId || t.propertyId === activeMoveOut.propertyId) && t.unit === activeMoveOut.unit)
  );
  const currency = activeMoveOut.currency || matchedAg?.currency || matchedUnit?.currency || viewCurrency;
  const depositHeld = activeMoveOut.depositHeld || matchedAg?.deposit || matchedUnit?.deposit || matchedTenant?.deposit || (matchedAg?.rent ? matchedAg.rent * 2 : (matchedUnit?.rent ? matchedUnit.rent * 2 : 0));
  const unpaidBills = activeMoveOut.unpaidBills || 0;

  // Initialize checklist items from active move-out or clean inspection inventory
  const [checklist, setChecklist] = useState<MobileMoveOutCheckItem[]>(() => {
    if (activeMoveOut.inspectionChecklist && activeMoveOut.inspectionChecklist.length > 0) {
      return activeMoveOut.inspectionChecklist.map((item) => ({
        ...item,
        room: item.room || 'General',
        item: item.item || (item as any).amenity || 'Inspection Item',
        amenity: item.item || (item as any).amenity || 'Inspection Item',
        condition: (item.condition === 'fair' || item.condition === 'minor_wear') ? 'minor_wear' : (item.condition === 'damaged' ? 'damaged' : 'good'),
        deduction: Number(item.deduction) || 0,
        notes: item.notes || '',
        photos: item.photos || ((item as any).photo ? [(item as any).photo] : []),
      }));
    }
    return [
      { room: 'Living Room', item: 'Paint, Walls & Ceilings', amenity: 'Paint, Walls & Ceilings', condition: 'good', deduction: 0, notes: '', photos: [] },
      { room: 'Kitchen', item: 'Counters, Cabinets & Appliances', amenity: 'Counters, Cabinets & Appliances', condition: 'good', deduction: 0, notes: '', photos: [] },
      { room: 'Bedrooms', item: 'Doors, Windows, Locks & Keys', amenity: 'Doors, Windows, Locks & Keys', condition: 'good', deduction: 0, notes: '', photos: [] },
      { room: 'Bathroom', item: 'Plumbing, Sanitary & Taps', amenity: 'Plumbing, Sanitary & Taps', condition: 'good', deduction: 0, notes: '', photos: [] },
      { room: 'Premises', item: 'Flooring, Tiles & Carpets', amenity: 'Flooring, Tiles & Carpets', condition: 'good', deduction: 0, notes: '', photos: [] },
      { room: 'Utility / Balcony', item: 'Electrical, Lighting & Fixtures', amenity: 'Electrical, Lighting & Fixtures', condition: 'good', deduction: 0, notes: '', photos: [] },
    ];
  });

  React.useEffect(() => {
    if (activeMoveOut.inspectionChecklist && activeMoveOut.inspectionChecklist.length > 0) {
      setChecklist(
        activeMoveOut.inspectionChecklist.map((item) => ({
          ...item,
          room: item.room || 'General',
          item: item.item || (item as any).amenity || 'Inspection Item',
          amenity: item.item || (item as any).amenity || 'Inspection Item',
          condition: (item.condition === 'fair' || item.condition === 'minor_wear') ? 'minor_wear' : (item.condition === 'damaged' ? 'damaged' : 'good'),
          deduction: Number(item.deduction) || 0,
          notes: item.notes || '',
          photos: item.photos || ((item as any).photo ? [(item as any).photo] : []),
        }))
      );
    }
  }, [activeMoveOut.id, activeMoveOut.inspectionChecklist]);

  // Modal to add custom deduction/item
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newRoom, setNewRoom] = useState('Living Room');
  const [newItem, setNewItem] = useState('');
  const [newDeduction, setNewDeduction] = useState('1000');
  const [newNotes, setNewNotes] = useState('');

  const totalDeductions = useMemo(() => {
    return checklist.reduce((sum, item) => sum + (Number(item.deduction) || 0), 0);
  }, [checklist]);

  const netRefund = Math.max(0, depositHeld - totalDeductions - unpaidBills);

  const toggleCondition = (idx: number, cond: 'good' | 'minor_wear' | 'damaged', defDeduction: number) => {
    setChecklist((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              condition: cond,
              deduction: cond === 'damaged' ? item.deduction || defDeduction : 0,
            }
          : item
      )
    );
  };

  const handleUpdateDeductionAmount = (idx: number, text: string) => {
    const val = Number(text) || 0;
    setChecklist((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, deduction: val } : item))
    );
  };

  const handleRemoveChecklistItem = (idx: number) => {
    const itemToRemove = checklist[idx];
    Alert.alert(
      'Remove Item',
      `Remove "${itemToRemove?.item || 'this item'}" from inspection checklist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setChecklist((prev) => prev.filter((_, i) => i !== idx));
          },
        },
      ]
    );
  };

  const handleAddNewItem = () => {
    if (!newItem.trim()) {
      Alert.alert('Missing Field', 'Please enter amenity / item title.');
      return;
    }
    const created: MobileMoveOutCheckItem = {
      room: newRoom,
      item: newItem.trim(),
      amenity: newItem.trim(),
      condition: 'damaged',
      deduction: Number(newDeduction) || 0,
      notes: newNotes.trim() || undefined,
      photos: [],
    };
    setChecklist((prev) => [...prev, created]);
    setShowAddItemModal(false);
    setNewItem('');
    setNewDeduction('1000');
    setNewNotes('');
  };

  const handleSaveAndApproveSettlement = () => {
    const itemizedDeductions = checklist
      .filter((c) => c.deduction > 0)
      .map((c) => ({
        reason: `${c.room} - ${c.item}${c.notes ? ` (${c.notes})` : ''}`,
        amount: c.deduction,
        amenity: c.item,
      }));

    updateMoveOut(activeMoveOut.id, {
      inspectionChecklist: checklist,
      totalDeductions,
      netRefundAmount: netRefund,
      status: 'refund_scheduled',
      deductions: itemizedDeductions,
    });

    createDepositSettlement({
      id: activeMoveOut.id,
      propertyId: activeMoveOut.propertyId,
      unit: activeMoveOut.unit,
      tenantId: activeMoveOut.tenantId,
      tenantName: activeMoveOut.tenantName,
      totalDeductions,
      netRefundAmount: netRefund,
      status: 'refund_scheduled' as any,
      inspectionChecklist: checklist,
    });

    const successMsg = `Move-out inspection for Unit ${activeMoveOut.unit} registered. Deductions: ${format(totalDeductions, currency)}. Net refundable deposit: ${format(netRefund, currency)}. Itemized report submitted to resident.`;

    if (Platform.OS === 'web') {
      window.alert(`Inspection Finalized ✓\n\n${successMsg}`);
      if (onSuccess) onSuccess();
      else if (onBack) onBack();
    } else {
      Alert.alert(
        'Inspection Finalized ✓',
        successMsg,
        [
          {
            text: 'OK',
            onPress: () => {
              if (onSuccess) onSuccess();
              else if (onBack) onBack();
            },
          },
        ]
      );
    }
  };

  const handleEscalateDispute = () => {
    const newDispute: MobileDispute = {
      id: `DSP-${Date.now().toString().slice(-4)}`,
      raisedById: activeMoveOut.tenantId || user.id,
      raisedByName: activeMoveOut.tenantName || user.displayName || 'Resident',
      raisedByRole: 'tenant',
      againstName: 'Property Owner',
      propertyId: activeMoveOut?.propertyId || '',
      propertyName: activeMoveOut?.propertyName || 'Property',
      unit: activeMoveOut?.unit || '',
      category: 'Security Deposit Deduction',
      amountDisputed: totalDeductions,
      currency,
      statement: `Tenant contested ${format(totalDeductions, currency)} deductions for move-out damages. Claims normal wear and tear.`,
      evidenceNotes: 'Move-in inspection checklist comparison submitted.',

      status: 'filed',
      createdAt: new Date().toISOString(),
    };

    saveDispute(newDispute);
    updateMoveOut(activeMoveOut.id, {
      status: 'disputed',
      tenantDisputeRaised: true,
    });

    Alert.alert(
      'Dispute Registered',
      `Deductions of ${format(totalDeductions, currency)} have been contested. Dispute ticket ${newDispute.id} is now queued for manager mediation.`,
      [
        {
          text: 'OK',
          onPress: () => {
            if (onSuccess) onSuccess();
            else if (onBack) onBack();
          },
        },
      ]
    );
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


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
            <Feather name="clipboard" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Inspection</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Tenant Move-Out Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroName}>{activeMoveOut.tenantName}</Text>
              <Text style={styles.heroSub}>
                Unit {activeMoveOut.unit} • {activeMoveOut.propertyName}
              </Text>
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeText}>Vacate: {activeMoveOut.moveOutDate}</Text>
            </View>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.statGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Security Deposit</Text>
              <Text style={styles.statVal}>{format(depositHeld, currency)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Deductions</Text>
              <Text style={[styles.statVal, { color: totalDeductions > 0 ? '#DC2626' : '#059669' }]}>
                - {format(totalDeductions, currency)}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Net Refundable</Text>
              <Text style={[styles.statVal, { color: '#059669' }]}>
                {format(netRefund, currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Inspection Checklist</Text>
          <TouchableOpacity
            style={styles.addItemBtn}
            onPress={() => setShowAddItemModal(true)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={14} color="#059669" />
            <Text style={styles.addItemBtnText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        {/* Checklist Cards */}
        {checklist.map((item, idx) => {
          const isDamaged = item.condition === 'damaged';
          const isWear = item.condition === 'minor_wear' || item.condition === 'fair';
          const isGood = item.condition === 'good';

          return (
            <View key={item.id || idx} style={styles.checkCard}>
              <View style={styles.checkHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.roomTag}>{(item.room || 'General').toUpperCase()}</Text>
                  <Text style={styles.itemName}>{item.item || (item as any).amenity || 'Inspection Item'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {isDamaged && (
                    <View style={styles.deductBadge}>
                      <Text style={styles.deductBadgeText}>
                        - {format(item.deduction || 0, currency)}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.deleteItemBtn}
                    onPress={() => handleRemoveChecklistItem(idx)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="trash-2" size={14} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Condition Selector Pills */}
              <View style={styles.conditionRow}>
                <TouchableOpacity
                  style={[styles.condPill, isGood && styles.condPillGood]}
                  onPress={() => toggleCondition(idx, 'good', 0)}
                  activeOpacity={0.8}
                >
                  <Feather
                    name="check"
                    size={12}
                    color={isGood ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.condText, isGood && styles.condTextActive]} numberOfLines={1}>
                    Good
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.condPill, isWear && styles.condPillWear]}
                  onPress={() => toggleCondition(idx, 'minor_wear', 0)}
                  activeOpacity={0.8}
                >
                  <Feather
                    name="minus"
                    size={12}
                    color={isWear ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.condText, isWear && styles.condTextActive]} numberOfLines={1}>
                    Wear
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.condPill, isDamaged && styles.condPillDamaged]}
                  onPress={() => toggleCondition(idx, 'damaged', 1500)}
                  activeOpacity={0.8}
                >
                  <Feather
                    name="alert-circle"
                    size={12}
                    color={isDamaged ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.condText, isDamaged && styles.condTextActive]} numberOfLines={1}>
                    Damaged
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Deduction Input if Damaged */}
              {isDamaged && (
                <View style={styles.damageBox}>
                  <Text style={styles.damageLabel}>Repair Cost Deduction ({currencySymbol}):</Text>
                  <TextInput
                    style={styles.damageInput}
                    value={String(item.deduction || 0)}
                    onChangeText={(t) => handleUpdateDeductionAmount(idx, t)}
                    keyboardType="numeric"
                  />
                </View>
              )}

              {item.notes && <Text style={styles.notesText}>Note: {item.notes}</Text>}
            </View>
          );
        })}

        {/* Action Buttons */}
        <View style={styles.bottomActionsRow}>
          <TouchableOpacity
            style={styles.cancelActionBtn}
            onPress={onBack}
            activeOpacity={0.85}
          >
            <Feather name="arrow-left" size={14} color="#475569" />
            <Text style={styles.cancelActionBtnText} numberOfLines={1}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.approveBtn}
            onPress={handleSaveAndApproveSettlement}
            activeOpacity={0.85}
          >
            <Feather name="send" size={14} color="#FFFFFF" />
            <Text style={styles.approveBtnText} numberOfLines={1}>Submit Inspection</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ADD ITEM MODAL */}
      <Modal visible={showAddItemModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Inspection Item</Text>
              <TouchableOpacity onPress={() => setShowAddItemModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.fieldLabel}>Room / Area</Text>
              <View style={styles.roomPillRow}>
                {['Living Room', 'Kitchen', 'Master Bedroom', 'Bathroom', 'Balcony'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roomPill, newRoom === r && styles.roomPillActive]}
                    onPress={() => setNewRoom(r)}
                  >
                    <Text style={[styles.roomPillText, newRoom === r && styles.roomPillTextActive]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Amenity / Item Name *</Text>
              <TextInput
                style={styles.input}
                value={newItem}
                onChangeText={setNewItem}
                placeholder="e.g. Broken tile, Window curtain rod"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>Estimated Deduction Amount ({currencySymbol})</Text>
              <TextInput
                style={styles.input}
                value={newDeduction}
                onChangeText={setNewDeduction}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Inspection Notes</Text>
              <TextInput
                style={styles.input}
                value={newNotes}
                onChangeText={setNewNotes}
                placeholder="Description of wear or fault..."
                placeholderTextColor="#94A3B8"
              />

              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleAddNewItem}
                activeOpacity={0.85}
              >
                <Text style={styles.submitModalBtnText}>Add Item to Inspection</Text>
              </TouchableOpacity>
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
    marginRight: 10,
    padding: 4,
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  headerSub: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  scroll: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 16,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  heroSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  dateBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  heroDivider: {
    height: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    marginVertical: 12,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: colors.inkSoft,
    marginBottom: 2,
  },
  statVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  addItemBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  checkCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
  },
  checkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  roomTag: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.inkSoft,
    marginBottom: 2,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.navy,
  },
  deductBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  deductBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  deleteItemBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  condPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  condPillGood: {
    backgroundColor: '#10B981',
  },
  condPillWear: {
    backgroundColor: '#F59E0B',
  },
  condPillDamaged: {
    backgroundColor: '#EF4444',
  },
  condText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  condTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  damageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  damageLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#991B1B',
  },
  damageInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    width: 80,
    textAlign: 'right',
  },
  notesText: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 6,
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.line,
  },
  cancelActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  escalateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  escalateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  approveBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#10B981',
  },
  approveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
    marginTop: 10,
  },
  roomPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roomPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  roomPillActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#059669',
  },
  roomPillText: {
    fontSize: 11,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  roomPillTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  input: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.navy,
  },
  submitModalBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  submitModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  });
