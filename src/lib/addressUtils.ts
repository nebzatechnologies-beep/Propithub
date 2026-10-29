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
 * Parses any raw address string to accurately deduce the City and Country
 */
export const parseAddressString = (rawAddress?: string): { city: string; country: string } => {
  if (!rawAddress || !rawAddress.trim()) {
    return { city: 'City', country: 'India' };
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
