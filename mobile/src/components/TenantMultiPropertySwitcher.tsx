import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { MobileUnit } from '../types';
import { getCurrencySymbol } from '../lib/currencyService';
import { useMobileTheme } from '../context/MobileThemeContext';

interface TenantMultiPropertySwitcherProps {
  myUnits: MobileUnit[];
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string) => void;
  showAllOption?: boolean;
  onSelectAll?: () => void;
  isAllSelected?: boolean;
}

export const TenantMultiPropertySwitcher: React.FC<TenantMultiPropertySwitcherProps> = ({
  myUnits,
  selectedUnitId,
  onSelectUnit,
  showAllOption = false,
  onSelectAll,
  isAllSelected = false,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!myUnits || myUnits.length <= 1) return null;

  const currentUnit = myUnits.find(
    (u) =>
      u.id === selectedUnitId ||
      u.unitNumber.toLowerCase() === (selectedUnitId || '').toLowerCase()
  ) || myUnits[0];

  const currentLabel = isAllSelected
    ? `All Units (${myUnits.length} Properties)`
    : `${currentUnit?.propertyName || 'Residence'} • Unit ${currentUnit?.unitNumber}`;

  return (
    <>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <View style={styles.iconCircle}>
              <Feather name="layers" size={13} color={isDark ? '#34D399' : '#047857'} />
            </View>
            <View style={styles.titleTextCol}>
              <Text style={styles.title} numberOfLines={1}>Multi-Property Resident</Text>
              <Text style={styles.sub}>
                You rent {myUnits.length} units. Tap to switch:
              </Text>
            </View>
          </View>
        </View>

        {/* Dropdown Trigger Box */}
        <TouchableOpacity
          style={styles.dropdownTrigger}
          onPress={() => setDropdownOpen(true)}
          activeOpacity={0.85}
        >
          <View style={styles.triggerLeft}>
            <Feather name="home" size={15} color="#0D9488" style={{ marginRight: 8 }} />
            <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
              <Text style={styles.triggerValue} numberOfLines={1} ellipsizeMode="tail">
                {currentLabel}
              </Text>
            </View>
          </View>
          <View style={styles.chevronBox}>
            <Text style={styles.changeText}>Change</Text>
            <Feather name="chevron-down" size={16} color="#0D9488" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Dropdown Modal Sheet */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHead}>
              <View>
                <Text style={styles.modalTitle}>Select Residence</Text>
                <Text style={styles.modalSub}>
                  Switch between your {myUnits.length} active rental units
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDropdownOpen(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {showAllOption && onSelectAll && (
                <TouchableOpacity
                  style={[styles.unitOption, isAllSelected && styles.unitOptionActive]}
                  onPress={() => {
                    onSelectAll();
                    setDropdownOpen(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.unitOptionLeft}>
                    <View style={[styles.unitIconBox, isAllSelected && styles.unitIconBoxActive]}>
                      <Feather name="grid" size={16} color={isAllSelected ? '#0D9488' : '#64748B'} />
                    </View>
                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={[styles.unitOptionTitle, isAllSelected && styles.unitOptionTitleActive]}>
                        All Units & Properties
                      </Text>
                      <Text style={styles.unitOptionSub}>
                        View unified ledger across all {myUnits.length} units
                      </Text>
                    </View>
                  </View>
                  {isAllSelected && (
                    <Ionicons name="checkmark-circle" size={22} color="#0D9488" />
                  )}
                </TouchableOpacity>
              )}

              {myUnits.map((u, idx) => {
                const activeId = selectedUnitId || currentUnit?.id;
                const isSelected =
                  !isAllSelected &&
                  (u.id === activeId ||
                    `${u.propertyId || ''}_${u.unitNumber}`.toLowerCase() === (selectedUnitId || '').toLowerCase() ||
                    (Boolean(selectedUnitId) &&
                      u.unitNumber.toLowerCase() === selectedUnitId?.toLowerCase() &&
                      (!currentUnit?.propertyId || u.propertyId === currentUnit?.propertyId)));

                return (
                  <TouchableOpacity
                    key={`${u.propertyId || 'prop'}_${u.id || u.unitNumber}_${idx}`}
                    style={[styles.unitOption, isSelected && styles.unitOptionActive]}
                    onPress={() => {
                      onSelectUnit(u.id);
                      setDropdownOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.unitOptionLeft}>
                      <View style={[styles.unitIconBox, isSelected && styles.unitIconBoxActive]}>
                        <Feather name="home" size={16} color={isSelected ? '#0D9488' : '#64748B'} />
                      </View>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={[styles.unitOptionTitle, isSelected && styles.unitOptionTitleActive]}>
                          Unit {u.unitNumber} • {u.propertyName || 'Property'}
                        </Text>
                        <Text style={styles.unitOptionSub}>
                          {u.rent ? `Monthly Rent: ${getCurrencySymbol(u.currency)}${u.rent.toLocaleString()}` : 'Active Tenancy'}
                          {u.furnishing ? ` • ${u.furnishing}` : ''}
                        </Text>
                      </View>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color="#0D9488" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      backgroundColor: isDark ? '#06281E' : '#ECFDF5',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#065F46' : '#A7F3D0',
      padding: 12,
      marginBottom: 16,
      overflow: 'hidden',
    },
    headerRow: {
      marginBottom: 8,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    titleTextCol: {
      flex: 1,
    },
    iconCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: isDark ? '#064E3B' : '#D1FAE5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#065F46',
    },
    sub: {
      fontSize: 11,
      color: isDark ? '#6EE7B7' : '#047857',
      marginTop: 1,
      flexShrink: 1,
    },
    dropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: '#0D9488',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    triggerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    triggerLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#0D9488',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    triggerValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    chevronBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingLeft: 8,
    },
    changeText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: '#0D9488',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalContent: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 18,
    },
    modalHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingBottom: 12,
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    modalCloseBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
    },
    unitOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
      marginBottom: 8,
    },
    unitOptionActive: {
      borderColor: '#0D9488',
      backgroundColor: isDark ? '#134E48' : '#F0FDFA',
    },
    unitOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    unitIconBox: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    unitIconBoxActive: {
      backgroundColor: isDark ? '#042F2E' : '#CCFBF1',
    },
    unitOptionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    unitOptionTitleActive: {
      color: isDark ? '#2DD4BF' : '#0F766E',
    },
    unitOptionSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
  });
