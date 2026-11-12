import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import {
  MapPin,
  Building2,
  Plus,
  X,
  Check,
  Sparkles,
  Layers,
  Home,
  CheckCircle2,
  Eye,
  Edit3,
  Trash2,
  Camera,
  Image as ImageIcon,
  Upload,
  ArrowRight,
  ArrowLeft,
  User,
  Phone,
  Mail,
  Search,
  ExternalLink,
} from 'lucide-react';
import { AddressDisplay } from '../../components/common/AddressDisplay';
import { GooglePlacesAddressPicker } from '../../components/GooglePlacesAddressPicker';
import { Property, PropertyAddress, Unit } from '../../types';
import { ButtonProcessing } from '../../components/common/Spinner';
import { uploadOrCompressImage } from '../../lib/imageUploader';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { sanitizeCountry } from '../../lib/addressUtils';
import { OnboardResidentModal } from '../../components/owner/OnboardResidentModal';
import { AddPropertyWizardModal } from '../../components/owner/AddPropertyWizardModal';
import {
  PROPERTY_TYPE_OPTIONS,
  getPropertyCategory,
  getDefaultPropertyStructure,
  isSingleUnitProperty,
  getUnitTypesForProperty,
  PropertyStructure,
} from '../../lib/propertyTypes';
import {
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  getCurrencySymbol,
  GLOBAL_CURRENCIES,
  normalizeCurrencyCode,
} from '../../lib/currencyService';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyAmount, getTableCurrencyHeader } from '../../components/common/CurrencyAmount';
import { resolveUnitOccupancy, matchesUnitRelational } from '../../lib/portfolioSelectors';

interface InspectionLog {
  id: string;
  unitId: string;
  unitNumber: string;
  propertyId: string;
  date: string;
  inspector: string;
  condition: 'excellent' | 'good' | 'fair' | 'needs_repair';
  notes: string;
  loggedAt: string;
}

interface UnitDraft {
  unitNumber: string;
  unitType: string;
  floor: string;
  areaSqFt: number;
  furnishing: 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished';
  rent: number;
  deposit: number;
  currency: string;
  electricityMeter?: string;
  images?: string[];
}

export const ManagedPropertiesPage: React.FC = () => {
  const {
    state,
    updateState,
    showToast,
    logAuditEvent,
    saveProperty,
    saveUnit,
    saveAgreement,
    saveTenancyRequest,
    saveTenant,
  } = useAppData();
  const { user } = useAuth();
  const { viewCurrency, convert, format } = useCurrency();

  // Photo viewer lightbox modal state
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{ title: string; url: string } | null>(null);
  const [expandedAmenities, setExpandedAmenities] = useState<Record<string, boolean>>({});

  const managerRecord = (state.propertyManagers || (state as any).managers || []).find(
    (m: any) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );
  const assignedPropertyId =
    (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId || '';
  const ownerId = user?.ownerId || (managerRecord as any)?.ownerId || '';

  // Manager's scoped properties
  const myProperties = useMemo(() => {
    let props = state.properties;
    if (ownerId) {
      props = props.filter((p) => p.ownerId === ownerId);
    }
    if (assignedPropertyId) {
      return props.filter((p) => p.id === assignedPropertyId || p.assignedManagerId === user?.id);
    }
    const explicitlyAssigned = props.filter((p) => p.assignedManagerId === user?.id);
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : props;
  }, [state.properties, ownerId, assignedPropertyId, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  // Manager's scoped units
  const myUnits = useMemo(() => {
    if (!ownerId && myPropertyIds.size === 0) return [];
    return state.units.filter((u) => {
      const matchOwner = ownerId ? u.ownerId === ownerId : false;
      const matchProp = Boolean(u.propertyId && myPropertyIds.has(u.propertyId));
      return matchOwner || matchProp;
    });
  }, [state.units, ownerId, myPropertyIds]);

  // Search and Category Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'residential' | 'commercial' | 'mixed'>('all');

  const filteredProperties = useMemo(() => {
    return myProperties.filter((p) => {
      const matchesCategory =
        categoryFilter === 'all' ||
        (p.propertyCategory || getPropertyCategory(p.propertyType)) === categoryFilter;

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = p.name.toLowerCase().includes(q);
      const addrText = typeof p.address === 'object' ? (p.address?.formattedAddress || '') : String(p.address || '');
      const addrMatch = addrText.toLowerCase().includes(q);
      const unitsInProp = myUnits.filter((u) => u.propertyId === p.id);
      const unitMatch = unitsInProp.some(
        (u) =>
          u.unitNumber.toLowerCase().includes(q) ||
          (u.tenant && u.tenant.toLowerCase().includes(q))
      );
      return nameMatch || addrMatch || unitMatch;
    });
  }, [myProperties, categoryFilter, searchQuery, myUnits]);

  // Onboard Resident Modal State
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [onboardUnitId, setOnboardUnitId] = useState<string | undefined>(undefined);
  const [onboardUnitIds, setOnboardUnitIds] = useState<string[] | undefined>(undefined);
  const [onboardPropertyId, setOnboardPropertyId] = useState<string | undefined>(undefined);
  const [selectedBulkUnits, setSelectedBulkUnits] = useState<Record<string, string[]>>({});

  // Unit Details Modal State
  const [viewingUnit, setViewingUnit] = useState<Unit | null>(null);

  // Unit Edit Modal State
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [editUnitType, setEditUnitType] = useState('2 BHK');
  const [editFloor, setEditFloor] = useState('1st Floor');
  const [editAreaSqFt, setEditAreaSqFt] = useState(1000);
  const [editFurnishing, setEditFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [editRent, setEditRent] = useState(0);
  const [editDeposit, setEditDeposit] = useState(0);
  const [editStatus, setEditStatus] = useState<'occupied' | 'vacant' | 'reserved' | 'maintenance'>('vacant');
  const [editElectricityMeter, setEditElectricityMeter] = useState('');
  const [editWaterMeter, setEditWaterMeter] = useState('');
  const [editUnitImages, setEditUnitImages] = useState<string[]>([]);
  const [isSavingUnitEdit, setIsSavingUnitEdit] = useState(false);

  // Add Unit to Existing Property Modal State
  const [addUnitProperty, setAddUnitProperty] = useState<Property | null>(null);
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitType, setNewUnitType] = useState('2 BHK');
  const [newUnitFloor, setNewUnitFloor] = useState('1st Floor');
  const [newUnitAreaSqFt, setNewUnitAreaSqFt] = useState(1000);
  const [newUnitFurnishing, setNewUnitFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [newUnitRent, setNewUnitRent] = useState(0);
  const [newUnitDeposit, setNewUnitDeposit] = useState(0);
  const [newUnitMeter, setNewUnitMeter] = useState('');
  const [newUnitImages, setNewUnitImages] = useState<string[]>([]);
  const [isAddingUnit, setIsAddingUnit] = useState(false);

  // Unit Inspection Log State
  const [inspectingUnit, setInspectingUnit] = useState<Unit | null>(null);
  const [inspCondition, setInspCondition] = useState<'excellent' | 'good' | 'fair' | 'needs_repair'>('good');
  const [inspNotes, setInspNotes] = useState('');
  const [inspDate, setInspDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingInspection, setIsSavingInspection] = useState(false);

  // Create Property Wizard Modal State
  const [isAddPropertyModalOpen, setIsAddPropertyModalOpen] = useState(false);

  // Handlers for Unit Details and Edit
  const openUnitDetails = (u: Unit) => {
    setViewingUnit(u);
  };

  const openUnitEdit = (u: Unit) => {
    setEditingUnit(u);
    setEditUnitNumber(u.unitNumber || '');
    const parentProp = state.properties.find((p) => p.id === u.propertyId);
    const validTypes = getUnitTypesForProperty(parentProp?.propertyType, u.unitType);
    setEditUnitType(u.unitType || validTypes[0] || '2 BHK');
    setEditFloor(u.floor || '1st Floor');
    setEditAreaSqFt(u.areaSqFt || 1000);
    setEditFurnishing(u.furnishing || 'Semi-Furnished');
    setEditRent(u.rent || 0);
    setEditDeposit(u.deposit || 0);
    const currentEffective = resolveUnitOccupancy(
      u,
      state.agreements,
      state.tenancyRequests,
      state.moveouts
    ).effectiveStatus;
    setEditStatus(currentEffective || u.status || 'vacant');
    setEditElectricityMeter(u.electricityMeter || '');
    setEditWaterMeter(u.waterMeter || '');
    setEditUnitImages(u.images && u.images.length > 0 ? [...u.images] : u.image ? [u.image] : []);
  };

  const handleSaveUnitEdit = async () => {
    if (!editingUnit) return;
    setIsSavingUnitEdit(true);
    try {
      const cleanNum = editUnitNumber.trim() || editingUnit.unitNumber;
      const updatedUnit: Unit = {
        ...editingUnit,
        unitNumber: cleanNum,
        unitType: editUnitType,
        floor: editFloor,
        areaSqFt: Number(editAreaSqFt) || 1000,
        furnishing: editFurnishing,
        rent: Number(editRent) || 0,
        deposit: Number(editDeposit) || 0,
        status: editStatus,
        electricityMeter: editElectricityMeter.trim() || undefined,
        waterMeter: editWaterMeter.trim() || undefined,
        images: editUnitImages.length > 0 ? editUnitImages : undefined,
        image: editUnitImages[0] || editingUnit.image,
      };

      await saveUnit(updatedUnit);
      showToast(`✓ Unit ${cleanNum} updated successfully.`);
      setEditingUnit(null);
      if (viewingUnit && viewingUnit.id === editingUnit.id) {
        setViewingUnit(updatedUnit);
      }
    } catch (err: any) {
      showToast(`❌ Failed to update unit: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsSavingUnitEdit(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    const target = state.units.find((u) => u.id === unitId);
    if (target && (target.status === 'occupied' || target.tenant)) {
      showToast('⚠️ Cannot delete an occupied unit. Please vacate the resident first.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete Unit ${target?.unitNumber || unitId}? This cannot be undone.`)) {
      return;
    }
    updateState((prev) => ({
      ...prev,
      units: prev.units.filter((u) => u.id !== unitId),
    }));
    showToast(`✓ Unit ${target?.unitNumber || unitId} deleted.`);
    setEditingUnit(null);
    setViewingUnit(null);
  };

  const handleToggleListing = (unitId: string) => {
    const targetUnit = state.units.find((u) => u.id === unitId);
    if (!targetUnit) return;
    const updated = { ...targetUnit, isListedPublicly: !targetUnit.isListedPublicly };
    saveUnit(updated);
    showToast(`Unit ${targetUnit.unitNumber} is now ${updated.isListedPublicly ? 'listed publicly' : 'hidden from public listings'}.`);
  };

  const handlePropertyPhotoUpload = async (prop: Property, file: File) => {
    try {
      showToast(`Optimizing property photo for ${prop.name}...`);
      const optimized = await uploadOrCompressImage(
        file,
        `properties/${prop.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      );
      const cleanExisting = (prop.images || []).filter((img) => !img.includes('unsplash.com'));
      const updatedProp: Property = {
        ...prop,
        images: [optimized, ...cleanExisting],
      };
      await saveProperty(updatedProp);
      showToast(`📸 Real photo saved for ${prop.name}!`);
    } catch (err: any) {
      showToast(`Upload failed: ${err?.message || 'Error processing image'}`);
    }
  };

  const handleUnitPhotoUpload = async (u: Unit, file: File) => {
    try {
      showToast(`Optimizing photo for Unit ${u.unitNumber}...`);
      const optimized = await uploadOrCompressImage(
        file,
        `units/${u.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      );
      const cleanExisting = (u.images || []).filter((img) => !img.includes('unsplash.com'));
      const updatedUnit: Unit = {
        ...u,
        images: [optimized, ...cleanExisting],
        image: optimized,
      };
      await saveUnit(updatedUnit);
      showToast(`📸 Photo saved for Unit ${u.unitNumber}!`);
    } catch (err: any) {
      showToast(`Upload failed: ${err?.message || 'Error processing image'}`);
    }
  };

  // Add Unit to Existing Property Handler
  const handleOpenAddUnit = (prop: Property) => {
    setAddUnitProperty(prop);
    const existingCount = myUnits.filter((u) => u.propertyId === prop.id).length;
    setNewUnitNumber(`Unit ${existingCount + 1}01`);
    const validTypes = getUnitTypesForProperty(prop.propertyType);
    setNewUnitType(validTypes[0] || '2 BHK');
    setNewUnitFloor('1st Floor');
    setNewUnitAreaSqFt(1000);
    setNewUnitFurnishing('Semi-Furnished');
    setNewUnitRent(25000);
    setNewUnitDeposit(50000);
    setNewUnitMeter(`MTR-${existingCount + 1}01`);
    setNewUnitImages([]);
  };

  const handleAddUnitToProperty = async () => {
    if (!addUnitProperty) return;
    setIsAddingUnit(true);
    try {
      const cleanNum = newUnitNumber.trim() || `Unit ${Date.now().toString().slice(-4)}`;
      const unitId = `unit-${Date.now()}`;
      const finalOwnerId = ownerId || addUnitProperty.ownerId || user?.id || '';

      const newUnitObj: Unit = {
        id: unitId,
        ownerId: finalOwnerId,
        propertyId: addUnitProperty.id,
        propertyName: addUnitProperty.name,
        country: sanitizeCountry(
          typeof addUnitProperty.address === 'object' ? addUnitProperty.address.country : addUnitProperty.country,
          typeof addUnitProperty.address === 'object' ? addUnitProperty.address.formattedAddress : addUnitProperty.address
        ),
        address:
          typeof addUnitProperty.address === 'object'
            ? addUnitProperty.address.formattedAddress
            : addUnitProperty.address,
        unitNumber: cleanNum,
        unitType: newUnitType,
        floor: newUnitFloor,
        areaSqFt: Number(newUnitAreaSqFt) || 1000,
        furnishing: newUnitFurnishing,
        rent: Number(newUnitRent) || 0,
        deposit: Number(newUnitDeposit) || 0,
        currency: getCurrencySymbol(addUnitProperty.currency) || DEFAULT_CURRENCY_SYMBOL,
        status: 'vacant',
        tenant: null,
        currentTenantId: null,
        isListedPublicly: true,
        electricityMeter: newUnitMeter.trim() || undefined,
        images: newUnitImages.length > 0 ? newUnitImages : addUnitProperty.images,
        image: newUnitImages[0] || addUnitProperty.images?.[0],
      };

      await saveUnit(newUnitObj);
      const updatedProp = { ...addUnitProperty, unitCount: (addUnitProperty.unitCount || 0) + 1 };
      await saveProperty(updatedProp);

      showToast(`✓ Unit ${cleanNum} added to ${addUnitProperty.name}.`);
      setAddUnitProperty(null);
      setNewUnitNumber('');
      setNewUnitImages([]);
    } catch (err: any) {
      showToast(`❌ Failed to add unit: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsAddingUnit(false);
    }
  };

  // Inspection Log Handler
  const handleSaveInspection = async () => {
    if (!inspectingUnit) return;
    setIsSavingInspection(true);
    try {
      const newLog: InspectionLog = {
        id: `INSP-${Date.now()}`,
        unitId: inspectingUnit.id,
        unitNumber: inspectingUnit.unitNumber,
        propertyId: inspectingUnit.propertyId || '',
        date: inspDate,
        inspector: user?.displayName || managerRecord?.name || 'Property Manager',
        condition: inspCondition,
        notes: inspNotes.trim() || `Routine inspection — condition: ${inspCondition}.`,
        loggedAt: new Date().toISOString(),
      };

      logAuditEvent({
        actor: newLog.inspector,
        actorRole: 'manager',
        action: 'Unit Inspection Logged',
        category: 'maintenance',
        propertyId: newLog.propertyId,
        unit: newLog.unitNumber,
        detail: `Unit ${newLog.unitNumber}: ${newLog.condition.toUpperCase()} — ${newLog.notes}`,
      }).catch(console.warn);

      if (isFirebaseConfigured) {
        await setDoc(doc(db, 'propertyInspections', newLog.id), newLog, { merge: true }).catch(console.warn);
      }

      showToast(`Inspection logged for Unit ${inspectingUnit.unitNumber} — ${inspCondition}.`);
      setInspectingUnit(null);
      setInspCondition('good');
      setInspNotes('');
    } finally {
      setIsSavingInspection(false);
    }
  };

  return (
    <div>
      {/* Filter and Search Bar with Add Property */}
      <div
        className="card"
        style={{
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', marginRight: '4px' }}>
            Category:
          </span>
          {(['all', 'residential', 'commercial', 'mixed'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`btn small ${categoryFilter === cat ? 'brass' : 'secondary'}`}
              onClick={() => setCategoryFilter(cat)}
              style={{ textTransform: 'capitalize', fontSize: '12px', padding: '4px 10px' }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
            <input
              type="text"
              placeholder="Search properties, units, tenants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                fontSize: '12.5px',
              }}
            />
          </div>
          <button
            type="button"
            className="btn brass"
            onClick={() => setIsAddPropertyModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Plus size={16} /> Add Property
          </button>
        </div>
      </div>

      {/* Properties List */}
      {filteredProperties.length === 0 ? (
        <div className="panel" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'var(--surface-sunken, #F1F5F9)',
              color: 'var(--ink-soft, #64748B)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Building2 size={28} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>
            No Managed Properties Found
          </h3>
          <p style={{ margin: '0 auto 20px', maxWidth: '460px', fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            {searchQuery
              ? 'No buildings matched your search filter. Clear your query to see all managed properties.'
              : 'You do not have any properties assigned yet. Click below to add a property and onboard units.'}
          </p>
          <button
            type="button"
            className="btn brass"
            onClick={() => setIsAddPropertyModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> Add First Property
          </button>
        </div>
      ) : (
        <div>
          {filteredProperties.map((p) => {
            const propUnits = myUnits.filter((u) => u.propertyId === p.id);
            const occupiedInProp = propUnits.filter(
              (u) => resolveUnitOccupancy(u, state.agreements, state.tenancyRequests, state.moveouts).effectiveStatus === 'occupied'
            ).length;
            const reservedInProp = propUnits.filter(
              (u) => resolveUnitOccupancy(u, state.agreements, state.tenancyRequests, state.moveouts).effectiveStatus === 'reserved'
            ).length;
            const isSingle = isSingleUnitProperty(p) || (p.unitCount === 1 && propUnits.length === 1 && propUnits[0].isWholeProperty);
            const singleUnit = isSingle ? (propUnits[0] || null) : null;
            const isSingleOccupied = singleUnit
              ? resolveUnitOccupancy(singleUnit, state.agreements, state.tenancyRequests, state.moveouts).effectiveStatus === 'occupied'
              : false;
            const totalUnits = propUnits.length > 0 ? propUnits.length : (p.unitCount || 1);
            const isFull = occupiedInProp === totalUnits && totalUnits > 0;

            return (
              <div key={p.id} className="panel" style={{ marginBottom: '24px' }}>
                {/* Property Card Header */}
                <div className="panel-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {(() => {
                      const realImages = (p.images || []).filter((img) => !img.includes('unsplash.com'));
                      const hasRealImage = realImages.length > 0;
                      return (
                        <div style={{ position: 'relative' }}>
                          <label
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              border: hasRealImage ? '1px solid var(--line)' : '1px dashed var(--line)',
                              background: hasRealImage ? 'var(--bg)' : 'var(--surface-sunken)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                            title={hasRealImage ? 'Click to change or update real photo' : 'Click to upload real property photo'}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handlePropertyPhotoUpload(p, f);
                              }}
                            />
                            {hasRealImage ? (
                              <img
                                src={realImages[0]}
                                alt={p.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <Building2 size={22} color="var(--primary)" />
                            )}
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                background: 'rgba(0,0,0,0.6)',
                                borderRadius: '4px 0 0 0',
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Upload or Change Photo"
                            >
                              <Camera size={10} color="#fff" />
                            </div>
                          </label>
                        </div>
                      );
                    })()}
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '17px', fontWeight: 800 }}>
                        {p.name}
                        {p.amenityPhotos && p.amenityPhotos.length > 0 && (
                          <span
                            className="badge green"
                            style={{ fontSize: '11px', padding: '2px 6px', fontWeight: 500 }}
                            title={`${p.amenityPhotos.length} amenities have photos`}
                          >
                            📷 {p.amenityPhotos.length} Amenity Photos
                          </span>
                        )}
                      </h3>
                      <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                        <MapPin size={13} style={{ flexShrink: 0 }} />
                        <AddressDisplay address={p.address} fallback="Address on file" />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {isSingle ? (
                      <>
                        <span className="badge" style={{ background: '#FAF0E6', color: '#8A5340', fontWeight: 600 }}>
                          🏡 Single Property Asset
                        </span>
                        <span className={`badge ${isSingleOccupied ? 'green' : 'amber'}`} style={{ fontWeight: 600 }}>
                          {isSingleOccupied ? 'Occupied' : 'Vacant'}
                        </span>
                        {!isSingleOccupied ? (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => {
                              setOnboardPropertyId(p.id);
                              setOnboardUnitId(singleUnit?.id);
                              setIsOnboardOpen(true);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            🔑 Lease Property
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            onClick={() => {
                              if (singleUnit) openUnitDetails(singleUnit);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={13} /> View Lease
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={`badge ${isFull ? 'green' : (occupiedInProp > 0 || reservedInProp > 0) ? 'blue' : 'grey'}`} style={{ fontWeight: 600 }}>
                          {occupiedInProp}/{totalUnits} occupied{reservedInProp > 0 ? ` • ${reservedInProp} reserved` : ''}{isFull ? ' • 100% Full' : ''}
                        </span>
                        <button
                          type="button"
                          className="btn brass small btn-mobile-full"
                          onClick={() => handleOpenAddUnit(p)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Plus size={13} /> Add Unit
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Property Body / Amenities & Units Table */}
                <div className="panel-body">
                  {p.amenities && p.amenities.length > 0 && (() => {
                    const isExpanded = Boolean(expandedAmenities[p.id]);
                    const limit = 4;
                    const hasMore = p.amenities.length > limit;
                    const visibleAmenities = isExpanded || !hasMore ? p.amenities : p.amenities.slice(0, limit);
                    const remainingCount = p.amenities.length - limit;

                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600 }}>Amenities:</span>
                        {visibleAmenities.map((am) => {
                          const hasPhoto = p.amenityPhotos?.find((ap) => ap.name === am);
                          return (
                            <span
                              key={am}
                              className="badge"
                              style={{
                                fontSize: '11.5px',
                                padding: '3px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: hasPhoto ? 'pointer' : 'default',
                                border: hasPhoto ? '1px solid var(--teal-border)' : '1px solid var(--line)',
                                background: hasPhoto ? 'var(--teal-light)' : 'var(--surface-sunken)',
                                color: hasPhoto ? 'var(--teal-primary)' : 'var(--ink-soft)',
                              }}
                              onClick={() => {
                                if (hasPhoto) {
                                  setPreviewPhotoModal({ title: `${p.name} — ${am}`, url: hasPhoto.image });
                                }
                              }}
                              title={hasPhoto ? 'Click to view amenity photo' : undefined}
                            >
                              {hasPhoto && '📷 '}
                              {am}
                            </span>
                          );
                        })}
                        {hasMore && (
                          <button
                            type="button"
                            className="badge"
                            style={{
                              fontSize: '11.5px',
                              padding: '3px 8px',
                              cursor: 'pointer',
                              background: 'var(--surface-sunken)',
                              border: '1px solid var(--line)',
                              color: 'var(--ink)',
                              fontWeight: 600,
                            }}
                            onClick={() => setExpandedAmenities((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                          >
                            {isExpanded ? 'Show less ▴' : `+${remainingCount} more ▾`}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {isSingle ? (
                    <div
                      style={{
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '20px',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Asset Classification</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px', color: 'var(--ink)' }}>
                            {singleUnit?.unitType || p.propertyType || 'Single Family House'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Rent</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px', color: 'var(--brass)' }}>
                            {getCurrencySymbol(singleUnit?.currency || p.currency || DEFAULT_CURRENCY_SYMBOL)}{(singleUnit?.rent || 0).toLocaleString()} / mo
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Security Deposit</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                            {getCurrencySymbol(singleUnit?.currency || p.currency || DEFAULT_CURRENCY_SYMBOL)}{(singleUnit?.deposit || 0).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Carpet Area & Furnishing</div>
                          <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>
                            {singleUnit?.areaSqFt ? `${singleUnit.areaSqFt} sq.ft • ` : ''}{singleUnit?.furnishing || 'Semi-Furnished'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Lease Status</div>
                          <div style={{ marginTop: '2px' }}>
                            <span className={`badge ${isSingleOccupied ? 'green' : 'amber'}`}>
                              {isSingleOccupied ? `Occupied by ${singleUnit?.tenant}` : 'Vacant (Available for Lease)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          {singleUnit?.unitNumber && singleUnit.unitNumber !== 'Entire House' ? `Unit Identifier: ${singleUnit.unitNumber} • ` : ''}
                          Managed and leased directly as an independent single-property asset.
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {singleUnit && (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => openUnitEdit(singleUnit)}
                            >
                              <Edit3 size={13} /> Edit Lease Specs
                            </button>
                          )}
                          {!isSingleOccupied ? (
                            <button
                              type="button"
                              className="btn brass small"
                              onClick={() => {
                                setOnboardPropertyId(p.id);
                                setOnboardUnitId(singleUnit?.id);
                                setIsOnboardOpen(true);
                              }}
                            >
                              🔑 Lease Property
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => singleUnit && openUnitDetails(singleUnit)}
                            >
                              <Eye size={13} /> View Lease & Resident
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : propUnits.length === 0 ? (
                    <div style={{ color: 'var(--ink-soft)', padding: '24px', textAlign: 'center' }}>
                      <p style={{ margin: '0 0 12px 0' }}>No units recorded for this property yet.</p>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => handleOpenAddUnit(p)}
                      >
                        <Plus size={13} /> Add First Unit
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Multi-Unit Bulk Leasing Action Bar if units are selected */}
                      {(() => {
                        const currentSelected = selectedBulkUnits[p.id] || [];
                        const vacantUnitsInProp = propUnits.filter((u) => u.status === 'vacant');
                        const allVacantSelected = vacantUnitsInProp.length > 0 && vacantUnitsInProp.every((u) => currentSelected.includes(u.id));
                        const selectedUnitsList = propUnits.filter((u) => currentSelected.includes(u.id));
                        const combinedRent = selectedUnitsList.reduce((acc, u) => acc + (u.rent || 0), 0);
                        const combinedDeposit = selectedUnitsList.reduce((acc, u) => acc + (u.deposit || 0), 0);

                        return (
                          <>
                            {currentSelected.length > 0 && (
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  background: '#FAF8F5',
                                  border: '1px solid var(--brass)',
                                  borderRadius: '6px',
                                  padding: '10px 16px',
                                  marginBottom: '12px',
                                  flexWrap: 'wrap',
                                  gap: '10px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  <span className="badge brass" style={{ fontWeight: 700 }}>
                                    {currentSelected.length} Vacant Units Selected
                                  </span>
                                  <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                                    Combined Monthly Rent: <b>{getCurrencySymbol(p.currency)}{combinedRent.toLocaleString()}</b> • Deposit: <b>{getCurrencySymbol(p.currency)}{combinedDeposit.toLocaleString()}</b>
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => setSelectedBulkUnits((prev) => ({ ...prev, [p.id]: [] }))}
                                  >
                                    Clear Selection
                                  </button>
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    onClick={() => {
                                      setOnboardPropertyId(p.id);
                                      setOnboardUnitIds(currentSelected);
                                      setOnboardUnitId(undefined);
                                      setIsOnboardOpen(true);
                                    }}
                                  >
                                    Bulk Lease Selected Units
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Desktop Table View */}
                            <div className="desktop-table-view">
                              <div className="table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th style={{ width: '38px', textAlign: 'center' }}>
                                        {vacantUnitsInProp.length > 0 && (
                                          <input
                                            type="checkbox"
                                            checked={allVacantSelected}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setSelectedBulkUnits((prev) => ({
                                                  ...prev,
                                                  [p.id]: vacantUnitsInProp.map((u) => u.id),
                                                }));
                                              } else {
                                                setSelectedBulkUnits((prev) => ({ ...prev, [p.id]: [] }));
                                              }
                                            }}
                                            title="Select all vacant units for bulk lease"
                                            style={{ cursor: 'pointer' }}
                                          />
                                        )}
                                      </th>
                                      <th>Unit</th>
                                      <th>Tenant</th>
                                      <th>{getTableCurrencyHeader('Rent', viewCurrency)}</th>
                                      <th>{getTableCurrencyHeader('Deposit', viewCurrency)}</th>
                                      <th>Status</th>
                                      <th>Listed</th>
                                      <th>Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {propUnits.map((u) => {
                                      const occ = resolveUnitOccupancy(
                                        u,
                                        state.agreements,
                                        state.tenancyRequests,
                                        state.moveouts
                                      );
                                      const isUnitVacant = u.status === 'vacant';
                                      const isChecked = (selectedBulkUnits[p.id] || []).includes(u.id);
                                      const unitEffectiveStatus = occ.effectiveStatus;
                                      const unitCover = (u.images && u.images[0]) || u.image;
                                      const occTenant = occ.activeAgreement?.tenant || occ.pendingRequest?.tenantName || u.tenant;

                                      return (
                                        <tr key={u.id}>
                                          <td style={{ width: '38px', textAlign: 'center', padding: '6px 8px' }}>
                                            {isUnitVacant ? (
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {
                                                  setSelectedBulkUnits((prev) => {
                                                    const current = prev[p.id] || [];
                                                    const next = current.includes(u.id)
                                                      ? current.filter((x) => x !== u.id)
                                                      : [...current, u.id];
                                                    return { ...prev, [p.id]: next };
                                                  });
                                                }}
                                                title="Select unit for bulk lease"
                                                style={{ cursor: 'pointer' }}
                                              />
                                            ) : (
                                              <span style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>—</span>
                                            )}
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                              {unitCover ? (
                                                <div
                                                  style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '6px',
                                                    overflow: 'hidden',
                                                    border: '1px solid var(--line)',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                  }}
                                                  onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber || u.id}`, url: unitCover })}
                                                  title="Click to view photo"
                                                >
                                                  <img src={unitCover} alt={`Unit ${u.unitNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </div>
                                              ) : (
                                                <label
                                                  style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '6px',
                                                    background: 'var(--surface-sunken)',
                                                    border: '1px dashed var(--line)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'var(--ink-soft)',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                  }}
                                                  title="Click to upload unit photo"
                                                >
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                      const f = e.target.files?.[0];
                                                      if (f) handleUnitPhotoUpload(u, f);
                                                    }}
                                                  />
                                                  <Camera size={14} />
                                                </label>
                                              )}
                                              <div>
                                                <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{u.unitNumber || u.id}</b>
                                                {u.unitType && (
                                                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>
                                                    {u.unitType}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td>
                                            {occTenant && (unitEffectiveStatus === 'occupied' || unitEffectiveStatus === 'reserved') ? (
                                              <span
                                                style={{
                                                  color: 'var(--ink)',
                                                  fontWeight: 600,
                                                }}
                                              >
                                                {occTenant}
                                              </span>
                                            ) : (
                                              <span style={{ color: 'var(--ink-soft)' }}>Vacant</span>
                                            )}
                                          </td>
                                          <td>
                                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                              <CurrencyAmount amount={u.rent} currency={u.currency || p.currency} />
                                            </div>
                                          </td>
                                          <td>
                                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                              <CurrencyAmount amount={u.deposit} currency={u.currency || p.currency} />
                                            </div>
                                          </td>
                                          <td>
                                            <span
                                              className={`badge ${unitEffectiveStatus === 'occupied'
                                                ? 'green'
                                                : unitEffectiveStatus === 'reserved'
                                                  ? 'amber'
                                                  : unitEffectiveStatus === 'maintenance'
                                                    ? 'grey'
                                                    : 'grey'
                                                }`}
                                            >
                                              {unitEffectiveStatus === 'occupied'
                                                ? 'Occupied'
                                                : unitEffectiveStatus === 'reserved'
                                                  ? 'Reserved'
                                                  : unitEffectiveStatus === 'maintenance'
                                                    ? 'Maintenance'
                                                    : 'Vacant'}
                                            </span>
                                          </td>
                                          <td>
                                            {unitEffectiveStatus === 'vacant' ? (
                                              <label
                                                className={`toggle ${u.isListedPublicly ? 'on' : ''}`}
                                                onClick={() => handleToggleListing(u.id)}
                                                title={u.isListedPublicly ? 'Listed publicly' : 'Unlisted'}
                                              >
                                                <span className="track" />
                                              </label>
                                            ) : null}
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <button
                                                type="button"
                                                className="btn secondary small"
                                                onClick={() => openUnitDetails(u)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                                                title="View Unit Details"
                                              >
                                                <Eye size={12} /> Details
                                              </button>
                                              <button
                                                type="button"
                                                className="btn secondary small"
                                                onClick={() => openUnitEdit(u)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                                                title="Edit Unit"
                                              >
                                                <Edit3 size={12} /> Edit
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* Mobile Card View (<=640px) */}
                      <div className="mobile-card-view" style={{ padding: '12px' }}>
                        {propUnits.map((u) => {
                          const occ = resolveUnitOccupancy(
                            u,
                            state.agreements,
                            state.tenancyRequests,
                            state.moveouts
                          );
                          const unitEffectiveStatus = occ.effectiveStatus;
                          const isVacant = unitEffectiveStatus === 'vacant';
                          const isOccupied = unitEffectiveStatus === 'occupied';
                          const unitCover = (u.images && u.images[0]) || u.image;
                          const occTenant = occ.activeAgreement?.tenant || occ.pendingRequest?.tenantName || u.tenant;

                          return (
                            <div key={u.id} className="staff-card" style={{ marginBottom: '12px' }}>
                              <div className="staff-card-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  {unitCover ? (
                                    <div
                                      style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        border: '1px solid var(--line)',
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber || u.id}`, url: unitCover })}
                                    >
                                      <img src={unitCover} alt={`Unit ${u.unitNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                  ) : (
                                    <label
                                      style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '6px',
                                        background: '#F0F2F5',
                                        border: '1px dashed #CBD2D9',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--ink-soft)',
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                      }}
                                      title="Click to upload unit photo"
                                    >
                                      <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) handleUnitPhotoUpload(u, f);
                                        }}
                                      />
                                      <Camera size={16} />
                                    </label>
                                  )}
                                  <div>
                                    <b style={{ fontSize: '15px', color: 'var(--ink)' }}>Unit {u.unitNumber}</b>
                                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                      {u.unitType ? `${u.unitType} • ` : ''}
                                      {occTenant ? `Tenant: ${occTenant}` : 'Vacant Unit'}
                                    </div>
                                  </div>
                                </div>
                                <span
                                  className={`badge ${isOccupied
                                    ? 'green'
                                    : unitEffectiveStatus === 'reserved'
                                      ? 'amber'
                                      : 'grey'
                                    }`}
                                >
                                  {unitEffectiveStatus === 'occupied'
                                    ? 'Occupied'
                                    : unitEffectiveStatus === 'reserved'
                                      ? 'Reserved'
                                      : unitEffectiveStatus === 'maintenance'
                                        ? 'Maintenance'
                                        : 'Vacant'}
                                </span>
                              </div>

                              <div
                                style={{
                                  margin: '10px 0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: 'var(--surface-sunken)',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--line)',
                                }}
                              >
                                <div>
                                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Rent: </span>
                                  <b style={{ fontSize: '13px' }}>
                                    {getCurrencySymbol(u.currency || p.currency)}
                                    {(u.rent || 0).toLocaleString()}
                                  </b>
                                  {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(u.currency || p.currency || DEFAULT_CURRENCY) && (
                                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>
                                      ~{format(convert(u.rent || 0, u.currency || p.currency || DEFAULT_CURRENCY, viewCurrency), viewCurrency)}
                                    </span>
                                  )}
                                </div>
                                {isVacant ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        color: u.isListedPublicly ? 'var(--ledger)' : 'var(--ink-soft)',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {u.isListedPublicly ? 'Listed' : 'Unlisted'}
                                    </span>
                                    <label
                                      className={`toggle ${u.isListedPublicly ? 'on' : ''}`}
                                      onClick={() => handleToggleListing(u.id)}
                                    >
                                      <span className="track" />
                                    </label>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>—</span>
                                )}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <button
                                  type="button"
                                  className="btn secondary small btn-mobile-full"
                                  onClick={() => openUnitDetails(u)}
                                >
                                  <Eye size={13} /> Details
                                </button>
                                <button
                                  type="button"
                                  className="btn secondary small btn-mobile-full"
                                  onClick={() => openUnitEdit(u)}
                                >
                                  <Edit3 size={13} /> Edit
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Unit to Existing Property Modal */}
      {addUnitProperty && (
        <div className="modal-backdrop" onClick={() => setAddUnitProperty(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: '520px', width: '92vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                  Add Unit to {addUnitProperty.name}
                </h3>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setAddUnitProperty(null)}
                style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Unit Identifier *</label>
                  <input
                    type="text"
                    placeholder="e.g. Unit 302 / Shop 5"
                    value={newUnitNumber}
                    onChange={(e) => setNewUnitNumber(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Unit Type</label>
                  <select
                    value={newUnitType}
                    onChange={(e) => setNewUnitType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    {getUnitTypesForProperty(addUnitProperty.propertyType).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Floor</label>
                  <input
                    type="text"
                    placeholder="e.g. 1st Floor / Ground"
                    value={newUnitFloor}
                    onChange={(e) => setNewUnitFloor(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Area (Sq Ft)</label>
                  <input
                    type="number"
                    value={newUnitAreaSqFt}
                    onChange={(e) => setNewUnitAreaSqFt(parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>
                    Monthly Rent ({getCurrencySymbol(addUnitProperty.currency)})
                  </label>
                  <input
                    type="number"
                    value={newUnitRent}
                    onChange={(e) => setNewUnitRent(parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>
                    Security Deposit ({getCurrencySymbol(addUnitProperty.currency)})
                  </label>
                  <input
                    type="number"
                    value={newUnitDeposit}
                    onChange={(e) => setNewUnitDeposit(parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Furnishing</label>
                  <select
                    value={newUnitFurnishing}
                    onChange={(e) => setNewUnitFurnishing(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    <option value="Unfurnished">Unfurnished</option>
                    <option value="Semi-Furnished">Semi-Furnished</option>
                    <option value="Fully Furnished">Fully Furnished</option>
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Electricity Meter</label>
                  <input
                    type="text"
                    placeholder="e.g. MTR-302"
                    value={newUnitMeter}
                    onChange={(e) => setNewUnitMeter(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setAddUnitProperty(null)}
                disabled={isAddingUnit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleAddUnitToProperty}
                disabled={isAddingUnit}
              >
                <ButtonProcessing
                  loading={isAddingUnit}
                  loadingText="Adding Unit..."
                  defaultText="Add Unit to Property"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Unit Modal */}
      {editingUnit && (
        <div className="modal-backdrop" onClick={() => setEditingUnit(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: '520px', width: '92vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                  Edit Unit {editingUnit.unitNumber}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  {editingUnit.propertyName || 'Managed Building'}
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setEditingUnit(null)}
                style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Unit Identifier *</label>
                  <input
                    type="text"
                    value={editUnitNumber}
                    onChange={(e) => setEditUnitNumber(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Unit Type</label>
                  <input
                    type="text"
                    value={editUnitType}
                    onChange={(e) => setEditUnitType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Floor</label>
                  <input
                    type="text"
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Area (Sq Ft)</label>
                  <input
                    type="number"
                    value={editAreaSqFt}
                    onChange={(e) => setEditAreaSqFt(parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>
                    Monthly Rent ({getCurrencySymbol(editingUnit.currency)})
                  </label>
                  <input
                    type="number"
                    value={editRent}
                    onChange={(e) => setEditRent(parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>
                    Security Deposit ({getCurrencySymbol(editingUnit.currency)})
                  </label>
                  <input
                    type="number"
                    value={editDeposit}
                    onChange={(e) => setEditDeposit(parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Furnishing</label>
                  <select
                    value={editFurnishing}
                    onChange={(e) => setEditFurnishing(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    <option value="Unfurnished">Unfurnished</option>
                    <option value="Semi-Furnished">Semi-Furnished</option>
                    <option value="Fully Furnished">Fully Furnished</option>
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="reserved">Reserved (Pending Invite)</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Electricity Meter</label>
                  <input
                    type="text"
                    value={editElectricityMeter}
                    onChange={(e) => setEditElectricityMeter(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Water Meter</label>
                  <input
                    type="text"
                    value={editWaterMeter}
                    onChange={(e) => setEditWaterMeter(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {!editingUnit.tenant && editingUnit.status !== 'occupied' && (
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => handleDeleteUnit(editingUnit.id)}
                    style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                  >
                    <Trash2 size={13} /> Delete Unit
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditingUnit(null)}
                  disabled={isSavingUnitEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn brass"
                  onClick={handleSaveUnitEdit}
                  disabled={isSavingUnitEdit}
                >
                  <ButtonProcessing
                    loading={isSavingUnitEdit}
                    loadingText="Saving..."
                    defaultText="Save Changes"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unit Details Modal */}
      {viewingUnit && (
        <div className="modal-backdrop" onClick={() => setViewingUnit(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: '580px', width: '92vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Unit {viewingUnit.unitNumber}
                </h3>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  {viewingUnit.propertyName || 'Managed Building'}
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setViewingUnit(null)}
                style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Photo Banner if available */}
              {((viewingUnit.images && viewingUnit.images[0]) || viewingUnit.image) && (
                <img
                  src={(viewingUnit.images && viewingUnit.images[0]) || viewingUnit.image}
                  alt={`Unit ${viewingUnit.unitNumber}`}
                  style={{ width: '100%', maxHeight: '180px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--line)' }}
                />
              )}

              {/* Status & Resident Card */}
              <div style={{ background: 'var(--surface-sunken)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>OCCUPANCY STATUS</span>
                  <span className={`badge ${viewingUnit.status === 'occupied' ? 'green' : viewingUnit.status === 'reserved' ? 'amber' : 'blue'}`}>
                    {(viewingUnit.status || 'VACANT').toUpperCase()}
                  </span>
                </div>
                {viewingUnit.tenant ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#10B981', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                      {viewingUnit.tenant.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{viewingUnit.tenant}</b>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Active Resident on File</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>
                    Currently vacant and ready for tenant placement.
                  </div>
                )}
              </div>

              {/* Specs & Financials Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600 }}>MONTHLY RENT</div>
                  <div style={{ fontSize: '17px', fontWeight: 800, marginTop: '2px', color: 'var(--ink)' }}>
                    {getCurrencySymbol(viewingUnit.currency)}{(viewingUnit.rent || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600 }}>SECURITY DEPOSIT</div>
                  <div style={{ fontSize: '17px', fontWeight: 800, marginTop: '2px', color: 'var(--ink)' }}>
                    {getCurrencySymbol(viewingUnit.currency)}{(viewingUnit.deposit || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ fontSize: '12.5px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Type: </span>
                  <b>{viewingUnit.unitType || 'Standard'}</b>
                </div>
                <div style={{ fontSize: '12.5px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Floor: </span>
                  <b>{viewingUnit.floor || '1st Floor'}</b>
                </div>
                <div style={{ fontSize: '12.5px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Area: </span>
                  <b>{viewingUnit.areaSqFt ? `${viewingUnit.areaSqFt} sq ft` : '1,000 sq ft'}</b>
                </div>
                <div style={{ fontSize: '12.5px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Furnishing: </span>
                  <b>{viewingUnit.furnishing || 'Semi-Furnished'}</b>
                </div>
                <div style={{ fontSize: '12.5px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Power Meter: </span>
                  <b>{viewingUnit.electricityMeter || '—'}</b>
                </div>
                <div style={{ fontSize: '12.5px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Water Meter: </span>
                  <b>{viewingUnit.waterMeter || '—'}</b>
                </div>
              </div>
            </div>

            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {viewingUnit.status === 'vacant' && (
                <button
                  type="button"
                  className="btn brass"
                  onClick={() => {
                    setOnboardUnitId(viewingUnit.id);
                    setOnboardPropertyId(viewingUnit.propertyId);
                    setViewingUnit(null);
                    setIsOnboardOpen(true);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={14} /> Onboard Resident
                </button>
              )}
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  const target = viewingUnit;
                  setViewingUnit(null);
                  openUnitEdit(target);
                }}
              >
                <Edit3 size={13} /> Edit Unit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4-Step Add Property & Configure Units Wizard (Exact same as Owner) */}
      <AddPropertyWizardModal
        isOpen={isAddPropertyModalOpen}
        onClose={() => setIsAddPropertyModalOpen(false)}
        creatorRole="manager"
        defaultOwnerId={ownerId}
      />

      {/* Inspection Log Modal */}
      {inspectingUnit && (
        <div className="modal-backdrop" onClick={() => setInspectingUnit(null)}>
          <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Log Inspection — Unit {inspectingUnit.unitNumber}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  {inspectingUnit.propertyName || 'Building Asset'}
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setInspectingUnit(null)}
                style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Inspection Date</label>
                <input
                  type="date"
                  value={inspDate}
                  onChange={(e) => setInspDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Condition</label>
                <select
                  value={inspCondition}
                  onChange={(e) => setInspCondition(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                >
                  <option value="excellent">Excellent — Pristine condition</option>
                  <option value="good">Good — Normal wear & tear</option>
                  <option value="fair">Fair — Minor cosmetic work needed</option>
                  <option value="needs_repair">Needs Repair — Maintenance dispatch required</option>
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Inspection Notes & Observations</label>
                <textarea
                  rows={4}
                  placeholder="Record fixtures, painting, appliances, or repair requirements..."
                  value={inspNotes}
                  onChange={(e) => setInspNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px' }}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary" onClick={() => setInspectingUnit(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleSaveInspection}
                disabled={isSavingInspection}
              >
                <ButtonProcessing
                  loading={isSavingInspection}
                  loadingText="Saving..."
                  defaultText="Save Inspection"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Onboard Resident Modal Integration for Manager */}
      <OnboardResidentModal
        isOpen={isOnboardOpen}
        onClose={() => {
          setIsOnboardOpen(false);
          setOnboardUnitId(undefined);
          setOnboardUnitIds(undefined);
          setOnboardPropertyId(undefined);
        }}
        entryContext="leasing"
        preselectedUnitId={onboardUnitId}
        preselectedUnitIds={onboardUnitIds}
        preselectedPropertyId={onboardPropertyId}
        onSuccess={(tenantName, unitLabel) => {
          showToast(`✓ Onboarding initiated for ${tenantName} (${unitLabel})!`);
          setIsOnboardOpen(false);
          setOnboardUnitId(undefined);
          setOnboardUnitIds(undefined);
          if (onboardPropertyId) {
            setSelectedBulkUnits((prev) => ({ ...prev, [onboardPropertyId]: [] }));
          }
          setOnboardPropertyId(undefined);
        }}
      />

      {/* Photo Lightbox / Preview Modal */}
      {previewPhotoModal && (
        <div className="modal-backdrop" onClick={() => setPreviewPhotoModal(null)} style={{ zIndex: 9999 }}>
          <div
            className="modal-card"
            style={{ maxWidth: '640px', width: '90%', padding: 0, overflow: 'hidden', background: '#111', borderRadius: '12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 18px',
                background: '#1c1c1e',
                color: '#fff',
                borderBottom: '1px solid #333',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{previewPhotoModal.title}</span>
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', padding: '2px 8px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ maxHeight: '75vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', background: '#000' }}>
              <img
                src={previewPhotoModal.url}
                alt={previewPhotoModal.title}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '6px' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
