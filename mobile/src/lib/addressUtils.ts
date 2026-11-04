/**
 * Mobile Address & Location Utilities
 * URL normalization, place name extraction, and clean display formatting
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

