import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Image,
  Alert,
  LayoutAnimation,
  ActivityIndicator,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { ThemePalette } from '../theme/colors';
import { MobileProperty, MobileUnit, MobilePropertyAddress } from '../types';
import { uploadOrCompressImage } from '../lib/imageUploader';
import { pickSingleImage, pickMultipleImages } from '../lib/nativePicker';
import { usePlanLimits, ResourceQuotaType } from '../hooks/usePlanLimits';
import { PlanLimitModal } from '../components/PlanLimitModal';
import {
  GLOBAL_CURRENCIES,
  normalizeCurrencyCode,
  getCurrencySymbol,
  CurrencyMeta,
} from '../lib/currencyService';
import {
  PROPERTY_TYPE_OPTIONS,
  PropertyStructure,
  getDefaultPropertyStructure,
  getPropertyCategory,
  getUnitTypesForProperty,
} from '../lib/propertyTypes';

interface PropertyCreateWizardScreenProps {
  onBack?: () => void;
  onSuccess?: () => void;
  onNavigate?: (screenKey: string) => void;
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
  waterMeter?: string;
  images?: string[];
}

const COUNTRY_OPTIONS = [
  { name: 'India', currency: 'INR', symbol: '₹', defaultRent: 26000, defaultDeposit: 52000, city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', address: 'Plot 12, Indiranagar' },
  { name: 'United States', currency: 'USD', symbol: '$', defaultRent: 2200, defaultDeposit: 4400, city: 'Austin', state: 'Texas', postalCode: '78701', address: '100 Grand Avenue' },
  { name: 'United Kingdom', currency: 'GBP', symbol: '£', defaultRent: 1800, defaultDeposit: 3600, city: 'London', state: 'Greater London', postalCode: 'EC1A 1BB', address: '24 Baker Street' },
  { name: 'European Union', currency: 'EUR', symbol: '€', defaultRent: 1900, defaultDeposit: 3800, city: 'Berlin', state: 'Berlin', postalCode: '10115', address: 'Friedrichstraße 45' },
  { name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', defaultRent: 7500, defaultDeposit: 15000, city: 'Dubai', state: 'Dubai', postalCode: '00000', address: 'Marina Promenade Tower 2' },
  { name: 'Canada', currency: 'CAD', symbol: 'CA$', defaultRent: 2400, defaultDeposit: 4800, city: 'Toronto', state: 'Ontario', postalCode: 'M5V 2T6', address: '250 Front Street W' },
  { name: 'Australia', currency: 'AUD', symbol: 'A$', defaultRent: 2600, defaultDeposit: 5200, city: 'Sydney', state: 'New South Wales', postalCode: '2000', address: '50 George Street' },
  { name: 'Singapore', currency: 'SGD', symbol: 'S$', defaultRent: 3500, defaultDeposit: 7000, city: 'Singapore', state: 'Central', postalCode: '018981', address: '12 Marina Boulevard' },
];

const PREDEFINED_AMENITIES = [
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
];

const POPULAR_GOOGLE_PLACES = [
  {
    formattedAddress: 'Golf Course Extension Road, Sector 65, Gurugram, Haryana 122018, India',
    addressLine: 'Sector 65, Golf Course Extension Road',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122018',
    lat: 28.3973,
    lng: 77.0694,
  },
  {
    formattedAddress: 'Cyber City, DLF Phase 2, Gurugram, Haryana 122002, India',
    addressLine: 'Building 10, DLF Cyber City',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122002',
    lat: 28.4950,
    lng: 77.0895,
  },
  {
    formattedAddress: 'Whitefield Main Road, Prestige Shantiniketan, Bengaluru, Karnataka 560048, India',
    addressLine: 'Prestige Shantiniketan, Whitefield Main Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    postalCode: '560048',
    lat: 12.9859,
    lng: 77.7314,
  },
  {
    formattedAddress: 'Indiranagar 100 Feet Road, HAL 2nd Stage, Bengaluru, Karnataka 560038, India',
    addressLine: '100 Feet Road, HAL 2nd Stage, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    postalCode: '560038',
    lat: 12.9784,
    lng: 77.6408,
  },
  {
    formattedAddress: 'Hitec City, Madhapur, Hyderabad, Telangana 500081, India',
    addressLine: 'Cyber Towers, Hitec City, Madhapur',
    city: 'Hyderabad',
    state: 'Telangana',
    country: 'India',
    postalCode: '500081',
    lat: 17.4474,
    lng: 78.3762,
  },
  {
    formattedAddress: '350 5th Ave, Manhattan, New York, NY 10118, United States',
    addressLine: '350 5th Avenue, Midtown',
    city: 'New York',
    state: 'New York',
    country: 'United States',
    postalCode: '10118',
    lat: 40.7484,
    lng: -73.9857,
  },
  {
    formattedAddress: 'Downtown Dubai, Sheikh Mohammed bin Rashid Blvd, Dubai, UAE',
    addressLine: 'Boulevard Point, Downtown',
    city: 'Dubai',
    state: 'Dubai',
    country: 'United Arab Emirates',
    postalCode: '00000',
    lat: 25.1972,
    lng: 55.2744,
  },
  {
    formattedAddress: 'Canary Wharf, 25 Bank Street, London E14 5JP, United Kingdom',
    addressLine: '25 Bank Street, Canary Wharf',
    city: 'London',
    state: 'Greater London',
    country: 'United Kingdom',
    postalCode: 'E14 5JP',
    lat: 51.5033,
    lng: -0.0195,
  },
];

export const PropertyCreateWizardScreen: React.FC<PropertyCreateWizardScreenProps> = ({
  onBack,
  onSuccess,
  onNavigate,
}) => {
  const { state, planUsage, saveProperty } = useMobileAppData();
  const { user } = useMobileAuth();
  const { viewCurrency, getSymbol, format, convert } = useMobileCurrency();
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { usage, currentPlanName } = usePlanLimits();
  const [limitModalType, setLimitModalType] = useState<ResourceQuotaType | null>(null);

  const initialCountryOption =
    COUNTRY_OPTIONS.find((c) => c.currency === viewCurrency) ||
    COUNTRY_OPTIONS[0];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [refreshing, setRefreshing] = useState(false);

  // STEP 1 STATE: Identity & Structure
  const [propertyName, setPropertyName] = useState('');
  const [country, setCountry] = useState(initialCountryOption.name);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');

  const [propertyType, setPropertyType] = useState('Residential Apartment Complex');
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [propStructure, setPropStructure] = useState<PropertyStructure>('multi_unit');

  const [assignedManagerId, setAssignedManagerId] = useState('');
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);

  // Address & Places state
  const GOOGLE_MAPS_API_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    'AIzaSyCag0ilgHZgDX4cUuI1SOWstKXyK12vfZI';

  const [placesSearchQuery, setPlacesSearchQuery] = useState('');
  const [isPlacesDropdownOpen, setIsPlacesDropdownOpen] = useState(false);
  const [isPlacesLoading, setIsPlacesLoading] = useState(false);
  const [livePlaces, setLivePlaces] = useState<typeof POPULAR_GOOGLE_PLACES>([]);
  const placesDebounceRef = useRef<any>(null);
  const activePlacesQueryRef = useRef<string>('');

  const [confirmedAddress, setConfirmedAddress] = useState<MobilePropertyAddress>({
    formattedAddress: '',
    country: initialCountryOption.name,
    city: '',
    placeId: '',
    lat: 0,
    lng: 0,
  });

  const [floorsCount, setFloorsCount] = useState('4');
  const [yearBuilt, setYearBuilt] = useState('2022');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // STEP 2 STATE: Policies & Amenities
  const [propCurrency, setPropCurrency] = useState(initialCountryOption.currency);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');

  const [propRules, setPropRules] = useState({
    petsAllowed: false,
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

  // STEP 3 STATE: Units Builder
  // A. Single-Unit Asset Mode State
  const [singleUnitType, setSingleUnitType] = useState('Villa / House');
  const [singleUnitLabel, setSingleUnitLabel] = useState('Entire House');
  const [singleUnitRent, setSingleUnitRent] = useState(initialCountryOption.defaultRent || 35000);
  const [singleUnitDeposit, setSingleUnitDeposit] = useState(initialCountryOption.defaultDeposit || 70000);
  const [singleUnitAreaSqFt, setSingleUnitAreaSqFt] = useState(2200);
  const [singleUnitFurnishing, setSingleUnitFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [singleUnitElectricityMeter, setSingleUnitElectricityMeter] = useState('');
  const [singleUnitWaterMeter, setSingleUnitWaterMeter] = useState('');

  // B. Multi-Unit Mode State
  const [unitsBuilderMode, setUnitsBuilderMode] = useState<'table' | 'bulk'>('table');
  const [bulkFloorsStart, setBulkFloorsStart] = useState('1');
  const [bulkFloorsEnd, setBulkFloorsEnd] = useState('4');
  const [bulkUnitsPerFloor, setBulkUnitsPerFloor] = useState('2');
  const [bulkUnitType, setBulkUnitType] = useState('2 BHK');
  const [bulkFurnishing, setBulkFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [bulkAreaSqFt, setBulkAreaSqFt] = useState('1100');
  const [bulkBaseRent, setBulkBaseRent] = useState(String(initialCountryOption.defaultRent || 25000));
  const [bulkBaseDeposit, setBulkBaseDeposit] = useState(String(initialCountryOption.defaultDeposit || 50000));
  const [bulkDefaultPhoto, setBulkDefaultPhoto] = useState<string | null>(null);

  const [initialUnits, setInitialUnits] = useState<UnitDraft[]>([]);

  const [expandedUnitIndices, setExpandedUnitIndices] = useState<Record<number, boolean>>({});
  const [openUnitDropdown, setOpenUnitDropdown] = useState<{ idx: number; field: 'layout' | 'furnishing' } | null>(null);

  // STEP 4 STATE: Photos & Review
  const [propImages, setPropImages] = useState<string[]>([]);
  const [coverPhotoIndex, setCoverPhotoIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available managers from state
  const availableManagers = useMemo(() => {
    const list: { id: string; name: string; role: string; phone?: string; email?: string }[] = [];
    if (state.propertyManagers && state.propertyManagers.length > 0) {
      state.propertyManagers
        .filter((m) => !user?.id || !m.ownerId || m.ownerId === user.id)
        .forEach((m) => {
          list.push({
            id: m.id,
            name: m.name,
            role: m.role || 'Property Manager',
            phone: m.phone,
            email: m.email,
          });
        });
    }
    return list;
  }, [state.propertyManagers, user?.id]);

  // Google Places autocomplete search
  const searchGooglePlaces = async (query: string): Promise<typeof POPULAR_GOOGLE_PLACES> => {
    const trimmed = query.trim();
    if (!trimmed || !GOOGLE_MAPS_API_KEY) return [];

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        },
        body: JSON.stringify({ input: trimmed }),
      });

      if (!res.ok) return [];

      const data = await res.json();
      if (data.suggestions && Array.isArray(data.suggestions)) {
        return data.suggestions
          .filter((s: any) => s.placePrediction)
          .map((s: any) => {
            const pred = s.placePrediction;
            const text = pred.text?.text || pred.structuredFormat?.mainText?.text || '';
            const addressLine = pred.structuredFormat?.mainText?.text || text;
            const secondary = pred.structuredFormat?.secondaryText?.text || '';
            const parts = secondary.split(',').map((p: string) => p.trim());
            const city = parts[0] || '';
            const countryVal = parts[parts.length - 1] || '';

            return {
              formattedAddress: `${text}${secondary ? `, ${secondary}` : ''}`,
              addressLine,
              city,
              state: parts.length > 2 ? parts[1] : city,
              country: countryVal,
              postalCode: '',
              lat: 0,
              lng: 0,
            };
          });
      }
      return [];
    } catch {
      return [];
    }
  };

  const placesSuggestions = useMemo(() => {
    if (!placesSearchQuery.trim()) {
      return POPULAR_GOOGLE_PLACES.filter(
        (p) => !country || p.country.toLowerCase().includes(country.toLowerCase()) || country.toLowerCase().includes(p.country.toLowerCase())
      );
    }
    if (livePlaces.length > 0) return livePlaces;
    return POPULAR_GOOGLE_PLACES.filter((p) => {
      const q = placesSearchQuery.toLowerCase();
      return (
        p.formattedAddress.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.addressLine.toLowerCase().includes(q)
      );
    });
  }, [placesSearchQuery, livePlaces, country]);

  const handleSelectPlace = (place: (typeof POPULAR_GOOGLE_PLACES)[0]) => {
    setConfirmedAddress({
      formattedAddress: place.formattedAddress,
      country: place.country || country,
      city: place.city,
      placeId: `place_${Date.now()}`,
      lat: place.lat || 0,
      lng: place.lng || 0,
    });
    if (place.country) {
      setCountry(place.country);
      const matchCountry = COUNTRY_OPTIONS.find((c) => c.name.toLowerCase() === place.country.toLowerCase());
      if (matchCountry) {
        setPropCurrency(matchCountry.currency);
      }
    }
    setPlacesSearchQuery('');
    setIsPlacesDropdownOpen(false);
    if (fieldErrors.propAddress) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.propAddress;
        return next;
      });
    }
  };

  const handleSelectCustomQueryAsLocation = () => {
    const trimmed = placesSearchQuery.trim();
    if (!trimmed) return;
    setConfirmedAddress({
      formattedAddress: trimmed,
      country,
      city: '',
      placeId: `custom_${Date.now()}`,
      lat: 0,
      lng: 0,
    });
    setPlacesSearchQuery('');
    setIsPlacesDropdownOpen(false);
    if (fieldErrors.propAddress) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.propAddress;
        return next;
      });
    }
  };

  const handleCountrySelect = (cName: string, cCurrency: string) => {
    setCountry(cName);
    setPropCurrency(cCurrency);
    setIsCountryDropdownOpen(false);
    const preset = COUNTRY_OPTIONS.find((c) => c.name === cName);
    if (preset) {
      setSingleUnitRent(preset.defaultRent);
      setSingleUnitDeposit(preset.defaultDeposit);
      setBulkBaseRent(String(preset.defaultRent));
      setBulkBaseDeposit(String(preset.defaultDeposit));
      setInitialUnits((prev) =>
        prev.map((u) => ({
          ...u,
          currency: preset.currency,
          rent: preset.defaultRent,
          deposit: preset.defaultDeposit,
        }))
      );
    }
  };

  // Property type selection handler
  const handlePropertyTypeSelect = (selectedLabel: string) => {
    setPropertyType(selectedLabel);
    const defStructure = getDefaultPropertyStructure(selectedLabel);
    setPropStructure(defStructure);
    if (defStructure === 'single_unit') {
      setFloorsCount('2');
    }
    const validTypes = getUnitTypesForProperty(selectedLabel);
    if (validTypes.length > 0) {
      setSingleUnitType(validTypes[0]);
      setBulkUnitType(validTypes[0]);
    }
    setIsTypeDropdownOpen(false);
  };

  // Bulk Generator Execution
  const handleGenerateBulkUnits = () => {
    const startF = Math.max(1, parseInt(bulkFloorsStart, 10) || 1);
    const endF = Math.max(startF, parseInt(bulkFloorsEnd, 10) || 1);
    const perF = Math.max(1, Math.min(20, parseInt(bulkUnitsPerFloor, 10) || 2));
    const baseR = Math.max(0, parseInt(bulkBaseRent, 10) || 0);
    const baseD = Math.max(0, parseInt(bulkBaseDeposit, 10) || 0);
    const area = Math.max(0, parseInt(bulkAreaSqFt, 10) || 0);

    const generated: UnitDraft[] = [];
    for (let floorNum = startF; floorNum <= endF; floorNum++) {
      const floorLabel =
        floorNum === 1 ? '1st Floor' : floorNum === 2 ? '2nd Floor' : floorNum === 3 ? '3rd Floor' : `${floorNum}th Floor`;

      for (let unitIdx = 1; unitIdx <= perF; unitIdx++) {
        const unitNumber = `${floorNum}${unitIdx.toString().padStart(2, '0')}`;
        generated.push({
          unitNumber,
          unitType: bulkUnitType,
          floor: floorLabel,
          areaSqFt: area,
          furnishing: bulkFurnishing,
          rent: baseR,
          deposit: baseD,
          currency: propCurrency,
          electricityMeter: `MTR-${unitNumber}`,
          images: bulkDefaultPhoto ? [bulkDefaultPhoto] : [],
        });
      }
    }

    setInitialUnits(generated);
    setUnitsBuilderMode('table');
    Alert.alert('Batch Units Generated! ⚡', `${generated.length} units have been created in your inventory.`);
  };

  // Unit row management
  const handleAddIndividualUnit = () => {
    const nextNum = 100 + initialUnits.length + 1;
    setInitialUnits((prev) => [
      ...prev,
      {
        unitNumber: `${nextNum}`,
        unitType: '2 BHK',
        floor: '1st Floor',
        areaSqFt: 1100,
        furnishing: 'Semi-Furnished',
        rent: parseInt(bulkBaseRent, 10) || 25000,
        deposit: parseInt(bulkBaseDeposit, 10) || 50000,
        currency: propCurrency,
        electricityMeter: `MTR-${nextNum}`,
      },
    ]);
  };

  const handleDeleteUnit = (idx: number) => {
    setInitialUnits((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUploadUnitPhoto = async (idx: number) => {
    try {
      const picked = await pickSingleImage({ quality: 0.8 });
      if (picked) {
        const optimized = await uploadOrCompressImage(
          picked.file || picked.uri,
          `units/${Date.now()}_unit_${idx}`
        );
        setInitialUnits((prev) =>
          prev.map((item, i) =>
            i === idx ? { ...item, images: [optimized] } : item
          )
        );
      }
    } catch (err) {
      console.warn('Unit photo upload error:', err);
    }
  };

  const handleRemoveUnitPhoto = (idx: number) => {
    setInitialUnits((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, images: [] } : item))
    );
  };

  // Amenity photo upload
  const handleUploadAmenityPhoto = async (amName: string) => {
    try {
      const picked = await pickSingleImage({ quality: 0.8 });
      if (picked) {
        const optimized = await uploadOrCompressImage(
          picked.file || picked.uri,
          `amenities/${Date.now()}_${amName.replace(/[^a-zA-Z0-9]/g, '_')}`
        );
        setPropAmenityPhotos((prev) => ({ ...prev, [amName]: optimized }));
      }
    } catch (err) {
      console.warn('Amenity photo upload error:', err);
    }
  };

  const handleRemoveAmenityPhoto = (amName: string) => {
    setPropAmenityPhotos((prev) => {
      const next = { ...prev };
      delete next[amName];
      return next;
    });
  };

  const handleAddCustomAmenity = () => {
    const trimmed = customAmenityInput.trim();
    if (!trimmed) return;
    if (!propAmenities.includes(trimmed)) {
      setPropAmenities((prev) => [...prev, trimmed]);
    }
    setCustomAmenityInput('');
  };

  // Gallery photo upload
  const handleUploadGalleryPhotos = async () => {
    try {
      const pickedList = await pickMultipleImages({ quality: 0.8 });
      if (pickedList.length > 0) {
        const optimizedList: string[] = [];
        for (const item of pickedList) {
          const opt = await uploadOrCompressImage(
            item.file || item.uri,
            `properties/gallery/${Date.now()}_${item.name || 'photo'}`
          );
          optimizedList.push(opt);
        }
        setPropImages((prev) => [...prev, ...optimizedList]);
      }
    } catch (err) {
      console.warn('Gallery upload error:', err);
    }
  };

  // Projected metrics
  const totalProjectedMonthlyRent = useMemo(() => {
    if (propStructure === 'single_unit') {
      return singleUnitRent || 0;
    }
    return initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0);
  }, [propStructure, singleUnitRent, initialUnits]);

  // Step 1 Validation & Progression
  const handleStep1Next = () => {
    const errors: Record<string, string> = {};
    if (!propertyName.trim()) {
      errors.propName = 'Property name is required.';
    }
    if (!confirmedAddress?.formattedAddress) {
      errors.propAddress = 'Location is required. Please search and select from Google Maps Places.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      Alert.alert('Required Information Missing', 'Please fill the highlighted fields in Step 1.');
      return;
    }
    setFieldErrors({});
    setStep(2);
  };

  // Step 3 Validation & Progression
  const handleStep3Next = () => {
    if (propStructure === 'multi_unit' && initialUnits.length === 0) {
      Alert.alert('No Units Configured', 'Please add at least one unit or generate units using the Bulk Generator.');
      return;
    }
    if (propStructure === 'single_unit' && (!singleUnitRent || singleUnitRent <= 0)) {
      Alert.alert('Expected Rent Missing', 'Please specify expected monthly rent for this single-unit property.');
      return;
    }
    setStep(4);
  };

  // Final Publish Handler (Parity with Web PropertiesPage handleCreateProperty)
  const handleSaveAndPublish = async () => {
    if (!user) return;
    const effectiveOwnerId = user.role === 'manager' && user.ownerId ? user.ownerId : user.id;

    // Check Plan Limits
    if (usage.properties.isFull) {
      setLimitModalType('properties');
      return;
    }
    const unitCountToRegister = propStructure === 'single_unit' ? 1 : initialUnits.length;
    if (usage.units.max < 9999 && usage.units.used + unitCountToRegister > usage.units.max) {
      setLimitModalType('units');
      return;
    }

    setIsSubmitting(true);
    try {
      const propId = `prop_${Date.now()}`;
      const sortedImages = [...propImages];
      if (coverPhotoIndex > 0 && coverPhotoIndex < sortedImages.length) {
        const [cover] = sortedImages.splice(coverPhotoIndex, 1);
        sortedImages.unshift(cover);
      }

      const newProp: MobileProperty = {
        id: propId,
        ownerId: effectiveOwnerId,
        name: propertyName.trim(),
        propertyType,
        propertyStructure: propStructure,
        propertyCategory: getPropertyCategory(propertyType),
        isSingleUnit: propStructure === 'single_unit',
        floorsCount: parseInt(floorsCount, 10) || 1,
        yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : undefined,
        assignedManagerId: user.role === 'manager' ? user.id : (assignedManagerId || undefined),
        address: confirmedAddress,
        country,
        currency: propCurrency,
        amenities: propAmenities,
        amenityPhotos: Object.entries(propAmenityPhotos)
          .filter(([name]) => propAmenities.includes(name))
          .map(([name, image]) => ({ name, image })),
        images: sortedImages,
        coverPhotoIndex: 0,
        rules: propRules,
        unitCount: unitCountToRegister,
        occupied: 0,
        createdAt: new Date().toISOString(),
      };

      let newUnitsList: MobileUnit[] = [];
      if (propStructure === 'single_unit') {
        newUnitsList = [
          {
            id: `unit-${propId}-main`,
            propertyId: propId,
            propertyName: propertyName.trim(),
            country,
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
            images: sortedImages.length > 0 ? sortedImages : [],
            image: sortedImages[0] || '',
          },
        ];
      } else {
        newUnitsList = initialUnits.map((u) => ({
          id: `unit-${propId}-${u.unitNumber}`,
          propertyId: propId,
          propertyName: propertyName.trim(),
          country,
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
          waterMeter: u.waterMeter || undefined,
          images: u.images && u.images.length > 0 ? u.images : (sortedImages.length > 0 ? [sortedImages[0]] : []),
          image: (u.images && u.images[0]) || sortedImages[0] || '',
        }));
      }

      await Promise.resolve(saveProperty(newProp, newUnitsList));
      Alert.alert(
        'Property Published! 🎉',
        propStructure === 'single_unit'
          ? `"${newProp.name}" (Single-Unit Asset) is now published in your portfolio.`
          : `"${newProp.name}" with ${newUnitsList.length} configured units is now live in your portfolio.`
      );
      if (onSuccess) onSuccess();
      else if (onBack) onBack();
    } catch (err: any) {
      console.error('Error saving property:', err);
      Alert.alert('Save Failed', err?.message || 'Could not create property. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenStatusBar />

        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={20} color={colors.navy} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Add New Property</Text>
          </View>
          <View style={[styles.stepBadge, isDark && { backgroundColor: '#064E3B', borderColor: '#059669' }]}>
            <Text style={[styles.stepBadgeText, isDark && { color: '#6EE7B7' }]}>STEP {step} / 4</Text>
          </View>
        </View>

        <ScrollView
          style={[styles.scroll, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 500);
              }}
              tintColor={colors.primary}
            />
          }
        >
        {/* Current Stage Chip Only (Web Parity Clean UX) */}
        {(() => {
          const stepDefs = [
            { num: 1, label: 'Identity & Structure', icon: 'home' },
            { num: 2, label: 'Policies & Amenities', icon: 'shield' },
            { num: 3, label: propStructure === 'single_unit' ? 'Single-Unit Terms' : `Units Inventory (${initialUnits.length})`, icon: 'layers' },
            { num: 4, label: 'Photos & Final Review', icon: 'image' },
          ];
          const currentStage = stepDefs.find((s) => s.num === step) || stepDefs[0];

          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <View style={styles.currentStageChip}>
                <Feather
                  name={currentStage.icon as any}
                  size={13}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.currentStageChipText}>
                  {currentStage.label}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* ========================================================================= */}
        {/* STEP 1: IDENTITY & STRUCTURE                                              */}
        {/* ========================================================================= */}
        {step === 1 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>1. Identity & Physical Structure</Text>

            {/* Property Name */}
            <Text style={[styles.inputLabel, fieldErrors.propName && { color: '#EF4444' }]}>
              Property Name *
            </Text>
            <TextInput
              style={[styles.input, fieldErrors.propName && styles.inputError]}
              value={propertyName}
              onChangeText={(val) => {
                setPropertyName(val);
                if (fieldErrors.propName) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.propName;
                    return next;
                  });
                }
              }}
              placeholder="e.g. Maple Heights Residency, Tower A"
              placeholderTextColor={colors.inkSoft}
            />
            {fieldErrors.propName && (
              <Text style={styles.errorText}>⚠️ {fieldErrors.propName}</Text>
            )}

            {/* Country * */}
            <Text style={styles.inputLabel}>Country *</Text>
            <View style={{ marginBottom: 14 }}>
              <TouchableOpacity
                style={[styles.dropdownTrigger, isCountryDropdownOpen && styles.dropdownTriggerActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsCountryDropdownOpen((prev) => !prev);
                  setIsTypeDropdownOpen(false);
                  setIsManagerDropdownOpen(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.dropdownLeft}>
                  <View style={styles.dropdownBadge}>
                    <Text style={styles.dropdownBadgeSymbol}>
                      {COUNTRY_OPTIONS.find((c) => c.name === country)?.symbol || getSymbol(propCurrency)}
                    </Text>
                  </View>
                  <Text style={styles.dropdownText}>
                    {country} ({COUNTRY_OPTIONS.find((c) => c.name === country)?.currency || propCurrency})
                  </Text>
                </View>
                <Feather
                  name={isCountryDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={isCountryDropdownOpen ? colors.primary : colors.inkSoft}
                />
              </TouchableOpacity>

              {isCountryDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                    {COUNTRY_OPTIONS.map((c) => {
                      const isSelected = country === c.name;
                      return (
                        <TouchableOpacity
                          key={c.name}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                          onPress={() => handleCountrySelect(c.name, c.currency)}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <View style={[styles.dropdownBadge, isSelected && { backgroundColor: '#D1FAE5' }]}>
                              <Text style={styles.dropdownBadgeSymbol}>{c.symbol}</Text>
                            </View>
                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                              {c.name} ({c.currency})
                            </Text>
                          </View>
                          {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Property Classification (Categorized) */}
            <Text style={styles.inputLabel}>Property Classification</Text>
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.dropdownTrigger, isTypeDropdownOpen && styles.dropdownTriggerActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsTypeDropdownOpen((prev) => !prev);
                  setIsCountryDropdownOpen(false);
                  setIsManagerDropdownOpen(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.dropdownLeft}>
                  <View style={styles.dropdownBadge}>
                    <Feather name="home" size={14} color={isDark ? '#34D399' : '#059669'} />
                  </View>
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {propertyType}
                  </Text>
                </View>
                <Feather
                  name={isTypeDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={isTypeDropdownOpen ? colors.primary : colors.inkSoft}
                />
              </TouchableOpacity>

              {isTypeDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 280 }}>
                    {['residential', 'commercial', 'mixed'].map((catKey) => {
                      const categoryLabel =
                        catKey === 'residential'
                          ? 'Residential Options'
                          : catKey === 'commercial'
                            ? 'Commercial Real Estate'
                            : 'Mixed-Use Development';
                      const options = PROPERTY_TYPE_OPTIONS.filter((o) => o.category === catKey);

                      return (
                        <View key={catKey}>
                          <View style={styles.dropdownGroupHeader}>
                            <Text style={styles.dropdownGroupHeaderText}>{categoryLabel.toUpperCase()}</Text>
                          </View>
                          {options.map((opt) => {
                            const isSelected = propertyType === opt.label;
                            return (
                              <TouchableOpacity
                                key={opt.label}
                                style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                                onPress={() => handlePropertyTypeSelect(opt.label)}
                                activeOpacity={0.7}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                                    {opt.label}
                                  </Text>
                                </View>
                                {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Property Structure & Leasing Model * (Exact 1:1 Web Parity) */}
            <View style={[styles.structureBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
              <Text style={[styles.structureBoxTitle, { color: colors.navy }]}>
                Property Structure & Leasing Model *
              </Text>
              <Text style={[styles.hintText, { marginBottom: 12 }]}>
                Choose whether this asset is leased as a single unified property or partitioned into individual rentable units.
              </Text>

              <View style={styles.structureCardsRow}>
                {/* Option 1: Single-Unit Asset */}
                <TouchableOpacity
                  style={[
                    styles.structureCard,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                    propStructure === 'single_unit' && styles.structureCardActive,
                  ]}
                  onPress={() => {
                    setPropStructure('single_unit');
                    setFloorsCount('2');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.structureRadioRow}>
                    <View style={[styles.radioCircle, propStructure === 'single_unit' && styles.radioCircleActive]}>
                      {propStructure === 'single_unit' && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.structureCardName, { color: colors.navy }]}>🏡 Single-Unit Asset</Text>
                  </View>
                  <Text style={[styles.structureCardDesc, { color: colors.inkSoft }]}>
                    Entire house, standalone 4BHK villa, bungalow, or single shop leased as 1 complete property.
                  </Text>
                </TouchableOpacity>

                {/* Option 2: Multi-Unit Complex */}
                <TouchableOpacity
                  style={[
                    styles.structureCard,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                    propStructure === 'multi_unit' && styles.structureCardActive,
                  ]}
                  onPress={() => {
                    setPropStructure('multi_unit');
                    setFloorsCount('4');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.structureRadioRow}>
                    <View style={[styles.radioCircle, propStructure === 'multi_unit' && styles.radioCircleActive]}>
                      {propStructure === 'multi_unit' && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.structureCardName, { color: colors.navy }]}>🏢 Multi-Unit Complex</Text>
                  </View>
                  <Text style={[styles.structureCardDesc, { color: colors.inkSoft }]}>
                    Apartment building, gated villa community, or office plaza with multiple leasable units.
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Assigned Property Manager */}
            <Text style={styles.inputLabel}>Assigned Property Manager</Text>
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.dropdownTrigger, isManagerDropdownOpen && styles.dropdownTriggerActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsManagerDropdownOpen((prev) => !prev);
                  setIsTypeDropdownOpen(false);
                  setIsCountryDropdownOpen(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.dropdownLeft}>
                  <View style={styles.dropdownBadge}>
                    <Feather name="user-check" size={14} color={isDark ? '#34D399' : '#059669'} />
                  </View>
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {(() => {
                      if (!assignedManagerId) return 'None (Direct Owner Operations)';
                      const found = availableManagers.find((m) => m.id === assignedManagerId);
                      return found ? `${found.name} (${found.role})` : 'None (Direct Owner Operations)';
                    })()}
                  </Text>
                </View>
                <Feather
                  name={isManagerDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={isManagerDropdownOpen ? colors.primary : colors.inkSoft}
                />
              </TouchableOpacity>

              {isManagerDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                    <TouchableOpacity
                      style={[styles.dropdownItem, !assignedManagerId && styles.dropdownItemActive]}
                      onPress={() => {
                        setAssignedManagerId('');
                        setIsManagerDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dropdownItemText, !assignedManagerId && styles.dropdownItemTextActive]}>
                          None (Direct Owner Operations)
                        </Text>
                      </View>
                      {!assignedManagerId && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>

                    {availableManagers.map((m) => {
                      const isSelected = assignedManagerId === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                          onPress={() => {
                            setAssignedManagerId(m.id);
                            setIsManagerDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                              {m.name}
                            </Text>
                            <Text style={styles.dropdownItemSub}>
                              {m.role} {m.phone ? `• ${m.phone}` : m.email ? `• ${m.email}` : ''}
                            </Text>
                          </View>
                          {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Google Maps Places Address * */}
            <View style={{ marginBottom: 14 }}>
              <Text style={[styles.inputLabel, fieldErrors.propAddress && { color: '#EF4444' }]}>
                Google Maps Places Address *
              </Text>
              <Text style={styles.hintText}>
                Search and select location to auto-populate city, state, country, and coordinates.
              </Text>

              <View style={[styles.placesSearchBox, fieldErrors.propAddress && styles.inputError]}>
                <Feather name="search" size={16} color="#64748B" />
                <TextInput
                  style={styles.placesSearchInput}
                  value={placesSearchQuery}
                  onChangeText={(val) => {
                    setPlacesSearchQuery(val);
                    activePlacesQueryRef.current = val;
                    if (!isPlacesDropdownOpen) setIsPlacesDropdownOpen(true);

                    if (placesDebounceRef.current) clearTimeout(placesDebounceRef.current);
                    if (!val.trim()) {
                      setLivePlaces([]);
                      setIsPlacesLoading(false);
                      return;
                    }

                    setIsPlacesLoading(true);
                    placesDebounceRef.current = setTimeout(async () => {
                      const results = await searchGooglePlaces(val);
                      if (activePlacesQueryRef.current === val) {
                        setLivePlaces(results);
                        setIsPlacesLoading(false);
                      }
                    }, 280);
                  }}
                  onFocus={() => setIsPlacesDropdownOpen(true)}
                  placeholder="Search street, city, or landmark (Google Maps)..."
                  placeholderTextColor={colors.inkSoft}
                  autoCapitalize="none"
                />
                {isPlacesLoading && <ActivityIndicator size="small" color="#059669" style={{ marginRight: 6 }} />}
                {placesSearchQuery ? (
                  <TouchableOpacity
                    onPress={() => {
                      setPlacesSearchQuery('');
                      setLivePlaces([]);
                      setIsPlacesDropdownOpen(false);
                    }}
                  >
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {fieldErrors.propAddress && (
                <Text style={styles.errorText}>⚠️ {fieldErrors.propAddress}</Text>
              )}

              {isPlacesDropdownOpen && (
                <View style={styles.placesDropdownMenu}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                    {placesSuggestions.map((p, pIdx) => (
                      <TouchableOpacity
                        key={`${p.formattedAddress}-${pIdx}`}
                        style={styles.placeItem}
                        onPress={() => handleSelectPlace(p)}
                        activeOpacity={0.7}
                      >
                        <View style={{ marginRight: 10 }}>
                          <Feather name="map-pin" size={15} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.placeItemText} numberOfLines={1}>
                            {p.addressLine || p.city}
                          </Text>
                          <Text style={styles.placeItemSub} numberOfLines={1}>
                            {p.formattedAddress}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {placesSearchQuery.trim().length > 0 && (
                      <TouchableOpacity
                        style={[styles.placeItem, { backgroundColor: '#F0FDF4' }]}
                        onPress={handleSelectCustomQueryAsLocation}
                        activeOpacity={0.7}
                      >
                        <View style={{ marginRight: 10 }}>
                          <Feather name="check" size={15} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.placeItemText, { color: '#059669' }]} numberOfLines={1}>
                            Use Custom: "{placesSearchQuery.trim()}"
                          </Text>
                          <Text style={styles.placeItemSub}>Apply as verified property location</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              )}

              {confirmedAddress?.formattedAddress ? (
                <View style={styles.confirmedLocationCard}>
                  <View style={styles.confirmedLocationHeader}>
                    <Feather name="map-pin" size={14} color="#059669" />
                    <Text style={styles.confirmedLocationTitle}>Confirmed Location</Text>
                  </View>
                  <Text style={styles.confirmedLocationText}>
                    {confirmedAddress.formattedAddress} ({confirmedAddress.country})
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Total Floors & Year Built Grid */}
            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Total Number of Floors</Text>
                <TextInput
                  style={styles.input}
                  value={floorsCount}
                  onChangeText={setFloorsCount}
                  keyboardType="numeric"
                  placeholder="4"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Year Built / Commissioned</Text>
                <TextInput
                  style={styles.input}
                  value={yearBuilt}
                  onChangeText={setYearBuilt}
                  keyboardType="numeric"
                  placeholder="e.g. 2022"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>
            </View>

            <TouchableOpacity style={[styles.nextBtn, { marginTop: 16 }]} onPress={handleStep1Next} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>Next Step →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: POLICIES, RULES & AMENITIES                                       */}
        {/* ========================================================================= */}
        {step === 2 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>2. Policies & Amenities</Text>

            {/* Operational Rental Currency - 160+ Global Search Dropdown (Web Parity) */}
            <Text style={styles.inputLabel}>Operational Rental Currency (160+ Global Currencies)</Text>
            {(() => {
              const selectedCurrencyObj =
                GLOBAL_CURRENCIES.find((c) => c.code === propCurrency || c.symbol === propCurrency) ||
                GLOBAL_CURRENCIES[0];

              const filteredCurrencies = GLOBAL_CURRENCIES.filter((c) => {
                const q = currencySearchQuery.toLowerCase().trim();
                if (!q) return true;
                return (
                  c.code.toLowerCase().includes(q) ||
                  c.name.toLowerCase().includes(q) ||
                  c.country.toLowerCase().includes(q) ||
                  (c.symbol && c.symbol.toLowerCase().includes(q))
                );
              });

              return (
                <View style={{ marginBottom: 18 }}>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, isCurrencyDropdownOpen && styles.dropdownTriggerActive]}
                    onPress={() => setIsCurrencyDropdownOpen((prev) => !prev)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dropdownLeft}>
                      <Text style={{ fontSize: 18, marginRight: 6 }}>{selectedCurrencyObj.flag}</Text>
                      <Text style={styles.dropdownText}>
                        {selectedCurrencyObj.code} • {selectedCurrencyObj.name} ({selectedCurrencyObj.symbol})
                      </Text>
                    </View>
                    <Feather
                      name={isCurrencyDropdownOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={isCurrencyDropdownOpen ? colors.primary : colors.inkSoft}
                    />
                  </TouchableOpacity>

                  {isCurrencyDropdownOpen && (
                    <View style={styles.dropdownMenu}>
                      <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSunken, borderRadius: 6, paddingHorizontal: 8 }}>
                          <Feather name="search" size={14} color={colors.inkSoft} style={{ marginRight: 6 }} />
                          <TextInput
                            placeholder="Search by currency code, country, or symbol..."
                            placeholderTextColor={colors.inkSoft}
                            value={currencySearchQuery}
                            onChangeText={setCurrencySearchQuery}
                            style={{ flex: 1, paddingVertical: 6, fontSize: 13, color: colors.ink }}
                            autoCapitalize="none"
                          />
                        </View>
                      </View>
                      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {filteredCurrencies.map((c) => {
                          const isSelected = propCurrency === c.code || propCurrency === c.symbol;
                          return (
                            <TouchableOpacity
                              key={c.code}
                              style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                              onPress={() => {
                                setPropCurrency(c.symbol || c.code);
                                setIsCurrencyDropdownOpen(false);
                                setCurrencySearchQuery('');
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                                <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                                  {c.code} ({c.symbol}) - {c.name}
                                </Text>
                              </View>
                              {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Standard House Rules & Lease Policy */}
            <View style={[styles.rulesCard, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
              <Text style={[styles.rulesHeader, { color: colors.navy }]}>Standard House Rules & Lease Policy</Text>

              {/* Checkboxes Row */}
              <View style={styles.rulesCheckboxList}>
                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setPropRules({ ...propRules, petsAllowed: !propRules.petsAllowed })}
                  activeOpacity={0.8}
                >
                  <View style={styles.toggleLeft}>
                    <Text style={styles.toggleIcon}>🐾</Text>
                    <Text style={[styles.toggleTitle, { color: colors.ink }]}>Pets Permitted</Text>
                  </View>
                  <Ionicons
                    name={propRules.petsAllowed ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={propRules.petsAllowed ? '#10B981' : colors.inkSoft}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setPropRules({ ...propRules, smokingAllowed: !propRules.smokingAllowed })}
                  activeOpacity={0.8}
                >
                  <View style={styles.toggleLeft}>
                    <Text style={styles.toggleIcon}>🚭</Text>
                    <Text style={[styles.toggleTitle, { color: colors.ink }]}>Smoking Permitted</Text>
                  </View>
                  <Ionicons
                    name={propRules.smokingAllowed ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={propRules.smokingAllowed ? '#10B981' : colors.inkSoft}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setPropRules({ ...propRules, sublettingAllowed: !propRules.sublettingAllowed })}
                  activeOpacity={0.8}
                >
                  <View style={styles.toggleLeft}>
                    <Text style={styles.toggleIcon}>🤝</Text>
                    <Text style={[styles.toggleTitle, { color: colors.ink }]}>Subletting Allowed</Text>
                  </View>
                  <Ionicons
                    name={propRules.sublettingAllowed ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={propRules.sublettingAllowed ? '#10B981' : colors.inkSoft}
                  />
                </TouchableOpacity>
              </View>

              {/* Standard Minimum Lease Duration */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.subLabel}>Standard Minimum Lease Duration</Text>
                <View style={styles.segmentedSmall}>
                  {[
                    { m: 6, label: '6 Mos' },
                    { m: 11, label: '11 Mos (India)' },
                    { m: 12, label: '12 Mos (Global)' },
                    { m: 24, label: '24 Mos' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.m}
                      style={[styles.smallSegBtn, propRules.minLeaseMonths === item.m && styles.smallSegBtnActive]}
                      onPress={() => setPropRules({ ...propRules, minLeaseMonths: item.m })}
                    >
                      <Text style={[styles.smallSegText, propRules.minLeaseMonths === item.m && styles.smallSegTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Default Notice Period */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.subLabel}>Default Notice Period</Text>
                <View style={styles.segmentedSmall}>
                  {[15, 30, 60, 90].map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.smallSegBtn, propRules.noticePeriodDays === d && styles.smallSegBtnActive]}
                      onPress={() => setPropRules({ ...propRules, noticePeriodDays: d })}
                    >
                      <Text style={[styles.smallSegText, propRules.noticePeriodDays === d && styles.smallSegTextActive]}>
                        {d} Days
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Property Amenities & Perks */}
            <View style={{ marginTop: 16 }}>
              <Text style={styles.inputLabel}>Property Amenities & Perks</Text>
              <Text style={styles.hintText}>
                Select existing amenities or add custom perks unique to this property.
              </Text>

              <View style={styles.chipGrid}>
                {PREDEFINED_AMENITIES.map((am) => {
                  const isSelected = propAmenities.includes(am);
                  const hasPhoto = Boolean(propAmenityPhotos[am]);
                  return (
                    <TouchableOpacity
                      key={am}
                      style={[
                        styles.amenityBadge,
                        isSelected && styles.amenityBadgeActive,
                      ]}
                      onPress={() => {
                        setPropAmenities((prev) =>
                          prev.includes(am) ? prev.filter((x) => x !== am) : [...prev, am]
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.amenityBadgeText, isSelected && styles.amenityBadgeTextActive]}>
                        {isSelected ? '✓ ' : '+ '}
                        {hasPhoto ? '📷 ' : ''}
                        {am}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {propAmenities
                  .filter((a) => !PREDEFINED_AMENITIES.includes(a))
                  .map((customAm) => (
                    <TouchableOpacity
                      key={customAm}
                      style={[styles.amenityBadge, styles.amenityBadgeActive]}
                      onPress={() => setPropAmenities((prev) => prev.filter((x) => x !== customAm))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.amenityBadgeText, styles.amenityBadgeTextActive]}>
                        ✓ {propAmenityPhotos[customAm] ? '📷 ' : ''}{customAm} ✕
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>

              {/* Add Custom Amenity Row */}
              <View style={styles.customAmenityRow}>
                <TextInput
                  style={styles.customAmenityInput}
                  value={customAmenityInput}
                  onChangeText={setCustomAmenityInput}
                  placeholder="Add custom amenity (e.g. Badminton Court, Co-Working Lounge)"
                  placeholderTextColor={colors.inkSoft}
                />
                <TouchableOpacity
                  style={styles.addAmenityBtn}
                  onPress={handleAddCustomAmenity}
                  disabled={!customAmenityInput.trim()}
                >
                  <Text style={styles.addAmenityBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {/* Amenity Photos Showcase & Upload Section (Web Parity) */}
              {propAmenities.length > 0 && (
                <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Text style={[styles.sectionHeader, { color: colors.navy }]}>
                    Upload Amenity Photos ({Object.keys(propAmenityPhotos).length}/{propAmenities.length} with photos)
                  </Text>
                  <Text style={styles.hintText}>
                    Attach photos for active amenities to showcase on public listings and verification pages.
                  </Text>

                  <View style={styles.amenityPhotoGrid}>
                    {propAmenities.map((am) => {
                      const photo = propAmenityPhotos[am];
                      return (
                        <View
                          key={am}
                          style={[
                            styles.amenityPhotoCard,
                            { backgroundColor: colors.surfaceSunken, borderColor: photo ? '#10B981' : colors.line },
                          ]}
                        >
                          <View style={styles.amenityCardHeader}>
                            <Text style={[styles.amenityCardName, { color: colors.navy }]} numberOfLines={1}>
                              {am}
                            </Text>
                            {photo && (
                              <View style={styles.photoAttachedBadge}>
                                <Text style={styles.photoAttachedBadgeText}>✓ Photo</Text>
                              </View>
                            )}
                          </View>

                          {photo ? (
                            <View style={styles.amenityThumbContainer}>
                              <Image source={{ uri: photo }} style={styles.amenityThumbImg} resizeMode="cover" />
                              <View style={styles.amenityActionRow}>
                                <TouchableOpacity
                                  style={styles.amenityReplaceBtn}
                                  onPress={() => handleUploadAmenityPhoto(am)}
                                >
                                  <Text style={styles.amenityReplaceBtnText}>Replace</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.amenityRemoveBtn}
                                  onPress={() => handleRemoveAmenityPhoto(am)}
                                >
                                  <Feather name="trash-2" size={13} color="#DC2626" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.amenityUploadPlaceholder}
                              onPress={() => handleUploadAmenityPhoto(am)}
                              activeOpacity={0.7}
                            >
                              <Feather name="camera" size={18} color={colors.inkSoft} />
                              <Text style={[styles.amenityPlaceholderText, { color: colors.primary }]}>
                                + Upload Photo
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backStepBtn} onPress={() => setStep(1)} activeOpacity={0.8}>
                <Text style={styles.backStepText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.nextBtn, { flex: 1 }]} onPress={() => setStep(3)} activeOpacity={0.85}>
                <Text style={styles.nextBtnText}>Next Step →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: UNITS BUILDER (Single-Unit vs Multi-Unit Exact Parity)            */}
        {/* ========================================================================= */}
        {step === 3 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>
              3. {propStructure === 'single_unit' ? 'Single-Unit Asset Configuration' : 'Units Builder & Generator'}
            </Text>

            {/* SINGLE-UNIT ASSET MODE (Whole House / Villa / Facility) */}
            {propStructure === 'single_unit' ? (
              <View>
                <View style={[styles.singleAssetBanner, { backgroundColor: '#FAF8F5', borderColor: '#C5A059' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <View style={styles.brassBadge}>
                      <Text style={styles.brassBadgeText}>🏡 Single-Unit Asset Mode</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                      Lease Terms & Property Specifications
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 17 }}>
                    This entire property will be leased as a single unified asset without managing internal sub-units.
                  </Text>
                </View>

                {/* Layout Type & Property Identifier */}
                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Layout / House Type *</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {getUnitTypesForProperty(propertyType, singleUnitType).map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.smallSegBtn, { flexGrow: 0, paddingHorizontal: 10 }, singleUnitType === t && styles.smallSegBtnActive]}
                          onPress={() => setSingleUnitType(t)}
                        >
                          <Text style={[styles.smallSegText, singleUnitType === t && styles.smallSegTextActive]} numberOfLines={1}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Property Identifier / Unit Label</Text>
                    <TextInput
                      style={styles.input}
                      value={singleUnitLabel}
                      onChangeText={setSingleUnitLabel}
                      placeholder="e.g. Entire House, Main Villa"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>

                {/* Expected Rent & Security Deposit */}
                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Expected Monthly Rent ({getSymbol(propCurrency)}) *</Text>
                    <TextInput
                      style={styles.input}
                      value={singleUnitRent ? String(singleUnitRent) : ''}
                      onChangeText={(val) => setSingleUnitRent(parseInt(val, 10) || 0)}
                      keyboardType="numeric"
                      placeholder="35000"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Security Deposit ({getSymbol(propCurrency)})</Text>
                    <TextInput
                      style={styles.input}
                      value={singleUnitDeposit ? String(singleUnitDeposit) : ''}
                      onChangeText={(val) => setSingleUnitDeposit(parseInt(val, 10) || 0)}
                      keyboardType="numeric"
                      placeholder="70000"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>

                {/* Carpet Area & Furnishing State */}
                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Carpet Area (Sq.Ft)</Text>
                    <TextInput
                      style={styles.input}
                      value={singleUnitAreaSqFt ? String(singleUnitAreaSqFt) : ''}
                      onChangeText={(val) => setSingleUnitAreaSqFt(parseInt(val, 10) || 0)}
                      keyboardType="numeric"
                      placeholder="2200"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Furnishing State</Text>
                    <View style={styles.segmentedSmall}>
                      {(['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] as const).map((furn) => (
                        <TouchableOpacity
                          key={furn}
                          style={[styles.smallSegBtn, singleUnitFurnishing === furn && styles.smallSegBtnActive]}
                          onPress={() => setSingleUnitFurnishing(furn)}
                        >
                          <Text style={[styles.smallSegText, singleUnitFurnishing === furn && styles.smallSegTextActive]}>
                            {furn.replace('-Furnished', '').replace(' Furnished', '')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* Meter Numbers */}
                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Electricity Meter # (Optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={singleUnitElectricityMeter}
                      onChangeText={setSingleUnitElectricityMeter}
                      placeholder="e.g. EB-887711"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Water Meter # (Optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={singleUnitWaterMeter}
                      onChangeText={setSingleUnitWaterMeter}
                      placeholder="e.g. WTR-4422"
                      placeholderTextColor={colors.inkSoft}
                    />
                  </View>
                </View>
              </View>
            ) : (
              /* MULTI-UNIT COMPLEX MODE */
              <View>
                {/* Stats Bar */}
                <View style={[styles.metricsBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metricsLabel}>CONFIGURED UNITS</Text>
                    <Text style={[styles.metricsValue, { color: colors.navy }]}>{initialUnits.length} Units</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.metricsLabel}>PROJECTED RENT</Text>
                    <Text style={styles.metricsRent}>
                      {getSymbol(propCurrency)}{totalProjectedMonthlyRent.toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* Mode Switcher */}
                <View style={styles.modeTabs}>
                  <TouchableOpacity
                    style={[styles.modeTab, unitsBuilderMode === 'table' && styles.modeTabActive]}
                    onPress={() => setUnitsBuilderMode('table')}
                  >
                    <Text style={[styles.modeTabText, unitsBuilderMode === 'table' && styles.modeTabTextActive]}>
                      📋 Units Inventory Table ({initialUnits.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeTab, unitsBuilderMode === 'bulk' && styles.modeTabActive]}
                    onPress={() => setUnitsBuilderMode('bulk')}
                  >
                    <Text style={[styles.modeTabText, unitsBuilderMode === 'bulk' && styles.modeTabTextActive]}>
                      ⚡ Bulk Unit Generator
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Bulk Generator Form */}
                {unitsBuilderMode === 'bulk' && (
                  <View style={[styles.bulkBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
                    <Text style={[styles.bulkBoxTitle, { color: colors.navy }]}>
                      ⚡ Multi-Unit Automated Batch Generator
                    </Text>
                    <Text style={styles.bulkBoxSub}>
                      Instantly generate units across your floors. Existing units in table will be replaced by this batch.
                    </Text>

                    <View style={styles.grid3}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>From Floor</Text>
                        <TextInput
                          style={styles.input}
                          value={bulkFloorsStart}
                          onChangeText={setBulkFloorsStart}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>To Floor</Text>
                        <TextInput
                          style={styles.input}
                          value={bulkFloorsEnd}
                          onChangeText={setBulkFloorsEnd}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Units/Floor</Text>
                        <TextInput
                          style={styles.input}
                          value={bulkUnitsPerFloor}
                          onChangeText={setBulkUnitsPerFloor}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View style={styles.grid2}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Layout / Type</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          {getUnitTypesForProperty(propertyType, bulkUnitType).map((t) => (
                            <TouchableOpacity
                              key={t}
                              style={[styles.smallSegBtn, { flexGrow: 0, paddingHorizontal: 10 }, bulkUnitType === t && styles.smallSegBtnActive]}
                              onPress={() => setBulkUnitType(t)}
                            >
                              <Text style={[styles.smallSegText, bulkUnitType === t && styles.smallSegTextActive]} numberOfLines={1}>{t}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Furnishing</Text>
                        <View style={styles.segmentedSmall}>
                          {(['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] as const).map((furn) => (
                            <TouchableOpacity
                              key={furn}
                              style={[styles.smallSegBtn, bulkFurnishing === furn && styles.smallSegBtnActive]}
                              onPress={() => setBulkFurnishing(furn)}
                            >
                              <Text style={[styles.smallSegText, bulkFurnishing === furn && styles.smallSegTextActive]}>
                                {furn.replace('-Furnished', '').replace(' Furnished', '')}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>

                    <View style={styles.grid2}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Carpet Area (Sq Ft)</Text>
                        <TextInput
                          style={styles.input}
                          value={bulkAreaSqFt}
                          onChangeText={setBulkAreaSqFt}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Base Rent ({getSymbol(propCurrency)})</Text>
                        <TextInput
                          style={styles.input}
                          value={bulkBaseRent}
                          onChangeText={setBulkBaseRent}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View style={{ marginBottom: 10 }}>
                      <Text style={styles.inputLabel}>Base Security Deposit ({getSymbol(propCurrency)})</Text>
                      <TextInput
                        style={styles.input}
                        value={bulkBaseDeposit}
                        onChangeText={setBulkBaseDeposit}
                        keyboardType="numeric"
                      />
                    </View>

                    {/* Batch Unit Photo (Opt) */}
                    <View style={{ marginTop: 6, marginBottom: 14 }}>
                      <Text style={styles.inputLabel}>Batch Unit Photo (Optional)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {bulkDefaultPhoto ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Image source={{ uri: bulkDefaultPhoto }} style={{ width: 44, height: 44, borderRadius: 6 }} />
                            <TouchableOpacity onPress={() => setBulkDefaultPhoto(null)}>
                              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>✕ Remove</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.unitPhotoAttachBtn, { paddingVertical: 8, paddingHorizontal: 12 }]}
                            onPress={async () => {
                              const picked = await pickSingleImage();
                              if (picked) {
                                const opt = await uploadOrCompressImage(picked.file || picked.uri, `units/bulk/${Date.now()}`);
                                setBulkDefaultPhoto(opt);
                              }
                            }}
                          >
                            <Feather name="camera" size={14} color="#059669" />
                            <Text style={styles.unitPhotoAttachText}>+ Attach Batch Photo</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.executeBulkBtn}
                      onPress={handleGenerateBulkUnits}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.executeBulkBtnText}>
                        ⚡ Generate {(Math.max(1, parseInt(bulkFloorsEnd, 10) || 1) - Math.max(1, parseInt(bulkFloorsStart, 10) || 1) + 1) * Math.max(1, parseInt(bulkUnitsPerFloor, 10) || 1)} Units Now
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Inventory Table List */}
                {unitsBuilderMode === 'table' && (
                  <View>
                    {initialUnits.map((u, idx) => {
                      const isExpanded = Boolean(expandedUnitIndices[idx]);
                      const hasPhoto = u.images && u.images.length > 0;

                      return (
                        <View key={idx} style={[styles.unitRowCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                          <View style={styles.unitRowTopBar}>
                            <View style={styles.unitPillEditable}>
                              <Text style={styles.unitPillPrefix}>Unit</Text>
                              <TextInput
                                style={styles.unitPillInput}
                                value={u.unitNumber}
                                onChangeText={(val) => {
                                  setInitialUnits(
                                    initialUnits.map((item, i) => (i === idx ? { ...item, unitNumber: val } : item))
                                  );
                                }}
                                selectTextOnFocus
                              />
                            </View>

                            <TouchableOpacity
                              onPress={() => handleDeleteUnit(idx)}
                              style={styles.deleteUnitBtn}
                            >
                              <Ionicons name="trash-outline" size={16} color="#EF4444" />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.unitRowActionsBar}>
                            {hasPhoto ? (
                              <View style={styles.unitPhotoThumbWrapper}>
                                <Image source={{ uri: u.images![0] }} style={styles.unitPhotoThumb} resizeMode="cover" />
                                <TouchableOpacity
                                  style={styles.unitPhotoRemoveBtn}
                                  onPress={() => handleRemoveUnitPhoto(idx)}
                                >
                                  <Ionicons name="close" size={10} color="#FFFFFF" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.unitPhotoAttachBtn}
                                onPress={() => handleUploadUnitPhoto(idx)}
                              >
                                <Feather name="camera" size={12} color="#059669" />
                                <Text style={styles.unitPhotoAttachText}>+ Photo</Text>
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity
                              style={styles.unitSpecsToggleBtn}
                              onPress={() => {
                                setExpandedUnitIndices((prev) => ({ ...prev, [idx]: !prev[idx] }));
                              }}
                            >
                              <Text style={[styles.unitMetaText, { color: colors.inkSoft }]} numberOfLines={1}>
                                {u.floor} • {u.unitType} • {u.areaSqFt} sq.ft
                              </Text>
                              <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#059669" />
                            </TouchableOpacity>
                          </View>

                          {/* Expanded Specs Drawer */}
                          {isExpanded && (
                            <View style={styles.unitExpandedDrawer}>
                              <View style={styles.grid2}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.drawerSubLabel}>Floor</Text>
                                  <TextInput
                                    style={styles.smallInput}
                                    value={u.floor}
                                    onChangeText={(val) => {
                                      setInitialUnits(
                                        initialUnits.map((item, i) => (i === idx ? { ...item, floor: val } : item))
                                      );
                                    }}
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.drawerSubLabel}>Carpet Area (Sq.Ft)</Text>
                                  <TextInput
                                    style={styles.smallInput}
                                    value={String(u.areaSqFt || '')}
                                    onChangeText={(val) => {
                                      const num = parseInt(val, 10) || 0;
                                      setInitialUnits(
                                        initialUnits.map((item, i) => (i === idx ? { ...item, areaSqFt: num } : item))
                                      );
                                    }}
                                    keyboardType="numeric"
                                  />
                                </View>
                              </View>
                            </View>
                          )}

                          {/* Financials & Meters Grid */}
                          <View style={styles.unitInputsGrid}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.subLabel}>Rent ({getSymbol(propCurrency)})</Text>
                              <TextInput
                                style={styles.smallInput}
                                value={String(u.rent || 0)}
                                keyboardType="numeric"
                                onChangeText={(val) => {
                                  const num = parseInt(val, 10) || 0;
                                  setInitialUnits(
                                    initialUnits.map((item, i) => (i === idx ? { ...item, rent: num } : item))
                                  );
                                }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.subLabel}>Deposit ({getSymbol(propCurrency)})</Text>
                              <TextInput
                                style={styles.smallInput}
                                value={String(u.deposit || 0)}
                                keyboardType="numeric"
                                onChangeText={(val) => {
                                  const num = parseInt(val, 10) || 0;
                                  setInitialUnits(
                                    initialUnits.map((item, i) => (i === idx ? { ...item, deposit: num } : item))
                                  );
                                }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.subLabel}>Meter #</Text>
                              <TextInput
                                style={styles.smallInput}
                                value={u.electricityMeter || ''}
                                placeholder="Meter"
                                onChangeText={(val) => {
                                  setInitialUnits(
                                    initialUnits.map((item, i) => (i === idx ? { ...item, electricityMeter: val } : item))
                                  );
                                }}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.addIndividualBtn, { backgroundColor: colors.surface, borderColor: colors.line }]}
                      onPress={handleAddIndividualUnit}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.addIndividualBtnText, { color: colors.primary }]}>+ Add Individual Unit</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backStepBtn} onPress={() => setStep(2)} activeOpacity={0.8}>
                <Text style={styles.backStepText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.nextBtn, { flex: 1 }]} onPress={handleStep3Next} activeOpacity={0.85}>
                <Text style={styles.nextBtnText}>Next Step →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: PHOTOS & REVIEW                                                   */}
        {/* ========================================================================= */}
        {step === 4 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>4. Photos & Final Review</Text>

            {/* Property Photos Gallery */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Property Photos Gallery ({propImages.length} photos)</Text>
              </View>
              <TouchableOpacity
                style={styles.uploadPhotosBtn}
                onPress={handleUploadGalleryPhotos}
                activeOpacity={0.85}
              >
                <Feather name="upload" size={13} color="#FFFFFF" />
                <Text style={styles.uploadPhotosBtnText}>Upload Photos</Text>
              </TouchableOpacity>
            </View>

            {propImages.length === 0 ? (
              <TouchableOpacity
                style={[styles.galleryEmptyBox, { borderColor: colors.line }]}
                onPress={handleUploadGalleryPhotos}
                activeOpacity={0.8}
              >
                <Feather name="camera" size={24} color={colors.inkSoft} />
                <Text style={[styles.galleryEmptyText, { color: colors.navy }]}>No property photos added yet</Text>
                <Text style={{ fontSize: 11, color: colors.inkSoft }}>Select exterior, lobby, or facade photos</Text>
              </TouchableOpacity>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
                {propImages.map((imgUrl, idx) => (
                  <View key={idx} style={styles.galleryCard}>
                    <Image source={{ uri: imgUrl }} style={styles.galleryThumb} />
                    <TouchableOpacity
                      style={[styles.coverStarBtn, coverPhotoIndex === idx && styles.coverStarBtnActive]}
                      onPress={() => setCoverPhotoIndex(idx)}
                    >
                      <Ionicons
                        name={coverPhotoIndex === idx ? 'star' : 'star-outline'}
                        size={12}
                        color="#FFFFFF"
                      />
                      <Text style={styles.coverStarText}>{coverPhotoIndex === idx ? 'Cover' : 'Set Cover'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.galleryDeleteBtn}
                      onPress={() => {
                        const next = propImages.filter((_, i) => i !== idx);
                        setPropImages(next);
                        if (coverPhotoIndex >= next.length) setCoverPhotoIndex(0);
                      }}
                    >
                      <Feather name="trash-2" size={11} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Amenity Photos Showcase in Review */}
            {Object.keys(propAmenityPhotos).length > 0 && (
              <View style={[styles.reviewSectionBox, { marginTop: 14 }]}>
                <Text style={styles.reviewSectionTitle}>
                  AMENITY PHOTOS SHOWCASE ({Object.keys(propAmenityPhotos).length})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {Object.entries(propAmenityPhotos).map(([name, photo]) => (
                    <View key={name} style={styles.amenityReviewCard}>
                      <Image source={{ uri: photo }} style={styles.amenityReviewImg} />
                      <View style={styles.amenityReviewLabelBox}>
                        <Text style={styles.amenityReviewLabelText} numberOfLines={1}>{name}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Configured Units Showcase in Review */}
            <View style={[styles.reviewSectionBox, { marginTop: 14 }]}>
              <Text style={styles.reviewSectionTitle}>
                {propStructure === 'single_unit' ? 'SINGLE-UNIT ASSET SPECS' : `CONFIGURED UNITS (${initialUnits.length})`}
              </Text>
              {propStructure === 'single_unit' ? (
                <View style={styles.singleUnitReviewSpecs}>
                  <Text style={styles.singleUnitReviewLine}>
                    <b>Identifier:</b> {singleUnitLabel || 'Entire House'} • <b>Type:</b> {singleUnitType}
                  </Text>
                  <Text style={styles.singleUnitReviewLine}>
                    <b>Monthly Rent:</b> {getSymbol(propCurrency)}{singleUnitRent.toLocaleString()}/mo • <b>Deposit:</b> {getSymbol(propCurrency)}{singleUnitDeposit.toLocaleString()}
                  </Text>
                  <Text style={styles.singleUnitReviewLine}>
                    <b>Area:</b> {singleUnitAreaSqFt} sq.ft • <b>Furnishing:</b> {singleUnitFurnishing}
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {initialUnits.map((u, i) => (
                    <View key={i} style={[styles.unitReviewTile, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      {u.images && u.images[0] ? (
                        <Image source={{ uri: u.images[0] }} style={styles.unitReviewTileImg} />
                      ) : (
                        <View style={styles.unitReviewTilePlaceholder}>
                          <Feather name="home" size={14} color={colors.inkSoft} />
                        </View>
                      )}
                      <View>
                        <Text style={styles.unitReviewTileTitle}>Unit {u.unitNumber} ({u.unitType})</Text>
                        <Text style={styles.unitReviewTileSub}>
                          {getSymbol(propCurrency)}{u.rent.toLocaleString()}/mo • {u.floor}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Comprehensive Property Verification & Summary */}
            <View style={[styles.reviewContainer, { marginTop: 16 }]}>
              <View style={styles.reviewHeroCard}>
                <View style={styles.reviewHeroHeader}>
                  <View style={styles.reviewHeroIconWrap}>
                    <Feather name="home" size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewPropName} numberOfLines={2}>
                      {propertyName || 'Unnamed Property'}
                    </Text>
                    <Text style={styles.reviewPropTypeSub} numberOfLines={1}>
                      {propertyType} • {propStructure === 'single_unit' ? 'Single-Unit Asset' : 'Multi-Unit Complex'}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewLocationRow}>
                  <Feather name="map-pin" size={13} color="#059669" style={{ marginTop: 2, marginRight: 6 }} />
                  <Text style={styles.reviewLocationText} numberOfLines={2}>
                    {confirmedAddress.formattedAddress} ({country})
                  </Text>
                </View>
              </View>

              {/* 2x2 Metric Tiles */}
              <View style={styles.reviewStatsGrid}>
                <View style={[styles.reviewStatTile, styles.reviewStatTileHighlighted]}>
                  <Text style={styles.reviewStatLabelHighlighted}>PROJECTED RENT</Text>
                  <Text style={styles.reviewStatValueHighlighted} numberOfLines={1}>
                    {getSymbol(propCurrency)}{totalProjectedMonthlyRent.toLocaleString()}
                  </Text>
                  <Text style={styles.reviewStatSubHighlighted}>per month</Text>
                </View>

                <View style={styles.reviewStatTile}>
                  <Text style={styles.reviewStatLabel}>TOTAL CAPACITY</Text>
                  <Text style={styles.reviewStatValue} numberOfLines={1}>
                    {propStructure === 'single_unit' ? '1 Asset' : `${initialUnits.length} Units`}
                  </Text>
                  <Text style={styles.reviewStatSub} numberOfLines={1}>
                    {floorsCount} Floors • {yearBuilt}
                  </Text>
                </View>

                <View style={styles.reviewStatTile}>
                  <Text style={styles.reviewStatLabel}>OPERATIONS</Text>
                  <Text style={styles.reviewStatValue} numberOfLines={1}>
                    {(() => {
                      if (!assignedManagerId) return 'Direct Owner';
                      const found = availableManagers.find((m) => m.id === assignedManagerId);
                      return found ? found.name : 'Direct Owner';
                    })()}
                  </Text>
                  <Text style={styles.reviewStatSub} numberOfLines={1}>
                    {assignedManagerId ? 'Delegated Manager' : 'Self-Managed'}
                  </Text>
                </View>

                <View style={styles.reviewStatTile}>
                  <Text style={styles.reviewStatLabel}>LEASE POLICY</Text>
                  <Text style={styles.reviewStatValue} numberOfLines={1}>
                    {propRules.minLeaseMonths}M Min
                  </Text>
                  <Text style={styles.reviewStatSub} numberOfLines={1}>
                    {propRules.noticePeriodDays}d Notice • {propRules.petsAllowed ? 'Pets OK' : 'No Pets'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backStepBtn} onPress={() => setStep(3)} activeOpacity={0.8}>
                <Text style={styles.backStepText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1 }, isSubmitting && { opacity: 0.7 }]}
                onPress={handleSaveAndPublish}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {propStructure === 'single_unit'
                      ? ' Create '
                      : ` Create `}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Plan Quota Interception Modal */}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemePalette, isDark: boolean) =>
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
      borderBottomWidth: 1,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    logoBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#059669',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 15.5,
      fontWeight: '800',
    },
    headerSub: {
      fontSize: 11,
      fontWeight: '500',
    },
    stepBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    stepBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    currentStageChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: '#059669',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      shadowColor: '#059669',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 2,
    },
    currentStageChipText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    quotaBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    quotaBannerTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? '#6EE7B7' : '#065F46',
    },
    quotaBannerSub: {
      fontSize: 11,
      color: isDark ? '#A7F3D0' : '#047857',
      marginTop: 2,
    },
    quotaBadge: {
      backgroundColor: '#059669',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    quotaBadgeText: {
      color: '#FFFFFF',
      fontSize: 10.5,
      fontWeight: '700',
    },
    stepsNavRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 14,
    },
    stepTabPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: 8,
      borderWidth: 1,
    },
    stepTabPillActive: {
      backgroundColor: '#059669',
      borderColor: '#059669',
    },
    stepTabPillCompleted: {
      backgroundColor: '#ECFDF5',
      borderColor: '#A7F3D0',
    },
    stepTabPillText: {
      fontSize: 10.5,
      fontWeight: '600',
    },
    stepTabPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 14,
    },
    inputLabel: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 6,
    },
    subLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
      marginBottom: 4,
    },
    hintText: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginBottom: 8,
      lineHeight: 16,
    },
    input: {
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13.5,
      color: colors.ink,
      marginBottom: 14,
    },
    inputError: {
      borderColor: '#EF4444',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
    },
    errorText: {
      color: '#EF4444',
      fontSize: 11.5,
      marginTop: -10,
      marginBottom: 12,
      fontWeight: '600',
    },
    dropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    dropdownTriggerActive: {
      borderColor: '#059669',
      borderWidth: 1.5,
    },
    dropdownLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    dropdownBadge: {
      width: 24,
      height: 24,
      borderRadius: 6,
      backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    dropdownBadgeSymbol: {
      fontSize: 12,
      fontWeight: '800',
      color: '#059669',
    },
    dropdownText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink,
      flex: 1,
    },
    dropdownMenu: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      marginTop: 4,
      overflow: 'hidden',
      elevation: 4,
    },
    dropdownGroupHeader: {
      backgroundColor: colors.surfaceSunken,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    dropdownGroupHeaderText: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.inkSoft,
      letterSpacing: 0.5,
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
    dropdownItemActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    dropdownItemText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink,
    },
    dropdownItemTextActive: {
      color: '#059669',
      fontWeight: '700',
    },
    dropdownItemSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    structureBox: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 16,
    },
    structureBoxTitle: {
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 2,
    },
    structureCardsRow: {
      gap: 10,
    },
    structureCard: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    structureCardActive: {
      borderColor: '#C5A059',
      borderWidth: 2,
      backgroundColor: isDark ? 'rgba(197, 160, 89, 0.12)' : '#FAF8F5',
    },
    structureRadioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    radioCircle: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.inkSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    radioCircleActive: {
      borderColor: '#C5A059',
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#C5A059',
    },
    structureCardName: {
      fontSize: 13,
      fontWeight: '800',
    },
    structureCardDesc: {
      fontSize: 11.5,
      lineHeight: 16,
      paddingLeft: 24,
    },
    placesSearchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 2,
      marginBottom: 8,
    },
    placesSearchInput: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 8,
      fontSize: 13,
      color: colors.ink,
    },
    placesDropdownMenu: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      marginBottom: 8,
      overflow: 'hidden',
    },
    placeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    placeItemText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.ink,
    },
    placeItemSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    confirmedLocationCard: {
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#BBF7D0',
      borderRadius: 10,
      padding: 10,
      marginTop: 4,
      marginBottom: 12,
    },
    confirmedLocationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 2,
    },
    confirmedLocationTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: '#059669',
      textTransform: 'uppercase',
    },
    confirmedLocationText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#065F46',
    },
    grid2: {
      flexDirection: 'row',
      gap: 10,
    },
    grid3: {
      flexDirection: 'row',
      gap: 8,
    },
    nextBtn: {
      backgroundColor: '#059669',
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
    btnRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    backStepBtn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backStepText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    rulesCard: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 14,
    },
    rulesHeader: {
      fontSize: 13.5,
      fontWeight: '800',
      marginBottom: 10,
    },
    rulesCheckboxList: {
      gap: 8,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    toggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toggleIcon: {
      fontSize: 15,
    },
    toggleTitle: {
      fontSize: 13,
      fontWeight: '600',
    },
    segmentedSmall: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 3,
      gap: 4,
      borderWidth: 1,
      borderColor: colors.line,
    },
    smallSegBtn: {
      flex: 1,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    smallSegBtnActive: {
      backgroundColor: '#059669',
    },
    smallSegText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    smallSegTextActive: {
      color: '#FFFFFF',
      fontWeight: '800',
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 12,
    },
    amenityBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
    },
    amenityBadgeActive: {
      backgroundColor: '#ECFDF5',
      borderColor: '#A7F3D0',
    },
    amenityBadgeText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    amenityBadgeTextActive: {
      color: '#065F46',
      fontWeight: '700',
    },
    customAmenityRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    customAmenityInput: {
      flex: 1,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 12.5,
      color: colors.ink,
    },
    addAmenityBtn: {
      backgroundColor: '#059669',
      paddingHorizontal: 14,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addAmenityBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 4,
    },
    amenityPhotoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    amenityPhotoCard: {
      width: '48%',
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      minHeight: 120,
      justifyContent: 'space-between',
    },
    amenityCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    amenityCardName: {
      fontSize: 12,
      fontWeight: '700',
      flex: 1,
      marginRight: 4,
    },
    photoAttachedBadge: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    photoAttachedBadgeText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#15803D',
    },
    amenityThumbContainer: {
      width: '100%',
      height: 70,
      borderRadius: 6,
      overflow: 'hidden',
      position: 'relative',
    },
    amenityThumbImg: {
      width: '100%',
      height: '100%',
    },
    amenityActionRow: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      flexDirection: 'row',
      gap: 4,
    },
    amenityReplaceBtn: {
      backgroundColor: 'rgba(0,0,0,0.7)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    amenityReplaceBtnText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
    },
    amenityRemoveBtn: {
      backgroundColor: 'rgba(255,255,255,0.9)',
      padding: 3,
      borderRadius: 4,
    },
    amenityUploadPlaceholder: {
      height: 65,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.line,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    amenityPlaceholderText: {
      fontSize: 11,
      fontWeight: '700',
    },
    singleAssetBanner: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 16,
    },
    brassBadge: {
      backgroundColor: '#C5A059',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    brassBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    metricsBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    metricsLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    metricsValue: {
      fontSize: 15,
      fontWeight: '800',
    },
    metricsRent: {
      fontSize: 15,
      fontWeight: '800',
      color: '#059669',
    },
    modeTabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    modeTab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeTabActive: {
      backgroundColor: '#059669',
      borderColor: '#059669',
    },
    modeTabText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.inkSoft,
    },
    modeTabTextActive: {
      color: '#FFFFFF',
    },
    bulkBox: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 14,
    },
    bulkBoxTitle: {
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 2,
    },
    bulkBoxSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginBottom: 12,
      lineHeight: 16,
    },
    executeBulkBtn: {
      backgroundColor: '#059669',
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    executeBulkBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '800',
    },
    unitRowCard: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    unitRowTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    unitPillEditable: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: '#A7F3D0',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    unitPillPrefix: {
      fontSize: 11,
      fontWeight: '700',
      color: '#059669',
      marginRight: 4,
    },
    unitPillInput: {
      fontSize: 13,
      fontWeight: '800',
      color: '#065F46',
      minWidth: 40,
      padding: 0,
    },
    deleteUnitBtn: {
      padding: 4,
    },
    unitRowActionsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    unitPhotoAttachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: '#059669',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: '#ECFDF5',
    },
    unitPhotoAttachText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#059669',
    },
    unitPhotoThumbWrapper: {
      position: 'relative',
    },
    unitPhotoThumb: {
      width: 32,
      height: 32,
      borderRadius: 6,
    },
    unitPhotoRemoveBtn: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: '#EF4444',
      borderRadius: 8,
      width: 14,
      height: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitSpecsToggleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    unitMetaText: {
      fontSize: 11,
      fontWeight: '600',
    },
    unitExpandedDrawer: {
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      marginBottom: 8,
    },
    drawerSubLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.inkSoft,
      marginBottom: 2,
    },
    smallInput: {
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
      fontSize: 12,
      color: colors.ink,
    },
    unitInputsGrid: {
      flexDirection: 'row',
      gap: 6,
    },
    addIndividualBtn: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    addIndividualBtnText: {
      fontSize: 13,
      fontWeight: '800',
    },
    uploadPhotosBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#059669',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 4,
    },
    uploadPhotosBtnText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    galleryEmptyBox: {
      height: 100,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginBottom: 12,
    },
    galleryEmptyText: {
      fontSize: 12.5,
      fontWeight: '700',
    },
    galleryScroll: {
      marginBottom: 12,
    },
    galleryCard: {
      width: 100,
      height: 90,
      borderRadius: 8,
      overflow: 'hidden',
      marginRight: 8,
      position: 'relative',
    },
    galleryThumb: {
      width: '100%',
      height: '100%',
    },
    coverStarBtn: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    coverStarBtnActive: {
      backgroundColor: '#C5A059',
    },
    coverStarText: {
      color: '#FFFFFF',
      fontSize: 9.5,
      fontWeight: '700',
    },
    galleryDeleteBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: 'rgba(239, 68, 68, 0.85)',
      borderRadius: 10,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewSectionBox: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 12,
    },
    reviewSectionTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    amenityReviewCard: {
      width: 80,
      height: 65,
      borderRadius: 6,
      overflow: 'hidden',
      marginRight: 6,
      position: 'relative',
    },
    amenityReviewImg: {
      width: '100%',
      height: '100%',
    },
    amenityReviewLabelBox: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    amenityReviewLabelText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '600',
    },
    singleUnitReviewSpecs: {
      gap: 4,
    },
    singleUnitReviewLine: {
      fontSize: 12,
      color: colors.ink,
      lineHeight: 18,
    },
    unitReviewTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 6,
      borderRadius: 8,
      borderWidth: 1,
      marginRight: 8,
    },
    unitReviewTileImg: {
      width: 32,
      height: 32,
      borderRadius: 4,
    },
    unitReviewTilePlaceholder: {
      width: 32,
      height: 32,
      borderRadius: 4,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitReviewTileTitle: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.navy,
    },
    unitReviewTileSub: {
      fontSize: 10.5,
      color: colors.inkSoft,
    },
    reviewContainer: {
      gap: 10,
    },
    reviewHeroCard: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 12,
      padding: 12,
    },
    reviewHeroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    reviewHeroIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: '#DCFCE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewPropName: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.navy,
    },
    reviewPropTypeSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    reviewLocationRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    reviewLocationText: {
      fontSize: 11.5,
      color: colors.inkSoft,
      flex: 1,
      lineHeight: 16,
    },
    reviewStatsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    reviewStatTile: {
      width: '48%',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 10,
    },
    reviewStatTileHighlighted: {
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: '#A7F3D0',
    },
    reviewStatLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    reviewStatLabelHighlighted: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#065F46',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    reviewStatValue: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.navy,
    },
    reviewStatValueHighlighted: {
      fontSize: 15,
      fontWeight: '800',
      color: '#059669',
    },
    reviewStatSub: {
      fontSize: 10,
      color: colors.inkSoft,
      marginTop: 2,
    },
    reviewStatSubHighlighted: {
      fontSize: 10,
      color: '#047857',
      marginTop: 2,
      fontWeight: '600',
    },
    saveBtn: {
      backgroundColor: '#059669',
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
  });
