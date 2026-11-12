import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Switch,
  Modal,
  Alert,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { MobileProperty, MobileUnit } from '../types';
import { AddressDisplay } from '../components/AddressDisplay';
import { getCleanAddressText } from '../lib/addressUtils';
import { isSingleUnitProperty, getPropertyCategory, getUnitTypesForProperty } from '../lib/propertyTypes';
import { pickSingleImage } from '../lib/nativePicker';
import { uploadOrCompressImage } from '../lib/imageUploader';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { resolveEffectiveUnitStatus } from '../lib/portfolioReconcile';

interface InspectionRecord {
  id: string;
  unitId: string;
  unitNumber: string;
  propertyId: string;
  propertyName?: string;
  date: string;
  inspector: string;
  condition: 'excellent' | 'good' | 'fair' | 'needs_repair';
  notes: string;
  loggedAt: string;
}

const DEFAULT_AMENITIES = [
  '24/7 Security',
  'Power Backup',
  'Covered Parking',
  'Elevator / Lift',
  'CCTV Surveillance',
  'Gymnasium',
  'Swimming Pool',
  'Water Supply 24x7',
  'EV Charging',
  'Clubhouse',
];

interface ManagerPropertiesScreenProps {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const ManagerPropertiesScreen: React.FC<ManagerPropertiesScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, saveUnit, deleteUnit, saveProperty } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();

  const managerRecord = (state.propertyManagers || []).find(
    (m) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase().trim() === user.email.toLowerCase().trim())
  );
  const assignedPropertyId =
    (user as any)?.propertyId ||
    (user as any)?.assignedPropertyId ||
    managerRecord?.propertyId ||
    '';
  const effectiveOwnerId =
    user?.ownerId && user.ownerId !== user.id
      ? user.ownerId
      : managerRecord?.ownerId || '';
  const assignedProps = [
    ...(user?.assignedProperties || []),
    ...(managerRecord?.assignedProperties || []),
    ...(assignedPropertyId ? [assignedPropertyId] : []),
  ];
  const ownerId = effectiveOwnerId;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'residential' | 'commercial' | 'mixed'>('all');
  const [collapsedProps, setCollapsedProps] = useState<Record<string, boolean>>({});
  const [selectedBulkUnits, setSelectedBulkUnits] = useState<Record<string, string[]>>({});

  // Scoped properties
  const myProperties = useMemo(() => {
    return (state.properties || []).filter((p) => {
      if (p.assignedManagerId === user?.id || (p as any).managerId === user?.id) return true;
      if (assignedProps.includes(p.id)) return true;
      if (assignedPropertyId && p.id === assignedPropertyId) return true;
      if (effectiveOwnerId && p.ownerId === effectiveOwnerId) {
        if (assignedProps.length === 0 && !assignedPropertyId) return true;
        if (assignedProps.includes(p.id)) return true;
      }
      return false;
    });
  }, [state.properties, effectiveOwnerId, assignedPropertyId, assignedProps, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    return state.units.filter((u) => {
      if (u.propertyId && myPropertyIds.has(u.propertyId)) return true;
      if (ownerId && u.ownerId === ownerId) return true;
      return false;
    });
  }, [state.units, myPropertyIds, ownerId]);

  // Relational Occupancy Resolution (1-to-1 with Web ManagedPropertiesPage)
  const resolveUnitOccupancy = (u: MobileUnit) => {
    const eff = resolveEffectiveUnitStatus(u, state.agreements, state.tenancyRequests, state.moveOuts);
    if (eff === 'occupied') {
      const activeAgreement = (state.agreements || []).find(
        (a) =>
          (a.status === 'active' || (a.status as any) === 'signed') &&
          (!u.propertyId || !a.propertyId || a.propertyId === u.propertyId) &&
          (a.unit === u.unitNumber || a.unit === u.id || a.unit?.includes(u.unitNumber))
      );
      return {
        effectiveStatus: 'occupied' as const,
        effectiveTenant: activeAgreement?.tenant || u.tenant || 'Resident',
      };
    }
    if (eff === 'reserved') {
      return {
        effectiveStatus: 'reserved' as const,
        effectiveTenant: u.tenant || 'Pending Invite',
      };
    }
    if (eff === 'maintenance') {
      return {
        effectiveStatus: 'maintenance' as const,
        effectiveTenant: null,
      };
    }
    return {
      effectiveStatus: 'vacant' as const,
      effectiveTenant: null,
    };
  };

  // Filtered Properties
  const filteredProperties = useMemo(() => {
    return myProperties.filter((p) => {
      const cat = getPropertyCategory(p.propertyType || (p as any).category);
      if (categoryFilter !== 'all' && cat !== categoryFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const propMatch =
        p.name.toLowerCase().includes(q) ||
        getCleanAddressText(p.address).text.toLowerCase().includes(q);
      if (propMatch) return true;

      const propUnits = myUnits.filter((u) => u.propertyId === p.id);
      return propUnits.some((u) => {
        const occ = resolveUnitOccupancy(u);
        return (
          u.unitNumber.toLowerCase().includes(q) ||
          (occ.effectiveTenant || '').toLowerCase().includes(q) ||
          (u.unitType || '').toLowerCase().includes(q)
        );
      });
    });
  }, [myProperties, myUnits, categoryFilter, searchQuery, state.agreements, state.tenancyRequests]);

  // Inspections State & Persistence
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [showInspectionLog, setShowInspectionLog] = useState(false);
  const [inspectingUnit, setInspectingUnit] = useState<MobileUnit | null>(null);
  const [inspCondition, setInspCondition] = useState<'excellent' | 'good' | 'fair' | 'needs_repair'>('good');
  const [inspNotes, setInspNotes] = useState('');
  const [inspDate, setInspDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingInspection, setIsSavingInspection] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadInspections = async () => {
      try {
        const cached = await AsyncStorage.getItem('propithub_unit_inspections');
        if (cached && mounted) {
          setInspections(JSON.parse(cached));
        }
        if (isFirebaseConfigured) {
          const snap = await getDocs(collection(db, 'propertyInspections'));
          const list: InspectionRecord[] = [];
          snap.forEach((d) => list.push(d.data() as InspectionRecord));
          if (mounted && list.length > 0) {
            list.sort((a, b) => (b.loggedAt || '').localeCompare(a.loggedAt || ''));
            setInspections(list);
            await AsyncStorage.setItem('propithub_unit_inspections', JSON.stringify(list));
          }
        }
      } catch {
        // Ignore offline errors
      }
    };
    loadInspections();
    return () => {
      mounted = false;
    };
  }, []);

  const myInspections = useMemo(() => {
    const unitIds = new Set(myUnits.map((u) => u.id));
    return inspections.filter(
      (i) => myPropertyIds.has(i.propertyId) || unitIds.has(i.unitId)
    );
  }, [inspections, myPropertyIds, myUnits]);

  // Add Unit State
  const [targetProperty, setTargetProperty] = useState<MobileProperty | null>(null);
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitType, setNewUnitType] = useState('2 BHK');
  const [newUnitFloor, setNewUnitFloor] = useState('1st Floor');
  const [newUnitArea, setNewUnitArea] = useState('1050');
  const [newUnitFurnishing, setNewUnitFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [newUnitRent, setNewUnitRent] = useState('');
  const [newUnitDeposit, setNewUnitDeposit] = useState('');
  const [newUnitMeter, setNewUnitMeter] = useState('');
  const [newUnitPhotos, setNewUnitPhotos] = useState<string[]>([]);
  const [isAddingUnit, setIsAddingUnit] = useState(false);

  // Edit Unit State
  const [editingUnit, setEditingUnit] = useState<MobileUnit | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [editUnitType, setEditUnitType] = useState('2 BHK');
  const [editFloor, setEditFloor] = useState('1st Floor');
  const [editAreaSqFt, setEditAreaSqFt] = useState('1050');
  const [editFurnishing, setEditFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [editRent, setEditRent] = useState('');
  const [editDeposit, setEditDeposit] = useState('');
  const [editStatus, setEditStatus] = useState<'occupied' | 'vacant' | 'reserved' | 'maintenance'>('vacant');
  const [editElectricityMeter, setEditElectricityMeter] = useState('');
  const [editWaterMeter, setEditWaterMeter] = useState('');
  const [editUnitImages, setEditUnitImages] = useState<string[]>([]);
  const [isSavingUnitEdit, setIsSavingUnitEdit] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Unit Details & Lightbox State
  const [viewingUnit, setViewingUnit] = useState<MobileUnit | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Amenities Modal State
  const [amenitiesProperty, setAmenitiesProperty] = useState<MobileProperty | null>(null);
  const [customAmenity, setCustomAmenity] = useState('');

  // Available Unit Types for Add/Edit
  const availableAddTypes = useMemo(() => {
    if (!targetProperty) return ['1 BHK', '2 BHK', '3 BHK', 'Studio'];
    return getUnitTypesForProperty(targetProperty.propertyType || (targetProperty as any).category, newUnitType);
  }, [targetProperty, newUnitType]);

  const availableEditTypes = useMemo(() => {
    const prop = state.properties.find((p) => p.id === editingUnit?.propertyId);
    return getUnitTypesForProperty(prop?.propertyType || (prop as any)?.category, editUnitType);
  }, [editingUnit, state.properties, editUnitType]);

  // Public Listing Toggle
  const handleToggleListing = (unit: MobileUnit) => {
    const updated: MobileUnit = {
      ...unit,
      isListedPublicly: !unit.isListedPublicly,
    };
    saveUnit(updated);
  };

  // Open Google Maps
  const handleOpenMaps = (address: any, name: string) => {
    const resolved = getCleanAddressText(address, name);
    const url =
      resolved.mapUrl ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(resolved.text || name)}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Google Maps.'));
  };

  // Navigate to Lease Builder with pre-filled Unit/Property
  const handleLeaseUnit = async (prop: MobileProperty, unitsToLease: MobileUnit[]) => {
    try {
      const first = unitsToLease[0];
      const unitNums = unitsToLease.map((u) => u.unitNumber).join(', ');
      const totalRent = unitsToLease.reduce((sum, u) => sum + (Number(u.rent) || 0), 0);
      const totalDep = unitsToLease.reduce((sum, u) => sum + (Number(u.deposit) || 0), 0);
      await AsyncStorage.setItem(
        'propithub_mobile_lease_prefill',
        JSON.stringify({
          propertyId: prop.id,
          propertyName: prop.name,
          unitNumber: unitNums,
          rent: totalRent > 0 ? String(totalRent) : '',
          deposit: totalDep > 0 ? String(totalDep) : '',
          isSingleAsset: isSingleUnitProperty(prop),
          unitId: first?.id,
        })
      );
    } catch {
      // ignore storage error
    }
    onNavigate?.('lease_drafting_builder');
  };

  const toggleBulkUnit = (propId: string, unitId: string) => {
    setSelectedBulkUnits((prev) => {
      const current = prev[propId] || [];
      const next = current.includes(unitId)
        ? current.filter((id) => id !== unitId)
        : [...current, unitId];
      return { ...prev, [propId]: next };
    });
  };

  // Photo Upload Helper
  const handlePickPhoto = async (
    mode: 'add' | 'edit' | 'property' | 'unit_direct' | 'amenity',
    prop?: MobileProperty,
    targetUnit?: MobileUnit,
    amenityName?: string
  ) => {
    const picked = await pickSingleImage({ quality: 0.8 });
    if (!picked) return;
    setIsUploadingPhoto(true);
    try {
      const uploadedUrl = await uploadOrCompressImage(
        picked.base64 || picked.uri,
        `units/photo_${Date.now()}.jpg`
      );
      if (mode === 'add') {
        setNewUnitPhotos((prev) => [uploadedUrl, ...prev]);
      } else if (mode === 'edit') {
        setEditUnitImages((prev) => [uploadedUrl, ...prev]);
      } else if (mode === 'property' && prop) {
        const cleanExisting = (prop.images || []).filter((img) => !img.includes('unsplash.com'));
        saveProperty({ ...prop, images: [uploadedUrl, ...cleanExisting] });
      } else if (mode === 'unit_direct' && targetUnit) {
        const cleanExisting = (targetUnit.images || []).filter((img) => !img.includes('unsplash.com'));
        saveUnit({
          ...targetUnit,
          images: [uploadedUrl, ...cleanExisting],
          image: uploadedUrl,
        });
      } else if (mode === 'amenity' && amenitiesProperty && amenityName) {
        const existingPhotos: { name: string; image: string }[] =
          (amenitiesProperty as any).amenityPhotos || [];
        const nextPhotos = [
          { name: amenityName, image: uploadedUrl },
          ...existingPhotos.filter((ap) => ap.name !== amenityName),
        ];
        const updatedProp = {
          ...amenitiesProperty,
          amenityPhotos: nextPhotos,
        } as MobileProperty;
        setAmenitiesProperty(updatedProp);
        saveProperty(updatedProp);
      }
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message || 'Could not process image.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Add Unit Handlers
  const handleOpenAddUnit = (prop: MobileProperty) => {
    setTargetProperty(prop);
    const existingCount = myUnits.filter((u) => u.propertyId === prop.id).length;
    const nextNum = `${existingCount + 1}01`;
    const types = getUnitTypesForProperty(prop.propertyType || (prop as any).category);
    setNewUnitNumber(nextNum);
    setNewUnitType(types[0] || '2 BHK');
    setNewUnitFloor('1st Floor');
    setNewUnitArea('1050');
    setNewUnitFurnishing('Semi-Furnished');
    const isINR = prop.currency === '₹' || prop.currency === 'INR';
    setNewUnitRent(isINR ? '25000' : '2200');
    setNewUnitDeposit(isINR ? '50000' : '4400');
    setNewUnitMeter(`MTR-${nextNum}`);
    setNewUnitPhotos([]);
  };

  const handleSaveNewUnit = async () => {
    if (!targetProperty || !newUnitNumber.trim()) {
      Alert.alert('Required', 'Please enter a unit identifier.');
      return;
    }
    setIsAddingUnit(true);
    try {
      const cleanNum = newUnitNumber.trim();
      const newUnit: MobileUnit = {
        id: `unit-${targetProperty.id}-${cleanNum}-${Date.now().toString().slice(-3)}`,
        propertyId: targetProperty.id,
        propertyName: targetProperty.name,
        ownerId: targetProperty.ownerId || ownerId,
        unitNumber: cleanNum,
        unitType: newUnitType,
        floor: newUnitFloor,
        areaSqFt: parseInt(newUnitArea, 10) || 1050,
        furnishing: newUnitFurnishing,
        rent: parseInt(newUnitRent, 10) || 25000,
        deposit: parseInt(newUnitDeposit, 10) || 50000,
        currency: targetProperty.currency || viewCurrency,
        status: 'vacant',
        isListedPublicly: true,
        tenant: null,
        currentTenantId: null,
        electricityMeter: newUnitMeter.trim() || undefined,
        images: newUnitPhotos.length > 0 ? newUnitPhotos : targetProperty.images,
        image: newUnitPhotos[0] || targetProperty.images?.[0] || '',
      };

      saveUnit(newUnit);
      saveProperty({ ...targetProperty, unitCount: (targetProperty.unitCount || 0) + 1 });
      setTargetProperty(null);
    } finally {
      setIsAddingUnit(false);
    }
  };

  // Edit Unit Handlers
  const handleOpenEditUnit = (unit: MobileUnit) => {
    const occ = resolveUnitOccupancy(unit);
    setEditingUnit(unit);
    setEditUnitNumber(unit.unitNumber || '');
    setEditUnitType(unit.unitType || '2 BHK');
    setEditFloor(unit.floor || '1st Floor');
    setEditAreaSqFt(unit.areaSqFt ? String(unit.areaSqFt) : '1050');
    setEditFurnishing((unit.furnishing as any) || 'Semi-Furnished');
    setEditRent(unit.rent ? unit.rent.toString() : '');
    setEditDeposit(unit.deposit ? unit.deposit.toString() : '');
    setEditStatus(occ.effectiveStatus || (unit.status as any) || 'vacant');
    setEditElectricityMeter(unit.electricityMeter || '');
    setEditWaterMeter((unit as any).waterMeter || '');
    setEditUnitImages(unit.images && unit.images.length > 0 ? [...unit.images] : unit.image ? [unit.image] : []);
  };

  const handleSaveUnitEdit = () => {
    if (!editingUnit) return;
    setIsSavingUnitEdit(true);
    try {
      const cleanNum = editUnitNumber.trim() || editingUnit.unitNumber;
      const updated: MobileUnit = {
        ...editingUnit,
        unitNumber: cleanNum,
        unitType: editUnitType,
        floor: editFloor,
        areaSqFt: parseInt(editAreaSqFt, 10) || editingUnit.areaSqFt || 1050,
        furnishing: editFurnishing,
        rent: parseInt(editRent, 10) || editingUnit.rent,
        deposit: parseInt(editDeposit, 10) || editingUnit.deposit,
        status: editStatus,
        electricityMeter: editElectricityMeter.trim() || undefined,
        waterMeter: editWaterMeter.trim() || undefined,
        images: editUnitImages.length > 0 ? editUnitImages : undefined,
        image: editUnitImages[0] || editingUnit.image,
      } as MobileUnit;

      saveUnit(updated);
      if (viewingUnit && viewingUnit.id === editingUnit.id) {
        setViewingUnit(updated);
      }
      setEditingUnit(null);
    } finally {
      setIsSavingUnitEdit(false);
    }
  };

  const handleDeleteUnit = (unit: MobileUnit) => {
    const occ = resolveUnitOccupancy(unit);
    if (occ.effectiveStatus === 'occupied' || occ.effectiveTenant) {
      Alert.alert('Cannot Delete', 'Vacate the resident before deleting this unit.');
      return;
    }
    Alert.alert(
      'Delete Unit',
      `Delete Unit ${unit.unitNumber}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteUnit(unit.id);
            setEditingUnit(null);
            setViewingUnit(null);
          },
        },
      ]
    );
  };

  // Amenities Handlers
  const handleToggleAmenity = (amenity: string) => {
    if (!amenitiesProperty) return;
    const current = amenitiesProperty.amenities || [];
    const next = current.includes(amenity)
      ? current.filter((a) => a !== amenity)
      : [...current, amenity];
    const updated = { ...amenitiesProperty, amenities: next };
    setAmenitiesProperty(updated);
    saveProperty(updated);
  };

  const handleAddCustomAmenity = () => {
    if (!amenitiesProperty || !customAmenity.trim()) return;
    const clean = customAmenity.trim();
    const current = amenitiesProperty.amenities || [];
    if (!current.includes(clean)) {
      const updated = { ...amenitiesProperty, amenities: [...current, clean] };
      setAmenitiesProperty(updated);
      saveProperty(updated);
    }
    setCustomAmenity('');
  };

  // Inspection Save Handler
  const handleSaveInspection = async () => {
    if (!inspectingUnit) return;
    setIsSavingInspection(true);
    try {
      const newLog: InspectionRecord = {
        id: `INSP-${Date.now()}`,
        unitId: inspectingUnit.id,
        unitNumber: inspectingUnit.unitNumber,
        propertyId: inspectingUnit.propertyId || '',
        propertyName: inspectingUnit.propertyName || '',
        date: inspDate,
        inspector: user?.displayName || 'Property Manager',
        condition: inspCondition,
        notes: inspNotes.trim() || `Routine inspection — ${inspCondition}.`,
        loggedAt: new Date().toISOString(),
      };

      const nextList = [newLog, ...inspections];
      setInspections(nextList);
      await AsyncStorage.setItem('propithub_unit_inspections', JSON.stringify(nextList));

      if (isFirebaseConfigured) {
        await setDoc(doc(db, 'propertyInspections', newLog.id), newLog, { merge: true }).catch(console.warn);
      }

      setInspectingUnit(null);
      setInspNotes('');
      setInspCondition('good');
    } finally {
      setIsSavingInspection(false);
    }
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Portfolio KPI totals using relational occupancy
  const { totalOccupied, totalVacant } = useMemo(() => {
    let occ = 0;
    let vac = 0;
    myUnits.forEach((u) => {
      const res = resolveUnitOccupancy(u);
      if (res.effectiveStatus === 'occupied') occ++;
      else if (res.effectiveStatus === 'vacant') vac++;
    });
    return { totalOccupied: occ, totalVacant: vac };
  }, [myUnits, state.agreements, state.tenancyRequests]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      <Header
        title="Properties"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimal 4-Column KPI Row */}
        <TourTarget id="manager-properties-list" style={styles.kpiRow}>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>PROPERTIES</Text>
            <Text style={styles.kpiValue}>{myProperties.length}</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>UNITS</Text>
            <Text style={styles.kpiValue}>{myUnits.length}</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>OCCUPIED</Text>
            <Text style={[styles.kpiValue, { color: '#10B981' }]}>{totalOccupied}</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>VACANT</Text>
            <Text style={[styles.kpiValue, { color: '#3B82F6' }]}>{totalVacant}</Text>
          </View>
        </TourTarget>

        {/* Search + Add Property Row */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchBox}>
            <Feather name="search" size={14} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search property, unit, or resident..."
              placeholderTextColor={colors.inkSoft}
            />
            {Boolean(searchQuery) && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={15} color={colors.inkSoft} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.addPropBtn}
            onPress={() => onNavigate?.('property_create_wizard')}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={14} color="#FFFFFF" />
            <Text style={styles.addPropBtnText}>Property</Text>
          </TouchableOpacity>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'residential', label: 'Residential' },
              { key: 'commercial', label: 'Commercial' },
              { key: 'mixed', label: 'Mixed' },
            ] as const
          ).map((chip) => {
            const active = categoryFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategoryFilter(chip.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Properties List */}
        {filteredProperties.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="home" size={32} color={colors.inkSoft} />
            <Text style={styles.emptyTitle}>No properties found</Text>
          </View>
        ) : (
          filteredProperties.map((p) => {
            const propUnits = myUnits.filter((u) => u.propertyId === p.id);
            const occupiedCount = propUnits.filter(
              (u) => resolveUnitOccupancy(u).effectiveStatus === 'occupied'
            ).length;
            const isCollapsed = Boolean(collapsedProps[p.id]);
            const singleAsset = isSingleUnitProperty(p);
            const propThumb = p.images?.[0];
            const bulkSelectedIds = selectedBulkUnits[p.id] || [];

            return (
              <View key={p.id} style={styles.propertyCard}>
                {/* Property Header */}
                <View style={styles.propHeader}>
                  <View style={{ position: 'relative' }}>
                    <TouchableOpacity
                      style={styles.propThumbWrap}
                      onPress={() =>
                        propThumb ? setLightboxImage(propThumb) : handlePickPhoto('property', p)
                      }
                      activeOpacity={0.8}
                    >
                      {propThumb ? (
                        <Image source={{ uri: propThumb }} style={styles.propThumb} />
                      ) : (
                        <View style={styles.propThumbPlaceholder}>
                          <Feather name="camera" size={15} color={colors.inkSoft} />
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cameraCornerBadge}
                      onPress={() => handlePickPhoto('property', p)}
                      activeOpacity={0.8}
                    >
                      <Feather name="camera" size={9} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() =>
                      setCollapsedProps((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                    }
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.propertyName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <View style={styles.occPill}>
                        <Text style={styles.occPillText}>
                          {occupiedCount}/{propUnits.length || 1}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.addressRow}
                      onPress={() => handleOpenMaps(p.address, p.name)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location-outline" size={12} color="#10B981" />
                      <AddressDisplay
                        address={p.address}
                        fallback="Map location"
                        textStyle={styles.addressText}
                      />
                      <Feather name="external-link" size={10} color={colors.inkSoft} />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.collapseBtn}
                    onPress={() =>
                      setCollapsedProps((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                    }
                  >
                    <Feather
                      name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                      size={16}
                      color={colors.inkSoft}
                    />
                  </TouchableOpacity>
                </View>

                {/* Property Quick Actions Bar */}
                {!isCollapsed && (
                  <>
                    <View style={styles.propActionRow}>
                      {!singleAsset && (
                        <TouchableOpacity
                          style={styles.propActionPillPrimary}
                          onPress={() => handleOpenAddUnit(p)}
                          activeOpacity={0.8}
                        >
                          <Feather name="plus" size={12} color="#FFFFFF" />
                          <Text style={styles.propActionPillPrimaryText}>Add Unit</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.propActionPill}
                        onPress={() => setAmenitiesProperty(p)}
                        activeOpacity={0.8}
                      >
                        <Feather name="sliders" size={12} color={colors.navy} />
                        <Text style={styles.propActionPillText}>
                          Amenities ({(p.amenities || []).length})
                        </Text>
                      </TouchableOpacity>
                      {bulkSelectedIds.length > 0 && (
                        <TouchableOpacity
                          style={[styles.propActionPillPrimary, { backgroundColor: '#2563EB' }]}
                          onPress={() => {
                            const selectedObjs = propUnits.filter((u) =>
                              bulkSelectedIds.includes(u.id)
                            );
                            handleLeaseUnit(p, selectedObjs);
                          }}
                          activeOpacity={0.85}
                        >
                          <Feather name="file-plus" size={12} color="#FFFFFF" />
                          <Text style={styles.propActionPillPrimaryText}>
                            Lease ({bulkSelectedIds.length})
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Inline Amenity Chips with Photo Preview */}
                    {p.amenities && p.amenities.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.inlineAmenityScroll}
                      >
                        {p.amenities.map((am) => {
                          const amPhoto = ((p as any).amenityPhotos || []).find(
                            (ap: any) => ap.name === am
                          );
                          return (
                            <TouchableOpacity
                              key={am}
                              style={[
                                styles.inlineAmenityChip,
                                Boolean(amPhoto) && styles.inlineAmenityChipPhoto,
                              ]}
                              onPress={() =>
                                amPhoto
                                  ? setLightboxImage(amPhoto.image)
                                  : setAmenitiesProperty(p)
                              }
                              activeOpacity={0.8}
                            >
                              {Boolean(amPhoto) && (
                                <Feather name="camera" size={10} color="#10B981" />
                              )}
                              <Text
                                style={[
                                  styles.inlineAmenityText,
                                  Boolean(amPhoto) && { color: '#10B981', fontWeight: '700' },
                                ]}
                              >
                                {am}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}

                    {/* Units List */}
                    <View style={styles.unitsContainer}>
                      {propUnits.length === 0 ? (
                        <View style={styles.noUnitsRow}>
                          <Text style={styles.noUnitsText}>No units configured</Text>
                          <TouchableOpacity
                            style={styles.propActionPillPrimary}
                            onPress={() => handleOpenAddUnit(p)}
                          >
                            <Text style={styles.propActionPillPrimaryText}>+ Add Unit</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        propUnits.map((u) => {
                          const occ = resolveUnitOccupancy(u);
                          const isOccupied = occ.effectiveStatus === 'occupied';
                          const isVacant = occ.effectiveStatus === 'vacant';
                          const isReserved = occ.effectiveStatus === 'reserved';
                          const unitImg = (u.images && u.images[0]) || u.image;
                          const isBulkChecked = bulkSelectedIds.includes(u.id);

                          return (
                            <View key={u.id} style={styles.unitCard}>
                              {/* Top Row: Unit Identity + Status Pill */}
                              <View style={styles.unitTopRow}>
                                <View style={styles.unitLeftRow}>
                                  {isVacant && !singleAsset && (
                                    <TouchableOpacity
                                      style={[
                                        styles.checkbox,
                                        isBulkChecked && styles.checkboxChecked,
                                      ]}
                                      onPress={() => toggleBulkUnit(p.id, u.id)}
                                    >
                                      {isBulkChecked && (
                                        <Feather name="check" size={10} color="#FFFFFF" />
                                      )}
                                    </TouchableOpacity>
                                  )}
                                  {unitImg ? (
                                    <View style={{ position: 'relative' }}>
                                      <TouchableOpacity onPress={() => setLightboxImage(unitImg)}>
                                        <Image source={{ uri: unitImg }} style={styles.unitThumb} />
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.cameraCornerBadgeSmall}
                                        onPress={() => handlePickPhoto('unit_direct', undefined, u)}
                                      >
                                        <Feather name="camera" size={8} color="#FFFFFF" />
                                      </TouchableOpacity>
                                    </View>
                                  ) : (
                                    <TouchableOpacity
                                      style={styles.unitThumbPlaceholder}
                                      onPress={() => handlePickPhoto('unit_direct', undefined, u)}
                                      activeOpacity={0.8}
                                    >
                                      <Feather name="camera" size={13} color={colors.inkSoft} />
                                    </TouchableOpacity>
                                  )}
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.unitNumText} numberOfLines={1}>
                                      {singleAsset ? p.propertyType || 'Whole Property' : `Unit ${u.unitNumber}`}
                                    </Text>
                                    <Text style={styles.unitSpecsText} numberOfLines={1}>
                                      {u.unitType || 'Standard'} · {u.areaSqFt || 1050} sq.ft
                                    </Text>
                                  </View>
                                </View>

                                <View
                                  style={[
                                    styles.statusPill,
                                    isOccupied
                                      ? styles.statusPillGreen
                                      : isVacant
                                      ? styles.statusPillBlue
                                      : styles.statusPillAmber,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.statusPillText,
                                      isOccupied
                                        ? { color: '#059669' }
                                        : isVacant
                                        ? { color: '#2563EB' }
                                        : { color: '#D97706' },
                                    ]}
                                  >
                                    {isOccupied
                                      ? 'Occupied'
                                      : isReserved
                                      ? 'Reserved'
                                      : occ.effectiveStatus === 'maintenance'
                                      ? 'Repair'
                                      : 'Vacant'}
                                  </Text>
                                </View>
                              </View>

                              {/* 2-Column Minimal Grid */}
                              <View style={styles.unitGrid}>
                                <View style={styles.unitGridCol}>
                                  <Text style={styles.gridLabel}>RENT</Text>
                                  <Text style={styles.gridValue}>
                                    {format(u.rent || 0, u.currency || p.currency)}
                                    <Text style={styles.gridSub}>/mo</Text>
                                  </Text>
                                </View>

                                <View style={styles.unitGridCol}>
                                  <Text style={styles.gridLabel}>
                                    {isVacant ? 'PUBLIC LISTING' : 'RESIDENT'}
                                  </Text>
                                  {isVacant ? (
                                    <View style={styles.inlineSwitchRow}>
                                      <Text
                                        style={[
                                          styles.listingLabel,
                                          { color: u.isListedPublicly ? '#10B981' : colors.inkSoft },
                                        ]}
                                      >
                                        {u.isListedPublicly ? 'Listed' : 'Hidden'}
                                      </Text>
                                      <Switch
                                        value={Boolean(u.isListedPublicly)}
                                        onValueChange={() => handleToggleListing(u)}
                                        trackColor={{ false: colors.line, true: '#10B981' }}
                                        thumbColor="#FFFFFF"
                                        style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                                      />
                                    </View>
                                  ) : (
                                    <Text style={styles.gridValue} numberOfLines={1}>
                                      {occ.effectiveTenant || '—'}
                                    </Text>
                                  )}
                                </View>
                              </View>

                              {/* Clean Footer Actions */}
                              <View style={styles.unitFooter}>
                                <TouchableOpacity
                                  style={styles.unitBtn}
                                  onPress={() => setViewingUnit(u)}
                                >
                                  <Text style={styles.unitBtnText}>Details</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.unitBtn}
                                  onPress={() => handleOpenEditUnit(u)}
                                >
                                  <Text style={styles.unitBtnText}>Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.unitBtn}
                                  onPress={() => {
                                    setInspectingUnit(u);
                                    setInspDate(new Date().toISOString().split('T')[0]);
                                    setInspCondition('good');
                                    setInspNotes('');
                                  }}
                                >
                                  <Text style={styles.unitBtnText}>Inspect</Text>
                                </TouchableOpacity>
                                {isVacant && (
                                  <TouchableOpacity
                                    style={styles.unitBtnPrimary}
                                    onPress={() => handleLeaseUnit(p, [u])}
                                  >
                                    <Text style={styles.unitBtnPrimaryText}>Lease</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}

        {/* Collapsible Inspection Log Section (Simulator Parity) */}
        <View style={styles.inspectionSection}>
          <TouchableOpacity
            style={styles.inspectionToggle}
            onPress={() => setShowInspectionLog((prev) => !prev)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="clipboard" size={14} color={colors.navy} />
              <Text style={styles.inspectionToggleTitle}>
                Inspection log ({myInspections.length})
              </Text>
            </View>
            <Feather
              name={showInspectionLog ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.inkSoft}
            />
          </TouchableOpacity>

          {showInspectionLog && (
            <View style={styles.inspectionList}>
              {myInspections.length === 0 ? (
                <Text style={styles.noUnitsText}>No unit inspections logged yet.</Text>
              ) : (
                myInspections.slice(0, 10).map((log) => (
                  <View key={log.id} style={styles.inspectionItem}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.unitNumText}>
                        Unit {log.unitNumber}
                        {log.propertyName ? ` · ${log.propertyName}` : ''}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          log.condition === 'needs_repair'
                            ? styles.statusPillAmber
                            : styles.statusPillGreen,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            {
                              color:
                                log.condition === 'needs_repair' ? '#D97706' : '#059669',
                            },
                          ]}
                        >
                          {log.condition.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.unitSpecsText, { marginTop: 3 }]}>{log.notes}</Text>
                    <Text style={[styles.gridSub, { marginTop: 3 }]}>
                      {log.date} · {log.inspector}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ================================================================== */}
      {/* ADD UNIT BOTTOM SHEET                                              */}
      {/* ================================================================== */}
      <Modal visible={Boolean(targetProperty)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Unit · {targetProperty?.name}</Text>
              <TouchableOpacity onPress={() => setTargetProperty(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Unit Number *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newUnitNumber}
                    onChangeText={setNewUnitNumber}
                    placeholder="e.g. 201"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Floor</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newUnitFloor}
                    onChangeText={setNewUnitFloor}
                    placeholder="1st Floor"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Layout</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {availableAddTypes.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.optionPill, newUnitType === t && styles.optionPillActive]}
                      onPress={() => setNewUnitType(t)}
                    >
                      <Text style={[styles.optionPillText, newUnitType === t && styles.optionPillTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Area (sq.ft)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newUnitArea}
                    onChangeText={setNewUnitArea}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Power Meter #</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newUnitMeter}
                    onChangeText={setNewUnitMeter}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Furnishing</Text>
                <View style={styles.row2}>
                  {(['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] as const).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.optionPill, { flex: 1 }, newUnitFurnishing === f && styles.optionPillActive]}
                      onPress={() => setNewUnitFurnishing(f)}
                    >
                      <Text
                        style={[styles.optionPillText, newUnitFurnishing === f && styles.optionPillTextActive]}
                        numberOfLines={1}
                      >
                        {f.replace('-Furnished', '')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Rent ({targetProperty?.currency || viewCurrency})</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newUnitRent}
                    onChangeText={setNewUnitRent}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Deposit</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newUnitDeposit}
                    onChangeText={setNewUnitDeposit}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Unit Photo Upload */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Unit Photos</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.photoUploadBtn}
                    onPress={() => handlePickPhoto('add')}
                    disabled={isUploadingPhoto}
                  >
                    {isUploadingPhoto ? (
                      <ActivityIndicator size="small" color="#10B981" />
                    ) : (
                      <>
                        <Feather name="camera" size={14} color="#10B981" />
                        <Text style={styles.photoUploadBtnText}>Add Photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {newUnitPhotos.map((uri, idx) => (
                      <View key={idx} style={{ position: 'relative' }}>
                        <Image source={{ uri }} style={styles.uploadedThumb} />
                        <TouchableOpacity
                          style={styles.removePhotoBadge}
                          onPress={() =>
                            setNewUnitPhotos((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Ionicons name="close" size={10} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSaveNewUnit}
                disabled={isAddingUnit}
              >
                <Text style={styles.primaryBtnText}>
                  {isAddingUnit ? 'Saving...' : 'Add Unit'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* EDIT UNIT BOTTOM SHEET                                             */}
      {/* ================================================================== */}
      <Modal visible={Boolean(editingUnit)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Unit {editingUnit?.unitNumber}</Text>
              <TouchableOpacity onPress={() => setEditingUnit(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Unit Number</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editUnitNumber}
                    onChangeText={setEditUnitNumber}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Floor</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editFloor}
                    onChangeText={setEditFloor}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Layout</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {availableEditTypes.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.optionPill, editUnitType === t && styles.optionPillActive]}
                      onPress={() => setEditUnitType(t)}
                    >
                      <Text style={[styles.optionPillText, editUnitType === t && styles.optionPillTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.row2}>
                  {(['vacant', 'occupied', 'reserved', 'maintenance'] as const).map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.optionPill, { flex: 1 }, editStatus === st && styles.optionPillActive]}
                      onPress={() => setEditStatus(st)}
                    >
                      <Text
                        style={[styles.optionPillText, editStatus === st && styles.optionPillTextActive]}
                        numberOfLines={1}
                      >
                        {st === 'maintenance' ? 'Repair' : st.charAt(0).toUpperCase() + st.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Area (sq.ft)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editAreaSqFt}
                    onChangeText={setEditAreaSqFt}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Power Meter #</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editElectricityMeter}
                    onChangeText={setEditElectricityMeter}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Furnishing</Text>
                <View style={styles.row2}>
                  {(['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] as const).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.optionPill, { flex: 1 }, editFurnishing === f && styles.optionPillActive]}
                      onPress={() => setEditFurnishing(f)}
                    >
                      <Text
                        style={[styles.optionPillText, editFurnishing === f && styles.optionPillTextActive]}
                        numberOfLines={1}
                      >
                        {f.replace('-Furnished', '')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Rent ({editingUnit?.currency || viewCurrency})</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editRent}
                    onChangeText={setEditRent}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Deposit</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDeposit}
                    onChangeText={setEditDeposit}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Unit Photos */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Photos</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.photoUploadBtn}
                    onPress={() => handlePickPhoto('edit')}
                    disabled={isUploadingPhoto}
                  >
                    {isUploadingPhoto ? (
                      <ActivityIndicator size="small" color="#10B981" />
                    ) : (
                      <>
                        <Feather name="camera" size={14} color="#10B981" />
                        <Text style={styles.photoUploadBtnText}>Upload</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {editUnitImages.map((uri, idx) => (
                      <View key={idx} style={{ position: 'relative' }}>
                        <Image source={{ uri }} style={styles.uploadedThumb} />
                        <TouchableOpacity
                          style={styles.removePhotoBadge}
                          onPress={() =>
                            setEditUnitImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Ionicons name="close" size={10} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSaveUnitEdit}
                disabled={isSavingUnitEdit}
              >
                <Text style={styles.primaryBtnText}>
                  {isSavingUnitEdit ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>

              {editingUnit && resolveUnitOccupancy(editingUnit).effectiveStatus !== 'occupied' && (
                <TouchableOpacity
                  style={styles.dangerOutlineBtn}
                  onPress={() => handleDeleteUnit(editingUnit)}
                >
                  <Feather name="trash-2" size={13} color="#DC2626" />
                  <Text style={styles.dangerOutlineBtnText}>Delete Unit</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* UNIT DETAILS BOTTOM SHEET                                          */}
      {/* ================================================================== */}
      <Modal visible={Boolean(viewingUnit)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Unit {viewingUnit?.unitNumber}</Text>
              <TouchableOpacity onPress={() => setViewingUnit(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            {viewingUnit && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {((viewingUnit.images && viewingUnit.images.length > 0) || viewingUnit.image) && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, marginBottom: 14 }}
                  >
                    {(viewingUnit.images?.length ? viewingUnit.images : [viewingUnit.image!]).map(
                      (img, i) => (
                        <TouchableOpacity key={i} onPress={() => setLightboxImage(img)}>
                          <Image
                            source={{ uri: img }}
                            style={{ width: 120, height: 80, borderRadius: 10 }}
                          />
                        </TouchableOpacity>
                      )
                    )}
                  </ScrollView>
                )}

                <View style={styles.detailsGrid}>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>STATUS</Text>
                    <Text style={styles.gridValue}>
                      {resolveUnitOccupancy(viewingUnit).effectiveStatus.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>RESIDENT</Text>
                    <Text style={styles.gridValue}>
                      {resolveUnitOccupancy(viewingUnit).effectiveTenant || 'Vacant'}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>MONTHLY RENT</Text>
                    <Text style={styles.gridValue}>
                      {format(viewingUnit.rent || 0, viewingUnit.currency)}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>DEPOSIT</Text>
                    <Text style={styles.gridValue}>
                      {format(viewingUnit.deposit || 0, viewingUnit.currency)}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>LAYOUT & AREA</Text>
                    <Text style={styles.gridValue}>
                      {viewingUnit.unitType || 'Standard'} · {viewingUnit.areaSqFt || 1050} sq.ft
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>FURNISHING</Text>
                    <Text style={styles.gridValue}>
                      {viewingUnit.furnishing || 'Semi-Furnished'}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>FLOOR</Text>
                    <Text style={styles.gridValue}>{viewingUnit.floor || '1st Floor'}</Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>POWER METER</Text>
                    <Text style={styles.gridValue}>{viewingUnit.electricityMeter || '—'}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => {
                      const target = viewingUnit;
                      setViewingUnit(null);
                      handleOpenEditUnit(target);
                    }}
                  >
                    <Text style={styles.primaryBtnText}>Edit Unit</Text>
                  </TouchableOpacity>
                  {resolveUnitOccupancy(viewingUnit).effectiveStatus === 'vacant' && (
                    <TouchableOpacity
                      style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: '#2563EB' }]}
                      onPress={() => {
                        const prop = myProperties.find((p) => p.id === viewingUnit.propertyId);
                        setViewingUnit(null);
                        if (prop) handleLeaseUnit(prop, [viewingUnit]);
                      }}
                    >
                      <Text style={styles.primaryBtnText}>Lease Unit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* PROPERTY AMENITIES BOTTOM SHEET                                    */}
      {/* ================================================================== */}
      <Modal visible={Boolean(amenitiesProperty)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Amenities · {amenitiesProperty?.name}</Text>
              <TouchableOpacity onPress={() => setAmenitiesProperty(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.conditionPillsRow}>
                {Array.from(
                  new Set([...DEFAULT_AMENITIES, ...(amenitiesProperty?.amenities || [])])
                ).map((item) => {
                  const selected = (amenitiesProperty?.amenities || []).includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.optionPill, selected && styles.optionPillActive]}
                      onPress={() => handleToggleAmenity(item)}
                    >
                      <Text style={[styles.optionPillText, selected && styles.optionPillTextActive]}>
                        {selected ? `✓ ${item}` : item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.row2, { marginTop: 14 }]}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  value={customAmenity}
                  onChangeText={setCustomAmenity}
                  placeholder="Add custom amenity..."
                  placeholderTextColor={colors.inkSoft}
                />
                <TouchableOpacity style={styles.addPropBtn} onPress={handleAddCustomAmenity}>
                  <Text style={styles.addPropBtnText}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Amenity Photos Section */}
              {(amenitiesProperty?.amenities || []).length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.inputLabel}>Amenity Photos</Text>
                  <View style={{ gap: 8 }}>
                    {(amenitiesProperty?.amenities || []).map((am) => {
                      const amPhoto = ((amenitiesProperty as any)?.amenityPhotos || []).find(
                        (ap: any) => ap.name === am
                      );
                      return (
                        <View key={am} style={styles.amenityPhotoRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            {amPhoto?.image ? (
                              <TouchableOpacity onPress={() => setLightboxImage(amPhoto.image)}>
                                <Image source={{ uri: amPhoto.image }} style={styles.unitThumb} />
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.unitThumbPlaceholder}>
                                <Feather name="image" size={13} color={colors.inkSoft} />
                              </View>
                            )}
                            <Text style={styles.unitNumText} numberOfLines={1}>
                              {am}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.propActionPill}
                            onPress={() =>
                              handlePickPhoto('amenity', amenitiesProperty!, undefined, am)
                            }
                            disabled={isUploadingPhoto}
                          >
                            <Feather name="camera" size={12} color="#10B981" />
                            <Text style={[styles.propActionPillText, { color: '#10B981' }]}>
                              {amPhoto?.image ? 'Replace' : 'Upload'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* UNIT INSPECTION BOTTOM SHEET                                       */}
      {/* ================================================================== */}
      <Modal visible={Boolean(inspectingUnit)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Inspect Unit {inspectingUnit?.unitNumber}</Text>
              <TouchableOpacity onPress={() => setInspectingUnit(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={inspDate}
                  onChangeText={setInspDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Condition</Text>
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
                        styles.optionPill,
                        inspCondition === item.key && styles.optionPillActive,
                      ]}
                      onPress={() => setInspCondition(item.key)}
                    >
                      <Text
                        style={[
                          styles.optionPillText,
                          inspCondition === item.key && styles.optionPillTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={inspNotes}
                  onChangeText={setInspNotes}
                  placeholder="Observations on fixtures, paint, plumbing..."
                  placeholderTextColor={colors.inkSoft}
                  multiline
                />
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSaveInspection}
                disabled={isSavingInspection}
              >
                <Text style={styles.primaryBtnText}>
                  {isSavingInspection ? 'Saving...' : 'Save Inspection'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Photo Lightbox */}
      <Modal visible={Boolean(lightboxImage)} transparent animationType="fade">
        <TouchableOpacity
          style={styles.lightboxOverlay}
          activeOpacity={1}
          onPress={() => setLightboxImage(null)}
        >
          {lightboxImage && (
            <Image
              source={{ uri: lightboxImage }}
              style={{ width: '90%', height: '65%', borderRadius: 12 }}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
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
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 24,
    },
    kpiRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    kpiTile: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    kpiLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.4,
    },
    kpiValue: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.navy,
      marginTop: 2,
    },
    searchBarRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 10,
      height: 38,
      gap: 6,
    },
    searchInput: {
      flex: 1,
      fontSize: 12.5,
      color: colors.navy,
      paddingVertical: 0,
    },
    addPropBtn: {
      backgroundColor: '#10B981',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      height: 38,
      borderRadius: 10,
      gap: 4,
    },
    addPropBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    chipsScroll: {
      gap: 6,
      paddingBottom: 10,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    chipActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    chipText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    chipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    emptyCard: {
      paddingVertical: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    propertyCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden',
    },
    propHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      gap: 10,
    },
    propThumbWrap: {
      width: 38,
      height: 38,
      borderRadius: 8,
      overflow: 'hidden',
    },
    propThumb: {
      width: 38,
      height: 38,
      borderRadius: 8,
    },
    propThumbPlaceholder: {
      width: 38,
      height: 38,
      borderRadius: 8,
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraCornerBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraCornerBadgeSmall: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineAmenityScroll: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 2,
      gap: 6,
    },
    inlineAmenityChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3.5,
      borderRadius: 999,
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.line,
    },
    inlineAmenityChipPhoto: {
      borderColor: 'rgba(16, 185, 129, 0.4)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    inlineAmenityText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    amenityPhotoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 8,
      borderRadius: 8,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
    },
    propertyName: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
      flexShrink: 1,
    },
    occPill: {
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    occPillText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    addressText: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    collapseBtn: {
      padding: 4,
    },
    propActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    propActionPillPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#10B981',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 7,
    },
    propActionPillPrimaryText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    propActionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 7,
    },
    propActionPillText: {
      color: colors.navy,
      fontSize: 11,
      fontWeight: '600',
    },
    unitsContainer: {
      padding: 10,
      gap: 8,
    },
    noUnitsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    noUnitsText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    unitCard: {
      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      padding: 10,
    },
    unitTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    unitLeftRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    checkbox: {
      width: 17,
      height: 17,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.inkSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: '#2563EB',
      borderColor: '#2563EB',
    },
    unitThumb: {
      width: 32,
      height: 32,
      borderRadius: 6,
    },
    unitThumbPlaceholder: {
      width: 32,
      height: 32,
      borderRadius: 6,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    unitNumText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    unitSpecsText: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    statusPill: {
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: 999,
    },
    statusPillGreen: {
      backgroundColor: 'rgba(16, 185, 129, 0.14)',
    },
    statusPillBlue: {
      backgroundColor: 'rgba(59, 130, 246, 0.14)',
    },
    statusPillAmber: {
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: '700',
    },
    unitGrid: {
      flexDirection: 'row',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      gap: 10,
    },
    unitGridCol: {
      flex: 1,
    },
    gridLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.3,
    },
    gridValue: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 2,
    },
    gridSub: {
      fontSize: 10.5,
      fontWeight: '500',
      color: colors.inkSoft,
    },
    inlineSwitchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: -2,
    },
    listingLabel: {
      fontSize: 11.5,
      fontWeight: '700',
    },
    unitFooter: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    unitBtn: {
      flex: 1,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.navy,
    },
    unitBtnPrimary: {
      flex: 1,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitBtnPrimaryText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    inspectionSection: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      overflow: 'hidden',
      marginTop: 4,
    },
    inspectionToggle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
    },
    inspectionToggleTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    inspectionList: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 10,
    },
    inspectionItem: {
      padding: 10,
      borderRadius: 8,
      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 24,
      maxHeight: '85%',
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: colors.navy,
    },
    row2: {
      flexDirection: 'row',
      gap: 10,
    },
    inputGroup: {
      marginBottom: 12,
    },
    inputLabel: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
      marginBottom: 5,
    },
    textInput: {
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.navy,
    },
    textArea: {
      minHeight: 74,
      textAlignVertical: 'top',
    },
    optionPill: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionPillActive: {
      borderColor: '#10B981',
      backgroundColor: 'rgba(16, 185, 129, 0.14)',
    },
    optionPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    optionPillTextActive: {
      color: '#10B981',
      fontWeight: '700',
    },
    conditionPillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    photoUploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: '#10B981',
    },
    photoUploadBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#10B981',
    },
    uploadedThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
    },
    removePhotoBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#EF4444',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtn: {
      backgroundColor: '#10B981',
      borderRadius: 9,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontWeight: '700',
    },
    dangerOutlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: '#FCA5A5',
      borderRadius: 9,
      paddingVertical: 10,
      marginTop: 8,
    },
    dangerOutlineBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#DC2626',
    },
    detailsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    detailsCell: {
      width: '48%',
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      padding: 10,
    },
    lightboxOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.88)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
