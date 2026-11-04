/**
 * Address & Location Normalization Utilities
 * Robust parsing and sanitization to prevent street names from polluting country/city fields
 * and provide clean, clamped address presentations across property and listing cards.
 */

const KNOWN_COUNTRIES = [
  'India',
  'United States',
  'USA',
  'United Kingdom',
  'UK',
  'United Arab Emirates',
  'UAE',
  'Australia',
  'Singapore',
  'Canada',
  'Germany',
  'France',
  'Malaysia',
  'New Zealand',
];

const KNOWN_CITIES = [
  'Hyderabad',
  'Secunderabad',
  'Bengaluru',
  'Bangalore',
  'Mumbai',
  'Pune',
  'Chennai',
  'Delhi',
  'New Delhi',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Chandigarh',
  'Gurugram',
  'Gurgaon',
  'Noida',
  'Kochi',
  'Thiruvananthapuram',
  'Visakhapatnam',
  'Vijayawada',
  'Indore',
  'Bhopal',
  'Lucknow',
  'Patna',
  'Coimbatore',
  'Nagpur',
  'Austin',
  'New York',
  'London',
  'Dubai',
  'Singapore',
  'Melbourne',
  'Sydney',
  'Toronto',
  'San Francisco',
  'Chicago',
];

/**
 * Checks if a string looks like a street/road name or house number rather than a legitimate country
 */
export const isInvalidCountry = (val?: string): boolean => {
  if (!val) return true;
  const t = val.trim();
  if (t.length < 2) return true;

  // If it is or contains a URL, it is not a valid country
  if (t.startsWith('http://') || t.startsWith('https://') || t.includes('google.com') || t.includes('goo.gl')) {
    return true;
  }

  // If it's a known country, it's valid
  if (KNOWN_COUNTRIES.some((c) => c.toLowerCase() === t.toLowerCase())) {
    return false;
  }

  // Common street/road/building indicators
  const streetIndicators = [
    /\brd\b/i,
    /\broad\b/i,
    /\bstreet\b/i,
    /\bst\b/i,
    /\blane\b/i,
    /\bln\b/i,
    /\bcircle\b/i,
    /\bavenue\b/i,
    /\bave\b/i,
    /\bboulevard\b/i,
    /\bblvd\b/i,
    /\bnagar\b/i,
    /\bcolony\b/i,
    /\bapartment/i,
    /\bfloor\b/i,
    /\bsector\b/i,
    /\bphase\b/i,
    /\bblock\b/i,
    /\bplot\b/i,
    /\bflat\b/i,
    /\bhotel\b/i,
    /\bbuilding\b/i,
    /\btower\b/i,
    /\bhwy\b/i,
    /\bhighway\b/i,
    /\d+/, // Contains digits (pincodes, plot numbers, door numbers)
  ];

  return streetIndicators.some((rx) => rx.test(t));
};

/**
 * Checks whether an address string is a URL (e.g. Google Maps URL or web link)
 */
export const isAddressUrl = (val?: any): boolean => {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim().toLowerCase();
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.includes('maps.google.') ||
    s.includes('goo.gl/') ||
    s.includes('google.com/maps')
  );
};

/**
 * Extracts a readable place or business name from a Google Maps URL, or returns empty string.
 * E.g., "https://www.google.com/maps/place/Bakeri+Group/@23.0371789,..." -> "Bakeri Group"
 * E.g., "https://maps.google.com/?q=Taj+Mahal" -> "Taj Mahal"
 */
export const extractPlaceNameFromUrl = (url?: string): string => {
  if (!url || typeof url !== 'string') return '';
  try {
    // Check for /place/Name+Here/ or /place/Name+Here@...
    const placeMatch = url.match(/\/place\/([^/@?]+)/i);
    if (placeMatch && placeMatch[1]) {
      const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      if (decoded && !/^[0-9.,+-]+$/.test(decoded)) {
        return decoded;
      }
    }
    // Check for ?q=Name+Here
    const qMatch = url.match(/[?&]q=([^&]+)/i);
    if (qMatch && qMatch[1]) {
      const decoded = decodeURIComponent(qMatch[1].replace(/\+/g, ' ')).trim();
      if (decoded && !/^[0-9.,+-]+$/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // fallback
  }
  return '';
};

/**
 * Parses any raw address string to accurately deduce the City and Country
 */
export const parseAddressString = (rawAddress?: string): { city: string; country: string } => {
  if (!rawAddress || !rawAddress.trim()) {
    return { city: 'City', country: 'India' };
  }

  // If the raw address is a URL, avoid parsing URL parameters as cities/countries
  if (isAddressUrl(rawAddress)) {
    const placeName = extractPlaceNameFromUrl(rawAddress);
    return { city: placeName || 'City', country: 'India' };
  }

  const text = rawAddress.trim();
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);

  // 1. Detect Country
  let detectedCountry = 'India';

  for (const c of KNOWN_COUNTRIES) {
    const rx = new RegExp(`\\b${c}\\b`, 'i');
    if (rx.test(text)) {
      detectedCountry =
        c.toUpperCase() === 'USA'
          ? 'United States'
          : c.toUpperCase() === 'UK'
          ? 'United Kingdom'
          : c.toUpperCase() === 'UAE'
          ? 'United Arab Emirates'
          : c;
      break;
    }
  }

  // Check state / pincode context for India
  if (detectedCountry === 'India') {
    const indianStates = [
      'Telangana',
      'Karnataka',
      'Maharashtra',
      'Tamil Nadu',
      'Delhi',
      'Kerala',
      'Gujarat',
      'West Bengal',
      'Rajasthan',
      'Uttar Pradesh',
      'Haryana',
      'Andhra Pradesh',
      'Punjab',
      'Goa',
    ];
    const hasIndianContext =
      /\b[1-9][0-9]{5}\b/.test(text) ||
      indianStates.some((st) => new RegExp(`\\b${st}\\b`, 'i').test(text));
    if (hasIndianContext) {
      detectedCountry = 'India';
    } else if (/\b[0-9]{5}(?:-[0-9]{4})?\b/.test(text)) {
      detectedCountry = 'United States';
    }
  }

  // 2. Detect City
  let detectedCity = '';

  // Look for known cities
  for (const part of parts) {
    for (const city of KNOWN_CITIES) {
      if (part.toLowerCase() === city.toLowerCase() || new RegExp(`\\b${city}\\b`, 'i').test(part)) {
        detectedCity = city;
        break;
      }
    }
    if (detectedCity) break;
  }

  // Fallback: pick the segment before state/pin or country
  if (!detectedCity && parts.length > 1) {
    for (let i = parts.length - 2; i >= 0; i--) {
      const p = parts[i];
      if (!isInvalidCountry(p) && p.length > 2 && p.length < 30) {
        detectedCity = p.replace(/\b\d+\b/g, '').trim();
        break;
      }
    }
  }

  return {
    city: detectedCity || parts[parts.length - 2] || 'City',
    country: detectedCountry,
  };
};

/**
 * Sanitizes country string; if it is a street name or invalid, cleans it using address or fallback
 */
export const sanitizeCountry = (country?: string, address?: string): string => {
  if (country && !isInvalidCountry(country)) {
    return country.trim();
  }
  if (address) {
    const parsed = parseAddressString(address);
    return parsed.country;
  }
  return 'India';
};

/**
 * Resolves a clean, elegant location label for cards (e.g. "Secunderabad, Hyderabad" or "Secunderabad, India")
 * Never displays a street or raw door number
 */
export const resolveDisplayLocation = (
  unitAddress?: string,
  unitCountry?: string,
  unitCity?: string
): string => {
  const cleanCountry = sanitizeCountry(unitCountry, unitAddress);

  if (unitCity && !isInvalidCountry(unitCity)) {
    return `${unitCity}, ${cleanCountry}`;
  }

  if (unitAddress) {
    const { city, country } = parseAddressString(unitAddress);
    if (city && city.toLowerCase() !== country.toLowerCase()) {
      return `${city}, ${country}`;
    }
    return country;
  }

  return cleanCountry;
};

/**
 * Checks if a string is pure numeric coordinates (e.g. "72.5054191" or "23.0371789, 72.5054191")
 */
export const isNumericCoordinate = (val?: string): boolean => {
  if (!val || typeof val !== 'string') return false;
  const t = val.trim();
  return /^[0-9.,+\-\s]+$/.test(t) && /\d+\.\d+/.test(t);
};

/**
 * Normalizes any address (string or object) into clean human-readable text and an optional map URL.
 * Guarantees that raw URLs (like 200-character Google Maps links) are NEVER returned as plain address text,
 * and always creates a clickable Google Maps link when valid location details exist.
 */
export const getCleanAddressText = (
  address?: any,
  fallback: string = 'Property Address'
): { text: string; mapUrl: string | null } => {
  if (!address) return { text: fallback, mapUrl: null };

  // Case 1: address is a string
  if (typeof address === 'string') {
    const trimmed = address.trim();
    if (!trimmed) return { text: fallback, mapUrl: null };

    if (isAddressUrl(trimmed)) {
      const placeName = extractPlaceNameFromUrl(trimmed);
      return {
        text: placeName || fallback,
        mapUrl: trimmed,
      };
    }

    if (isNumericCoordinate(trimmed)) {
      return {
        text: fallback !== 'Property Address' ? fallback : 'Location on Map',
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`,
      };
    }

    return {
      text: trimmed,
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`,
    };
  }

  // Case 2: address is an object
  const rawFormatted = typeof address.formattedAddress === 'string' ? address.formattedAddress.trim() : '';
  const isFormattedUrl = isAddressUrl(rawFormatted);

  // Resolve mapUrl prioritizing explicit URLs and coordinates
  let mapUrl: string | null = null;
  if (isFormattedUrl) {
    mapUrl = rawFormatted;
  } else if (typeof address.mapUrl === 'string' && isAddressUrl(address.mapUrl)) {
    mapUrl = address.mapUrl;
  } else if (typeof address.googleMapsUrl === 'string' && isAddressUrl(address.googleMapsUrl)) {
    mapUrl = address.googleMapsUrl;
  } else if (typeof address.url === 'string' && isAddressUrl(address.url)) {
    mapUrl = address.url;
  } else if (typeof address.lat === 'number' && typeof address.lng === 'number' && (address.lat !== 0 || address.lng !== 0)) {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${address.lat},${address.lng}`;
  } else if (typeof address.latitude === 'number' && typeof address.longitude === 'number' && (address.latitude !== 0 || address.longitude !== 0)) {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`;
  } else if (address.placeId && !String(address.placeId).startsWith('addr_')) {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=place_id:${address.placeId}`;
  }

  // Check structured fields, filtering out pure numeric coordinates from the label
  const structuredParts = [
    address.street || address.line1,
    address.city,
    address.state,
    address.country,
  ]
    .filter((p) => typeof p === 'string' && p.trim() && !isAddressUrl(p) && !isNumericCoordinate(p))
    .map((p) => p.trim());

  if (structuredParts.length > 0) {
    const text = structuredParts.join(', ');
    if (!mapUrl && text && text !== fallback) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
    }
    return {
      text,
      mapUrl,
    };
  }

  // If formattedAddress is a URL, extract place name or fallback
  if (isFormattedUrl) {
    const placeName = extractPlaceNameFromUrl(rawFormatted);
    const label = placeName || (!isNumericCoordinate(address.city) ? address.city : null) || fallback;
    return {
      text: label,
      mapUrl: rawFormatted,
    };
  }

  // If rawFormatted has text, check if it's numeric coordinates
  if (rawFormatted) {
    if (isNumericCoordinate(rawFormatted)) {
      if (!mapUrl) {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawFormatted)}`;
      }
      return {
        text: address.country || fallback,
        mapUrl,
      };
    }
    if (!mapUrl) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawFormatted)}`;
    }
    return { text: rawFormatted, mapUrl };
  }

  if (address.city && !isNumericCoordinate(address.city)) {
    const loc = [address.city, address.country].filter(Boolean).join(', ');
    if (!mapUrl && loc) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
    }
    return { text: loc || fallback, mapUrl };
  }

  if (address.country) {
    if (!mapUrl) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.country)}`;
    }
    return { text: address.country, mapUrl };
  }

  return { text: fallback, mapUrl };
};
