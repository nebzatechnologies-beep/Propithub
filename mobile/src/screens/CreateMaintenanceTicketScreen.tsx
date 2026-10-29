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
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { useTenantActiveUnit } from '../hooks/useTenantActiveUnit';
import { MobileTicket } from '../types';

export const CreateMaintenanceTicketScreen: React.FC<{ onBack?: () => void; onSuccess?: () => void }> = ({
  onBack,
  onSuccess,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, saveTicket } = useMobileAppData();
  const { user } = useMobileAuth();
  const { myUnits, activeUnit } = useTenantActiveUnit();

  const availableUnits = useMemo(() => {
    if (user.role === 'tenant') {
      return myUnits;
    }
    return state.units.filter((u) => !u.ownerId || u.ownerId === user.id);
  }, [user.role, user.id, myUnits, state.units]);

  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const activeSelectedUnitId = selectedUnitId || (user.role === 'tenant' ? (activeUnit?.id || availableUnits[0]?.id || '') : (availableUnits[0]?.id || ''));
  const selectedUnit = availableUnits.find((u) => u.id === activeSelectedUnitId) || availableUnits[0] || null;

  const [category, setCategory] = useState<'Plumbing' | 'Electrical' | 'HVAC' | 'Carpentry' | 'Appliance' | 'Other'>('Plumbing');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Emergency'>('High');
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);
  const [issueDescription, setIssueDescription] = useState('Kitchen sink pipe leaking into lower cabinetry.');
  const [preferredSlot, setPreferredSlot] = useState('Weekday Morning (9 AM - 12 PM)');
  const [photoCount, setPhotoCount] = useState(1);

  const CATEGORIES = ['Plumbing', 'Electrical', 'HVAC', 'Carpentry', 'Appliance', 'Other'] as const;
  const PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'] as const;

  const PRIORITY_CONFIG: Record<
    'Low' | 'Medium' | 'High' | 'Emergency',
    { label: string; sub: string; color: string; bg: string; icon: 'check-circle' | 'clock' | 'alert-circle' | 'alert-triangle' }
  > = {
    Low: {
      label: 'Low',
      sub: 'Routine issue • Normal queue',
      color: '#3B82F6',
      bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
      icon: 'check-circle',
    },
    Medium: {
      label: 'Medium',
      sub: 'Standard attention • Within 48 hours',
      color: '#D97706',
      bg: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7',
      icon: 'clock',
    },
    High: {
      label: 'High',
      sub: 'Urgent priority • Within 24 hours',
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
      icon: 'alert-circle',
    },
    Emergency: {
      label: 'Emergency',
      sub: 'Critical hazard • Immediate dispatch',
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
      icon: 'alert-triangle',
    },
  };

  const handleDispatchTicket = () => {
    if (!issueDescription.trim()) {
      Alert.alert('Required', 'Please describe the maintenance issue.');
      return;
    }

    const tckId = `TCK-${Date.now().toString().slice(-4)}`;
    const newTicket: MobileTicket = {
      id: tckId,
      ownerId: selectedUnit?.ownerId || user.ownerId || (user.role === 'owner' ? user.id : ''),
      propertyId: selectedUnit?.propertyId || '',
      propertyName: selectedUnit?.propertyName || 'Residence',
      unit: selectedUnit?.unitNumber || (user.role === 'tenant' ? 'General' : 'Common Area'),
      tenant: selectedUnit?.tenant || user.displayName || 'Resident',
      tenantId: selectedUnit?.currentTenantId || (user.role === 'tenant' ? user.id : ''),
      tenantPhone: user.phone || '',
      issue: issueDescription.trim(),
      category,
      priority,
      status: 'open',
      preferredTimeSlot: preferredSlot,
      created: new Date().toISOString(),
    };

    saveTicket(newTicket);
    Alert.alert(
      'Ticket Dispatched! 🛠️',
      `Maintenance ticket ${tckId} for Unit ${newTicket.unit} has been assigned to operations queue.`
    );
    if (onSuccess) onSuccess();
    else if (onBack) onBack();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Standard Dynamic Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="tool" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>New Request</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.navy }]}>1. Target Apartment</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginVertical: 6 }}>
            {availableUnits.map((u) => {
              const isSelected = u.id === selectedUnit?.id;
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.unitChip, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }, isSelected && styles.unitChipActive]}
                  onPress={() => setSelectedUnitId(u.id)}
                >
                  <Text style={[styles.unitChipTitle, { color: colors.navy }, isSelected && styles.unitChipTitleActive]}>
                    Unit {u.unitNumber}
                  </Text>
                  <Text style={[styles.unitChipSub, { color: colors.inkSoft }, isSelected && styles.unitChipSubActive]}>
                    {u.propertyName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          <Text style={[styles.cardTitle, { color: colors.navy }]}>2. Issue Categorization</Text>

          <View style={styles.chipGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }, isSelected && styles.categoryChipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, { color: colors.inkSoft }, isSelected && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Urgency Priority</Text>
          <View style={{ marginBottom: 6 }}>
            <TouchableOpacity
              style={[
                styles.dropdownTrigger,
                { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isPriorityDropdownOpen ? colors.primary : colors.line },
              ]}
              onPress={() => setIsPriorityDropdownOpen((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={[
                    styles.priorityBadgeIcon,
                    { backgroundColor: PRIORITY_CONFIG[priority].bg },
                  ]}
                >
                  <Feather
                    name={PRIORITY_CONFIG[priority].icon}
                    size={15}
                    color={PRIORITY_CONFIG[priority].color}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.priorityTriggerText, { color: colors.navy }]}>
                    {priority} Priority
                  </Text>
                  <Text style={[styles.priorityTriggerSub, { color: colors.inkSoft }]} numberOfLines={1}>
                    {PRIORITY_CONFIG[priority].sub}
                  </Text>
                </View>
              </View>
              <Feather
                name={isPriorityDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={isPriorityDropdownOpen ? colors.primary : colors.inkSoft}
              />
            </TouchableOpacity>

            {isPriorityDropdownOpen && (
              <View
                style={[
                  styles.dropdownMenu,
                  { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line },
                ]}
              >
                {PRIORITIES.map((p) => {
                  const isSelected = priority === p;
                  const cfg = PRIORITY_CONFIG[p];
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.dropdownItem,
                        { borderBottomColor: colors.line },
                        isSelected && {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                        },
                      ]}
                      onPress={() => {
                        setPriority(p);
                        setIsPriorityDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={[styles.priorityBadgeIcon, { backgroundColor: cfg.bg }]}>
                          <Feather name={cfg.icon} size={15} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.dropdownItemTitle,
                              { color: colors.navy },
                              isSelected && { color: isDark ? '#34D399' : '#059669', fontWeight: '700' },
                            ]}
                          >
                            {p} Priority
                          </Text>
                          <Text style={[styles.dropdownItemSub, { color: colors.inkSoft }]} numberOfLines={1}>
                            {cfg.sub}
                          </Text>
                        </View>
                      </View>
                      {isSelected && (
                        <Feather name="check" size={16} color={isDark ? '#34D399' : '#059669'} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          <Text style={[styles.cardTitle, { color: colors.navy }]}>3. Defect Description & Visit Slot</Text>

          <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Detailed Issue Statement *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy, height: 90, textAlignVertical: 'top' }]}
            value={issueDescription}
            onChangeText={setIssueDescription}
            placeholder="Describe what is broken, leaking, or malfunctioning..."
            placeholderTextColor={colors.inkSoft}
            multiline
          />

          <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Preferred Technician Visit Slot</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
            value={preferredSlot}
            onChangeText={setPreferredSlot}
            placeholder="e.g. Tomorrow Afternoon (2 PM - 5 PM)"
            placeholderTextColor={colors.inkSoft}
          />

          {/* Photo Attachment Row */}
          <View style={[styles.photoAttachBox, { backgroundColor: colors.surfaceSunken }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.photoBoxTitle, { color: colors.navy }]}>📸 Evidence Photos Attached ({photoCount})</Text>
              <Text style={[styles.photoBoxSub, { color: colors.inkSoft }]}>Photos help technician bring proper replacement parts</Text>
            </View>
            <TouchableOpacity
              style={[styles.attachBtn, { backgroundColor: colors.surface, borderColor: colors.line }]}
              onPress={() => setPhotoCount((c) => c + 1)}
            >
              <Text style={[styles.attachBtnText, { color: colors.navy }]}>Add Photo</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.dispatchBtn}
            onPress={handleDispatchTicket}
            activeOpacity={0.85}
          >
            <Text style={styles.dispatchBtnText}>✓ Dispatch Ticket</Text>
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
  statusBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  statusTime: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
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
  divider: {
    height: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    marginVertical: 14,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
  },
  categoryChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  categoryChipText: {
    fontSize: 12,
    color: colors.inkSoft,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  priorityBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityTriggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  priorityTriggerSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  dropdownMenu: {
    marginTop: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  dropdownItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  dropdownItemSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  photoAttachBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 8,
    padding: 12,
    marginVertical: 14,
  },
  photoBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  photoBoxSub: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 2,
  },
  attachBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  attachBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.navy,
  },
  dispatchBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  dispatchBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
