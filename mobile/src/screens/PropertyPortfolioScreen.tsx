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
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  LayoutAnimation,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileProperty, MobileUnit } from '../types';
import { uploadOrCompressImage } from '../lib/imageUploader';
import { pickSingleImage, pickMultipleImages } from '../lib/nativePicker';
import { usePlanLimits, ResourceQuotaType } from '../hooks/usePlanLimits';
import { PlanLimitModal } from '../components/PlanLimitModal';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';

interface PropertyPortfolioScreenProps {
  onProfilePress?: () => void;
  onAddPropertyPress?: () => void;
  onUnitPress?: (unit: MobileUnit) => void;
  onNavigate?: (screenKey: string) => void;
}

export const PropertyPortfolioScreen: React.FC<PropertyPortfolioScreenProps> = ({
  onProfilePress,
  onAddPropertyPress,
  onUnitPress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, planUsage, saveUnit, deleteUnit, saveProperty } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, getSymbol, viewCurrency } = useMobileCurrency();
  const { usage, currentPlanName } = usePlanLimits();
  const [limitModalType, setLimitModalType] = useState<ResourceQuotaType | null>(null);

  const [activeTab, setActiveTab] = useState<'properties' | 'directory'>('properties');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Unit Modal State
  const [targetProperty, setTargetProperty] = useState<MobileProperty | null>(null);
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitType, setNewUnitType] = useState('2 BHK');
  const [newUnitFloor, setNewUnitFloor] = useState('1st Floor');
  const [newUnitRent, setNewUnitRent] = useState(viewCurrency === 'INR' ? '26000' : '2200');
  const [newUnitDeposit, setNewUnitDeposit] = useState(viewCurrency === 'INR' ? '52000' : '4400');
  const [newUnitMeter, setNewUnitMeter] = useState('');

  // Edit Unit Modal State (Matches Web specifications)
  const [editingUnit, setEditingUnit] = useState<MobileUnit | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [editUnitType, setEditUnitType] = useState('2 BHK');
  const [editFloor, setEditFloor] = useState('1st Floor');
  const [editAreaSqFt, setEditAreaSqFt] = useState('1000');
  const [editFurnishing, setEditFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [editRent, setEditRent] = useState('');
  const [editDeposit, setEditDeposit] = useState('');
  const [editStatus, setEditStatus] = useState<'occupied' | 'vacant' | 'reserved' | 'maintenance'>('vacant');
  const [editElectricityMeter, setEditElectricityMeter] = useState('');
  const [editWaterMeter, setEditWaterMeter] = useState('');
  const [editUnitImages, setEditUnitImages] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [openEditDropdown, setOpenEditDropdown] = useState<'type' | 'furnishing' | 'status' | null>(null);

  // Dynamically scope to authenticated owner
  const myProperties = useMemo(() => {
    if (!user?.id) return [];
    return state.properties.filter((p) => p.ownerId === user.id);
  }, [state.properties, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    if (!user?.id) return [];
    return state.units.filter(
      (u) => (u.propertyId && myPropertyIds.has(u.propertyId)) || u.ownerId === user.id
    );
  }, [state.units, myPropertyIds, user?.id]);

  const filteredProperties = myProperties.filter((p) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = p.name.toLowerCase().includes(q);
    const addr = typeof p.address === 'string' ? p.address : p.address.formattedAddress;
    const addrMatch = addr.toLowerCase().includes(q);
    return nameMatch || addrMatch;
  });

  const filteredUnits = myUnits.filter((u) => {
    const q = searchQuery.toLowerCase();
    const numMatch = u.unitNumber.toLowerCase().includes(q);
    const propMatch = u.propertyName.toLowerCase().includes(q);
    const tenantMatch = (u.tenant || '').toLowerCase().includes(q);
    return numMatch || propMatch || tenantMatch;
  });

  const handleOpenAddUnit = (prop: MobileProperty) => {
    if (usage.units.isFull) {
      setLimitModalType('units');
      return;
    }
    setTargetProperty(prop);
    const nextNum = `${(prop.unitCount || 0) + 101}`;
    setNewUnitNumber(nextNum);
    const isINR = prop.currency === '₹' || prop.currency === 'INR';
    const defRent = isINR ? '26000' : '2200';
    const defDeposit = isINR ? '52000' : '4400';
    setNewUnitRent(defRent);
    setNewUnitDeposit(defDeposit);
    setNewUnitMeter(`MTR-${nextNum}`);
  };

  const handleSaveNewUnit = () => {
    if (!targetProperty || !newUnitNumber.trim()) return;

    const isINR = targetProperty.currency === '₹' || targetProperty.currency === 'INR';
    const fallbackRent = isINR ? 26000 : 2200;
    const fallbackDeposit = fallbackRent * 2;

    const newUnit: MobileUnit = {
      id: `unit-${targetProperty.id}-${newUnitNumber.trim()}`,
      propertyId: targetProperty.id,
      propertyName: targetProperty.name,
      ownerId: targetProperty.ownerId,
      unitNumber: newUnitNumber.trim(),
      unitType: newUnitType,
      floor: newUnitFloor,
      areaSqFt: 1100,
      furnishing: 'Semi-Furnished',
      rent: parseInt(newUnitRent, 10) || fallbackRent,
      deposit: parseInt(newUnitDeposit, 10) || fallbackDeposit,
      currency: targetProperty.currency,
      status: 'vacant',
      isListedPublicly: true,
      tenant: null,
      currentTenantId: null,
      electricityMeter: newUnitMeter.trim() || undefined,
      images: targetProperty.images,
      image: targetProperty.images[0] || '',
    };

    saveUnit(newUnit);
    setTargetProperty(null);
    Alert.alert('Unit Added', `Unit ${newUnit.unitNumber} added to ${targetProperty.name}`);
  };

  const handleOpenEditUnit = (unit: MobileUnit) => {
    setEditingUnit(unit);
    setOpenEditDropdown(null);
    setEditUnitNumber(unit.unitNumber || '');
    setEditUnitType(unit.unitType || '2 BHK');
    setEditFloor(unit.floor || '1st Floor');
    setEditAreaSqFt((unit.areaSqFt || 1000).toString());
    setEditFurnishing(unit.furnishing || 'Semi-Furnished');
    setEditRent(unit.rent != null ? unit.rent.toString() : '');
    setEditDeposit(unit.deposit != null ? unit.deposit.toString() : '');
    setEditStatus(unit.status || 'vacant');
    setEditElectricityMeter(unit.electricityMeter || '');
    setEditWaterMeter(unit.waterMeter || '');
    setEditUnitImages(
      unit.images && unit.images.length > 0
        ? [...unit.images]
        : unit.image
        ? [unit.image]
        : []
    );
  };

  const handleSaveUnitEdit = () => {
    if (!editingUnit) return;
    const cleanNum = editUnitNumber.trim() || editingUnit.unitNumber || editingUnit.id;
    const updated: MobileUnit = {
      ...editingUnit,
      unitNumber: cleanNum,
      unitType: editUnitType,
      floor: editFloor.trim() || '1st Floor',
      areaSqFt: parseInt(editAreaSqFt, 10) || 0,
      furnishing: editFurnishing,
      rent: parseInt(editRent, 10) || 0,
      deposit: parseInt(editDeposit, 10) || 0,
      status: editStatus,
      electricityMeter: editElectricityMeter.trim() || undefined,
      waterMeter: editWaterMeter.trim() || undefined,
      tenant: editStatus === 'vacant' ? null : editingUnit.tenant,
      currentTenantId: editStatus === 'vacant' ? null : editingUnit.currentTenantId,
      images: editUnitImages,
      image: editUnitImages[0] || undefined,
    };
    saveUnit(updated);
    setEditingUnit(null);
    setOpenEditDropdown(null);
    Alert.alert('Unit Updated', `Unit ${cleanNum} updated successfully.`);
  };

  const handleDeleteUnit = () => {
    if (!editingUnit) return;
    if (editingUnit.status === 'occupied' || editingUnit.tenant) {
      Alert.alert(
        'Cannot Delete Unit',
        '⚠️ Cannot delete an occupied unit. Please vacate the tenant first.'
      );
      return;
    }
    Alert.alert(
      'Delete Unit',
      `Are you sure you want to delete Unit ${editingUnit.unitNumber || editingUnit.id}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Unit',
          style: 'destructive',
          onPress: () => {
            const num = editingUnit.unitNumber || editingUnit.id;
            deleteUnit(editingUnit.id);
            setEditingUnit(null);
            setOpenEditDropdown(null);
            Alert.alert('Unit Deleted', `Unit ${num} has been deleted.`);
          },
        },
      ]
    );
  };

  const handleAddUnitPhoto = async () => {
    try {
      const picked = await pickMultipleImages({ quality: 0.8 });
      if (picked.length === 0) return;
      setIsUploadingPhoto(true);
      const newUrls: string[] = [];
      for (const item of picked) {
        const payload = item.file || item.base64 || item.uri;
        const url = await uploadOrCompressImage(
          payload,
          `units/edit/${Date.now()}_${item.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
        );
        if (url) newUrls.push(url);
      }
      if (newUrls.length > 0) {
        setEditUnitImages((prev) => [...prev, ...newUrls]);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Could not upload unit photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.navy }]}>Properties</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={onProfilePress}
            activeOpacity={0.8}
          >
            <Text style={styles.avatarText}>
              {user?.displayName
                ? user.displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
                : 'OW'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan Limits Indicator Strip */}
        <View style={[styles.planUsageStrip, isDark && { backgroundColor: 'rgba(37, 99, 235, 0.15)', borderColor: 'rgba(37, 99, 235, 0.3)' }]}>
          <Text style={[styles.planUsageText, isDark && { color: '#60A5FA' }]}>
            PRO TIER • {planUsage.propertiesUsed}/{planUsage.propertiesMax} Properties • {planUsage.unitsUsed}/{planUsage.unitsMax} Units
          </Text>
        </View>

        {/* Segmented Control Capsule */}
        <TourTarget id="properties-subtabs">
          <View style={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'properties' && styles.tabButtonActive, isDark && activeTab === 'properties' && { backgroundColor: '#0F172A' }]}
              onPress={() => setActiveTab('properties')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'properties' && styles.tabTextActive, isDark && { color: activeTab === 'properties' ? '#FFFFFF' : '#94A3B8' }]}>
                Properties ({myProperties.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'directory' && styles.tabButtonActive, isDark && activeTab === 'directory' && { backgroundColor: '#0F172A' }]}
              onPress={() => setActiveTab('directory')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'directory' && styles.tabTextActive, isDark && { color: activeTab === 'directory' ? '#FFFFFF' : '#94A3B8' }]}>
                Units ({myUnits.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar Input */}
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="search" size={16} color={colors.inkSoft} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.navy }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={activeTab === 'properties' ? 'Search by name or address...' : 'Search by unit or tenant...'}
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
              </TouchableOpacity>
            )}
          </View>
        </TourTarget>

        {/* TAB 1: PROPERTIES VIEW */}
        {activeTab === 'properties' && (
          <View>
            {filteredProperties.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Ionicons name="business-outline" size={40} color={colors.inkSoft} />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>No properties found</Text>
                <Text style={[styles.emptySub, { color: colors.inkSoft }]}>Add a new building using the studio wizard above.</Text>
              </View>
            ) : (
              filteredProperties.map((prop) => {
                const propUnits = myUnits.filter((u) => u.propertyId === prop.id);
                const occupiedCount = propUnits.filter((u) => u.status === 'occupied').length;
                const totalUnits = propUnits.length > 0 ? propUnits.length : prop.unitCount;
                const occupancyRate = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;
                
                // Real photos only: do not fall back to random stock/unsplash images
                const realImages = (prop.images || []).filter((img) => img && !img.includes('unsplash.com'));
                const coverImg = realImages.length > 0
                  ? (typeof prop.coverPhotoIndex === 'number' && realImages[prop.coverPhotoIndex] ? realImages[prop.coverPhotoIndex] : realImages[0])
                  : null;

                const handlePropertyPhotoUpload = async () => {
                  try {
                    const picked = await pickSingleImage({ quality: 0.8 });
                    if (!picked) return;
                    const payload = picked.file || picked.base64 || picked.uri;
                    const optimized = await uploadOrCompressImage(payload, `properties/${prop.id}_${Date.now()}_photo.jpg`);
                    const cleanExisting = (prop.images || []).filter((img) => img && !img.includes('unsplash.com'));
                    const updatedProp: MobileProperty = {
                      ...prop,
                      images: [optimized, ...cleanExisting],
                      coverPhotoIndex: 0,
                    };
                    saveProperty(updatedProp);
                    Alert.alert('Photo Updated ✓', `Real photo saved for ${prop.name}!`);
                  } catch (err: any) {
                    Alert.alert('Upload Failed', err?.message || 'Could not update property photo.');
                  }
                };

                return (
                  <View key={prop.id} style={[styles.propertyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    {coverImg ? (
                      <TouchableOpacity onPress={handlePropertyPhotoUpload} activeOpacity={0.9} style={{ position: 'relative' }}>
                        <Image source={{ uri: coverImg }} style={styles.propertyImage} resizeMode="cover" />
                        <View style={styles.photoChangeBadge}>
                          <Feather name="camera" size={12} color="#FFFFFF" />
                          <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '700' }}>Change</Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={handlePropertyPhotoUpload} activeOpacity={0.8} style={[styles.propertyImageBlank, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                        <View style={styles.propertyImageBlankIcon}>
                          <Feather name="camera" size={22} color={colors.inkSoft} />
                        </View>
                        <Text style={[styles.propertyImageBlankText, { color: colors.inkSoft }]}>No photo uploaded</Text>
                        <View style={styles.addPhotoChip}>
                          <Feather name="plus" size={11} color="#059669" />
                          <Text style={styles.addPhotoChipText}>Add Photo</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    <View style={styles.propertyDetails}>
                      <View style={styles.propertyTitleRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.propertyTitle, { color: colors.navy }]}>{prop.name}</Text>
                          <Text style={[styles.propertySub, { color: colors.inkSoft }]}>
                            {typeof prop.address === 'string' ? prop.address : prop.address.formattedAddress}
                          </Text>
                        </View>
                        <View style={[styles.occupiedBadge, occupancyRate === 100 && styles.occupiedBadgeFull]}>
                          <Text style={styles.occupiedBadgeText}>
                            {occupancyRate}% OCCUPIED ({occupiedCount}/{totalUnits})
                          </Text>
                        </View>
                      </View>

                      {/* Amenities Pills */}
                      <View style={styles.amenitiesPreviewRow}>
                        {prop.amenities.slice(0, 3).map((am) => (
                          <View key={am} style={styles.amenityMiniPill}>
                            <Text style={styles.amenityMiniText}>{am}</Text>
                          </View>
                        ))}
                        {prop.amenities.length > 3 && (
                          <View style={styles.amenityMiniPill}>
                            <Text style={styles.amenityMiniText}>+{prop.amenities.length - 3} more</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.divider} />

                      {/* Action Bar for this property */}
                      <View style={styles.propActionRow}>
                        <Text style={styles.unitDirectoryEyebrow}>
                          INVENTORY: {propUnits.length} UNITS
                        </Text>
                        <TouchableOpacity
                          style={styles.addUnitSmallBtn}
                          onPress={() => handleOpenAddUnit(prop)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={14} color="#059669" />
                          <Text style={styles.addUnitSmallBtnText}>Add Unit</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Units within this property */}
                      {propUnits.map((u) => (
                        <View key={u.id} style={styles.unitItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.unitItemTitle}>
                              Unit {u.unitNumber} ({u.unitType}) • {u.floor}
                            </Text>
                            <Text style={styles.unitItemSub}>
                              Rent: {format(u.rent, u.currency || viewCurrency)} • Dep: {format(u.deposit, u.currency || viewCurrency)}
                              {u.tenant ? ` • ${u.tenant}` : ''}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={u.status === 'occupied' ? styles.unitOccupiedBadge : styles.unitVacantBadge}>
                              <Text style={u.status === 'occupied' ? styles.unitOccupiedBadgeText : styles.unitVacantBadgeText}>
                                {u.status.toUpperCase()}
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={styles.editUnitIconBtn}
                              onPress={() => handleOpenEditUnit(u)}
                            >
                              <Feather name="edit-2" size={14} color="#64748B" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: GLOBAL UNIT DIRECTORY */}
        {activeTab === 'directory' && (
          <View>
            <View style={styles.directoryHeaderBox}>
              <Text style={[styles.directoryHeaderText, { color: colors.navy }]}>
                All Units Across Portfolio ({filteredUnits.length})
              </Text>
            </View>

            {filteredUnits.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Ionicons name="cube-outline" size={40} color={colors.inkSoft} />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>No units found</Text>
                <Text style={[styles.emptySub, { color: colors.inkSoft }]}>No units match your search query.</Text>
              </View>
            ) : (
              filteredUnits.map((u) => (
              <View key={u.id} style={[styles.directoryUnitCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.dirUnitTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dirUnitTitle, { color: colors.navy }]}>
                      Unit {u.unitNumber} • {u.propertyName}
                    </Text>
                    <Text style={[styles.dirUnitSub, { color: colors.inkSoft }]}>
                      {u.unitType} • {u.floor} • {u.areaSqFt ? `${u.areaSqFt} sq.ft` : ''}
                    </Text>
                  </View>
                  <View style={u.status === 'occupied' ? styles.unitOccupiedBadge : styles.unitVacantBadge}>
                    <Text style={u.status === 'occupied' ? styles.unitOccupiedBadgeText : styles.unitVacantBadgeText}>
                      {u.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.dirFinancialRow}>
                  <View>
                    <Text style={[styles.dirFinLabel, { color: colors.inkSoft }]}>Monthly Rent</Text>
                    <Text style={[styles.dirFinVal, { color: colors.navy }]}>{format(u.rent, u.currency || viewCurrency)}</Text>
                  </View>
                  <View>
                    <Text style={[styles.dirFinLabel, { color: colors.inkSoft }]}>Deposit Held</Text>
                    <Text style={[styles.dirFinVal, { color: colors.navy }]}>{format(u.deposit, u.currency || viewCurrency)}</Text>
                  </View>
                  <View>
                    <Text style={[styles.dirFinLabel, { color: colors.inkSoft }]}>Sub-Meter</Text>
                    <Text style={[styles.dirFinVal, { color: colors.navy }]}>{u.electricityMeter || 'None'}</Text>
                  </View>
                </View>

                <View style={[styles.dirTenantRow, isDark && { borderTopColor: colors.line }]}>
                  <Text style={[styles.dirTenantText, { color: colors.inkSoft }]}>
                    Resident: <Text style={{ fontWeight: '700', color: colors.navy }}>{u.tenant || 'Vacant'}</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.dirEditBtn}
                    onPress={() => handleOpenEditUnit(u)}
                  >
                    <Text style={styles.dirEditBtnText}>Edit Unit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button: Add Property */}
      {onAddPropertyPress && (
        <TourTarget
          id="properties-add-btn"
          style={{ position: 'absolute', bottom: 16, right: 14, zIndex: 99 }}
        >
          <TouchableOpacity
            style={[styles.fabButton, { position: 'relative', bottom: 0, right: 0 }]}
            onPress={() => {
              if (usage.properties.isFull) {
                setLimitModalType('properties');
                return;
              }
              onAddPropertyPress();
            }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={13} color="#FFFFFF" />
            <Text style={styles.fabButtonText}>Add Property</Text>
          </TouchableOpacity>
        </TourTarget>
      )}

      {/* MODAL: ADD UNIT TO EXISTING PROPERTY */}
      {targetProperty && (
        <Modal visible transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Unit to {targetProperty.name}</Text>
                <TouchableOpacity onPress={() => setTargetProperty(null)}>
                  <Ionicons name="close" size={22} color={colors.inkSoft} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={true}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalLabel}>Unit Number / Identifier *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newUnitNumber}
                  onChangeText={setNewUnitNumber}
                  placeholder="e.g. 302, B-4"
                  placeholderTextColor={colors.inkSoft}
                />

                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Unit Type</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newUnitType}
                      onChangeText={setNewUnitType}
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Floor Level</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newUnitFloor}
                      onChangeText={setNewUnitFloor}
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>

                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Monthly Rent ({getSymbol(targetProperty.currency)})</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newUnitRent}
                      onChangeText={setNewUnitRent}
                      keyboardType="numeric"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Deposit ({getSymbol(targetProperty.currency)})</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newUnitDeposit}
                      onChangeText={setNewUnitDeposit}
                      keyboardType="numeric"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>

                <Text style={styles.modalLabel}>Electricity Sub-Meter #</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newUnitMeter}
                  onChangeText={setNewUnitMeter}
                  placeholder="e.g. MTR-302"
                  placeholderTextColor={colors.inkSoft}
                />

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setTargetProperty(null)}
                  >
                    <Text style={styles.modalCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSaveBtn}
                    onPress={handleSaveNewUnit}
                  >
                    <Text style={styles.modalSaveBtnText}>✓ Add Unit Now</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL: EDIT UNIT SPECIFICATIONS */}
      {editingUnit && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setEditingUnit(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCardLarge}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={styles.modalHeaderIconWrap}>
                    <Feather name="edit-3" size={18} color={isDark ? '#FBBF24' : '#D97706'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>
                      Edit Unit {editingUnit.unitNumber || editingUnit.id}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      Modify unit specifications, rental rates, and occupancy
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setEditingUnit(null)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color={colors.inkSoft} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalScrollBody}
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Unit Identifier & Floor Level */}
                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Unit Number / ID *</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editUnitNumber}
                      onChangeText={setEditUnitNumber}
                      placeholder="e.g. 101, A-302"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Floor Level</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editFloor}
                      onChangeText={setEditFloor}
                      placeholder="e.g. 1st Floor"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>

                {/* Unit Type Selection */}
                <Text style={styles.modalLabel}>Unit Type</Text>
                <TouchableOpacity
                  style={[
                    styles.editDropdownBtn,
                    openEditDropdown === 'type' && styles.editDropdownBtnActive,
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setOpenEditDropdown((prev) => (prev === 'type' ? null : 'type'));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editDropdownBtnText}>{editUnitType || 'Select Unit Type'}</Text>
                  <Feather
                    name={openEditDropdown === 'type' ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.inkSoft}
                  />
                </TouchableOpacity>
                {openEditDropdown === 'type' && (
                  <View style={styles.editDropdownList}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                      {[
                        '1 RK',
                        '1 BHK',
                        '2 BHK',
                        '3 BHK',
                        '4 BHK',
                        'Studio',
                        'Penthouse',
                        'Villa',
                        'Commercial',
                      ].map((type) => {
                        const isSelected = editUnitType === type;
                        return (
                          <TouchableOpacity
                            key={type}
                            style={[
                              styles.editDropdownOption,
                              isSelected && styles.editDropdownOptionActive,
                            ]}
                            onPress={() => {
                              setEditUnitType(type);
                              setOpenEditDropdown(null);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.editDropdownOptionText,
                                isSelected && styles.editDropdownOptionTextActive,
                              ]}
                            >
                              {type}
                            </Text>
                            {isSelected && <Feather name="check" size={15} color="#059669" />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Area SqFt */}
                <View style={[styles.grid2, { marginTop: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Area (Sq.Ft)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editAreaSqFt}
                      onChangeText={setEditAreaSqFt}
                      keyboardType="numeric"
                      placeholder="1000"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }} />
                </View>

                {/* Furnishing Status */}
                <Text style={styles.modalLabel}>Furnishing Status</Text>
                <TouchableOpacity
                  style={[
                    styles.editDropdownBtn,
                    openEditDropdown === 'furnishing' && styles.editDropdownBtnActive,
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setOpenEditDropdown((prev) => (prev === 'furnishing' ? null : 'furnishing'));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editDropdownBtnText}>
                    {editFurnishing || 'Select Furnishing Status'}
                  </Text>
                  <Feather
                    name={openEditDropdown === 'furnishing' ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.inkSoft}
                  />
                </TouchableOpacity>
                {openEditDropdown === 'furnishing' && (
                  <View style={styles.editDropdownList}>
                    {(['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] as const).map((f) => {
                      const isSelected = editFurnishing === f;
                      return (
                        <TouchableOpacity
                          key={f}
                          style={[
                            styles.editDropdownOption,
                            isSelected && styles.editDropdownOptionActive,
                          ]}
                          onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setEditFurnishing(f);
                            setOpenEditDropdown(null);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.editDropdownOptionText,
                              isSelected && styles.editDropdownOptionTextActive,
                            ]}
                          >
                            {f}
                          </Text>
                          {isSelected && <Feather name="check" size={15} color="#059669" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Monthly Rent & Security Deposit */}
                <View style={[styles.grid2, { marginTop: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>
                      Monthly Rent ({getSymbol(editingUnit.currency || viewCurrency)}) *
                    </Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editRent}
                      onChangeText={(t) => setEditRent(t.replace(/^0+(?=\d)/, ''))}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>
                      Security Deposit ({getSymbol(editingUnit.currency || viewCurrency)})
                    </Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editDeposit}
                      onChangeText={(t) => setEditDeposit(t.replace(/^0+(?=\d)/, ''))}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>

                {/* Occupancy Status */}
                <Text style={styles.modalLabel}>Occupancy Status</Text>
                <TouchableOpacity
                  style={[
                    styles.editDropdownBtn,
                    openEditDropdown === 'status' && styles.editDropdownBtnActive,
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setOpenEditDropdown((prev) => (prev === 'status' ? null : 'status'));
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor:
                          editStatus === 'vacant'
                            ? '#10B981'
                            : editStatus === 'occupied'
                            ? '#3B82F6'
                            : editStatus === 'reserved'
                            ? '#F59E0B'
                            : '#EF4444',
                      }}
                    />
                    <Text style={styles.editDropdownBtnText}>
                      {editStatus === 'vacant'
                        ? 'Vacant'
                        : editStatus === 'occupied'
                        ? 'Occupied'
                        : editStatus === 'reserved'
                        ? 'Reserved'
                        : 'Under Maintenance'}
                    </Text>
                  </View>
                  <Feather
                    name={openEditDropdown === 'status' ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.inkSoft}
                  />
                </TouchableOpacity>
                {openEditDropdown === 'status' && (
                  <View style={styles.editDropdownList}>
                    {[
                      { key: 'vacant', label: 'Vacant', dot: '#10B981' },
                      { key: 'occupied', label: 'Occupied', dot: '#3B82F6' },
                      { key: 'reserved', label: 'Reserved', dot: '#F59E0B' },
                      { key: 'maintenance', label: 'Under Maintenance', dot: '#EF4444' },
                    ].map((st) => {
                      const isSelected = editStatus === st.key;
                      return (
                        <TouchableOpacity
                          key={st.key}
                          style={[
                            styles.editDropdownOption,
                            isSelected && styles.editDropdownOptionActive,
                          ]}
                          onPress={() => {
                            setEditStatus(st.key as any);
                            setOpenEditDropdown(null);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: st.dot,
                              }}
                            />
                            <Text
                              style={[
                                styles.editDropdownOptionText,
                                isSelected && styles.editDropdownOptionTextActive,
                              ]}
                            >
                              {st.label}
                            </Text>
                          </View>
                          {isSelected && <Feather name="check" size={15} color="#059669" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Detach Tenant Warning */}
                {editStatus === 'vacant' && editingUnit.tenant && (
                  <View style={styles.warningNotice}>
                    <Feather name="alert-triangle" size={14} color="#D97706" style={{ marginTop: 1 }} />
                    <Text style={styles.warningNoticeText}>
                      ⚠️ Setting status to Vacant will detach current resident ({editingUnit.tenant}).
                    </Text>
                  </View>
                )}

                {/* Utility Sub-Meters */}
                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Electricity Meter ID</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editElectricityMeter}
                      onChangeText={setEditElectricityMeter}
                      placeholder="e.g. EM-8821"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Water Meter ID</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editWaterMeter}
                      onChangeText={setEditWaterMeter}
                      placeholder="e.g. WM-4019"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>

                {/* Unit Photos */}
                <Text style={styles.modalLabel}>
                  Unit Photos ({editUnitImages.length})
                </Text>
                <View style={styles.photosContainer}>
                  {editUnitImages.map((imgUrl, idx) => (
                    <View key={idx} style={styles.photoThumbWrap}>
                      <Image source={{ uri: imgUrl }} style={styles.photoThumb} />
                      <TouchableOpacity
                        style={styles.photoRemoveBtn}
                        onPress={() =>
                          setEditUnitImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close" size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.photoAddBtn}
                    onPress={handleAddUnitPhoto}
                    disabled={isUploadingPhoto}
                  >
                    {isUploadingPhoto ? (
                      <ActivityIndicator size="small" color={colors.inkSoft} />
                    ) : (
                      <>
                        <Feather name="camera" size={18} color={colors.inkSoft} />
                        <Text style={styles.photoAddBtnText}>+ Photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {/* Footer Buttons */}
              <View style={styles.modalFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {!editingUnit.tenant && editingUnit.status !== 'occupied' ? (
                    <TouchableOpacity
                      style={styles.deleteUnitBtn}
                      onPress={handleDeleteUnit}
                    >
                      <Feather name="trash-2" size={13} color="#EF4444" />
                      <Text style={styles.deleteUnitBtnText}>Delete Unit</Text>
                    </TouchableOpacity>
                  ) : (
                    <View />
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.saveActionBtn}
                    onPress={handleSaveUnitEdit}
                  >
                    <Text style={styles.saveActionBtnText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Plan Quota Limit Interception Modal */}
      <PlanLimitModal
        visible={limitModalType !== null}
        resourceType={limitModalType}
        currentUsage={limitModalType ? usage[limitModalType].used : 0}
        limit={limitModalType ? usage[limitModalType].max : 0}
        planName={currentPlanName}
        onClose={() => setLimitModalType(null)}
        onUpgrade={() => {
          setLimitModalType(null);
          onNavigate?.('owner_plan_subscription');
        }}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  statusBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  statusTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fabButton: {
    position: 'absolute',
    bottom: 16,
    right: 14,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#059669',
    zIndex: 99,
  },
  fabButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11.5,
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  planUsageStrip: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 12,
    alignItems: 'center',
  },
  planUsageText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  propertyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  propertyImage: {
    width: '100%',
    height: 140,
  },
  photoChangeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  propertyImageBlank: {
    width: '100%',
    height: 140,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  propertyImageBlankIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  propertyImageBlankText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  addPhotoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  addPhotoChipText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  propertyDetails: {
    padding: 16,
  },
  propertyTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  propertyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  propertySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  occupiedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  occupiedBadgeFull: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  occupiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  amenitiesPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  amenityMiniPill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  amenityMiniText: {
    fontSize: 10,
    color: '#475569',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  propActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  unitDirectoryEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  addUnitSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
  },
  addUnitSmallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  unitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  unitItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  unitItemSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  unitOccupiedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 6,
  },
  unitOccupiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.ink,
  },
  unitVacantBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: isDark ? '#2D1B06' : '#FEF3C7',
    borderRadius: 6,
  },
  unitVacantBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#D97706',
  },
  editUnitIconBtn: {
    padding: 6,
  },
  directoryHeaderBox: {
    marginBottom: 12,
  },
  directoryHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  directoryHeaderSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  directoryUnitCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  dirUnitTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dirUnitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  dirUnitSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  dirFinancialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
  },
  dirFinLabel: {
    fontSize: 10,
    color: colors.inkSoft,
    marginBottom: 2,
  },
  dirFinVal: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  dirTenantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dirTenantText: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  dirEditBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 6,
  },
  dirEditBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.navy,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.line,
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
  modalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.navy,
    backgroundColor: colors.surfaceSunken,
  },
  grid2: {
    flexDirection: 'row',
    gap: 10,
  },
  editDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
  },
  editDropdownBtnActive: {
    borderColor: '#10B981',
    backgroundColor: isDark ? '#064E3B' : '#F0FDF4',
  },
  editDropdownBtnText: {
    fontSize: 13,
    color: colors.navy,
    fontWeight: '600',
  },
  editDropdownList: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  editDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  editDropdownOptionActive: {
    backgroundColor: isDark ? '#064E3B' : '#F0FDF4',
  },
  editDropdownOptionText: {
    fontSize: 12.5,
    color: colors.ink,
    fontWeight: '500',
  },
  editDropdownOptionTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#10B981',
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCardLarge: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: isDark ? '#2D1B06' : '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
  },
  modalScrollBody: {
    marginTop: 6,
  },

  warningNotice: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: isDark ? '#2D1B06' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? '#78350F' : '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
  },
  warningNoticeText: {
    fontSize: 11.5,
    color: isDark ? '#FBBF24' : '#92400E',
    flex: 1,
    lineHeight: 16,
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  photoThumbWrap: {
    width: 66,
    height: 66,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.line,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddBtn: {
    width: 66,
    height: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddBtnText: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 2,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 6,
  },
  deleteUnitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: isDark ? '#3B1212' : '#FEF2F2',
    borderWidth: 1,
    borderColor: isDark ? '#7F1D1D' : '#FECACA',
  },
  deleteUnitBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  cancelActionBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
  },
  cancelActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  saveActionBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#D97706',
  },
  saveActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
