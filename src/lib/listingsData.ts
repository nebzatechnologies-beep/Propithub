import { Unit, Property } from '../types';
import {
  sanitizeCountry,
  resolveDisplayLocation,
  parseAddressString,
  isValidCityName,
  isNumericCoordinate,
} from './addressUtils';
import {
  normalizeCurrencyCode,
  getCurrencySymbol,
  getLocaleForCurrency,
  convertCurrency,
  BASELINE_RATES_USD,
} from './currencyService';

export interface PublicListingItem {
  id: string;
  isRealUnit: boolean;
  unitId: string;
  unitNumber: string;
  propertyId?: string;
  propertyName: string;
  ownerId?: string;
  managerId?: string;
  title: string;
  description: string;
  city: string;
  country: string;
  displayLocation: string;
  rawAddress: any;
  currency: string;
  currencySymbol: string;
  rent: number;
  deposit: number;
  beds: number;
  bedsLabel: string;
  baths: number;
  areaSqFt: number;
  floor?: string | number;
  propertyType: string;
  furnishing: string;
  amenities: string[];
  amenityPhotos: { name: string; image: string }[];
  listedBy: string;
  rating: number | null;
  reviewsCount: number;
  ageDays: number;
  verified: boolean;
  images: string[];
  availableFrom?: string;
  leaseTerm: string;
  petsPolicy: string;
  isPopular: boolean;
  popularUntil?: string | null;
}

export const toUSD = (amount: number, currencyOrSymbol: string): number => {
  return convertCurrency(Number(amount) || 0, currencyOrSymbol || 'USD', 'USD', BASELINE_RATES_USD);
};

export const formatMoney = (amount: number, currencyOrSymbol: string = 'USD'): string => {
  const sym = getCurrencySymbol(currencyOrSymbol);
  const locale = getLocaleForCurrency(currencyOrSymbol);
  const num = Number(amount) || 0;
  return `${sym}${num.toLocaleString(locale)}`;
};

export const COUNTRY_FLAGS: Record<string, string> = {
  'United Arab Emirates': '🇦🇪',
  'United Kingdom': '🇬🇧',
  'Singapore': '🇸🇬',
  'United States': '🇺🇸',
  'India': '🇮🇳',
  'Australia': '🇦🇺',
  'Canada': '🇨🇦',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'Spain': '🇪🇸',
  'Portugal': '🇵🇹',
  'Japan': '🇯🇵',
  'Thailand': '🇹🇭',
  'Saudi Arabia': '🇸🇦',
  'Qatar': '🇶🇦',
  'South Africa': '🇿🇦',
  'Brazil': '🇧🇷',
  'Mexico': '🇲🇽',
  'Netherlands': '🇳🇱',
  'Ireland': '🇮🇪',
  'Italy': '🇮🇹',
  'Switzerland': '🇨🇭',
};

export const parseBedsFromUnitType = (unitType?: string): number => {
  if (!unitType) return 1;
  const s = unitType.toLowerCase();
  if (s.includes('studio') || s === '0') return 0;
  const match = s.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 1;
};

export const resolvePropertyForUnit = (unit: Unit, properties: Property[]): Property | undefined => {
  return (properties || []).find(
    (p) =>
      (unit.propertyId && p.id === unit.propertyId) ||
      (p.name &&
        unit.propertyName &&
        (p.name || '').trim().toLowerCase() === (unit.propertyName || '').trim().toLowerCase()) ||
      (unit.id && p.id && unit.id.includes(p.id))
  );
};

export const unitToPublicListing = (
  unit: Unit,
  property?: Property,
  reviews?: { owners?: any[]; tenants?: any[] }
): PublicListingItem => {
  // 1. Collect all real uploaded photos from Unit, Property, and Amenities
  const allPhotos: string[] = [];
  const addPhoto = (img?: any) => {
    if (typeof img === 'string' && img.trim().length > 10) {
      const clean = img.trim();
      if (!allPhotos.includes(clean)) {
        allPhotos.push(clean);
      }
    }
  };

  if (Array.isArray(unit.images)) {
    unit.images.forEach(addPhoto);
  }
  if (Array.isArray((unit as any).photos)) {
    (unit as any).photos.forEach(addPhoto);
  }
  addPhoto(unit.image);
  addPhoto((unit as any).photo);
  addPhoto((unit as any).coverImage);

  if (property) {
    if (Array.isArray(property.images)) {
      property.images.forEach(addPhoto);
    }
    if (Array.isArray((property as any).photos)) {
      (property as any).photos.forEach(addPhoto);
    }
    addPhoto((property as any).image);
    addPhoto((property as any).coverImage);
    if (Array.isArray(property.amenityPhotos)) {
      property.amenityPhotos.forEach((ap) => addPhoto(ap.image));
    }
  }

  // 2. Real Location & Address resolution
  const rawAddrStr =
    property?.address?.formattedAddress ||
    (typeof property?.address === 'string' ? property.address : '') ||
    unit.address ||
    '';
  const rawCountry = property?.address?.country || property?.country || unit.country;
  const rawCity = property?.address?.city;
  const country = sanitizeCountry(rawCountry, rawAddrStr);
  const displayLocation = resolveDisplayLocation(rawAddrStr, rawCountry, rawCity);
  const parsedAddr = parseAddressString(rawAddrStr);

  const cleanDisplayCity = displayLocation && displayLocation.includes(',')
    ? displayLocation.split(',')[0].trim()
    : displayLocation;

  const city =
    (rawCity && isValidCityName(rawCity) ? rawCity.trim() : null) ||
    (parsedAddr.city && isValidCityName(parsedAddr.city) ? parsedAddr.city : null) ||
    (cleanDisplayCity && isValidCityName(cleanDisplayCity) ? cleanDisplayCity : null) ||
    (isValidCityName(country) ? country : '');
  const rawAddress = property?.address || unit.address;

  // 3. Real Names & Titles
  const unitNumber = unit.unitNumber || unit.id;
  const propertyName = property?.name || unit.propertyName || `Unit ${unitNumber}`;
  const title =
    property?.name || unit.propertyName
      ? `Unit ${unitNumber} · ${property?.name || unit.propertyName}`
      : `Unit ${unitNumber}`;

  // 4. Real Specs
  const beds = parseBedsFromUnitType(unit.unitType);
  const bedsLabel = (() => {
    if (unit.unitType?.toLowerCase().includes('studio') || unit.unitType === '0') return 'Studio';
    if (unit.unitType && !isNaN(Number(unit.unitType))) {
      const num = Number(unit.unitType);
      return `${num} ${num === 1 ? 'bed' : 'beds'}`;
    }
    return unit.unitType || '1 bed';
  })();
  const baths = Number(unit.bathrooms) || 0;
  const areaSqFt = Number(unit.areaSqFt) || 0;
  const floor = unit.floor;
  const furnishing = unit.furnishing || 'Unfurnished';

  // 5. Real Currency & Prices
  const rawCurr = unit.currency || property?.currency || '$';
  const currency = normalizeCurrencyCode(rawCurr);
  const currencySymbol = getCurrencySymbol(rawCurr);
  const rent = Number(unit.rent) || 0;
  const deposit = Number(unit.deposit) || 0;

  // 6. Real Amenities & Reviews
  const amenities =
    Array.isArray(property?.amenities) && property.amenities.length > 0 ? property.amenities : [];
  const amenityPhotos = Array.isArray(property?.amenityPhotos) ? property.amenityPhotos : [];

  const propReviews = (reviews?.owners || []).filter(
    (r: any) =>
      (property?.id && r.propertyId === property.id) ||
      (property?.ownerId && r.ownerId === property.ownerId) ||
      (unit.ownerId && r.ownerId === unit.ownerId)
  );
  const rating =
    propReviews.length > 0
      ? Number(
          (
            propReviews.reduce((sum: number, r: any) => sum + (Number(r.rating) || 5), 0) /
            propReviews.length
          ).toFixed(1)
        )
      : null;
  const reviewsCount = propReviews.length;

  // 7. Age & Description
  const createdMs = (unit as any).createdAt ? new Date((unit as any).createdAt).getTime() : 0;
  const ageDays = createdMs ? Math.max(0, Math.floor((Date.now() - createdMs) / 86400000)) : 5;

  // 8. Popular Listing Boost Resolution
  const rawPopularUntil = (unit as any).popularUntil || (property as any)?.popularUntil || null;
  const isBoostActive = Boolean(
    ((unit as any).isPopular || (property as any)?.isPopular) &&
    rawPopularUntil &&
    new Date(rawPopularUntil).getTime() > Date.now()
  );

  const description =
    (unit as any).description ||
    (property as any)?.description ||
    `Unit ${unitNumber} at ${propertyName} (${displayLocation}). Layout: ${bedsLabel}${
      baths > 0 ? `, ${baths} bathroom(s)` : ''
    }${
      areaSqFt > 0 ? `, ${areaSqFt.toLocaleString()} sq ft` : ''
    }, ${furnishing}.`;

  return {
    id: unit.id,
    isRealUnit: true,
    unitId: unit.id,
    unitNumber,
    propertyId: unit.propertyId || property?.id,
    propertyName,
    ownerId: unit.ownerId || property?.ownerId,
    managerId: property?.assignedManagerId || (unit as any).managerId || (property as any)?.managerId,
    title,
    description,
    city,
    country,
    displayLocation,
    rawAddress,
    currency,
    currencySymbol,
    rent,
    deposit,
    beds,
    bedsLabel,
    baths,
    areaSqFt,
    floor,
    propertyType: unit.unitType || 'Apartment',
    furnishing,
    amenities,
    amenityPhotos,
    listedBy: property?.name ? `${property.name}` : 'Verified Property Owner',
    rating,
    reviewsCount,
    ageDays,
    verified: true,
    images: allPhotos,
    leaseTerm: 'Standard lease',
    petsPolicy: 'Contact owner',
    isPopular: isBoostActive,
    popularUntil: rawPopularUntil,
  };
};

export const getAllListings = (
  units: Unit[],
  properties: Property[],
  reviews?: { owners?: any[]; tenants?: any[] }
): PublicListingItem[] => {
  const liveUnits = (units || []).filter((u) => u.isListedPublicly && u.status === 'vacant');
  return liveUnits.map((u) => {
    const prop = resolvePropertyForUnit(u, properties || []);
    return unitToPublicListing(u, prop, reviews);
  });
};

export const calculateBenchmark = (listing: PublicListingItem, allListings: PublicListingItem[]) => {
  const similar = allListings.filter(
    (x) => x.id !== listing.id && x.country === listing.country && Math.abs(x.beds - listing.beds) <= 1
  );
  if (similar.length < 2) return null;
  const avgRentUSD = similar.reduce((sum, x) => sum + toUSD(x.rent, x.currency), 0) / similar.length;
  const currentRentUSD = toUSD(listing.rent, listing.currency);
  if (avgRentUSD <= 0) return null;
  const diffPct = Math.round(((currentRentUSD / avgRentUSD) - 1) * 100);
  return {
    sampleCount: similar.length,
    percentage: diffPct,
  };
};

export const parseNaturalQuery = (query: string) => {
  const out: { beds: number | null; maxRentUSD: number | null; tokens: string[] } = {
    beds: null,
    maxRentUSD: null,
    tokens: [],
  };
  let s = ` ${String(query || '').toLowerCase()} `;

  const bedMatch = s.match(/(\d+)\s*[- ]?\s*(bed|bedroom|br|bhk)s?\b/);
  if (bedMatch) {
    out.beds = parseInt(bedMatch[1], 10);
    s = s.replace(bedMatch[0], ' ');
  }
  if (/\bstudio\b/.test(s)) {
    out.beds = 0;
    s = s.replace(/\bstudio\b/, ' ');
  }

  const priceMatch = s.match(/(?:under|below|max|upto|up to|<)\s*([a-z]{3})?\s*([\d,.]+)\s*(k)?\s*([a-z]{3})?/);
  if (priceMatch) {
    const rawVal = parseFloat(priceMatch[2].replace(/,/g, '')) * (priceMatch[3] ? 1000 : 1);
    const currencyStr = (priceMatch[1] || priceMatch[4] || 'USD').toUpperCase();
    out.maxRentUSD = toUSD(rawVal, currencyStr);
    s = s.replace(priceMatch[0], ' ');
  }

  out.tokens = s
    .replace(/\b(in|near|for|a|an|the|apartment|apartments|flat|home|homes|to|rent|with)\b/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return out;
};
