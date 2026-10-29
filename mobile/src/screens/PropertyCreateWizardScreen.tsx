import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Alert,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { ThemePalette } from '../theme/colors';
import { MobileProperty, MobileUnit } from '../types';
import { uploadOrCompressImage } from '../lib/imageUploader';
import { pickSingleImage, pickMultipleImages } from '../lib/nativePicker';
import { usePlanLimits, ResourceQuotaType } from '../hooks/usePlanLimits';
import { PlanLimitModal } from '../components/PlanLimitModal';
import { GLOBAL_CURRENCIES } from '../lib/currencyService';

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
  electricityMeter: string;
  images?: string[];
}

const UNIT_LAYOUT_TYPES = [
  'Studio',
  '1 BHK',
  '2 BHK',
  '3 BHK',
  '4 BHK',
  'Penthouse',
  'Commercial Office',
  'Shop / Retail',
];

const UNIT_FURNISHING_TYPES: ('Unfurnished' | 'Semi-Furnished' | 'Fully Furnished')[] = [
  'Unfurnished',
  'Semi-Furnished',
  'Fully Furnished',
];

const COUNTRY_OPTIONS = [
  { name: 'United States', currency: 'USD', symbol: '$', defaultRent: 2200, defaultDeposit: 4400, city: 'Austin', state: 'Texas', postalCode: '78701', address: '100 Grand Avenue' },
  { name: 'United Kingdom', currency: 'GBP', symbol: '£', defaultRent: 1800, defaultDeposit: 3600, city: 'London', state: 'Greater London', postalCode: 'EC1A 1BB', address: '24 Baker Street' },
  { name: 'European Union', currency: 'EUR', symbol: '€', defaultRent: 1900, defaultDeposit: 3800, city: 'Berlin', state: 'Berlin', postalCode: '10115', address: 'Friedrichstraße 45' },
  { name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', defaultRent: 7500, defaultDeposit: 15000, city: 'Dubai', state: 'Dubai', postalCode: '00000', address: 'Marina Promenade Tower 2' },
  { name: 'Canada', currency: 'CAD', symbol: 'CA$', defaultRent: 2400, defaultDeposit: 4800, city: 'Toronto', state: 'Ontario', postalCode: 'M5V 2T6', address: '250 Front Street W' },
  { name: 'Australia', currency: 'AUD', symbol: 'A$', defaultRent: 2600, defaultDeposit: 5200, city: 'Sydney', state: 'New South Wales', postalCode: '2000', address: '50 George Street' },
  { name: 'Singapore', currency: 'SGD', symbol: 'S$', defaultRent: 3500, defaultDeposit: 7000, city: 'Singapore', state: 'Central', postalCode: '018981', address: '12 Marina Boulevard' },
  { name: 'India', currency: 'INR', symbol: '₹', defaultRent: 26000, defaultDeposit: 52000, city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', address: 'Plot 12, Indiranagar' },
];

const ALL_GLOBAL_COUNTRIES = GLOBAL_CURRENCIES.map((c) => {
  const existingPreset = COUNTRY_OPTIONS.find((p) => p.currency === c.code || p.name === c.country);
  return {
    name: c.country ? `${c.country} (${c.name})` : c.name,
    currency: c.code,
    symbol: c.symbol,
    flag: c.flag,
    defaultRent: existingPreset ? existingPreset.defaultRent : 1500,
    defaultDeposit: existingPreset ? existingPreset.defaultDeposit : 3000,
    city: existingPreset ? existingPreset.city : (c.country || c.name),
    state: existingPreset ? existingPreset.state : (c.country || c.name),
    postalCode: existingPreset ? existingPreset.postalCode : '00000',
    address: existingPreset ? existingPreset.address : 'Main Boulevard',
  };
});

const PROPERTY_TYPES = [
  'Residential Apartment Complex',
  'Commercial Office Building',
  'Gated Community / Villa',
  'Mixed-Use Commercial & Res',
  'Co-Living / PG Building',
];

const getPropertyTypeIcon = (type: string): keyof typeof Feather.glyphMap => {
  if (type.includes('Commercial')) return 'briefcase';
  if (type.includes('Villa')) return 'shield';
  if (type.includes('Co-Living')) return 'users';
  if (type.includes('Mixed')) return 'layers';
  return 'home';
};

const PREDEFINED_AMENITIES = [
  '24/7 Security',
  'Elevator',
  'Covered Parking',
  'Gymnasium',
  'Swimming Pool',
  'Power Backup',
  'CCTV Surveillance',
  'Clubhouse',
  'EV Charging Station',
  'Visitor Parking',
  'Water Softener',
  'Rooftop Garden',
];

export const POPULAR_GOOGLE_PLACES = [
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
    formattedAddress: 'Gachibowli Financial District, Hyderabad, Telangana 500032, India',
    addressLine: 'Financial District, Nanakramguda, Gachibowli',
    city: 'Hyderabad',
    state: 'Telangana',
    country: 'India',
    postalCode: '500032',
    lat: 17.4194,
    lng: 78.3432,
  },
  {
    formattedAddress: 'Bandra Kurla Complex (BKC), Bandra East, Mumbai, Maharashtra 400051, India',
    addressLine: 'G Block, Bandra Kurla Complex',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    postalCode: '400051',
    lat: 19.0657,
    lng: 72.8687,
  },
  {
    formattedAddress: 'Koregaon Park North Main Road, Pune, Maharashtra 411001, India',
    addressLine: 'Lane 5, North Main Road, Koregaon Park',
    city: 'Pune',
    state: 'Maharashtra',
    country: 'India',
    postalCode: '411001',
    lat: 18.5362,
    lng: 73.8940,
  },
  {
    formattedAddress: 'Connaught Place, Central Delhi, New Delhi, Delhi 110001, India',
    addressLine: 'Inner Circle, Connaught Place',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    postalCode: '110001',
    lat: 28.6315,
    lng: 77.2167,
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
  const { viewCurrency, getSymbol, format } = useMobileCurrency();
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { usage, currentPlanName } = usePlanLimits();
  const [limitModalType, setLimitModalType] = useState<ResourceQuotaType | null>(null);

  const initialCountryOption =
    COUNTRY_OPTIONS.find((c) => c.currency === viewCurrency) ||
    COUNTRY_OPTIONS[0];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Identity & Structure
  const [propertyName, setPropertyName] = useState('Grand Palms Residence');
  const [propertyType, setPropertyType] = useState('Residential Apartment Complex');
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [country, setCountry] = useState(initialCountryOption.name);
  const [currency, setCurrency] = useState(initialCountryOption.currency);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [addressLine, setAddressLine] = useState(initialCountryOption.address);
  const [city, setCity] = useState(initialCountryOption.city);
  const [stateName, setStateName] = useState(initialCountryOption.state);
  const [postalCode, setPostalCode] = useState(initialCountryOption.postalCode);
  const [floorsCount, setFloorsCount] = useState('4');
  const [yearBuilt, setYearBuilt] = useState('2023');
  const [assignedManagerId, setAssignedManagerId] = useState('');
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);

  // Google Maps Places (New) state & handlers
  const GOOGLE_MAPS_API_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    'AIzaSyCag0ilgHZgDX4cUuI1SOWstKXyK12vfZI';

  const [placesSearchQuery, setPlacesSearchQuery] = useState('');
  const [isPlacesDropdownOpen, setIsPlacesDropdownOpen] = useState(false);
  const [isPlacesLoading, setIsPlacesLoading] = useState(false);
  const [livePlaces, setLivePlaces] = useState<typeof POPULAR_GOOGLE_PLACES>([]);
  const placesDebounceRef = useRef<any>(null);
  const activePlacesQueryRef = useRef<string>('');

  const [confirmedLocation, setConfirmedLocation] = useState<string>(
    `${initialCountryOption.address}, ${initialCountryOption.city}, ${initialCountryOption.state}`
  );
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat?: number; lng?: number }>({
    lat: 28.3973,
    lng: 77.0694,
  });

  const availableManagers = useMemo(() => {
    const list: { id: string; name: string; role: string; phone?: string; email?: string }[] = [];
    if (state.propertyManagers && state.propertyManagers.length > 0) {
      state.propertyManagers
        .filter((m) => (!user?.id || !m.ownerId || m.ownerId === user.id))
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

  const searchGooglePlacesNew = async (query: string): Promise<typeof POPULAR_GOOGLE_PLACES> => {
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

      if (!res.ok) {
        return [];
      }

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
            const country = parts[parts.length - 1] || '';

            return {
              formattedAddress: text,
              addressLine,
              city,
              state: parts.length > 2 ? parts[1] : '',
              country,
              postalCode: '',
              lat: 0,
              lng: 0,
              placeId: pred.placeId,
            };
          });
      }
    } catch (err) {
      console.warn('Failed to fetch Places API predictions on mobile:', err);
    }

    return [];
  };

  const fetchGooglePlaceDetails = async (
    placeId: string,
    fallback: typeof POPULAR_GOOGLE_PLACES[0] & { placeId?: string }
  ): Promise<typeof POPULAR_GOOGLE_PLACES[0] & { placeId?: string }> => {
    if (!placeId || !GOOGLE_MAPS_API_KEY) return fallback;

    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,formattedAddress,addressComponents,location&key=${GOOGLE_MAPS_API_KEY}`
      );
      if (!res.ok) {
        return fallback;
      }

      const data = await res.json();
      let city = fallback.city;
      let state = fallback.state;
      let country = fallback.country;
      let postalCode = fallback.postalCode;
      let addressLine = fallback.addressLine;

      if (data.addressComponents && Array.isArray(data.addressComponents)) {
        for (const comp of data.addressComponents) {
          const text = comp.longText || comp.shortText || '';
          const types: string[] = comp.types || [];
          if (types.includes('locality') || types.includes('postal_town')) city = text;
          else if (!city && types.includes('administrative_area_level_2')) city = text;
          if (types.includes('administrative_area_level_1')) state = text;
          if (types.includes('country')) country = text;
          if (types.includes('postal_code')) postalCode = text;
          if (types.includes('route')) {
            addressLine = addressLine ? `${addressLine}, ${text}` : text;
          }
        }
      }

      return {
        formattedAddress: data.formattedAddress || data.displayName?.text || fallback.formattedAddress,
        addressLine: addressLine || fallback.addressLine,
        city: city || fallback.city,
        state: state || fallback.state,
        country: country || fallback.country,
        postalCode: postalCode || fallback.postalCode,
        lat: data.location?.latitude || fallback.lat,
        lng: data.location?.longitude || fallback.lng,
        placeId,
      };
    } catch (err) {
      console.warn('Failed to fetch Places API details on mobile:', err);
      return fallback;
    }
  };

  const placesSuggestions = useMemo(() => {
    const q = placesSearchQuery.trim().toLowerCase();
    if (!q) {
      return POPULAR_GOOGLE_PLACES.slice(0, 5);
    }
    if (livePlaces.length > 0) {
      return livePlaces;
    }
    return POPULAR_GOOGLE_PLACES.filter(
      (p) =>
        p.formattedAddress.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q)
    );
  }, [placesSearchQuery, livePlaces]);

  const handleSelectPlace = async (p: typeof POPULAR_GOOGLE_PLACES[0] & { placeId?: string }) => {
    let finalPlace = p;
    if (p.placeId) {
      setIsPlacesLoading(true);
      finalPlace = await fetchGooglePlaceDetails(p.placeId, p);
      setIsPlacesLoading(false);
    }

    setConfirmedLocation(finalPlace.formattedAddress);
    setPlacesSearchQuery(finalPlace.formattedAddress);
    setAddressLine(finalPlace.addressLine || finalPlace.formattedAddress);
    if (finalPlace.city) setCity(finalPlace.city);
    if (finalPlace.state) setStateName(finalPlace.state);
    if (finalPlace.postalCode) setPostalCode(finalPlace.postalCode);
    if (finalPlace.lat && finalPlace.lng) {
      setSelectedCoordinates({ lat: finalPlace.lat, lng: finalPlace.lng });
    }
    setIsPlacesDropdownOpen(false);
    if (finalPlace.country && finalPlace.country !== country) {
      handleCountrySelect(finalPlace.country);
    }
  };

  const handleSelectCustomQueryAsLocation = () => {
    if (!placesSearchQuery.trim()) return;
    setConfirmedLocation(placesSearchQuery.trim());
    setAddressLine(placesSearchQuery.trim());
    setIsPlacesDropdownOpen(false);
  };

  const handleStep1Next = () => {
    if (!propertyName.trim()) {
      Alert.alert('Required', 'Please enter a property name.');
      return;
    }
    if (!addressLine.trim() || !city.trim()) {
      Alert.alert('Address Required', 'Please enter or select a valid Google Maps address in Step 1.');
      return;
    }
    setStep(2);
  };

  // Step 2: Operational Policies & Amenities
  const [petsAllowed, setPetsAllowed] = useState(true);
  const [smokingAllowed, setSmokingAllowed] = useState(false);
  const [sublettingAllowed, setSublettingAllowed] = useState(false);
  const [minLeaseMonths, setMinLeaseMonths] = useState(11);
  const [noticePeriodDays, setNoticePeriodDays] = useState(30);

  const [amenities, setAmenities] = useState<string[]>([
    '24/7 Security',
    'Elevator',
    'Covered Parking',
    'Gymnasium',
    'Power Backup',
  ]);
  const [isAmenitiesDropdownOpen, setIsAmenitiesDropdownOpen] = useState(false);
  const [customAmenityInput, setCustomAmenityInput] = useState('');
  const [amenityPhotos, setAmenityPhotos] = useState<Record<string, string>>({
    'Gymnasium': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80',
    '24/7 Security': 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80',
  });

  // Step 3: Units Inventory Setup & Bulk Generator
  const [unitsMode, setUnitsMode] = useState<'bulk' | 'table'>('table');
  const [bulkStartFloor, setBulkStartFloor] = useState('1');
  const [bulkEndFloor, setBulkEndFloor] = useState('3');
  const [bulkUnitsPerFloor, setBulkUnitsPerFloor] = useState('2');
  const [bulkLayoutType, setBulkLayoutType] = useState('2 BHK');
  const [bulkFurnishing, setBulkFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [bulkAreaSqFt, setBulkAreaSqFt] = useState('1100');
  const [bulkBaseRent, setBulkBaseRent] = useState(String(initialCountryOption.defaultRent));
  const [bulkBaseDeposit, setBulkBaseDeposit] = useState(String(initialCountryOption.defaultDeposit));
  const [bulkNumberingScheme, setBulkNumberingScheme] = useState<'standard' | 'suffix' | 'tower'>('standard');
  const [bulkTowerPrefix, setBulkTowerPrefix] = useState('Wing A');
  const [bulkMeterPrefix, setBulkMeterPrefix] = useState('MTR');
  const [openUnitDropdown, setOpenUnitDropdown] = useState<{ idx: number; field: 'layout' | 'furnishing' } | null>(null);
  const [isBulkLayoutDropdownOpen, setIsBulkLayoutDropdownOpen] = useState(false);
  const [isBulkFurnishingDropdownOpen, setIsBulkFurnishingDropdownOpen] = useState(false);

  const [initialUnits, setInitialUnits] = useState<UnitDraft[]>([
    {
      unitNumber: '101',
      unitType: '2 BHK',
      floor: '1st Floor',
      areaSqFt: 1100,
      furnishing: 'Semi-Furnished',
      rent: initialCountryOption.defaultRent,
      deposit: initialCountryOption.defaultDeposit,
      currency: initialCountryOption.currency,
      electricityMeter: 'MTR-101',
    },
    {
      unitNumber: '102',
      unitType: '2 BHK',
      floor: '1st Floor',
      areaSqFt: 1100,
      furnishing: 'Semi-Furnished',
      rent: initialCountryOption.defaultRent,
      deposit: initialCountryOption.defaultDeposit,
      currency: initialCountryOption.currency,
      electricityMeter: 'MTR-102',
    },
    {
      unitNumber: '201',
      unitType: '3 BHK',
      floor: '2nd Floor',
      areaSqFt: 1450,
      furnishing: 'Fully Furnished',
      rent: Math.round(initialCountryOption.defaultRent * 1.3),
      deposit: Math.round(initialCountryOption.defaultDeposit * 1.3),
      currency: initialCountryOption.currency,
      electricityMeter: 'MTR-201',
    },
  ]);
  const [expandedUnitIndices, setExpandedUnitIndices] = useState<Record<number, boolean>>({});

  // Step 4: Gallery & Review
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [coverPhotoIndex, setCoverPhotoIndex] = useState(0);

  const handleUploadGalleryPhotos = async () => {
    try {
      const picked = await pickMultipleImages({ quality: 0.8 });
      if (picked.length === 0) return;
      Alert.alert('Processing Photos', `Compressing & uploading ${picked.length} property photo(s)...`);
      const newUploadedUrls: string[] = [];
      for (const item of picked) {
        const payload = item.file || item.base64 || item.uri;
        const url = await uploadOrCompressImage(
          payload,
          `properties/gallery/${Date.now()}_${item.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
        );
        if (url) newUploadedUrls.push(url);
      }
      if (newUploadedUrls.length > 0) {
        const updated = [...galleryImages, ...newUploadedUrls];
        setGalleryImages(updated);
        setCoverPhotoIndex(0);
        Alert.alert('Upload Complete ✓', `Added ${newUploadedUrls.length} photo(s) to property gallery.`);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Could not upload photos.');
    }
  };

  // Handlers
  const handleCountrySelect = (cName: string, explicitCurrency?: string) => {
    setCountry(cName);
    const match = ALL_GLOBAL_COUNTRIES.find((c) => c.name === cName || (explicitCurrency && c.currency === explicitCurrency)) || COUNTRY_OPTIONS.find((c) => c.name === cName);
    if (match) {
      setCurrency(match.currency);
      setBulkBaseRent(String(match.defaultRent));
      setBulkBaseDeposit(String(match.defaultDeposit));
      setInitialUnits((prev) =>
        prev.map((u) => ({
          ...u,
          currency: match.currency,
          rent: match.defaultRent,
          deposit: match.defaultDeposit,
        }))
      );
      setAddressLine(match.address);
      setCity(match.city);
      setStateName(match.state);
      setPostalCode(match.postalCode);
      setConfirmedLocation(`${match.address}, ${match.city}, ${match.state} ${match.postalCode}`);
      setPlacesSearchQuery('');
    }
  };

  const toggleAmenity = (name: string) => {
    if (amenities.includes(name)) {
      setAmenities(amenities.filter((a) => a !== name));
    } else {
      setAmenities([...amenities, name]);
    }
  };

  const handleAddCustomAmenity = () => {
    const clean = customAmenityInput.trim();
    if (clean && !amenities.includes(clean)) {
      setAmenities([...amenities, clean]);
      setCustomAmenityInput('');
    }
  };

  const handleUploadAmenityPhoto = async (am: string) => {
    try {
      const picked = await pickSingleImage({ quality: 0.8 });
      if (!picked) return;
      Alert.alert('Processing Photo', `Optimizing photo for ${am}...`);
      const payload = picked.file || picked.base64 || picked.uri;
      const url = await uploadOrCompressImage(
        payload,
        `properties/amenities/${Date.now()}_${picked.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      );
      if (url) {
        setAmenityPhotos((prev) => ({ ...prev, [am]: url }));
        Alert.alert('Photo Attached ✓', `Uploaded photo for ${am}`);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Could not upload photo.');
    }
  };

  const handleRemoveAmenityPhoto = (am: string) => {
    setAmenityPhotos((prev) => {
      const next = { ...prev };
      delete next[am];
      return next;
    });
  };

  const handleGenerateBulkUnits = () => {
    const startF = Math.max(1, parseInt(bulkStartFloor, 10) || 1);
    const endF = Math.max(startF, parseInt(bulkEndFloor, 10) || 1);
    const perFloor = Math.max(1, parseInt(bulkUnitsPerFloor, 10) || 2);
    const rentNum = parseInt(bulkBaseRent, 10) || 25000;
    const depNum = parseInt(bulkBaseDeposit, 10) || 50000;
    const sqFtNum = parseInt(bulkAreaSqFt, 10) || 1100;

    const suffixes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const generated: UnitDraft[] = [];
    for (let f = startF; f <= endF; f++) {
      for (let u = 1; u <= perFloor; u++) {
        let uNum = `${f * 100 + u}`;
        if (bulkNumberingScheme === 'suffix') {
          uNum = `${f}${suffixes[(u - 1) % suffixes.length]}`;
        } else if (bulkNumberingScheme === 'tower') {
          uNum = `${bulkTowerPrefix ? bulkTowerPrefix + '-' : ''}${f * 100 + u}`;
        }
        generated.push({
          unitNumber: uNum,
          unitType: bulkLayoutType,
          floor: `Floor ${f}`,
          areaSqFt: sqFtNum,
          furnishing: bulkFurnishing,
          rent: rentNum,
          deposit: depNum,
          currency: currency,
          electricityMeter: `${bulkMeterPrefix}-${uNum.replace(/[^a-zA-Z0-9]/g, '')}`,
        });
      }
    }
    setInitialUnits(generated);
    setUnitsMode('table');
    Alert.alert('Units Generated ⚡', `Successfully created ${generated.length} units across ${endF - startF + 1} floors!`);
  };

  const handleAddIndividualUnit = () => {
    const nextNum = (100 + initialUnits.length + 1).toString();
    setInitialUnits([
      ...initialUnits,
      {
        unitNumber: nextNum,
        unitType: '2 BHK',
        floor: '1st Floor',
        areaSqFt: 1100,
        furnishing: 'Semi-Furnished',
        rent: 25000,
        deposit: 50000,
        currency: currency,
        electricityMeter: `MTR-${nextNum}`,
      },
    ]);
  };

  const handleDeleteUnit = (index: number) => {
    setInitialUnits(initialUnits.filter((_, idx) => idx !== index));
  };

  const toggleUnitExpand = (idx: number) => {
    setExpandedUnitIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleUploadUnitPhoto = async (unitIndex: number) => {
    try {
      const picked = await pickSingleImage({ quality: 0.8 });
      if (!picked) return;
      Alert.alert('Processing Photo', 'Compressing & uploading unit photo...');
      const payload = picked.file || picked.base64 || picked.uri;
      const optimized = await uploadOrCompressImage(
        payload,
        `units/${Date.now()}_${picked.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      );
      if (optimized) {
        setInitialUnits((prev) =>
          prev.map((item, idx) =>
            idx === unitIndex ? { ...item, images: [optimized] } : item
          )
        );
        Alert.alert('Photo Attached ✓', `Photo attached to Unit ${initialUnits[unitIndex]?.unitNumber}`);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Could not upload unit photo.');
    }
  };

  const handleRemoveUnitPhoto = (unitIndex: number) => {
    setInitialUnits((prev) =>
      prev.map((item, idx) =>
        idx === unitIndex ? { ...item, images: [] } : item
      )
    );
  };

  const totalProjectedMonthlyRent = initialUnits.reduce((sum, u) => sum + (u.rent || 0), 0);

  const handleSaveAndPublish = () => {
    if (!propertyName.trim()) {
      setStep(1);
      Alert.alert('Required', 'Please enter a property name.');
      return;
    }
    if (initialUnits.length === 0) {
      setStep(3);
      Alert.alert('Units Required', 'Please configure at least one unit before publishing.');
      return;
    }
    if (planUsage.isPropertyLimitReached) {
      Alert.alert(
        'Plan Limit Reached',
        `You have used all ${planUsage.propertiesMax} properties on your ${planUsage.planName}. Please upgrade your tier.`
      );
      return;
    }

    const propId = `prop-${Date.now()}`;
    const sortedImages = [...galleryImages];
    if (coverPhotoIndex > 0 && coverPhotoIndex < sortedImages.length) {
      const [cover] = sortedImages.splice(coverPhotoIndex, 1);
      sortedImages.unshift(cover);
    }

    const newProp: MobileProperty = {
      id: propId,
      ownerId: user.id,
      name: propertyName.trim(),
      propertyType,
      floorsCount: parseInt(floorsCount, 10) || 3,
      yearBuilt: parseInt(yearBuilt, 10) || 2023,
      country,
      currency,
      address: {
        formattedAddress: confirmedLocation || `${addressLine.trim()}, ${city.trim()}, ${stateName.trim()} ${postalCode.trim()}`,
        city: city.trim(),
        state: stateName.trim(),
        country,
        postalCode: postalCode.trim(),
        lat: selectedCoordinates.lat,
        lng: selectedCoordinates.lng,
      },
      unitCount: initialUnits.length,
      occupied: 0,
      amenities,
      amenityPhotos: Object.entries(amenityPhotos)
        .filter(([name]) => amenities.includes(name))
        .map(([name, image]) => ({ name, image })),
      images: sortedImages,
      coverPhotoIndex: 0,
      assignedManagerId: assignedManagerId || undefined,
      rules: {
        petsAllowed,
        smokingAllowed,
        sublettingAllowed,
        minLeaseMonths,
        noticePeriodDays,
      },
      createdAt: new Date().toISOString(),
    };

    const newUnitsList: MobileUnit[] = initialUnits.map((u) => ({
      id: `unit-${propId}-${u.unitNumber}`,
      propertyId: propId,
      propertyName: propertyName.trim(),
      ownerId: user.id,
      unitNumber: u.unitNumber,
      unitType: u.unitType,
      floor: u.floor,
      areaSqFt: u.areaSqFt,
      furnishing: u.furnishing,
      rent: u.rent,
      deposit: u.deposit,
      currency: currency,
      status: 'vacant',
      isListedPublicly: true,
      tenant: null,
      currentTenantId: null,
      electricityMeter: u.electricityMeter,
      images: galleryImages.length > 0 ? [galleryImages[0]] : [],
      image: galleryImages[0] || '',
    }));

    if (usage.properties.isFull) {
      setLimitModalType('properties');
      return;
    }
    if (usage.units.used + newUnitsList.length > usage.units.max) {
      setLimitModalType('units');
      return;
    }

    saveProperty(newProp, newUnitsList);
    Alert.alert(
      'Property Published! 🎉',
      `"${newProp.name}" with ${newUnitsList.length} configured units is now live in your portfolio.`
    );
    if (onSuccess) onSuccess();
    else if (onBack) onBack();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, isDark && { backgroundColor: '#1E293B' }]} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="home" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>New Property</Text>
          </View>
        </View>
        <View style={[styles.stepBadge, isDark && { backgroundColor: '#064E3B', borderColor: '#059669' }]}>
          <Text style={[styles.stepBadgeText, isDark && { color: '#6EE7B7' }]}>STEP {step} / 4</Text>
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Tier Quota Indicator Banner */}
        <View style={[styles.quotaBanner, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.quotaBannerTitle, isDark && { color: '#6EE7B7' }]}>
              {planUsage.planName}: {planUsage.propertiesUsed} / {planUsage.propertiesMax} Properties Used
            </Text>
            <Text style={[styles.quotaBannerSub, isDark && { color: '#A7F3D0' }]}>
              {planUsage.unitsUsed} / {planUsage.unitsMax} Units registered in portfolio
            </Text>
          </View>
          <View style={styles.quotaBadge}>
            <Text style={styles.quotaBadgeText}>Quota OK</Text>
          </View>
        </View>

        {/* Step Progress Segmented Bar - Web Parity Flow */}
        <View style={styles.stepsNavRow}>
          {[
            { num: 1, label: 'Info', icon: 'home' },
            { num: 2, label: 'Rules', icon: 'shield' },
            { num: 3, label: 'Units', icon: 'layers' },
            { num: 4, label: 'Photos', icon: 'image' },
          ].map((s) => (
            <TouchableOpacity
              key={s.num}
              style={[
                styles.stepTabPill,
                { backgroundColor: colors.surface, borderColor: colors.line },
                step === s.num && styles.stepTabPillActive,
                step > s.num && (isDark ? { backgroundColor: 'rgba(16, 185, 129, 0.18)', borderColor: 'rgba(16, 185, 129, 0.35)' } : styles.stepTabPillCompleted),
              ]}
              onPress={() => setStep(s.num as any)}
              activeOpacity={0.8}
            >
              <Feather
                name={(step > s.num ? 'check' : s.icon) as any}
                size={12}
                color={step === s.num ? '#FFFFFF' : step > s.num ? (isDark ? '#34D399' : '#059669') : colors.inkSoft}
                style={{ marginRight: 3 }}
              />
              <Text
                style={[
                  styles.stepTabPillText,
                  { color: colors.inkSoft },
                  step === s.num && styles.stepTabPillTextActive,
                  step > s.num && (isDark ? { color: '#34D399' } : styles.stepTabPillTextCompleted),
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* STEP 1: IDENTITY & GEOLOCATION */}
        {step === 1 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>1. Identity & Physical Structure</Text>

            <Text style={styles.inputLabel}>Property Name *</Text>
            <TextInput
              style={styles.input}
              value={propertyName}
              onChangeText={setPropertyName}
              placeholder="e.g. Palm Residency, Tower A"
              placeholderTextColor={colors.inkSoft}
            />

            <Text style={styles.inputLabel}>Property Classification</Text>
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity
                style={[
                  styles.dropdownTrigger,
                  isTypeDropdownOpen && styles.dropdownTriggerActive,
                ]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsTypeDropdownOpen((prev) => !prev);
                  if (isCountryDropdownOpen) setIsCountryDropdownOpen(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.dropdownLeft}>
                  <View style={styles.dropdownBadge}>
                    <Feather
                      name={getPropertyTypeIcon(propertyType)}
                      size={14}
                      color={isDark ? '#34D399' : '#059669'}
                    />
                  </View>
                  <Text style={styles.dropdownText}>
                    {propertyType || 'Select Property Classification'}
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
                  {PROPERTY_TYPES.map((type) => {
                    const isSelected = propertyType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.dropdownItem,
                          isSelected && (isDark ? { backgroundColor: '#064E3B33' } : styles.dropdownItemActive),
                          isDark && { borderBottomColor: '#334155' },
                        ]}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setPropertyType(type);
                          setIsTypeDropdownOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View
                            style={[
                              styles.dropdownBadge,
                              isSelected && { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' },
                            ]}
                          >
                            <Feather
                              name={getPropertyTypeIcon(type)}
                              size={13}
                              color={isSelected ? '#059669' : '#64748B'}
                            />
                          </View>
                          <Text
                            style={[
                              styles.dropdownItemText,
                              isSelected && styles.dropdownItemTextActive,
                            ]}
                          >
                            {type}
                          </Text>
                        </View>
                        {isSelected && <Feather name="check" size={16} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <Text style={styles.inputLabel}>Operational Country & Currency</Text>
            {(() => {
              const selectedCountry =
                ALL_GLOBAL_COUNTRIES.find((c) => c.name === country || c.currency === currency) ||
                COUNTRY_OPTIONS.find((c) => c.name === country) || initialCountryOption;

              const filteredCountries = ALL_GLOBAL_COUNTRIES.filter((c) => {
                const q = countrySearchQuery.toLowerCase().trim();
                if (!q) return true;
                return (
                  c.name.toLowerCase().includes(q) ||
                  c.currency.toLowerCase().includes(q) ||
                  (c.symbol && c.symbol.toLowerCase().includes(q))
                );
              });

              return (
                <View>
                  <TouchableOpacity
                    style={[
                      styles.dropdownTrigger,
                      isCountryDropdownOpen && styles.dropdownTriggerActive,
                    ]}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setIsCountryDropdownOpen((prev) => !prev);
                      if (isTypeDropdownOpen) setIsTypeDropdownOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dropdownLeft}>
                      <View style={styles.dropdownBadge}>
                        <Text style={styles.dropdownBadgeSymbol}>{selectedCountry.symbol}</Text>
                      </View>
                      <Text style={styles.dropdownText}>
                        {selectedCountry.name} ({selectedCountry.currency})
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
                      {/* Real-time search input */}
                      <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSunken, borderRadius: 6, paddingHorizontal: 8 }}>
                          <Feather name="search" size={14} color={colors.inkSoft} style={{ marginRight: 6 }} />
                          <TextInput
                            placeholder="Search 160+ currencies & countries..."
                            placeholderTextColor={colors.inkSoft}
                            value={countrySearchQuery}
                            onChangeText={setCountrySearchQuery}
                            style={{ flex: 1, paddingVertical: 6, fontSize: 13, color: colors.ink }}
                            autoCapitalize="none"
                          />
                          {countrySearchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setCountrySearchQuery('')}>
                              <Feather name="x" size={14} color={colors.inkSoft} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* Scrollable list of 160+ currencies */}
                      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {filteredCountries.length === 0 ? (
                          <View style={{ padding: 14, alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, color: colors.inkSoft }}>No matching currencies found</Text>
                          </View>
                        ) : (
                          filteredCountries.map((c) => {
                            const isSelected = (country === c.name) || (currency === c.currency);
                            return (
                              <TouchableOpacity
                                key={`${c.name}-${c.currency}`}
                                style={[
                                  styles.dropdownItem,
                                  isSelected && styles.dropdownItemActive,
                                ]}
                                onPress={() => {
                                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                  handleCountrySelect(c.name, c.currency);
                                  setIsCountryDropdownOpen(false);
                                  setCountrySearchQuery('');
                                }}
                                activeOpacity={0.7}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                  <View
                                    style={[
                                      styles.dropdownBadge,
                                      isSelected && { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#D1FAE5', borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#6EE7B7' },
                                    ]}
                                  >
                                    <Text style={styles.dropdownBadgeSymbol}>{c.symbol}</Text>
                                  </View>
                                  <Text
                                    style={[
                                      styles.dropdownItemText,
                                      isSelected && styles.dropdownItemTextActive,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {c.name} ({c.currency})
                                  </Text>
                                </View>
                                {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Assigned Property Manager */}
            <Text style={styles.inputLabel}>Assigned Property Manager</Text>
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity
                style={[
                  styles.dropdownTrigger,
                  isManagerDropdownOpen && styles.dropdownTriggerActive,
                ]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsManagerDropdownOpen((prev) => !prev);
                  if (isTypeDropdownOpen) setIsTypeDropdownOpen(false);
                  if (isCountryDropdownOpen) setIsCountryDropdownOpen(false);
                  if (isPlacesDropdownOpen) setIsPlacesDropdownOpen(false);
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
                      style={[
                        styles.dropdownItem,
                        !assignedManagerId && (isDark ? { backgroundColor: '#064E3B33' } : styles.dropdownItemActive),
                        isDark && { borderBottomColor: '#334155' },
                      ]}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setAssignedManagerId('');
                        setIsManagerDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dropdownItemText, !assignedManagerId && styles.dropdownItemTextActive]}>
                          None (Direct Owner Operations)
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>Owner handles all operations directly</Text>
                      </View>
                      {!assignedManagerId && <Feather name="check" size={16} color="#059669" />}
                    </TouchableOpacity>

                    {availableManagers.map((m) => {
                      const isSelected = assignedManagerId === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.dropdownItem,
                            isSelected && styles.dropdownItemActive,
                          ]}
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
                            <Text style={{ fontSize: 11, color: '#64748B' }}>
                              {m.role} {m.phone ? `• ${m.phone}` : m.email ? `• ${m.email}` : ''}
                            </Text>
                          </View>
                          {isSelected && <Feather name="check" size={16} color="#059669" />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
              {availableManagers.length === 0 && (
                <Text style={styles.fieldHelpText}>
                  No managers onboarded yet. You can onboard delegated property managers from Team & Managers.
                </Text>
              )}
            </View>

            {/* Google Maps Places Address * */}
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.inputLabel}>Google Maps Places Address *</Text>
              <Text style={styles.hintText}>
                Search and select location to auto-populate city, state, country, and coordinates.
              </Text>

              <View style={styles.placesSearchBox}>
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
                      const results = await searchGooglePlacesNew(val);
                      if (activePlacesQueryRef.current === val) {
                        setLivePlaces(results);
                        setIsPlacesLoading(false);
                      }
                    }, 280);
                  }}
                  onFocus={() => setIsPlacesDropdownOpen(true)}
                  placeholder="Search street, city, or landmark (Google Maps)..."
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />
                {isPlacesLoading && (
                  <ActivityIndicator size="small" color="#059669" style={{ marginRight: 6 }} />
                )}
                {placesSearchQuery ? (
                  <TouchableOpacity
                    onPress={() => {
                      setPlacesSearchQuery('');
                      setLivePlaces([]);
                      setIsPlacesDropdownOpen(false);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

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
                          <Text style={styles.placeItemSub}>
                            Apply as verified property location
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              )}

              {confirmedLocation ? (
                <View style={styles.confirmedLocationCard}>
                  <View style={styles.confirmedLocationHeader}>
                    <Feather name="map-pin" size={14} color="#059669" />
                    <Text style={styles.confirmedLocationTitle}>Confirmed Location</Text>
                  </View>
                  <Text style={styles.confirmedLocationText}>{confirmedLocation} ({country})</Text>
                  <Text style={styles.confirmedLocationHint}>
                    Auto-populated into verified street address fields below.
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>Verified Street Address</Text>

            <Text style={styles.inputLabel}>Street / Building / Landmark</Text>
            <TextInput
              style={styles.input}
              value={addressLine}
              onChangeText={setAddressLine}
              placeholder="e.g. Plot 12, Golf Course Ext Road"
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>City</Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="Gurugram"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>State / Region</Text>
                <TextInput
                  style={styles.input}
                  value={stateName}
                  onChangeText={setStateName}
                  placeholder="Haryana"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Postal / PIN Code</Text>
                <TextInput
                  style={styles.input}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="122018"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Total Floors</Text>
                <TextInput
                  style={styles.input}
                  value={floorsCount}
                  onChangeText={setFloorsCount}
                  keyboardType="numeric"
                  placeholder="4"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Year Built / Commissioned</Text>
            <TextInput
              style={styles.input}
              value={yearBuilt}
              onChangeText={setYearBuilt}
              keyboardType="numeric"
              placeholder="2023"
              placeholderTextColor="#94A3B8"
            />

            <TouchableOpacity
              style={[styles.nextBtn, { marginTop: 16 }]}
              onPress={handleStep1Next}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2: POLICIES, RULES & AMENITIES */}
        {step === 2 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>2. Operational Policies & Amenities</Text>

            {/* Interactive House Rules */}
            <View style={styles.rulesCard}>
              <Text style={styles.rulesHeader}>Standard House Rules & Conduct</Text>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setPetsAllowed(!petsAllowed)}
                activeOpacity={0.8}
              >
                <View style={styles.toggleLeft}>
                  <Text style={styles.toggleIcon}>🐾</Text>
                  <Text style={styles.toggleTitle}>Pets Permitted</Text>
                </View>
                <Ionicons
                  name={petsAllowed ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={petsAllowed ? '#10B981' : '#94A3B8'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setSmokingAllowed(!smokingAllowed)}
                activeOpacity={0.8}
              >
                <View style={styles.toggleLeft}>
                  <Text style={styles.toggleIcon}>🚭</Text>
                  <Text style={styles.toggleTitle}>Smoking Permitted</Text>
                </View>
                <Ionicons
                  name={smokingAllowed ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={smokingAllowed ? '#10B981' : '#94A3B8'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setSublettingAllowed(!sublettingAllowed)}
                activeOpacity={0.8}
              >
                <View style={styles.toggleLeft}>
                  <Text style={styles.toggleIcon}>🤝</Text>
                  <Text style={styles.toggleTitle}>Subletting Permitted</Text>
                </View>
                <Ionicons
                  name={sublettingAllowed ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={sublettingAllowed ? '#10B981' : '#94A3B8'}
                />
              </TouchableOpacity>
            </View>

            {/* Lease Minimums & Notice (Stacked One Below Other) */}
            <View style={{ gap: 12 }}>
              <View>
                <Text style={styles.inputLabel}>Min Lease Duration</Text>
                <View style={styles.segmentedSmall}>
                  {[6, 11, 12, 24].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.smallSegBtn, minLeaseMonths === m && styles.smallSegBtnActive]}
                      onPress={() => setMinLeaseMonths(m)}
                    >
                      <Text style={[styles.smallSegText, minLeaseMonths === m && styles.smallSegTextActive]}>
                        {m}M
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.inputLabel}>Vacate Notice Days</Text>
                <View style={styles.segmentedSmall}>
                  {[15, 30, 60].map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.smallSegBtn, noticePeriodDays === d && styles.smallSegBtnActive]}
                      onPress={() => setNoticePeriodDays(d)}
                    >
                      <Text style={[styles.smallSegText, noticePeriodDays === d && styles.smallSegTextActive]}>
                        {d}d
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>Property Amenities ({amenities.length} selected)</Text>

            <TouchableOpacity
              style={[styles.dropdownTrigger, isAmenitiesDropdownOpen && styles.dropdownTriggerActive]}
              onPress={() => setIsAmenitiesDropdownOpen((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={styles.dropdownLeft}>
                <View style={styles.dropdownBadge}>
                  <Text style={styles.dropdownBadgeSymbol}>{amenities.length}</Text>
                </View>
                <Text style={styles.dropdownText}>
                  {amenities.length === 0
                    ? 'Select Amenities'
                    : `${amenities.length} Amenit${amenities.length === 1 ? 'y' : 'ies'} Selected`}
                </Text>
              </View>
              <Feather
                name={isAmenitiesDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={isAmenitiesDropdownOpen ? '#059669' : '#64748B'}
              />
            </TouchableOpacity>

            {isAmenitiesDropdownOpen && (
              <View style={styles.dropdownMenu}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {PREDEFINED_AMENITIES.map((item) => {
                    const isSelected = amenities.includes(item);
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                        onPress={() => toggleAmenity(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                          {item}
                        </Text>
                        {isSelected && <Feather name="check" size={16} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Selected Amenities Tag Cloud */}
            {amenities.length > 0 && (
              <View style={[styles.chipGrid, { marginTop: 8 }]}>
                {amenities.map((item) => (
                  <View key={item} style={styles.selectedAmenityPill}>
                    <Text style={styles.selectedAmenityPillText}>{item}</Text>
                    <TouchableOpacity
                      onPress={() => toggleAmenity(item)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close-circle" size={14} color="#059669" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Custom Amenity Input */}
            <View style={styles.customAmenityRow}>
              <TextInput
                style={styles.customAmenityInput}
                value={customAmenityInput}
                onChangeText={setCustomAmenityInput}
                placeholder="Custom amenity (e.g. Lounge)"
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity
                style={styles.addAmenityBtn}
                onPress={handleAddCustomAmenity}
                disabled={!customAmenityInput.trim()}
              >
                <Text style={styles.addAmenityBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Upload Amenity Photos - Web Parity Grid */}
            <View style={{ marginTop: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.sectionHeader}>
                  Upload Amenity Photos ({Object.keys(amenityPhotos).filter((k) => amenities.includes(k)).length}/{amenities.length})
                </Text>
                <View style={styles.amenityCounterBadge}>
                  <Text style={styles.amenityCounterText}>
                    {Object.keys(amenityPhotos).filter((k) => amenities.includes(k)).length} Attached
                  </Text>
                </View>
              </View>
              <Text style={[styles.hintText, { marginBottom: 12, textAlign: 'center' }]}>
                Attach photos for active amenities (Gymnasium, Pool, Rooftop, etc.) to showcase on public directory.
              </Text>

              {amenities.length === 0 ? (
                <View style={styles.emptyAmenityBox}>
                  <Feather name="info" size={16} color="#64748B" />
                  <Text style={styles.emptyAmenityText}>Select at least one amenity above to attach amenity photos.</Text>
                </View>
              ) : (
                <View style={styles.amenityPhotoGrid}>
                  {amenities.map((am) => {
                    const photo = amenityPhotos[am];
                    return (
                      <View
                        key={am}
                        style={[
                          styles.amenityPhotoCard,
                          {
                            backgroundColor: isDark ? (photo ? '#152132' : '#131B28') : (photo ? '#F7FAF8' : '#FAFAF7'),
                            borderColor: isDark ? (photo ? '#10B981' : '#334155') : (photo ? '#A7F3D0' : '#CBD5E1'),
                          },
                        ]}
                      >
                        <View style={styles.amenityCardHeader}>
                          <Text
                            style={[styles.amenityCardName, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
                            numberOfLines={1}
                          >
                            {am}
                          </Text>
                          {photo && (
                            <View style={[styles.photoAttachedBadge, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                              <Text style={[styles.photoAttachedBadgeText, isDark && { color: '#34D399' }]}>✓ Photo</Text>
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
                                activeOpacity={0.8}
                              >
                                <Feather name="refresh-cw" size={10} color="#FFFFFF" />
                                <Text style={styles.amenityReplaceBtnText}>Replace</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.amenityRemoveBtn}
                                onPress={() => handleRemoveAmenityPhoto(am)}
                                activeOpacity={0.8}
                              >
                                <Feather name="trash-2" size={12} color="#DC2626" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.amenityUploadPlaceholder}
                            onPress={() => handleUploadAmenityPhoto(am)}
                            activeOpacity={0.7}
                          >
                            <Feather name="camera" size={20} color="#94A3B8" />
                            <Text style={styles.amenityPlaceholderText}>No photo attached</Text>
                            <View style={styles.amenityAttachBtn}>
                              <Feather name="upload" size={11} color="#059669" />
                              <Text style={styles.amenityAttachBtnText}>Attach Photo</Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.backStepBtn}
                onPress={() => setStep(1)}
                activeOpacity={0.8}
              >
                <Text style={styles.backStepText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, { flex: 1 }]}
                onPress={() => setStep(3)}
                activeOpacity={0.85}
              >
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3: DUAL-MODE UNITS INVENTORY GENERATOR */}
        {step === 3 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>3. Units Inventory & Generator</Text>

            {/* Live Portfolio Aggregate Metrics */}
            <View style={[styles.metricsBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.metricsLabel, { color: colors.inkSoft }]} numberOfLines={1}>TOTAL UNITS</Text>
                <Text style={[styles.metricsValue, { color: colors.navy }]}>{initialUnits.length} Units</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.metricsLabel, { color: colors.inkSoft }]} numberOfLines={1}>MONTHLY RENT</Text>
                <Text style={styles.metricsRent} numberOfLines={1}>
                  {format(totalProjectedMonthlyRent, currency)}
                </Text>
              </View>
            </View>

            {/* Mode Switcher */}
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.modeTab, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }, unitsMode === 'table' && styles.modeTabActive]}
                onPress={() => setUnitsMode('table')}
              >
                <Text style={[styles.modeTabText, { color: colors.inkSoft }, unitsMode === 'table' && styles.modeTabTextActive]} numberOfLines={1}>
                  📋 Inventory ({initialUnits.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeTab, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }, unitsMode === 'bulk' && styles.modeTabActive]}
                onPress={() => setUnitsMode('bulk')}
              >
                <Text style={[styles.modeTabText, { color: colors.inkSoft }, unitsMode === 'bulk' && styles.modeTabTextActive]} numberOfLines={1}>
                  ⚡ Bulk Generator
                </Text>
              </TouchableOpacity>
            </View>

            {/* BULK GENERATOR FORM */}
            {unitsMode === 'bulk' && (
              <View style={[styles.bulkBox, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.25)' }]}>
                <Text style={[styles.bulkBoxTitle, isDark && { color: '#6EE7B7' }]}>⚡ Multi-Unit Automated Batch Generator</Text>
                <Text style={[styles.bulkBoxSub, isDark && { color: '#A7F3D0' }]}>
                  Instantly creates numbered apartments across selected floors with standard rent and deposit.
                </Text>

                <View style={styles.grid3}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>From Floor</Text>
                    <TextInput
                      style={styles.input}
                      value={bulkStartFloor}
                      onChangeText={setBulkStartFloor}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>To Floor</Text>
                    <TextInput
                      style={styles.input}
                      value={bulkEndFloor}
                      onChangeText={setBulkEndFloor}
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

                {/* Layout Type Presets */}
                <Text style={styles.inputLabel}>Layout Type Preset</Text>
                <View style={styles.chipGrid}>
                  {[
                    { label: '1 RK / Studio', sqFt: '550', rent: '15000', dep: '30000' },
                    { label: '1 BHK', sqFt: '750', rent: '20000', dep: '40000' },
                    { label: '2 BHK', sqFt: '1100', rent: '26000', dep: '52000' },
                    { label: '3 BHK', sqFt: '1650', rent: '38000', dep: '76000' },
                    { label: '4 BHK Villa', sqFt: '2400', rent: '55000', dep: '110000' },
                    { label: 'Commercial Office', sqFt: '1800', rent: '45000', dep: '90000' },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.amenityChip, bulkLayoutType === preset.label && styles.amenityChipActive]}
                      onPress={() => {
                        setBulkLayoutType(preset.label);
                        setBulkAreaSqFt(preset.sqFt);
                        setBulkBaseRent(preset.rent);
                        setBulkBaseDeposit(preset.dep);
                      }}
                    >
                      <Text style={[styles.amenityChipText, bulkLayoutType === preset.label && styles.amenityChipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Numbering Scheme Selector */}
                <Text style={styles.inputLabel}>Unit Numbering Scheme</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  {[
                    { id: 'standard', label: '101, 102...' },
                    { id: 'suffix', label: '1A, 1B, 2A...' },
                    { id: 'tower', label: 'Tower/Wing' },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.smallSegBtn,
                        bulkNumberingScheme === s.id && styles.smallSegBtnActive,
                        { flex: 1, paddingVertical: 6 },
                      ]}
                      onPress={() => setBulkNumberingScheme(s.id as any)}
                    >
                      <Text style={[styles.smallSegText, bulkNumberingScheme === s.id && styles.smallSegTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {bulkNumberingScheme === 'tower' && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={styles.inputLabel}>Tower / Wing Prefix</Text>
                    <TextInput
                      style={styles.input}
                      value={bulkTowerPrefix}
                      onChangeText={setBulkTowerPrefix}
                      placeholder="e.g. Tower A"
                    />
                  </View>
                )}

                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Layout / Type</Text>
                    <TouchableOpacity
                      style={[
                        styles.drawerDropdownBtn,
                        isBulkLayoutDropdownOpen && styles.drawerDropdownBtnActive,
                      ]}
                      onPress={() => {
                        setIsBulkLayoutDropdownOpen((prev) => !prev);
                        setIsBulkFurnishingDropdownOpen(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.drawerDropdownBtnText}>
                        {bulkLayoutType || 'Select Layout'}
                      </Text>
                      <Feather
                        name={isBulkLayoutDropdownOpen ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color="#059669"
                      />
                    </TouchableOpacity>
                    {isBulkLayoutDropdownOpen && (
                      <View style={styles.drawerDropdownList}>
                        {UNIT_LAYOUT_TYPES.map((lt) => {
                          const isSelected = bulkLayoutType === lt;
                          return (
                            <TouchableOpacity
                              key={lt}
                              style={[styles.drawerDropdownOption, isSelected && styles.drawerDropdownOptionActive]}
                              onPress={() => {
                                setBulkLayoutType(lt);
                                setIsBulkLayoutDropdownOpen(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.drawerDropdownOptionText, isSelected && styles.drawerDropdownOptionTextActive]}>
                                {lt}
                              </Text>
                              {isSelected && <Feather name="check" size={13} color="#059669" />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Furnishing Status</Text>
                    <TouchableOpacity
                      style={[
                        styles.drawerDropdownBtn,
                        isBulkFurnishingDropdownOpen && styles.drawerDropdownBtnActive,
                      ]}
                      onPress={() => {
                        setIsBulkFurnishingDropdownOpen((prev) => !prev);
                        setIsBulkLayoutDropdownOpen(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.drawerDropdownBtnText}>
                        {bulkFurnishing || 'Select Furnishing'}
                      </Text>
                      <Feather
                        name={isBulkFurnishingDropdownOpen ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color="#059669"
                      />
                    </TouchableOpacity>
                    {isBulkFurnishingDropdownOpen && (
                      <View style={styles.drawerDropdownList}>
                        {UNIT_FURNISHING_TYPES.map((f) => {
                          const isSelected = bulkFurnishing === f;
                          return (
                            <TouchableOpacity
                              key={f}
                              style={[styles.drawerDropdownOption, isSelected && styles.drawerDropdownOptionActive]}
                              onPress={() => {
                                setBulkFurnishing(f);
                                setIsBulkFurnishingDropdownOpen(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.drawerDropdownOptionText, isSelected && styles.drawerDropdownOptionTextActive]}>
                                {f}
                              </Text>
                              {isSelected && <Feather name="check" size={13} color="#059669" />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>

                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.inputLabel}>Carpet Area (Sq Ft)</Text>
                  <TextInput
                    style={styles.input}
                    value={bulkAreaSqFt}
                    onChangeText={setBulkAreaSqFt}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Base Rent ({getSymbol(currency)})</Text>
                    <TextInput
                      style={styles.input}
                      value={bulkBaseRent}
                      onChangeText={setBulkBaseRent}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Deposit ({getSymbol(currency)})</Text>
                    <TextInput
                      style={styles.input}
                      value={bulkBaseDeposit}
                      onChangeText={setBulkBaseDeposit}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.inputLabel}>Electricity Sub-Meter Prefix</Text>
                  <TextInput
                    style={styles.input}
                    value={bulkMeterPrefix}
                    onChangeText={setBulkMeterPrefix}
                    placeholder="MTR"
                    autoCapitalize="characters"
                  />
                </View>

                <TouchableOpacity
                  style={styles.executeBulkBtn}
                  onPress={handleGenerateBulkUnits}
                  activeOpacity={0.85}
                >
                  <Text style={styles.executeBulkBtnText}>
                    ⚡ Generate{' '}
                    {(Math.max(1, parseInt(bulkEndFloor, 10) || 1) -
                      Math.max(1, parseInt(bulkStartFloor, 10) || 1) +
                      1) *
                      Math.max(1, parseInt(bulkUnitsPerFloor, 10) || 1)}{' '}
                    Units Now
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* GRANULAR UNIT INVENTORY LIST */}
            {unitsMode === 'table' && (
              <View>
                {initialUnits.map((u, idx) => {
                  const isExpanded = !!expandedUnitIndices[idx];
                  const hasPhoto = u.images && u.images.length > 0;

                  return (
                    <View key={idx} style={[styles.unitRowCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      {/* TOP ROW: Unit Name + Delete Only */}
                      <View style={styles.unitRowTopBar}>
                        <View style={[styles.unitPillEditable, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                          <Text style={[styles.unitPillPrefix, isDark && { color: '#34D399' }]}>Unit</Text>
                          <TextInput
                            style={[styles.unitPillInput, isDark && { color: '#6EE7B7' }]}
                            value={u.unitNumber}
                            onChangeText={(val) => {
                              setInitialUnits(
                                initialUnits.map((item, i) =>
                                  i === idx ? { ...item, unitNumber: val } : item
                                )
                              );
                            }}
                            placeholder="101"
                            placeholderTextColor="#059669"
                            selectTextOnFocus
                          />
                        </View>

                        {/* Beside unit name: ONLY delete */}
                        <TouchableOpacity
                          onPress={() => handleDeleteUnit(idx)}
                          style={styles.deleteUnitBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>

                      {/* SECOND ROW (BELOW UNIT NAME): Photo Upload (img 1) + Quick Specs Dropdown (img 2) */}
                      <View style={styles.unitRowActionsBar}>
                        {/* Unit Photo thumbnail or + Photo button (img 1) */}
                        {hasPhoto ? (
                          <View style={styles.unitPhotoThumbWrapper}>
                            <Image source={{ uri: u.images![0] }} style={styles.unitPhotoThumb} resizeMode="cover" />
                            <TouchableOpacity
                              style={styles.unitPhotoRemoveBtn}
                              onPress={() => handleRemoveUnitPhoto(idx)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Ionicons name="close" size={10} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.unitPhotoAttachBtn, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line }]}
                            onPress={() => handleUploadUnitPhoto(idx)}
                            activeOpacity={0.7}
                          >
                            <Feather name="camera" size={12} color="#059669" />
                            <Text style={styles.unitPhotoAttachText}>+ Photo</Text>
                          </TouchableOpacity>
                        )}

                        {/* Summary & Expand toggle button (img 2) */}
                        <TouchableOpacity
                          style={[styles.unitSpecsToggleBtn, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line }]}
                          onPress={() => toggleUnitExpand(idx)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.unitMetaText, { color: colors.inkSoft }]} numberOfLines={1}>
                            {u.floor || 'Floor'} • {u.unitType || 'Type'} • {u.areaSqFt ? `${u.areaSqFt} sq.ft` : 'Area'}
                          </Text>
                          <Feather
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color="#059669"
                          />
                        </TouchableOpacity>
                      </View>

                      {/* EXPANDED SPECS DRAWER (Floor, Layout Type, Sq. Ft, Furnishing) */}
                      {isExpanded && (
                        <View style={styles.unitExpandedDrawer}>
                          {/* Layout / Type Dropdown */}
                          <Text style={styles.drawerSubLabel}>Layout / Type</Text>
                          <TouchableOpacity
                            style={[
                              styles.drawerDropdownBtn,
                              openUnitDropdown?.idx === idx && openUnitDropdown?.field === 'layout' && styles.drawerDropdownBtnActive,
                            ]}
                            onPress={() =>
                              setOpenUnitDropdown((prev) =>
                                prev?.idx === idx && prev?.field === 'layout' ? null : { idx, field: 'layout' }
                              )
                            }
                            activeOpacity={0.75}
                          >
                            <Text style={styles.drawerDropdownBtnText}>
                              {u.unitType || 'Select Layout / Type'}
                            </Text>
                            <Feather
                              name={
                                openUnitDropdown?.idx === idx && openUnitDropdown?.field === 'layout'
                                  ? 'chevron-up'
                                  : 'chevron-down'
                              }
                              size={15}
                              color="#059669"
                            />
                          </TouchableOpacity>

                          {openUnitDropdown?.idx === idx && openUnitDropdown?.field === 'layout' && (
                            <View style={styles.drawerDropdownList}>
                              {UNIT_LAYOUT_TYPES.map((lt) => {
                                const isSelected = u.unitType === lt;
                                return (
                                  <TouchableOpacity
                                    key={lt}
                                    style={[styles.drawerDropdownOption, isSelected && styles.drawerDropdownOptionActive]}
                                    onPress={() => {
                                      setInitialUnits(
                                        initialUnits.map((item, i) =>
                                          i === idx ? { ...item, unitType: lt } : item
                                        )
                                      );
                                      setOpenUnitDropdown(null);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text
                                      style={[
                                        styles.drawerDropdownOptionText,
                                        isSelected && styles.drawerDropdownOptionTextActive,
                                      ]}
                                    >
                                      {lt}
                                    </Text>
                                    {isSelected && <Feather name="check" size={13} color="#059669" />}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}

                          {/* Floor & Carpet Area Grid */}
                          <View style={[styles.grid2, { marginTop: 10 }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.drawerSubLabel}>Floor</Text>
                              <TextInput
                                style={styles.smallInput}
                                value={u.floor}
                                placeholder="e.g. 1st Floor"
                                placeholderTextColor="#94A3B8"
                                onChangeText={(val) => {
                                  setInitialUnits(
                                    initialUnits.map((item, i) =>
                                      i === idx ? { ...item, floor: val } : item
                                    )
                                  );
                                }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.drawerSubLabel}>Carpet Area (Sq. Ft)</Text>
                              <TextInput
                                style={styles.smallInput}
                                value={String(u.areaSqFt || '')}
                                keyboardType="numeric"
                                placeholder="1100"
                                placeholderTextColor="#94A3B8"
                                onChangeText={(val) => {
                                  const num = parseInt(val, 10) || 0;
                                  setInitialUnits(
                                    initialUnits.map((item, i) =>
                                      i === idx ? { ...item, areaSqFt: num } : item
                                    )
                                  );
                                }}
                              />
                            </View>
                          </View>

                          {/* Furnishing Status Dropdown */}
                          <Text style={[styles.drawerSubLabel, { marginTop: 10 }]}>Furnishing Status</Text>
                          <TouchableOpacity
                            style={[
                              styles.drawerDropdownBtn,
                              openUnitDropdown?.idx === idx && openUnitDropdown?.field === 'furnishing' && styles.drawerDropdownBtnActive,
                            ]}
                            onPress={() =>
                              setOpenUnitDropdown((prev) =>
                                prev?.idx === idx && prev?.field === 'furnishing' ? null : { idx, field: 'furnishing' }
                              )
                            }
                            activeOpacity={0.75}
                          >
                            <Text style={styles.drawerDropdownBtnText}>
                              {u.furnishing || 'Select Furnishing'}
                            </Text>
                            <Feather
                              name={
                                openUnitDropdown?.idx === idx && openUnitDropdown?.field === 'furnishing'
                                  ? 'chevron-up'
                                  : 'chevron-down'
                              }
                              size={15}
                              color="#059669"
                            />
                          </TouchableOpacity>

                          {openUnitDropdown?.idx === idx && openUnitDropdown?.field === 'furnishing' && (
                            <View style={styles.drawerDropdownList}>
                              {UNIT_FURNISHING_TYPES.map((f) => {
                                const isSelected = u.furnishing === f;
                                return (
                                  <TouchableOpacity
                                    key={f}
                                    style={[styles.drawerDropdownOption, isSelected && styles.drawerDropdownOptionActive]}
                                    onPress={() => {
                                      setInitialUnits(
                                        initialUnits.map((item, i) =>
                                          i === idx ? { ...item, furnishing: f } : item
                                        )
                                      );
                                      setOpenUnitDropdown(null);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text
                                      style={[
                                        styles.drawerDropdownOptionText,
                                        isSelected && styles.drawerDropdownOptionTextActive,
                                      ]}
                                    >
                                      {f}
                                    </Text>
                                    {isSelected && <Feather name="check" size={13} color="#059669" />}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      )}

                      {/* FINANCIALS & METERING INPUTS GRID */}
                      <View style={styles.unitInputsGrid}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subLabel, { color: colors.inkSoft }]} numberOfLines={1}>Rent ({getSymbol(currency)})</Text>
                          <TextInput
                            style={[styles.smallInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                            value={u.rent.toString()}
                            keyboardType="numeric"
                            placeholderTextColor={colors.inkSoft}
                            onChangeText={(val) => {
                              const num = parseInt(val, 10) || 0;
                              setInitialUnits(
                                initialUnits.map((item, i) => (i === idx ? { ...item, rent: num } : item))
                              );
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subLabel, { color: colors.inkSoft }]} numberOfLines={1}>Deposit ({getSymbol(currency)})</Text>
                          <TextInput
                            style={[styles.smallInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                            value={u.deposit.toString()}
                            keyboardType="numeric"
                            placeholderTextColor={colors.inkSoft}
                            onChangeText={(val) => {
                              const num = parseInt(val, 10) || 0;
                              setInitialUnits(
                                initialUnits.map((item, i) => (i === idx ? { ...item, deposit: num } : item))
                              );
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subLabel, { color: colors.inkSoft }]} numberOfLines={1}>Meter ID</Text>
                          <TextInput
                            style={[styles.smallInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                            value={u.electricityMeter}
                            placeholderTextColor={colors.inkSoft}
                            onChangeText={(val) => {
                              setInitialUnits(
                                initialUnits.map((item, i) =>
                                  i === idx ? { ...item, electricityMeter: val } : item
                                )
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

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.backStepBtn}
                onPress={() => setStep(2)}
                activeOpacity={0.8}
              >
                <Text style={styles.backStepText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, { flex: 1 }]}
                onPress={() => setStep(4)}
                activeOpacity={0.85}
              >
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 4: GALLERY & FINAL REVIEW */}
        {step === 4 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>4. Photos & Final Review</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Property Photo Gallery ({galleryImages.length} photos)</Text>
                <Text style={styles.hintText}>Tap star to set primary cover photo.</Text>
              </View>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#059669',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  gap: 6,
                }}
                onPress={handleUploadGalleryPhotos}
                activeOpacity={0.85}
              >
                <Feather name="upload" size={13} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Upload Photos</Text>
              </TouchableOpacity>
            </View>

            {galleryImages.length === 0 ? (
              <TouchableOpacity
                style={{
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: isDark ? '#334155' : '#CBD5E1',
                  borderRadius: 12,
                  backgroundColor: isDark ? '#131B28' : '#F8FAFC',
                  paddingVertical: 24,
                  paddingHorizontal: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  gap: 8,
                }}
                onPress={handleUploadGalleryPhotos}
                activeOpacity={0.8}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                  }}
                >
                  <Feather name="camera" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#F1F5F9' : '#0F172A' }}>No property photos added yet</Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: isDark ? '#064E3B44' : '#ECFDF5',
                    borderWidth: 1,
                    borderColor: isDark ? '#05966966' : '#A7F3D0',
                    borderRadius: 16,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    marginTop: 2,
                  }}
                >
                  <Feather name="plus" size={12} color={isDark ? '#34D399' : '#059669'} />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: isDark ? '#34D399' : '#059669' }}>Add Photos</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
                {galleryImages.map((imgUrl, idx) => (
                  <View key={idx} style={[styles.galleryCard, { position: 'relative' }]}>
                    <Image source={{ uri: imgUrl }} style={styles.galleryThumb} />
                    <TouchableOpacity
                      style={[styles.coverStarBtn, coverPhotoIndex === idx && styles.coverStarBtnActive]}
                      onPress={() => setCoverPhotoIndex(idx)}
                    >
                      <Ionicons
                        name={coverPhotoIndex === idx ? 'star' : 'star-outline'}
                        size={14}
                        color="#FFFFFF"
                      />
                      <Text style={styles.coverStarText}>
                        {coverPhotoIndex === idx ? 'Cover' : 'Set Cover'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        backgroundColor: 'rgba(220, 38, 38, 0.85)',
                        borderRadius: 12,
                        width: 24,
                        height: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onPress={() => {
                        const next = galleryImages.filter((_, i) => i !== idx);
                        setGalleryImages(next);
                        if (coverPhotoIndex >= next.length) setCoverPhotoIndex(0);
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="trash-2" size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={{
                    width: 140,
                    height: 110,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: '#059669',
                    borderRadius: 10,
                    backgroundColor: '#ECFDF5',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                  onPress={handleUploadGalleryPhotos}
                  activeOpacity={0.8}
                >
                  <Feather name="plus-circle" size={24} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669', marginTop: 4 }}>Add Photos</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>Property Summary Review</Text>

            <View style={styles.reviewContainer}>
              {/* 1. HERO IDENTITY & LOCATION CARD */}
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
                      {propertyType} • {country}
                    </Text>
                  </View>
                </View>

                {/* Location row */}
                <View style={styles.reviewLocationRow}>
                  <Feather name="map-pin" size={13} color="#059669" style={{ marginTop: 2, marginRight: 6 }} />
                  <Text style={styles.reviewLocationText} numberOfLines={2}>
                    {confirmedLocation || `${addressLine || ''}, ${city || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Address Pending'}
                  </Text>
                </View>
              </View>

              {/* 2. STATS & KEY METRICS (2x2 Grid) */}
              <View style={styles.reviewStatsGrid}>
                {/* Metric 1: Monthly Rent */}
                <View style={[styles.reviewStatTile, styles.reviewStatTileHighlighted]}>
                  <Text style={styles.reviewStatLabelHighlighted}>PROJECTED RENT</Text>
                  <Text style={styles.reviewStatValueHighlighted} numberOfLines={1}>
                    {format(totalProjectedMonthlyRent, currency)}
                  </Text>
                  <Text style={styles.reviewStatSubHighlighted}>per month</Text>
                </View>

                {/* Metric 2: Structure / Scale */}
                <View style={styles.reviewStatTile}>
                  <Text style={styles.reviewStatLabel}>SCALE</Text>
                  <Text style={styles.reviewStatValue} numberOfLines={1}>
                    {initialUnits.length} Units
                  </Text>
                  <Text style={styles.reviewStatSub} numberOfLines={1}>
                    {floorsCount} Floors
                  </Text>
                </View>

                {/* Metric 3: Operations & Management */}
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
                    {(() => {
                      if (!assignedManagerId) return 'Self-Managed';
                      const found = availableManagers.find((m) => m.id === assignedManagerId);
                      return found?.role || 'Property Manager';
                    })()}
                  </Text>
                </View>

                {/* Metric 4: Photos */}
                <View style={styles.reviewStatTile}>
                  <Text style={styles.reviewStatLabel}>ATTACHED MEDIA</Text>
                  <Text style={styles.reviewStatValue} numberOfLines={1}>
                    {galleryImages.length} Photos
                  </Text>
                  <Text style={styles.reviewStatSub} numberOfLines={1}>
                    {Object.keys(amenityPhotos).filter((k) => amenities.includes(k)).length} Amenities
                  </Text>
                </View>
              </View>

              {/* 3. POLICIES & TERMS CHIPS */}
              <View style={styles.reviewSectionBox}>
                <Text style={styles.reviewSectionTitle}>POLICIES & TERMS</Text>
                <View style={styles.reviewPillsWrap}>
                  <View style={styles.policyPill}>
                    <Text style={styles.policyPillText}>
                      {petsAllowed ? '🐾 Pets OK' : '🚫 No Pets'}
                    </Text>
                  </View>
                  <View style={styles.policyPill}>
                    <Text style={styles.policyPillText}>
                      🔒 {minLeaseMonths}M Lock-in
                    </Text>
                  </View>
                  <View style={styles.policyPill}>
                    <Text style={styles.policyPillText}>
                      📅 {noticePeriodDays}d Notice
                    </Text>
                  </View>
                  {smokingAllowed !== undefined && (
                    <View style={styles.policyPill}>
                      <Text style={styles.policyPillText}>
                        {smokingAllowed ? '🚬 Smoking OK' : '🚭 No Smoking'}
                      </Text>
                    </View>
                  )}
                  {sublettingAllowed !== undefined && (
                    <View style={styles.policyPill}>
                      <Text style={styles.policyPillText}>
                        {sublettingAllowed ? '🔄 Subletting OK' : '⛔ No Subletting'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 4. ACTIVE AMENITIES CHIPS */}
              <View style={[styles.reviewSectionBox, { marginBottom: 4 }]}>
                <Text style={styles.reviewSectionTitle}>
                  AMENITIES ({amenities.length})
                </Text>
                {amenities.length === 0 ? (
                  <Text style={styles.reviewEmptyText}>No amenities selected</Text>
                ) : (
                  <View style={styles.reviewPillsWrap}>
                    {amenities.slice(0, 6).map((am) => (
                      <View key={am} style={styles.amenityReviewPill}>
                        <Text style={styles.amenityReviewPillText} numberOfLines={1}>
                          {am}
                        </Text>
                      </View>
                    ))}
                    {amenities.length > 6 && (
                      <View style={[styles.amenityReviewPill, styles.amenityReviewPillMore]}>
                        <Text style={styles.amenityReviewPillMoreText}>
                          +{amenities.length - 6} more
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.backStepBtn}
                onPress={() => setStep(3)}
                activeOpacity={0.8}
              >
                <Text style={styles.backStepText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1 }]}
                onPress={handleSaveAndPublish}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>✓ Save & Publish</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

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
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    logoBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#10B981',
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
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    quotaBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#BBF7D0',
      borderRadius: 10,
      marginBottom: 14,
    },
    quotaBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#166534',
    },
    quotaBannerSub: {
      fontSize: 11,
      color: isDark ? '#A7F3D0' : '#15803D',
      marginTop: 2,
    },
    quotaBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: '#10B981',
      borderRadius: 6,
    },
    quotaBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    progressRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 16,
    },
    progressSegment: {
      flex: 1,
      height: 4,
      backgroundColor: colors.line,
      borderRadius: 2,
    },
    progressSegmentActive: {
      backgroundColor: colors.primary,
    },
    stepsNavRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 16,
    },
    stepTabPill: {
      flex: 1,
      height: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
    },
    stepTabPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    stepTabPillCompleted: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    stepTabPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    stepTabPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    stepTabPillTextCompleted: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.line,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.navy,
    },
    cardSub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink,
      marginBottom: 6,
      marginTop: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surfaceSunken,
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
    },
    filterChipActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderColor: colors.primary,
    },
    filterChipText: {
      fontSize: 12,
      color: colors.ink,
      fontWeight: '500',
    },
    filterChipTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    dropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.surfaceSunken,
    },
    dropdownTriggerActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
    },
    dropdownLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    dropdownBadge: {
      minWidth: 28,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dropdownBadgeSymbol: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    dropdownText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.text,
    },
    dropdownMenu: {
      marginTop: 6,
      marginBottom: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineLight,
    },
    dropdownItemActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    dropdownItemText: {
      fontSize: 13,
      color: colors.ink,
      fontWeight: '500',
    },
    dropdownItemTextActive: {
      color: isDark ? '#34D399' : '#065F46',
      fontWeight: '700',
    },
    divider: {
      height: 1,
      backgroundColor: colors.line,
      marginVertical: 16,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 6,
    },
    grid2: {
      flexDirection: 'row',
      gap: 10,
    },
    grid3: {
      flexDirection: 'row',
      gap: 8,
    },
    rulesCard: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 14,
    },
    rulesHeader: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 10,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineLight,
    },
    toggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: 8,
    },
    toggleIcon: {
      fontSize: 18,
      marginRight: 10,
    },
    toggleTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink,
    },
    toggleSub: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    segmentedSmall: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 6,
      padding: 2,
      borderWidth: 1,
      borderColor: colors.line,
    },
    smallSegBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: 4,
    },
    smallSegBtnActive: {
      backgroundColor: colors.primary,
    },
    smallSegText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    smallSegTextActive: {
      color: '#FFFFFF',
    },
    amenityChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
    },
    amenityChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    amenityChipText: {
      fontSize: 12,
      color: colors.ink,
    },
    amenityChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    selectedAmenityPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    selectedAmenityPillText: {
      fontSize: 12,
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '600',
    },
    customAmenityRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      marginTop: 12,
    },
    customAmenityInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      height: 42,
      fontSize: 13,
      color: colors.text,
      backgroundColor: colors.surfaceSunken,
    },
    addAmenityBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      height: 42,
      justifyContent: 'center',
      borderRadius: 8,
    },
    addAmenityBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
    },
    amenityCounterBadge: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    amenityCounterText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    emptyAmenityBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
    },
    emptyAmenityText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    amenityPhotoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    amenityPhotoCard: {
      width: '100%',
      maxWidth: 320,
      alignSelf: 'center',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderStyle: 'dashed',
      borderRadius: 10,
      padding: 8,
      justifyContent: 'space-between',
    },
    amenityPhotoCardActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#F7FAF8',
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      borderStyle: 'solid',
    },
    amenityCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    amenityCardName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
      flex: 1,
      marginRight: 4,
    },
    photoAttachedBadge: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    photoAttachedBadgeText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    amenityThumbContainer: {
      position: 'relative',
      width: '100%',
      height: 100,
      borderRadius: 6,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    amenityThumbImg: {
      width: '100%',
      height: '100%',
      borderRadius: 6,
    },
    amenityActionRow: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      left: 4,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    amenityReplaceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
    },
    amenityReplaceBtnText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
    },
    amenityRemoveBtn: {
      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
      padding: 4,
      borderRadius: 4,
    },
    amenityUploadPlaceholder: {
      height: 100,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    amenityPlaceholderText: {
      fontSize: 10,
      color: colors.inkSoft,
      marginTop: 3,
      marginBottom: 6,
    },
    amenityAttachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    amenityAttachBtnText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    metricsBox: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 12,
    },
    metricsLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
    },
    metricsValue: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.navy,
      marginTop: 2,
    },
    metricsRent: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.primary,
      marginTop: 2,
    },
    modeTabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    modeTab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
    },
    modeTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modeTabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    modeTabTextActive: {
      color: '#FFFFFF',
    },
    bulkBox: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#BBF7D0',
      borderRadius: 10,
      padding: 14,
      marginBottom: 14,
    },
    bulkBoxTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#166534',
    },
    bulkBoxSub: {
      fontSize: 11,
      color: isDark ? '#A7F3D0' : '#15803D',
      marginTop: 2,
      marginBottom: 12,
    },
    executeBulkBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 8,
    },
    executeBulkBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    unitRowCard: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 8,
    },
    unitRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    unitRowTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    unitRowActionsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    unitPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    unitPillText: {
      color: isDark ? '#34D399' : '#059669',
      fontSize: 11,
      fontWeight: '700',
    },
    unitPillEditable: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    unitPillPrefix: {
      color: isDark ? '#34D399' : '#059669',
      fontSize: 11,
      fontWeight: '700',
    },
    unitPillInput: {
      flex: 1,
      color: isDark ? '#34D399' : '#065F46',
      fontSize: 12,
      fontWeight: '700',
      padding: 0,
      margin: 0,
    },
    unitPhotoAttachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderStyle: 'dashed',
    },
    unitPhotoAttachText: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#34D399' : '#059669',
    },
    unitPhotoThumbWrapper: {
      position: 'relative',
    },
    unitPhotoThumb: {
      width: 32,
      height: 32,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
    },
    unitPhotoRemoveBtn: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: '#DC2626',
      borderRadius: 7,
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
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderStyle: 'dashed',
    },
    drawerDropdownBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    drawerDropdownBtnActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
    },
    drawerDropdownBtnText: {
      fontSize: 12.5,
      color: colors.text,
      fontWeight: '600',
    },
    drawerDropdownList: {
      marginTop: 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      overflow: 'hidden',
    },
    drawerDropdownOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineLight,
    },
    drawerDropdownOptionActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    drawerDropdownOptionText: {
      fontSize: 12,
      color: colors.ink,
    },
    drawerDropdownOptionTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    unitExpandedDrawer: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      padding: 10,
      marginTop: 4,
      marginBottom: 8,
    },
    drawerSubLabel: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.inkSoft,
      marginBottom: 4,
    },
    unitLayoutChip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
    },
    unitLayoutChipActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderColor: colors.primary,
    },
    unitLayoutChipText: {
      fontSize: 11,
      color: colors.ink,
      fontWeight: '500',
    },
    unitLayoutChipTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    unitMetaText: {
      fontSize: 11,
      color: colors.inkSoft,
      flex: 1,
    },
    deleteUnitBtn: {
      padding: 4,
    },
    unitInputsGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    subLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.inkSoft,
      marginBottom: 4,
      height: 16,
    },
    smallInput: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      height: 38,
      fontSize: 12,
      backgroundColor: colors.surfaceSunken,
      color: colors.text,
    },
    addIndividualBtn: {
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      borderStyle: 'dashed',
      alignItems: 'center',
      backgroundColor: colors.surfaceSunken,
      marginBottom: 14,
    },
    addIndividualBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    galleryScroll: {
      flexDirection: 'row',
      marginVertical: 10,
    },
    galleryCard: {
      width: 140,
      height: 100,
      borderRadius: 8,
      overflow: 'hidden',
      marginRight: 10,
      position: 'relative',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
    },
    galleryThumb: {
      width: '100%',
      height: '100%',
    },
    coverStarBtn: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
      gap: 4,
    },
    coverStarBtnActive: {
      backgroundColor: '#10B981',
    },
    coverStarText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
    },
    hintText: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    reviewContainer: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
      marginBottom: 16,
      gap: 10,
    },
    reviewHeroCard: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
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
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewPropName: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.navy,
      lineHeight: 20,
    },
    reviewPropTypeSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
      fontWeight: '500',
    },
    reviewLocationRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    reviewLocationText: {
      fontSize: 11.5,
      color: colors.ink,
      flex: 1,
      lineHeight: 16,
    },
    reviewStatsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    reviewStatTile: {
      flex: 1,
      minWidth: 125,
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    reviewStatTileHighlighted: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    reviewStatLabel: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    reviewStatLabelHighlighted: {
      fontSize: 9,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    reviewStatValue: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
    },
    reviewStatValueHighlighted: {
      fontSize: 14.5,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#059669',
    },
    reviewStatSub: {
      fontSize: 10,
      color: colors.inkSoft,
      marginTop: 2,
    },
    reviewStatSubHighlighted: {
      fontSize: 10,
      color: isDark ? '#34D399' : '#059669',
      marginTop: 2,
      fontWeight: '600',
    },
    reviewSectionBox: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    reviewSectionTitle: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    reviewPillsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    policyPill: {
      backgroundColor: colors.surface,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.line,
    },
    policyPillText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.ink,
    },
    amenityReviewPill: {
      backgroundColor: colors.surface,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.line,
    },
    amenityReviewPillText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.ink,
    },
    amenityReviewPillMore: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    amenityReviewPillMoreText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    reviewEmptyText: {
      fontSize: 11,
      color: colors.inkSoft,
      fontStyle: 'italic',
    },
    summaryCard: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineLight,
    },
    summaryKey: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    summaryVal: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
      maxWidth: '60%',
      textAlign: 'right',
    },
    btnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
    },
    backStepBtn: {
      height: 44,
      paddingHorizontal: 20,
      backgroundColor: colors.surfaceSunken,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    backStepText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.ink,
    },
    nextBtn: {
      height: 44,
      backgroundColor: colors.primary,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    nextBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    saveBtn: {
      height: 44,
      backgroundColor: colors.primary,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    placesSearchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 44,
      marginTop: 6,
    },
    placesSearchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      marginLeft: 8,
    },
    placesDropdownMenu: {
      marginTop: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      overflow: 'hidden',
    },
    placeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineLight,
    },
    placeItemText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.ink,
    },
    placeItemSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    confirmedLocationCard: {
      marginTop: 10,
      padding: 12,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#86EFAC',
      borderRadius: 8,
    },
    confirmedLocationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    confirmedLocationTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#166534',
    },
    confirmedLocationText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: isDark ? '#A7F3D0' : '#14532D',
    },
    confirmedLocationHint: {
      fontSize: 11,
      color: isDark ? '#6EE7B7' : '#15803D',
      marginTop: 3,
    },
    fieldHelpText: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 4,
      lineHeight: 15,
    },
  });
