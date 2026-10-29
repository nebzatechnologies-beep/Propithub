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
  Switch,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { MobileUnit } from '../types';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface ManagerPropertiesScreenProps {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const ManagerPropertiesScreen: React.FC<ManagerPropertiesScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, saveUnit } = useMobileAppData();
  const { user } = useMobileAuth();

  const ownerId = user?.ownerId || '';

  // Unit Inspection State
  const [inspectingUnit, setInspectingUnit] = useState<MobileUnit | null>(null);
  const [inspCondition, setInspCondition] = useState<'excellent' | 'good' | 'fair' | 'needs_repair'>('good');
  const [inspNotes, setInspNotes] = useState('');
  const [inspDate, setInspDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingInspection, setIsSavingInspection] = useState(false);

  // Scoped properties
  const myProperties = useMemo(() => {
    if (!ownerId && !user?.assignedProperties?.length) return [];
    const props = state.properties.filter((p) => {
      if (ownerId && p.ownerId === ownerId) return true;
      if (user?.assignedProperties?.includes(p.id)) return true;
      return false;
    });
    const explicitlyAssigned = props.filter(
      (p) => p.assignedManagerId === user?.id || user?.assignedProperties?.includes(p.id)
    );
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : props;
  }, [state.properties, ownerId, user?.id, user?.assignedProperties]);

  const handleToggleListing = (unit: MobileUnit) => {
    const updated: MobileUnit = {
      ...unit,
      isListedPublicly: !unit.isListedPublicly,
    };
    saveUnit(updated);
    Alert.alert(
      'Public Directory',
      `Unit ${unit.unitNumber} is now ${updated.isListedPublicly ? 'listed publicly' : 'hidden from public listings'}.`
    );
  };

  const handleSaveInspection = async () => {
    if (!inspectingUnit) return;
    setIsSavingInspection(true);

    try {
      const newLog = {
        id: `INSP-${Date.now()}`,
        unitId: inspectingUnit.id,
        unitNumber: inspectingUnit.unitNumber,
        propertyId: inspectingUnit.propertyId || '',
        date: inspDate,
        inspector: user?.displayName || 'Property Manager',
        condition: inspCondition,
        notes: inspNotes.trim() || `Routine inspection — condition: ${inspCondition}.`,
        loggedAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured) {
        await setDoc(doc(db, 'propertyInspections', newLog.id), newLog, { merge: true }).catch(console.warn);
      }

      Alert.alert(
        'Inspection Recorded ✓',
        `Inspection logged for Unit ${inspectingUnit.unitNumber} — ${inspCondition.toUpperCase()}. Notes saved.`
      );
      setInspectingUnit(null);
      setInspNotes('');
      setInspCondition('good');
    } finally {
      setIsSavingInspection(false);
    }
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Properties"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TourTarget id="manager-properties-list" style={styles.subHeader}>
          <Text style={[styles.subHeaderText, { color: colors.inkSoft }]}>
            {myProperties.length} Properties in Portfolio
          </Text>
        </TourTarget>

        {myProperties.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="home" size={48} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Properties Assigned</Text>
            <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
              Buildings delegated to your management portfolio will appear here.
            </Text>
          </View>
        ) : (
          myProperties.map((p) => {
            const propUnits = state.units.filter((u) => u.propertyId === p.id);
            const occupiedCount = propUnits.filter((u) => u.status === 'occupied').length;

            return (
              <View key={p.id} style={[styles.propertyPanel, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                {/* Property Card Header */}
                <View style={[styles.panelHead, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.propertyName, { color: colors.navy }]}>{p.name}</Text>
                    <View style={styles.addressRow}>
                      <Ionicons name="location-outline" size={13} color={colors.inkSoft} style={{ marginRight: 4 }} />
                      <Text style={[styles.addressText, { color: colors.inkSoft }]} numberOfLines={1}>
                        {typeof p.address === 'string'
                          ? p.address
                          : p.address?.formattedAddress || p.address?.city || 'Local Region'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.countBadge, isDark && { backgroundColor: '#1E293B' }]}>
                    <Text style={[styles.countBadgeText, { color: colors.inkSoft }]}>{propUnits.length} Units</Text>
                  </View>
                </View>

                {/* Units List */}
                <View style={styles.unitsListContainer}>
                  {propUnits.length === 0 ? (
                    <Text style={[styles.noUnitsText, { color: colors.inkSoft }]}>No units recorded for this property.</Text>
                  ) : (
                    propUnits.map((u) => {
                      const isOccupied = u.status === 'occupied';
                      const unitImg = (u.images && u.images[0]) || u.image;

                      return (
                        <View key={u.id} style={[styles.unitCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                          <View style={styles.unitCardHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              {unitImg ? (
                                <Image source={{ uri: unitImg }} style={styles.unitThumbnail} />
                              ) : (
                                <View style={[styles.unitPlaceholderThumb, isDark && { backgroundColor: '#1E293B' }]}>
                                  <Feather name="home" size={16} color={colors.inkSoft} />
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.unitNumberText, { color: colors.navy }]}>Unit {u.unitNumber}</Text>
                                <Text style={[styles.tenantText, { color: colors.inkSoft }]}>
                                  {isOccupied ? `Tenant: ${u.tenant || 'Resident'}` : 'Vacant Unit'}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={[
                                styles.statusBadge,
                                isOccupied ? styles.statusBadgeGreen : styles.statusBadgeAmber,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusBadgeText,
                                  isOccupied ? { color: '#059669' } : { color: '#B45309' },
                                ]}
                              >
                                {u.status ? u.status.toUpperCase() : 'VACANT'}
                              </Text>
                            </View>
                          </View>

                          {/* Public Listing Toggle for Vacant Units (Exact Web Functionality) */}
                          {!isOccupied && (
                            <View style={styles.publicListingRow}>
                              <Text style={[styles.publicListingLabel, { color: colors.inkSoft }]}>Public Directory Listing</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text
                                  style={[
                                    styles.publicListingStatusText,
                                    u.isListedPublicly ? { color: '#059669' } : { color: colors.inkSoft },
                                  ]}
                                >
                                  {u.isListedPublicly ? 'Listed' : 'Unlisted'}
                                </Text>
                                <Switch
                                  value={Boolean(u.isListedPublicly)}
                                  onValueChange={() => handleToggleListing(u)}
                                  trackColor={{ false: colors.line, true: '#10B981' }}
                                  thumbColor="#FFFFFF"
                                />
                              </View>
                            </View>
                          )}

                          {/* Action Button: Inspection Log */}
                          <TouchableOpacity
                            style={[styles.inspectionBtn, isDark && { backgroundColor: '#1E293B', borderColor: colors.line }]}
                            onPress={() => {
                              setInspectingUnit(u);
                              setInspCondition('good');
                              setInspNotes('');
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather name="clipboard" size={13} color={colors.navy} style={{ marginRight: 6 }} />
                            <Text style={[styles.inspectionBtnText, { color: colors.navy }]}>Inspection Log</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Unit Inspection Log Modal (Matching Web Functionality) */}
      <Modal visible={Boolean(inspectingUnit)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>
                  Log Unit Inspection: Unit {inspectingUnit?.unitNumber}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setInspectingUnit(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Inspection Date */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Inspection Date</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={inspDate}
                  onChangeText={setInspDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              {/* Condition Selector */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Unit Condition</Text>
                <View style={styles.conditionPillsRow}>
                  {(
                    [
                      { key: 'excellent', label: 'Excellent' },
                      { key: 'good', label: 'Good' },
                      { key: 'fair', label: 'Fair' },
                      { key: 'needs_repair', label: 'Needs Repair' },
                    ] as const
                  ).map((item) => (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.conditionPill,
                        { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line },
                        inspCondition === item.key && styles.conditionPillSelected,
                      ]}
                      onPress={() => setInspCondition(item.key)}
                    >
                      <Text
                        style={[
                          styles.conditionPillText,
                          { color: colors.inkSoft },
                          inspCondition === item.key && styles.conditionPillTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Inspector */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Inspector</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line, color: colors.navy }]}
                  value={user?.displayName || 'Property Manager'}
                  editable={false}
                />
              </View>

              {/* Notes */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Inspection Notes & Observations</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={inspNotes}
                  onChangeText={setInspNotes}
                  placeholder="Enter details on fixtures, plumbing, paint condition, or required repairs..."
                  placeholderTextColor={colors.inkSoft}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={styles.saveInspectionBtn}
                onPress={handleSaveInspection}
                activeOpacity={0.85}
                disabled={isSavingInspection}
              >
                <Text style={styles.saveInspectionBtnText} numberOfLines={1}>
                  {isSavingInspection ? 'Saving...' : 'Save Inspection'}
                </Text>
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
    scroll: {
      flex: 1,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
    },
    subHeader: {
      marginBottom: 12,
    },
    subHeaderText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 10,
      marginBottom: 4,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    propertyPanel: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      marginBottom: 16,
      overflow: 'hidden',
    },
    panelHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    propertyName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 2,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    addressText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    countBadge: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    countBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    unitsListContainer: {
      padding: 12,
      gap: 10,
    },
    noUnitsText: {
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: 'center',
      paddingVertical: 12,
    },
    unitCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      padding: 12,
    },
    unitCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    unitThumbnail: {
      width: 38,
      height: 38,
      borderRadius: 6,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    },
    unitPlaceholderThumb: {
      width: 38,
      height: 38,
      borderRadius: 6,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitNumberText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    tenantText: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 1,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusBadgeGreen: {
      backgroundColor: '#DCFCE7',
    },
    statusBadgeAmber: {
      backgroundColor: '#FEF3C7',
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
    },
    publicListingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginVertical: 6,
      borderWidth: 1,
      borderColor: colors.line,
    },
    publicListingLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink,
    },
    publicListingStatusText: {
      fontSize: 11,
      fontWeight: '700',
    },
    inspectionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 6,
      paddingVertical: 7,
      marginTop: 4,
    },
    inspectionBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSubTitle: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    inputGroup: {
      marginBottom: 14,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink,
      marginBottom: 6,
    },
    textInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: colors.navy,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    conditionPillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    conditionPill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    conditionPillSelected: {
      borderColor: '#059669',
      backgroundColor: '#ECFDF5',
    },
    conditionPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    conditionPillTextSelected: {
      color: '#059669',
    },
    saveInspectionBtn: {
      backgroundColor: '#059669',
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 20,
    },
    saveInspectionBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
