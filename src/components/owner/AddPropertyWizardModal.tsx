import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { GooglePlacesAddressPicker } from '../GooglePlacesAddressPicker';
import { Property, Unit, PropertyAddress } from '../../types';
import { uploadOrCompressImage } from '../../lib/imageUploader';
import { sanitizeCountry } from '../../lib/addressUtils';
import { ButtonProcessing } from '../common/Spinner';
import {
  MapPin,
  Check,
  Building2,
  Camera,
  Upload,
  ChevronDown,
  Search,
} from 'lucide-react';
import {
  getCurrencySymbol,
  GLOBAL_CURRENCIES,
  normalizeCurrencyCode,
} from '../../lib/currencyService';
import {
  PROPERTY_TYPE_OPTIONS,
  getPropertyCategory,
  getDefaultPropertyStructure,
  getUnitTypesForProperty,
  PropertyStructure,
} from '../../lib/propertyTypes';

export interface UnitDraft {
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

export interface AddPropertyWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  creatorRole?: 'owner' | 'manager';
  defaultOwnerId?: string;
  onSuccess?: (createdProp: Property, createdUnits: Unit[]) => void;
}

export const AddPropertyWizardModal: React.FC<AddPropertyWizardModalProps> = ({
  isOpen,
  onClose,
  creatorRole = 'owner',
  defaultOwnerId,
  onSuccess,
}) => {
  const { state, showToast, saveProperty } = useAppData();
  const { user } = useAuth();
  const { viewCurrency, convert, format } = useCurrency();

  const managerRecord = (state.propertyManagers || (state as any).managers || []).find(
    (m: any) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );

  const effectiveOwnerId =
    defaultOwnerId ||
    (user?.role === 'manager'
      ? user?.ownerId || (managerRecord as any)?.ownerId || user?.id || ''
      : user?.id || '');

  const {
    currentPlanName,
    usage,
  } = usePlanLimits();

  const maxProperties = usage.properties.max;
  const maxUnits = usage.units.max;
  const isPropertyLimitReached = usage.properties.isFull && creatorRole !== 'manager';

  // 4-Step Stepper State
  const [modalStep, setModalStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmittingProp, setIsSubmittingProp] = useState(false);

  // Step 1: Identity & Structure
  const [propName, setPropName] = useState('');
  const [propType, setPropType] = useState('Apartment Building');
  const [propStructure, setPropStructure] = useState<PropertyStructure>('multi_unit');
  const [propCountry, setPropCountry] = useState('India');
  const [propAddress, setPropAddress] = useState<PropertyAddress | null>(null);
  const [propFloors, setPropFloors] = useState<number>(4);
  const [propYearBuilt, setPropYearBuilt] = useState<string>('');
  const [propAssignedManager, setPropAssignedManager] = useState<string>(
    creatorRole === 'manager' ? (user?.id || 'self') : ''
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Available Managers for selection
  const myPropertyManagers = useMemo(() => {
    return (state.propertyManagers || (state as any).managers || []).filter(
      (m: any) => m.ownerId === effectiveOwnerId
    );
  }, [state.propertyManagers, (state as any).managers, effectiveOwnerId]);

  const COUNTRY_OPTIONS = [
    { name: 'India', currency: '₹' },
    { name: 'United States', currency: '$' },
    { name: 'United Kingdom', currency: '£' },
    { name: 'United Arab Emirates', currency: 'AED' },
    { name: 'Canada', currency: '$' },
    { name: 'Australia', currency: '$' },
    { name: 'Singapore', currency: '$' },
    { name: 'Germany', currency: '€' },
    { name: 'France', currency: '€' },
    { name: 'Spain', currency: '€' },
    { name: 'Italy', currency: '€' },
    { name: 'Netherlands', currency: '€' },
    { name: 'Ireland', currency: '€' },
    { name: 'Switzerland', currency: 'CHF' },
    { name: 'Portugal', currency: '€' },
    { name: 'Japan', currency: '¥' },
    { name: 'Saudi Arabia', currency: 'SAR' },
    { name: 'Qatar', currency: 'QAR' },
    { name: 'South Africa', currency: 'ZAR' },
    { name: 'New Zealand', currency: '$' },
    { name: 'Malaysia', currency: 'MYR' },
    { name: 'Thailand', currency: '฿' },
    { name: 'Brazil', currency: 'R$' },
    { name: 'Mexico', currency: '$' },
    { name: 'Sweden', currency: 'SEK' },
    { name: 'Norway', currency: 'NOK' },
    { name: 'Denmark', currency: 'DKK' },
    { name: 'Poland', currency: 'PLN' },
    { name: 'Turkey', currency: 'TRY' },
    { name: 'South Korea', currency: '₩' },
    { name: 'Hong Kong', currency: 'HK$' },
    { name: 'Indonesia', currency: 'IDR' },
    { name: 'Philippines', currency: '₱' },
    { name: 'Vietnam', currency: '₫' },
    { name: 'Egypt', currency: 'EGP' },
    { name: 'Nigeria', currency: 'NGN' },
    { name: 'Kenya', currency: 'KES' },
    { name: 'Kuwait', currency: 'KWD' },
  ];

  const handleCountrySelect = (selectedCountry: string) => {
    setPropCountry(selectedCountry);
    const match = COUNTRY_OPTIONS.find((c) => c.name.toLowerCase() === selectedCountry.toLowerCase());
    if (match) {
      setPropCurrency(match.currency);
    }
  };

  // Step 2: Policies & Amenities
  const [propCurrency, setPropCurrency] = useState<string>('₹');
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [propRules, setPropRules] = useState({
    petsAllowed: true,
    smokingAllowed: false,
    sublettingAllowed: false,
    minLeaseMonths: 11,
    noticePeriodDays: 30,
  });
  const [propAmenities, setPropAmenities] = useState<string[]>([
    '24/7 Security',
    'Elevator',
    'Covered Parking',
    'Power Backup',
  ]);
  const [customAmenityInput, setCustomAmenityInput] = useState('');
  const [propAmenityPhotos, setPropAmenityPhotos] = useState<Record<string, string>>({});

  // Step 3: Single-Unit fields
  const [singleUnitType, setSingleUnitType] = useState('2 BHK');
  const [singleUnitLabel, setSingleUnitLabel] = useState('Entire House');
  const [singleUnitRent, setSingleUnitRent] = useState<number>(0);
  const [singleUnitDeposit, setSingleUnitDeposit] = useState<number>(0);
  const [singleUnitAreaSqFt, setSingleUnitAreaSqFt] = useState<number>(0);
  const [singleUnitFurnishing, setSingleUnitFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [singleUnitElectricityMeter, setSingleUnitElectricityMeter] = useState('');
  const [singleUnitWaterMeter, setSingleUnitWaterMeter] = useState('');

  // Step 3: Multi-Unit Bulk Generator
  const [unitsBuilderMode, setUnitsBuilderMode] = useState<'table' | 'bulk'>('table');
  const [bulkFloorsStart, setBulkFloorsStart] = useState<number>(1);
  const [bulkFloorsEnd, setBulkFloorsEnd] = useState<number>(3);
  const [bulkUnitsPerFloor, setBulkUnitsPerFloor] = useState<number>(4);
  const [bulkBaseRent, setBulkBaseRent] = useState<number>(0);
  const [bulkBaseDeposit, setBulkBaseDeposit] = useState<number>(0);
  const [bulkUnitType, setBulkUnitType] = useState<string>('2 BHK');
  const [bulkFurnishing, setBulkFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [bulkAreaSqFt, setBulkAreaSqFt] = useState<number>(0);
  const [bulkDefaultPhoto, setBulkDefaultPhoto] = useState<string | null>(null);

  const [initialUnits, setInitialUnits] = useState<UnitDraft[]>([]);

  // Step 4: Photos & Review
  const [propImages, setPropImages] = useState<string[]>([]);
  const [coverPhotoIndex, setCoverPhotoIndex] = useState<number>(0);

  // Photo viewer lightbox
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{ title: string; url: string } | null>(null);

  const handleAddCustomAmenity = () => {
    if (!customAmenityInput.trim()) return;
    const clean = customAmenityInput.trim();
    if (!propAmenities.includes(clean)) {
      setPropAmenities((prev) => [...prev, clean]);
      showToast(`Added custom amenity: "${clean}"`);
    }
    setCustomAmenityInput('');
  };

  const handleAmenityPhotoUpload = async (amenityName: string, file: File) => {
    try {
      showToast(`Optimizing photo for ${amenityName}...`);
      const optimized = await uploadOrCompressImage(
        file,
        `properties/amenities/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      );
      setPropAmenityPhotos((prev) => ({ ...prev, [amenityName]: optimized }));
      showToast(`📸 Photo uploaded for ${amenityName}`);
    } catch (err) {
      console.warn('Amenity photo upload error:', err);
    }
  };

  const handleRemoveAmenityPhoto = (amenityName: string) => {
    setPropAmenityPhotos((prev) => {
      const next = { ...prev };
      delete next[amenityName];
      return next;
    });
    showToast(`Photo removed for ${amenityName}`);
  };

  const handleUnitPhotoUpload = async (unitIndex: number, file: File) => {
    try {
      showToast(`Optimizing unit photo...`);
      const optimized = await uploadOrCompressImage(
        file,
        `units/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      );
      setInitialUnits((prev) =>
        prev.map((item, idx) =>
          idx === unitIndex ? { ...item, images: [...(item.images || []), optimized] } : item
        )
      );
      showToast(`📸 Photo attached to Unit ${initialUnits[unitIndex]?.unitNumber || unitIndex + 1}`);
    } catch (err) {
      console.warn('Unit photo upload error:', err);
    }
  };

  const handleRemoveUnitPhoto = (unitIndex: number, photoIndex: number) => {
    setInitialUnits((prev) =>
      prev.map((item, idx) =>
        idx === unitIndex ? { ...item, images: (item.images || []).filter((_, pIdx) => pIdx !== photoIndex) } : item
      )
    );
  };

  const handleGenerateBulkUnits = () => {
    const generated: UnitDraft[] = [];
    const startF = Math.max(1, bulkFloorsStart);
    const endF = Math.max(startF, bulkFloorsEnd);
    for (let f = startF; f <= endF; f++) {
      for (let u = 1; u <= bulkUnitsPerFloor; u++) {
        const uNum = `${f * 100 + u}`;
        generated.push({
          unitNumber: uNum,
          unitType: bulkUnitType,
          floor: `Floor ${f}`,
          areaSqFt: bulkAreaSqFt,
          furnishing: bulkFurnishing,
          rent: bulkBaseRent,
          deposit: bulkBaseDeposit,
          currency: propCurrency,
          electricityMeter: '',
          images: bulkDefaultPhoto ? [bulkDefaultPhoto] : [],
        });
      }
    }
    setInitialUnits(generated);
    setUnitsBuilderMode('table');
    showToast(`⚡ Generated ${generated.length} units automatically across ${endF - startF + 1} floors!`);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    showToast(`Optimizing ${files.length} property photo(s)...`);
    for (const file of Array.from(files)) {
      try {
        const optimized = await uploadOrCompressImage(
          file,
          `properties/gallery/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
        );
        setPropImages((prev) => [...prev, optimized]);
      } catch (err) {
        console.warn('Image upload error:', err);
      }
    }
  };

  const handleCreateProperty = async () => {
    const errs: Record<string, string> = {};
    if (!propName.trim()) {
      errs.propName = 'Property name is required.';
    }
    if (!propAddress) {
      errs.propAddress = 'Please select a confirmed Google Maps location.';
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setModalStep(1);
      showToast('Please provide required property information in Step 1.');
      return;
    }
    if (propStructure === 'multi_unit' && initialUnits.length === 0) {
      setModalStep(3);
      showToast('Please configure at least one unit in Step 3.');
      return;
    }

    const calculatedUnitCount = propStructure === 'single_unit' ? 1 : initialUnits.length;

    if (isPropertyLimitReached) {
      showToast(`⚠️ Property limit reached (${usage.properties.used}/${maxProperties} on ${currentPlanName} tier). Please upgrade your plan.`);
      return;
    }
    if (creatorRole !== 'manager' && maxUnits < 9999 && (usage.units.used + calculatedUnitCount) > maxUnits) {
      showToast(`⚠️ Adding this property would exceed your plan's unit limit (${usage.units.used + calculatedUnitCount} > ${maxUnits} on ${currentPlanName} tier).`);
      return;
    }

    setIsSubmittingProp(true);
    try {
      const propId = `prop_${Date.now()}`;
      const sortedImages = [...propImages];
      if (coverPhotoIndex > 0 && coverPhotoIndex < sortedImages.length) {
        const [cover] = sortedImages.splice(coverPhotoIndex, 1);
        sortedImages.unshift(cover);
      }

      const confirmedAddress: PropertyAddress = propAddress || {
        formattedAddress: propName.trim(),
        country: propCountry,
        city: '',
        placeId: '',
        lat: 0,
        lng: 0,
      };
      const resolvedCountry = sanitizeCountry(propCountry || confirmedAddress.country, confirmedAddress.formattedAddress);

      const targetManagerId =
        creatorRole === 'manager'
          ? (propAssignedManager === 'self' || propAssignedManager === user?.id ? user?.id : propAssignedManager || user?.id)
          : (propAssignedManager || undefined);

      const newProp: Property = {
        id: propId,
        ownerId: effectiveOwnerId,
        name: propName.trim(),
        propertyType: propType,
        propertyStructure: propStructure,
        propertyCategory: getPropertyCategory(propType),
        isSingleUnit: propStructure === 'single_unit',
        floorsCount: propFloors,
        yearBuilt: propYearBuilt ? Number(propYearBuilt) : undefined,
        assignedManagerId: targetManagerId,
        address: {
          ...confirmedAddress,
          country: resolvedCountry,
          formattedAddress: confirmedAddress.formattedAddress,
        },
        amenities: propAmenities,
        amenityPhotos: Object.entries(propAmenityPhotos)
          .filter(([_, img]) => !!img)
          .map(([name, image]) => ({ name, image })),
        rules: propRules,
        images: sortedImages,
        unitCount: calculatedUnitCount,
        occupied: 0,
        createdAt: new Date().toISOString(),
        country: resolvedCountry,
        currency: propCurrency,
      };

      let newUnits: Unit[] = [];
      if (propStructure === 'single_unit') {
        newUnits = [
          {
            id: `unit-${propId}-main`,
            propertyId: propId,
            propertyName: propName.trim(),
            country: resolvedCountry,
            address: confirmedAddress.formattedAddress,
            ownerId: effectiveOwnerId,
            unitNumber: singleUnitLabel.trim() || 'Entire House',
            unitType: singleUnitType,
            floor: 'Whole Property',
            areaSqFt: singleUnitAreaSqFt || 0,
            furnishing: singleUnitFurnishing,
            rent: singleUnitRent || 0,
            deposit: singleUnitDeposit || 0,
            currency: propCurrency,
            status: 'vacant',
            isListedPublicly: true,
            tenant: null,
            currentTenantId: null,
            electricityMeter: singleUnitElectricityMeter || undefined,
            waterMeter: singleUnitWaterMeter || undefined,
            isWholeProperty: true,
            images: sortedImages.length > 0 ? sortedImages : undefined,
            image: sortedImages.length > 0 ? sortedImages[0] : undefined,
          },
        ];
      } else {
        newUnits = initialUnits.map((u) => ({
          id: `unit-${propId}-${u.unitNumber}`,
          propertyId: propId,
          propertyName: propName.trim(),
          country: resolvedCountry,
          address: confirmedAddress.formattedAddress,
          ownerId: effectiveOwnerId,
          unitNumber: u.unitNumber,
          unitType: u.unitType,
          floor: u.floor,
          areaSqFt: u.areaSqFt,
          furnishing: u.furnishing,
          rent: u.rent,
          deposit: u.deposit,
          currency: propCurrency,
          status: 'vacant',
          isListedPublicly: true,
          tenant: null,
          currentTenantId: null,
          electricityMeter: u.electricityMeter || undefined,
          images: u.images && u.images.length > 0 ? u.images : undefined,
          image: u.images && u.images.length > 0 ? u.images[0] : undefined,
        }));
      }

      await saveProperty(newProp, newUnits);

      showToast(
        propStructure === 'single_unit'
          ? `Single-unit property "${newProp.name}" created successfully!`
          : `Property "${newProp.name}" with ${newUnits.length} configured units created successfully!`
      );

      if (onSuccess) {
        onSuccess(newProp, newUnits);
      }
      onClose();
    } finally {
      setIsSubmittingProp(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1050 }}>
      <div
        className="modal-card prop-wizard-modal"
        style={{ maxWidth: '1200px', width: '95vw', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header & Progress Stepper */}
        <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '18px 24px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Add New Property & Configure Units</h3>
            <div className="hint" style={{ marginTop: '2px', fontSize: '12px' }}>
              Complete property onboarding with structural hierarchy, operational policies, and unit inventory.
            </div>
          </div>
          <button type="button" className="btn secondary small" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Stepper Tabs Bar */}
        <div
          className="stepper-tabs-bar"
          style={{
            display: 'flex',
            background: '#FAFAF7',
            borderBottom: '1px solid var(--line)',
            padding: '0 24px',
            gap: '8px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {[
            { step: 1, label: 'Identity & Structure' },
            { step: 2, label: 'Policies & Amenities' },
            { step: 3, label: `Units Builder (${initialUnits.length})` },
            { step: 4, label: 'Photos & Review' },
          ].map((s) => {
            const isActive = modalStep === s.step;
            const isPassed = modalStep > s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => {
                  if (s.step > 1 && (!propName.trim() || !propAddress)) {
                    showToast('Please provide property name and address in Step 1 first.');
                    return;
                  }
                  setModalStep(s.step as any);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--brass)' : '2px solid transparent',
                  color: isActive ? 'var(--ink)' : isPassed ? 'var(--brass)' : 'var(--ink-soft)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '13px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {isPassed && <Check size={14} />}
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body - Dynamic by Step */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* STEP 1: Property Identity & Structure */}
          {modalStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px', color: fieldErrors.propName ? '#EF4444' : undefined }}>Property Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Maple Heights Residency, Tower A"
                  value={propName}
                  onChange={(e) => {
                    setPropName(e.target.value);
                    if (fieldErrors.propName) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.propName;
                        return next;
                      });
                    }
                  }}
                  style={{
                    fontSize: '14px',
                    padding: '10px 12px',
                    borderColor: fieldErrors.propName ? '#EF4444' : undefined,
                    boxShadow: fieldErrors.propName ? '0 0 0 1px #EF4444' : undefined,
                  }}
                />
                {fieldErrors.propName && (
                  <span style={{ color: '#EF4444', fontSize: '11.5px', marginTop: '4px', display: 'block', fontWeight: 500 }}>
                    ⚠️ {fieldErrors.propName}
                  </span>
                )}
              </div>

              <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px' }}>Country *</label>
                  <select
                    value={propCountry}
                    onChange={(e) => handleCountrySelect(e.target.value)}
                    style={{ padding: '9px 12px' }}
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({getCurrencySymbol(c.currency)})
                      </option>
                    ))}
                    <option value="Other">Other Country</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px' }}>Property Type</label>
                  <select
                    value={propType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPropType(val);
                      const defaultStruct = getDefaultPropertyStructure(val);
                      setPropStructure(defaultStruct);
                      const validTypes = getUnitTypesForProperty(val);
                      if (validTypes.length > 0) {
                        setSingleUnitType(validTypes[0]);
                        setBulkUnitType(validTypes[0]);
                      }
                    }}
                    style={{ padding: '9px 12px' }}
                  >
                    <optgroup label="Residential — Multi-Unit">
                      {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'residential' && o.defaultStructure === 'multi_unit').map((o) => (
                        <option key={o.label} value={o.label}>{o.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Residential — Single House / Villa">
                      {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'residential' && o.defaultStructure === 'single_unit').map((o) => (
                        <option key={o.label} value={o.label}>{o.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Commercial">
                      {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'commercial').map((o) => (
                        <option key={o.label} value={o.label}>{o.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Mixed-Use">
                      {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'mixed').map((o) => (
                        <option key={o.label} value={o.label}>{o.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Property Structure & Leasing Model Selector */}
              <div className="field" style={{ background: 'var(--surface-sunken)', padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '4px' }}>
                  Property Structure & Leasing Model *
                </label>
                <div className="hint" style={{ fontSize: '12px', marginBottom: '10px' }}>
                  Choose whether this asset is leased as a whole independent unit or divided into multiple rentable units.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '12px',
                      borderRadius: '8px',
                      border: propStructure === 'single_unit' ? '2px solid var(--brass)' : '1px solid var(--line)',
                      background: propStructure === 'single_unit' ? '#FAF8F5' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="propStructure"
                      checked={propStructure === 'single_unit'}
                      onChange={() => setPropStructure('single_unit')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>🏡 Single-Unit Asset</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Entire house, standalone 4BHK villa, bungalow, or single shop leased as 1 complete property.
                      </div>
                    </div>
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '12px',
                      borderRadius: '8px',
                      border: propStructure === 'multi_unit' ? '2px solid var(--brass)' : '1px solid var(--line)',
                      background: propStructure === 'multi_unit' ? '#FAF8F5' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="propStructure"
                      checked={propStructure === 'multi_unit'}
                      onChange={() => setPropStructure('multi_unit')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>🏢 Multi-Unit Complex</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Apartment building, gated villa community, or office plaza with multiple leasable units.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Assigned Property Manager</label>
                <select
                  value={propAssignedManager}
                  onChange={(e) => setPropAssignedManager(e.target.value)}
                  style={{ padding: '9px 12px' }}
                >
                  {creatorRole === 'manager' ? (
                    <>
                      <option value={user?.id || 'self'}>
                        Assigned to Me ({user?.displayName || (user as any)?.name || 'Property Manager'})
                      </option>
                      <option value="">Direct Owner Operations</option>
                    </>
                  ) : (
                    <option value="">None (Direct Owner Operations)</option>
                  )}
                  {myPropertyManagers.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.phone ? `(${m.phone})` : m.email ? `(${m.email})` : ''}
                    </option>
                  ))}
                </select>
                {creatorRole === 'owner' && myPropertyManagers.length === 0 && (
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                    No managers onboarded yet. You can onboard delegated property managers from the <b>Team & Managers</b> page.
                  </div>
                )}
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Google Maps Places Address *</label>
                <div className="hint" style={{ marginBottom: '6px', fontSize: '12px' }}>
                  Search and select location to auto-populate city, state, country, and latitude/longitude coordinates.
                </div>
                <GooglePlacesAddressPicker
                  onAddressSelect={(addr) => {
                    setPropAddress(addr);
                    if (fieldErrors.propAddress) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.propAddress;
                        return next;
                      });
                    }
                    if (addr.country) {
                      handleCountrySelect(addr.country);
                    }
                  }}
                />
                {fieldErrors.propAddress && (
                  <span style={{ color: '#EF4444', fontSize: '11.5px', marginTop: '6px', display: 'block', fontWeight: 500 }}>
                    ⚠️ {fieldErrors.propAddress}
                  </span>
                )}
                {propAddress && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px 14px',
                      background: 'var(--surface-sunken)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--line)',
                      fontSize: '12.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <MapPin size={16} color="var(--ledger)" />
                    <span>
                      <b>Confirmed Location:</b> {propAddress.formattedAddress} ({propAddress.country})
                    </span>
                  </div>
                )}
              </div>

              <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px' }}>Total Number of Floors</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={propFloors}
                    onChange={(e) => setPropFloors(Math.max(1, Number(e.target.value)))}
                    style={{ padding: '9px 12px' }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px' }}>Year Built / Commissioned</label>
                  <input
                    type="number"
                    min="1950"
                    max="2030"
                    placeholder="e.g. 2022"
                    value={propYearBuilt}
                    onChange={(e) => setPropYearBuilt(e.target.value)}
                    style={{ padding: '9px 12px' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Policies, Rules & Amenities */}
          {modalStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Currency Selection - Searchable Dropdown */}
              <div className="field" style={{ position: 'relative' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Operational Rental Currency</span>
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 400 }}>160+ Global Currencies</span>
                </label>

                {(() => {
                  const selectedCurrencyObj = GLOBAL_CURRENCIES.find(
                    (c) => c.symbol === propCurrency || c.code === propCurrency || (propCurrency === '$' && c.code === 'USD') || (propCurrency === '₹' && c.code === 'INR') || (propCurrency === '£' && c.code === 'GBP') || (propCurrency === '€' && c.code === 'EUR')
                  ) || GLOBAL_CURRENCIES[0];

                  const filteredCurrencies = GLOBAL_CURRENCIES.filter((c) => {
                    const q = currencySearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      c.code.toLowerCase().includes(q) ||
                      c.name.toLowerCase().includes(q) ||
                      c.country.toLowerCase().includes(q) ||
                      c.symbol.toLowerCase().includes(q)
                    );
                  });

                  return (
                    <div>
                      {/* Trigger Button */}
                      <div
                        onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          border: isCurrencyDropdownOpen ? '2px solid var(--primary)' : '1px solid var(--line)',
                          borderRadius: '8px',
                          background: 'var(--surface)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '20px', lineHeight: 1 }}>{selectedCurrencyObj.flag}</span>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>
                              {selectedCurrencyObj.code}
                            </span>
                            <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginLeft: '8px' }}>
                              {selectedCurrencyObj.name} ({selectedCurrencyObj.symbol}) • {selectedCurrencyObj.country}
                            </span>
                          </div>
                        </div>
                        <ChevronDown size={18} color="var(--ink-soft)" style={{ transform: isCurrencyDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                      </div>

                      {/* Dropdown with Search */}
                      {isCurrencyDropdownOpen && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: '4px',
                            zIndex: 1000,
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', background: 'var(--surface-sunken)' }}>
                            <div style={{ position: 'relative' }}>
                              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                              <input
                                type="text"
                                autoFocus
                                value={currencySearchQuery}
                                onChange={(e) => setCurrencySearchQuery(e.target.value)}
                                placeholder="Search by code, country, or currency name (e.g. USD, EUR, INR, Yen, Dirham)..."
                                style={{
                                  width: '100%',
                                  padding: '8px 10px 8px 30px',
                                  fontSize: '12.5px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--line)',
                                  outline: 'none',
                                  background: 'var(--surface)',
                                  color: 'var(--ink)',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>

                          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                            {filteredCurrencies.length === 0 ? (
                              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--ink-soft)' }}>
                                No currencies found matching "{currencySearchQuery}"
                              </div>
                            ) : (
                              filteredCurrencies.map((c) => {
                                const isSelected = selectedCurrencyObj.code === c.code;
                                return (
                                  <div
                                    key={c.code}
                                    onClick={() => {
                                      setPropCurrency(c.symbol || c.code);
                                      setIsCurrencyDropdownOpen(false);
                                      setCurrencySearchQuery('');
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 14px',
                                      cursor: 'pointer',
                                      background: isSelected ? 'rgba(47, 93, 80, 0.08)' : 'transparent',
                                      borderBottom: '1px solid var(--line-subtle, rgba(0,0,0,0.04))',
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isSelected) e.currentTarget.style.background = 'var(--surface-sunken)';
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span style={{ fontSize: '18px' }}>{c.flag}</span>
                                      <div>
                                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                                          {c.code}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--ink-soft)', marginLeft: '6px' }}>
                                          {c.name} • {c.country}
                                        </span>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary)' }}>
                                        {c.symbol}
                                      </span>
                                      {isSelected && <Check size={16} color="var(--primary)" />}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* House Rules & Lease Defaults */}
              <div
                style={{
                  background: '#FAFAF7',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  padding: '16px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>
                  Standard House Rules & Lease Policy
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={propRules.petsAllowed}
                      onChange={(e) => setPropRules({ ...propRules, petsAllowed: e.target.checked })}
                    />
                    🐾 Pets Permitted
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={propRules.smokingAllowed}
                      onChange={(e) => setPropRules({ ...propRules, smokingAllowed: e.target.checked })}
                    />
                    🚭 Smoking Permitted
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={propRules.sublettingAllowed}
                      onChange={(e) => setPropRules({ ...propRules, sublettingAllowed: e.target.checked })}
                    />
                    🤝 Subletting Allowed
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                      Standard Minimum Lease Duration
                    </label>
                    <select
                      value={propRules.minLeaseMonths}
                      onChange={(e) => setPropRules({ ...propRules, minLeaseMonths: Number(e.target.value) })}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    >
                      <option value={6}>6 Months</option>
                      <option value={11}>11 Months (Standard India)</option>
                      <option value={12}>12 Months (Standard Global)</option>
                      <option value={24}>24 Months</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                      Default Notice Period
                    </label>
                    <select
                      value={propRules.noticePeriodDays}
                      onChange={(e) => setPropRules({ ...propRules, noticePeriodDays: Number(e.target.value) })}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    >
                      <option value={15}>15 Days</option>
                      <option value={30}>30 Days</option>
                      <option value={60}>60 Days</option>
                      <option value={90}>90 Days</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Building Amenities */}
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Property Amenities & Perks</label>
                <div className="hint" style={{ marginBottom: '8px', fontSize: '12px' }}>
                  Select existing amenities or add custom perks unique to this property.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {[
                    '24/7 Security',
                    'Elevator',
                    'Covered Parking',
                    'Gymnasium',
                    'Swimming Pool',
                    'Power Backup',
                    'CCTV Surveillance',
                    'Intercom',
                    'Clubhouse',
                    'EV Charging Station',
                    'Visitor Parking',
                    'Water Softener',
                    'Rooftop Garden',
                    'Solar Water Heater',
                  ].map((am) => {
                    const isSelected = propAmenities.includes(am);
                    const hasPhoto = !!propAmenityPhotos[am];
                    return (
                      <span
                        key={am}
                        className={`badge ${isSelected ? 'green' : 'grey'}`}
                        style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => {
                          setPropAmenities((prev) =>
                            prev.includes(am) ? prev.filter((x) => x !== am) : [...prev, am]
                          );
                        }}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {hasPhoto && '📷 '}
                        {am}
                      </span>
                    );
                  })}
                  {propAmenities
                    .filter(
                      (a) =>
                        ![
                          '24/7 Security',
                          'Elevator',
                          'Covered Parking',
                          'Gymnasium',
                          'Swimming Pool',
                          'Power Backup',
                          'CCTV Surveillance',
                          'Intercom',
                          'Clubhouse',
                          'EV Charging Station',
                          'Visitor Parking',
                          'Water Softener',
                          'Rooftop Garden',
                          'Solar Water Heater',
                        ].includes(a)
                    )
                    .map((customAm) => {
                      const hasPhoto = !!propAmenityPhotos[customAm];
                      return (
                        <span
                          key={customAm}
                          className="badge green"
                          style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => setPropAmenities((prev) => prev.filter((x) => x !== customAm))}
                        >
                          ✓ {hasPhoto && '📷 '}{customAm} ✕
                        </span>
                      );
                    })}
                </div>

                {/* Add Custom Amenity Bar */}
                <div style={{ display: 'flex', gap: '8px', maxWidth: '460px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Add custom amenity (e.g. Badminton Court, Co-Working Lounge)"
                    value={customAmenityInput}
                    onChange={(e) => setCustomAmenityInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomAmenity();
                      }
                    }}
                    style={{ padding: '8px 12px', fontSize: '13px', flex: '1 1 200px' }}
                  />
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={handleAddCustomAmenity}
                    disabled={!customAmenityInput.trim()}
                  >
                    + Add Amenity
                  </button>
                </div>

                {/* Amenity Photos Showcase & Upload Section */}
                {propAmenities.length > 0 && (
                  <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <label style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Camera size={15} color="var(--ledger)" />
                          Upload Amenity Photos ({Object.keys(propAmenityPhotos).length}/{propAmenities.length} with photos)
                        </label>
                        <div className="hint" style={{ fontSize: '12px', marginTop: '2px' }}>
                          Attach photos for any active amenity (Gymnasium, Pool, Rooftop, etc.) to showcase on the property profile and public directory.
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        justifyContent: 'center',
                        justifyItems: 'center',
                        gap: '12px',
                        marginTop: '10px',
                      }}
                    >
                      {propAmenities.map((am) => {
                        const photo = propAmenityPhotos[am];
                        return (
                          <div
                            key={am}
                            style={{
                              border: photo ? '1px solid var(--teal-border)' : '1px dashed var(--line-strong)',
                              background: photo ? 'var(--teal-light)' : 'var(--surface-sunken)',
                              borderRadius: '8px',
                              padding: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              minHeight: '140px',
                              width: '100%',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--ink)' }}>
                                {am}
                              </span>
                              {photo && (
                                <span className="badge green" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                  ✓ Photo
                                </span>
                              )}
                            </div>

                            {photo ? (
                              <div style={{ position: 'relative', width: '100%', height: '100px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--line)' }}>
                                <img src={photo} alt={am} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: '4px',
                                    right: '4px',
                                    display: 'flex',
                                    gap: '4px',
                                  }}
                                >
                                  <label
                                    style={{
                                      background: 'rgba(0,0,0,0.7)',
                                      color: '#fff',
                                      fontSize: '10.5px',
                                      padding: '3px 6px',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                    title="Replace photo"
                                  >
                                    Replace
                                    <input
                                      type="file"
                                      accept="image/*"
                                      style={{ display: 'none' }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleAmenityPhotoUpload(am, file);
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAmenityPhoto(am)}
                                    style={{
                                      background: 'rgba(220, 53, 69, 0.85)',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '3px',
                                      padding: '3px 6px',
                                      fontSize: '10.5px',
                                      cursor: 'pointer',
                                    }}
                                    title="Remove photo"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label
                                style={{
                                  height: '80px',
                                  border: '1px dashed var(--line-strong)',
                                  borderRadius: '6px',
                                  background: 'var(--surface-sunken)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: 'var(--ink-soft)',
                                  fontSize: '11.5px',
                                  gap: '4px',
                                }}
                              >
                                <Camera size={18} />
                                <span>+ Upload Photo</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleAmenityPhotoUpload(am, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Units Setup & Bulk Generator */}
          {modalStep === 3 && (
            propStructure === 'single_unit' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div
                  style={{
                    background: '#FAF8F5',
                    border: '1px solid var(--brass)',
                    borderRadius: 'var(--radius)',
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="badge brass" style={{ fontSize: '12px' }}>🏡 Single-Unit Asset Mode</span>
                    <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Lease Terms & Property Specifications</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                    This entire property will be leased as a single unified asset (e.g. 4BHK house, luxury villa, standalone commercial facility) without managing internal sub-units.
                  </div>
                </div>

                <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Layout / House Type *</label>
                    <select
                      value={singleUnitType}
                      onChange={(e) => setSingleUnitType(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    >
                      {getUnitTypesForProperty(propType, singleUnitType).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Property Identifier / Unit Label</label>
                    <input
                      type="text"
                      value={singleUnitLabel}
                      onChange={(e) => setSingleUnitLabel(e.target.value)}
                      placeholder="e.g. Entire House, Main Villa, House #12"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Expected Monthly Rent ({propCurrency}) *</label>
                    <input
                      type="number"
                      min="0"
                      value={singleUnitRent === 0 ? '' : singleUnitRent}
                      onChange={(e) => setSingleUnitRent(Number(e.target.value))}
                      placeholder="e.g. 35000"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Security Deposit ({propCurrency})</label>
                    <input
                      type="number"
                      min="0"
                      value={singleUnitDeposit === 0 ? '' : singleUnitDeposit}
                      onChange={(e) => setSingleUnitDeposit(Number(e.target.value))}
                      placeholder="e.g. 70000"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Carpet Area (Sq.Ft)</label>
                    <input
                      type="number"
                      min="0"
                      value={singleUnitAreaSqFt || ''}
                      onChange={(e) => setSingleUnitAreaSqFt(Number(e.target.value))}
                      placeholder="e.g. 2200"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Furnishing State</label>
                    <select
                      value={singleUnitFurnishing}
                      onChange={(e) => setSingleUnitFurnishing(e.target.value as any)}
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    >
                      <option value="Unfurnished">Unfurnished</option>
                      <option value="Semi-Furnished">Semi-Furnished</option>
                      <option value="Fully Furnished">Fully Furnished</option>
                    </select>
                  </div>
                </div>

                <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Electricity Meter # (Optional)</label>
                    <input
                      type="text"
                      value={singleUnitElectricityMeter}
                      onChange={(e) => setSingleUnitElectricityMeter(e.target.value)}
                      placeholder="e.g. EB-887711"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Water Meter # (Optional)</label>
                    <input
                      type="text"
                      value={singleUnitWaterMeter}
                      onChange={(e) => setSingleUnitWaterMeter(e.target.value)}
                      placeholder="e.g. WTR-4422"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Stats Bar & Mode Toggles */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#FAFAF7',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    padding: '12px 18px',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>
                      Configured Units: <span style={{ color: 'var(--brass)' }}>{initialUnits.length} Units</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                      Projected Total Monthly Rent:{' '}
                      <b>
                        {propCurrency}
                        {initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0).toLocaleString()}
                        {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(propCurrency) && (
                          <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 500, marginLeft: '6px' }}>
                            (~{format(convert(initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0), propCurrency, viewCurrency), viewCurrency)})
                          </span>
                        )}
                      </b>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn ${unitsBuilderMode === 'table' ? 'brass' : 'secondary'} small`}
                      onClick={() => setUnitsBuilderMode('table')}
                    >
                      📋 Units Inventory Table
                    </button>
                    <button
                      type="button"
                      className={`btn ${unitsBuilderMode === 'bulk' ? 'brass' : 'secondary'} small`}
                      onClick={() => setUnitsBuilderMode('bulk')}
                    >
                      ⚡ Bulk Unit Generator
                    </button>
                  </div>
                </div>

                {/* Mode: Bulk Generator Box */}
                {unitsBuilderMode === 'bulk' && (
                  <div
                    style={{
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--line-strong)',
                      borderRadius: 'var(--radius)',
                      padding: '18px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ledger)', marginBottom: '4px' }}>
                      ⚡ Multi-Unit Automated Batch Generator
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '14px' }}>
                      Instantly generate all units across your floors. Existing units in the table will be replaced by this generated batch.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>From Floor</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={bulkFloorsStart}
                          onChange={(e) => setBulkFloorsStart(Number(e.target.value))}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>To Floor</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={bulkFloorsEnd}
                          onChange={(e) => setBulkFloorsEnd(Number(e.target.value))}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Units Per Floor</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={bulkUnitsPerFloor}
                          onChange={(e) => setBulkUnitsPerFloor(Number(e.target.value))}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Layout / Type</label>
                        <select
                          value={bulkUnitType}
                          onChange={(e) => setBulkUnitType(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        >
                          {getUnitTypesForProperty(propType, bulkUnitType).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Furnishing</label>
                        <select
                          value={bulkFurnishing}
                          onChange={(e) => setBulkFurnishing(e.target.value as any)}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        >
                          <option value="Unfurnished">Unfurnished</option>
                          <option value="Semi-Furnished">Semi-Furnished</option>
                          <option value="Fully Furnished">Fully Furnished</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Carpet Area (Sq Ft)</label>
                        <input
                          type="number"
                          value={bulkAreaSqFt}
                          onChange={(e) => setBulkAreaSqFt(Number(e.target.value))}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Base Rent ({propCurrency})</label>
                        <input
                          type="number"
                          min="0"
                          value={bulkBaseRent === 0 ? '' : bulkBaseRent}
                          placeholder="0"
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                            setBulkBaseRent(cleaned === '' ? 0 : Number(cleaned));
                          }}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Deposit ({propCurrency})</label>
                        <input
                          type="number"
                          min="0"
                          value={bulkBaseDeposit === 0 ? '' : bulkBaseDeposit}
                          placeholder="0"
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                            setBulkBaseDeposit(cleaned === '' ? 0 : Number(cleaned));
                          }}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Batch Unit Photo (Opt)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '34px' }}>
                          {bulkDefaultPhoto ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <img
                                src={bulkDefaultPhoto}
                                alt="Default layout"
                                style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--line)' }}
                              />
                              <button
                                type="button"
                                onClick={() => setBulkDefaultPhoto(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                              >
                                ✕ Remove
                              </button>
                            </div>
                          ) : (
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 8px',
                                background: '#fff',
                                border: '1px dashed #CBD2D9',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11.5px',
                                color: 'var(--ink-soft)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Camera size={13} />
                              <span>+ Attach Photo</span>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    try {
                                      const optimized = await uploadOrCompressImage(
                                        file,
                                        `units/bulk/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
                                      );
                                      setBulkDefaultPhoto(optimized);
                                    } catch (err) {
                                      console.warn('Bulk photo error:', err);
                                    }
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setUnitsBuilderMode('table')}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn brass small"
                        onClick={handleGenerateBulkUnits}
                      >
                        ⚡ Generate {(Math.max(1, bulkFloorsEnd) - Math.max(1, bulkFloorsStart) + 1) * bulkUnitsPerFloor} Units Now
                      </button>
                    </div>
                  </div>
                )}

                {/* Detailed Units Inventory Table with Horizontal Scrolling */}
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <div
                    className="table-wrap"
                    style={{
                      overflowX: 'auto',
                      overflowY: 'auto',
                      maxHeight: '360px',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    <table style={{ width: '100%', minWidth: '1060px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr style={{ background: '#FAFAF7', borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                          <th style={{ padding: '10px 12px', width: '85px', fontWeight: 600 }}>UNIT #</th>
                          <th style={{ padding: '10px 12px', width: '90px', fontWeight: 600 }}>PHOTO</th>
                          <th style={{ padding: '10px 12px', width: '125px', fontWeight: 600 }}>LAYOUT / TYPE</th>
                          <th style={{ padding: '10px 12px', width: '120px', fontWeight: 600 }}>FLOOR</th>
                          <th style={{ padding: '10px 12px', width: '90px', fontWeight: 600 }}>SQ. FT</th>
                          <th style={{ padding: '10px 12px', width: '155px', fontWeight: 600 }}>FURNISHING</th>
                          <th style={{ padding: '10px 12px', width: '115px', fontWeight: 600 }}>RENT ({propCurrency})</th>
                          <th style={{ padding: '10px 12px', width: '115px', fontWeight: 600 }}>DEPOSIT ({propCurrency})</th>
                          <th style={{ padding: '10px 12px', width: '125px', fontWeight: 600 }}>METER # (OPT)</th>
                          <th style={{ padding: '10px 12px', width: '45px', textAlign: 'center', fontWeight: 600 }}>✕</th>
                        </tr>
                      </thead>
                      <tbody>
                        {initialUnits.length === 0 ? (
                          <tr>
                            <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-soft)' }}>
                              No units configured yet. Click "+ Add Individual Unit" or use the "⚡ Bulk Unit Generator" above.
                            </td>
                          </tr>
                        ) : (
                          initialUnits.map((u, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="text"
                                  value={u.unitNumber}
                                  placeholder="101"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, unitNumber: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                {u.images && u.images.length > 0 ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div
                                      style={{
                                        position: 'relative',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        border: '1px solid var(--line)',
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber} Photo`, url: u.images![0] })}
                                      title="Click to view full photo"
                                    >
                                      <img src={u.images[0]} alt={`Unit ${u.unitNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveUnitPhoto(i, 0)}
                                      style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                                      title="Remove photo"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <label
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '5px 7px',
                                      background: '#fff',
                                      border: '1px dashed #CBD2D9',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      color: 'var(--ink-soft)',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title="Upload unit photo"
                                  >
                                    <Camera size={12} />
                                    <span>+ Photo</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      style={{ display: 'none' }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUnitPhotoUpload(i, file);
                                      }}
                                    />
                                  </label>
                                )}
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <select
                                  value={u.unitType}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, unitType: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                >
                                  {getUnitTypesForProperty(propType, u.unitType).map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="text"
                                  value={u.floor}
                                  placeholder="1st Floor"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, floor: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="number"
                                  value={u.areaSqFt}
                                  placeholder="1100"
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, areaSqFt: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <select
                                  value={u.furnishing}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, furnishing: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                >
                                  <option value="Unfurnished">Unfurnished</option>
                                  <option value="Semi-Furnished">Semi-Furnished</option>
                                  <option value="Fully Furnished">Fully Furnished</option>
                                </select>
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={u.rent === 0 ? '' : u.rent}
                                  placeholder="Rent"
                                  onWheel={(e) => (e.target as HTMLElement).blur()}
                                  onChange={(e) => {
                                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                    const val = cleaned === '' ? 0 : Number(cleaned);
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, rent: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={u.deposit === 0 ? '' : u.deposit}
                                  placeholder="Deposit"
                                  onWheel={(e) => (e.target as HTMLElement).blur()}
                                  onChange={(e) => {
                                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                    const val = cleaned === '' ? 0 : Number(cleaned);
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, deposit: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="text"
                                  value={u.electricityMeter || ''}
                                  placeholder="MTR-990"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setInitialUnits((prev) =>
                                      prev.map((item, idx) => (idx === i ? { ...item, electricityMeter: val } : item))
                                    );
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => setInitialUnits((prev) => prev.filter((_, idx) => idx !== i))}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--danger)',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    padding: '4px',
                                  }}
                                  title="Delete unit row"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#FAFAF7', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() =>
                        setInitialUnits([
                          ...initialUnits,
                          {
                            unitNumber: `${100 + initialUnits.length + 1}`,
                            unitType: '2 BHK',
                            floor: '1st Floor',
                            areaSqFt: 0,
                            furnishing: 'Semi-Furnished',
                            rent: bulkBaseRent || 0,
                            deposit: bulkBaseDeposit || 0,
                            currency: propCurrency,
                          },
                        ])
                      }
                    >
                      + Add Individual Unit
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      You can adjust rent, deposit, and listing status anytime per unit.
                    </span>
                  </div>
                </div>
              </div>
            )
          )}

          {/* STEP 4: Media, Photos & Review */}
          {modalStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Photo Upload Gallery */}
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Property Photos Gallery</label>
                <div className="hint" style={{ marginBottom: '8px', fontSize: '12px' }}>
                  Upload exterior, lobby, or amenity photos. Click the star icon to designate the cover photo for public listings.
                </div>
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px 20px',
                    border: '2px dashed var(--line-strong)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--surface-sunken)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--teal-primary)';
                    e.currentTarget.style.background = 'var(--surface)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--line-strong)';
                    e.currentTarget.style.background = 'var(--surface-sunken)';
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'var(--teal-light)',
                      color: 'var(--teal-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Upload size={22} />
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>
                    Click to upload photos <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>or drag and drop</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                    Select multiple PNG, JPG, or WEBP photos (up to 10MB each)
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                </label>

                {propImages.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
                    {propImages.map((img, idx) => {
                      const isCover = coverPhotoIndex === idx;
                      return (
                        <div
                          key={idx}
                          style={{
                            position: 'relative',
                            width: '100px',
                            height: '100px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: isCover ? '2px solid var(--brass)' : '1px solid var(--line)',
                            boxShadow: isCover ? '0 0 0 2px rgba(197, 160, 89, 0.25)' : 'none',
                          }}
                        >
                          <img
                            src={img}
                            alt="Property preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          {isCover && (
                            <span
                              style={{
                                position: 'absolute',
                                bottom: '0',
                                left: '0',
                                right: '0',
                                background: 'var(--brass)',
                                color: '#fff',
                                fontSize: '10px',
                                textAlign: 'center',
                                padding: '2px 0',
                                fontWeight: 600,
                              }}
                            >
                              COVER
                            </span>
                          )}
                          <div
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              display: 'flex',
                              gap: '4px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setCoverPhotoIndex(idx)}
                              title="Set as Cover Photo"
                              style={{
                                background: isCover ? 'var(--brass)' : 'rgba(0,0,0,0.6)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '3px',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              ★
                            </button>
                            <button
                              type="button"
                              onClick={() => setPropImages((prev) => prev.filter((_, i) => i !== idx))}
                              title="Delete photo"
                              style={{
                                background: 'rgba(220, 53, 69, 0.85)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '3px',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Amenity Photos Showcase in Review */}
              {Object.keys(propAmenityPhotos).length > 0 && (
                <div
                  style={{
                    background: '#FAFAF7',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    padding: '16px',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Camera size={15} color="var(--ledger)" />
                    <span>Amenity Photos Showcase ({Object.keys(propAmenityPhotos).length} amenities with photos)</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {Object.entries(propAmenityPhotos).map(([name, photo]) => (
                      <div
                        key={name}
                        style={{
                          position: 'relative',
                          width: '110px',
                          height: '80px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          border: '1px solid var(--line)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setPreviewPhotoModal({ title: name, url: photo })}
                        title="Click to view full photo"
                      >
                        <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#fff',
                            fontSize: '10px',
                            padding: '2px 4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Configured Units Showcase in Review */}
              {propStructure === 'single_unit' ? (
                <div
                  style={{
                    background: '#FAFAF7',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    padding: '16px',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={15} color="var(--ledger)" />
                    <span>Single-Unit Asset Configuration</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', fontSize: '12.5px' }}>
                    <div><b>Layout:</b> {singleUnitType}</div>
                    <div><b>Identifier:</b> {singleUnitLabel || 'Entire House'}</div>
                    <div><b>Monthly Rent:</b> {propCurrency}{singleUnitRent.toLocaleString()}/mo</div>
                    <div><b>Deposit:</b> {propCurrency}{singleUnitDeposit.toLocaleString()}</div>
                    <div><b>Area:</b> {singleUnitAreaSqFt} sq.ft</div>
                    <div><b>Furnishing:</b> {singleUnitFurnishing}</div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: '#FAFAF7',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    padding: '16px',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 size={15} color="var(--ledger)" />
                      <span>Configured Units ({initialUnits.length} units total)</span>
                    </div>
                    <span className="badge green" style={{ fontSize: '11px' }}>
                      {initialUnits.filter((u) => u.images && u.images.length > 0).length} with photos
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxHeight: '180px', overflowY: 'auto' }}>
                    {initialUnits.map((u, uIdx) => (
                      <div
                        key={uIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#fff',
                          border: '1px solid var(--line)',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '12px',
                        }}
                      >
                        {u.images && u.images.length > 0 ? (
                          <img
                            src={u.images[0]}
                            alt={`Unit ${u.unitNumber}`}
                            style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                            onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber}`, url: u.images![0] })}
                            title="Click to view full photo"
                          />
                        ) : (
                          <div style={{ width: '32px', height: '32px', background: '#F0F2F5', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}>
                            <Camera size={14} />
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>Unit {u.unitNumber} ({u.unitType})</div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>
                            {propCurrency}{Number(u.rent).toLocaleString()}/mo • {u.floor}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comprehensive Review Card */}
              <div
                style={{
                  background: '#FAFAF7',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  padding: '18px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)', marginBottom: '12px' }}>
                  Property Verification & Summary
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Property Name:</span>{' '}
                    <b>{propName || 'Unnamed Property'}</b>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Property Type:</span> <b>{propType}</b>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Country:</span>{' '}
                    <b>{propCountry || propAddress?.country || 'India'}</b>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Address:</span>{' '}
                    <span>{propAddress?.formattedAddress || 'No address chosen'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Assigned Manager:</span>{' '}
                    <b>
                      {creatorRole === 'manager' && (propAssignedManager === 'self' || propAssignedManager === user?.id)
                        ? `Assigned to Me (${user?.displayName || (user as any)?.name || 'Property Manager'})`
                        : myPropertyManagers.find((m: any) => m.id === propAssignedManager)?.name ||
                          'Owner Managed'}
                    </b>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Total Units:</span>{' '}
                    <b style={{ color: 'var(--brass)' }}>
                      {propStructure === 'single_unit' ? '1 Single Unit Asset' : `${initialUnits.length} Units`}
                    </b>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Projected Monthly Rent:</span>{' '}
                    <b>
                      {propCurrency}
                      {propStructure === 'single_unit'
                        ? (singleUnitRent || 0).toLocaleString()
                        : initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0).toLocaleString()}
                      {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(propCurrency) && (
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 500, marginLeft: '6px' }}>
                          (~{format(convert(propStructure === 'single_unit' ? (singleUnitRent || 0) : initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0), propCurrency, viewCurrency), viewCurrency)})
                        </span>
                      )}
                    </b>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Active Amenities:</span>{' '}
                    <span>{propAmenities.join(', ') || 'None selected'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Lease Policy:</span>{' '}
                    <span>
                      Min {propRules.minLeaseMonths}m lease • {propRules.noticePeriodDays}d notice •{' '}
                      {propRules.petsAllowed ? 'Pets OK' : 'No Pets'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Stepper Foot Controls */}
        <div
          className="modal-foot"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderTop: '1px solid var(--line)',
            background: '#FAFAF7',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <button
            type="button"
            className="btn secondary btn-mobile-full"
            onClick={() => {
              if (modalStep > 1) {
                setModalStep((prev) => (prev - 1) as any);
              } else {
                onClose();
              }
            }}
          >
            {modalStep === 1 ? 'Cancel' : '← Back'}
          </button>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {modalStep < 4 ? (
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={() => {
                  if (modalStep === 1) {
                    const errs: Record<string, string> = {};
                    if (!propName.trim()) {
                      errs.propName = 'Property name is required.';
                    }
                    if (!propAddress) {
                      errs.propAddress = 'Please search and select a confirmed location from Google Maps Places.';
                    }
                    if (Object.keys(errs).length > 0) {
                      setFieldErrors(errs);
                      showToast('Please complete the required highlighted fields.');
                      return;
                    }
                  }
                  if (modalStep === 3 && propStructure === 'multi_unit' && initialUnits.length === 0) {
                    showToast('Please add at least one unit before proceeding.');
                    return;
                  }
                  setModalStep((prev) => (prev + 1) as any);
                }}
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                className={`btn brass ${isSubmittingProp ? 'btn-processing' : ''}`}
                onClick={handleCreateProperty}
                disabled={isSubmittingProp}
                style={{ fontWeight: 600 }}
              >
                <ButtonProcessing
                  loading={isSubmittingProp}
                  loadingText="Creating Property..."
                  defaultText={propStructure === 'single_unit' ? '✓ Create Single Property' : `✓ Create Property & ${initialUnits.length} Units`}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Photo Lightbox / Preview Modal */}
      {previewPhotoModal && (
        <div className="modal-backdrop" onClick={() => setPreviewPhotoModal(null)} style={{ zIndex: 9999 }}>
          <div
            className="modal-card"
            style={{ maxWidth: '640px', width: '90%', padding: 0, overflow: 'hidden', background: '#111', borderRadius: '12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{previewPhotoModal.title}</span>
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', padding: '2px 8px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
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

