import React, { useState, useEffect, useRef } from 'react';
import { PropertyAddress } from '../types';
import { MapPin, Search, Loader2, Sparkles } from 'lucide-react';
import { parseAddressString, sanitizeCountry } from '../lib/addressUtils';

interface GooglePlacesAddressPickerProps {
  onAddressSelect: (address: PropertyAddress) => void;
  initialValue?: string;
}

interface ExtendedAddressItem extends PropertyAddress {
  rawPrediction?: any;
}

export const GooglePlacesAddressPicker: React.FC<GooglePlacesAddressPickerProps> = ({
  onAddressSelect,
  initialValue = '',
}) => {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<ExtendedAddressItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApiReady, setIsApiReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const placesLibRef = useRef<any>(null);
  const debounceTimerRef = useRef<any>(null);
  const activeQueryRef = useRef<string>('');

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Initialize Google Maps Places API (New)
  useEffect(() => {
    if (!apiKey || apiKey.trim() === '') {
      return;
    }

    const initPlacesNew = async () => {
      try {
        if ((window as any).google?.maps?.importLibrary) {
          const places = await (window as any).google.maps.importLibrary('places');
          placesLibRef.current = places;
          setIsApiReady(true);
          return;
        }

        const scriptId = 'google-maps-places-script';
        if (!document.getElementById(scriptId)) {
          const script = document.createElement('script');
          script.id = scriptId;
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly&loading=async`;
          script.async = true;
          script.onload = async () => {
            try {
              if ((window as any).google?.maps?.importLibrary) {
                const places = await (window as any).google.maps.importLibrary('places');
                placesLibRef.current = places;
                setIsApiReady(true);
              } else if ((window as any).google?.maps?.places) {
                placesLibRef.current = (window as any).google.maps.places;
                setIsApiReady(true);
              }
            } catch (err) {
              console.warn('Error loading modern Places library:', err);
              // Still mark API ready if key exists so REST fallback can run
              setIsApiReady(true);
            }
          };
          script.onerror = () => {
            console.warn('Failed to load Google Maps script tag; using REST fallback.');
            setIsApiReady(true);
          };
          document.body.appendChild(script);
        } else {
          // Script already exists in DOM
          if ((window as any).google?.maps?.importLibrary) {
            const places = await (window as any).google.maps.importLibrary('places');
            placesLibRef.current = places;
            setIsApiReady(true);
          }
        }
      } catch (err) {
        console.warn('Places initialization exception:', err);
        setIsApiReady(true);
      }
    };

    initPlacesNew();
  }, [apiKey]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPredictions = async (val: string): Promise<ExtendedAddressItem[]> => {
    const trimmed = val.trim();
    if (!trimmed) return [];

    // Method 1: Modern Places API (New) via Maps JS SDK AutocompleteSuggestion
    const placesLib = placesLibRef.current || (window as any).google?.maps?.places;
    if (placesLib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      try {
        const response = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
        });
        if (response?.suggestions && response.suggestions.length > 0) {
          return response.suggestions
            .filter((s: any) => s.placePrediction)
            .map((s: any) => {
              const pred = s.placePrediction;
              const textStr =
                pred.text?.toString?.() ||
                pred.text?.text ||
                pred.mainText?.toString?.() ||
                '';
              const parsed = parseAddressString(textStr);
              return {
                formattedAddress: textStr,
                city: parsed.city,
                country: sanitizeCountry(parsed.country, textStr),
                placeId: pred.placeId || '',
                lat: 0,
                lng: 0,
                rawPrediction: pred,
              };
            });
        }
      } catch (err) {
        console.warn('AutocompleteSuggestion error, checking REST fallback:', err);
      }
    }

    // Method 2: Google Places API (New) REST API fallback
    if (apiKey) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
          },
          body: JSON.stringify({ input: trimmed }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions && data.suggestions.length > 0) {
            return data.suggestions
              .filter((s: any) => s.placePrediction)
              .map((s: any) => {
                const pred = s.placePrediction;
                const textStr =
                  pred.text?.text ||
                  pred.structuredFormat?.mainText?.text ||
                  '';
                const parsed = parseAddressString(textStr);
                return {
                  formattedAddress: textStr,
                  city: parsed.city,
                  country: sanitizeCountry(parsed.country, textStr),
                  placeId: pred.placeId || '',
                  lat: 0,
                  lng: 0,
                };
              });
          }
        }
      } catch (err) {
        console.warn('Places New REST autocomplete error:', err);
      }
    }

    return [];
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    activeQueryRef.current = val;

    if (!val.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await fetchPredictions(val);
        // Ensure user hasn't typed something else while waiting
        if (activeQueryRef.current === val) {
          if (results.length > 0) {
            setSuggestions(results);
            setIsOpen(true);
          } else {
            fallbackLocalSuggestions(val);
          }
        }
      } catch {
        if (activeQueryRef.current === val) {
          fallbackLocalSuggestions(val);
        }
      } finally {
        if (activeQueryRef.current === val) {
          setIsLoading(false);
        }
      }
    }, 280);
  };

  const fallbackLocalSuggestions = (val: string) => {
    const parsed = parseAddressString(val);
    setSuggestions([
      {
        formattedAddress: val,
        city: parsed.city,
        country: sanitizeCountry(parsed.country, val),
        placeId: `addr_${Date.now()}`,
        lat: 0,
        lng: 0,
      },
    ]);
    setIsOpen(true);
  };

  const handleSelect = async (item: ExtendedAddressItem) => {
    setIsLoading(true);

    try {
      const placesLib = placesLibRef.current || (window as any).google?.maps?.places;

      // Method 1: New Places SDK Place Prediction
      if (item.rawPrediction?.toPlace) {
        try {
          const place = item.rawPrediction.toPlace();
          await place.fetchFields({
            fields: ['displayName', 'formattedAddress', 'addressComponents', 'location'],
          });
          const enriched = extractFromPlaceObject(place, item);
          setQuery(enriched.formattedAddress);
          setIsOpen(false);
          onAddressSelect(enriched);
          return;
        } catch (err) {
          console.warn('place.toPlace() fetchFields error:', err);
        }
      }

      // Method 2: New Places SDK Place Constructor with ID
      if (placesLib?.Place && item.placeId && !item.placeId.startsWith('addr_')) {
        try {
          const place = new placesLib.Place({ id: item.placeId });
          await place.fetchFields({
            fields: ['displayName', 'formattedAddress', 'addressComponents', 'location'],
          });
          const enriched = extractFromPlaceObject(place, item);
          setQuery(enriched.formattedAddress);
          setIsOpen(false);
          onAddressSelect(enriched);
          return;
        } catch (err) {
          console.warn('new Place({ id }) fetchFields error:', err);
        }
      }

      // Method 3: Places API (New) REST Details
      if (apiKey && item.placeId && !item.placeId.startsWith('addr_')) {
        try {
          const res = await fetch(
            `https://places.googleapis.com/v1/places/${item.placeId}?fields=id,displayName,formattedAddress,addressComponents,location&key=${apiKey}`
          );
          if (res.ok) {
            const data = await res.json();
            let city = item.city;
            let country = item.country;
            let street = item.street;

            if (data.addressComponents) {
              for (const comp of data.addressComponents) {
                const text = comp.longText || comp.shortText || '';
                const types: string[] = comp.types || [];
                if (types.includes('locality') || types.includes('postal_town')) city = text;
                else if (!city && types.includes('administrative_area_level_2')) city = text;
                if (types.includes('country')) country = text;
                if (types.includes('route')) street = text;
              }
            }

            const enriched: PropertyAddress = {
              formattedAddress: data.formattedAddress || data.displayName?.text || item.formattedAddress,
              city: city || item.city,
              country: sanitizeCountry(country || item.country, data.formattedAddress),
              street: street || item.street,
              lat: data.location?.latitude || 0,
              lng: data.location?.longitude || 0,
              placeId: item.placeId,
            };

            setQuery(enriched.formattedAddress);
            setIsOpen(false);
            onAddressSelect(enriched);
            return;
          }
        } catch (err) {
          console.warn('REST details error:', err);
        }
      }
    } catch (err) {
      console.warn('Selection enrichment error:', err);
    } finally {
      setIsLoading(false);
    }

    // Fallback if detail fetch didn't return
    setQuery(item.formattedAddress);
    setIsOpen(false);
    onAddressSelect(item);
  };

  const extractFromPlaceObject = (place: any, fallbackItem: ExtendedAddressItem): PropertyAddress => {
    let city = fallbackItem.city;
    let country = fallbackItem.country;
    let street = fallbackItem.street;

    if (place.addressComponents && Array.isArray(place.addressComponents)) {
      for (const comp of place.addressComponents) {
        const val = comp.longText || comp.long_name || comp.shortText || '';
        const types: string[] = comp.types || [];
        if (types.includes('locality') || types.includes('postal_town')) {
          city = val;
        } else if (!city && types.includes('administrative_area_level_2')) {
          city = val;
        }
        if (types.includes('country')) {
          country = val;
        }
        if (types.includes('route')) {
          street = val;
        }
      }
    }

    const lat =
      typeof place.location?.lat === 'function'
        ? place.location.lat()
        : place.location?.lat || 0;
    const lng =
      typeof place.location?.lng === 'function'
        ? place.location.lng()
        : place.location?.lng || 0;

    const formattedAddress =
      place.formattedAddress ||
      (typeof place.displayName === 'string' ? place.displayName : place.displayName?.text) ||
      fallbackItem.formattedAddress;

    return {
      formattedAddress,
      city: city || fallbackItem.city,
      country: sanitizeCountry(country || fallbackItem.country, formattedAddress),
      street: street || fallbackItem.street,
      lat,
      lng,
      placeId: place.id || fallbackItem.placeId,
    };
  };

  return (
    <div className="search-wrap" ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => {
            if (query.trim() && suggestions.length > 0) setIsOpen(true);
          }}
          placeholder="Search street address, city or landmark (Google Maps Places)..."
          style={{ paddingLeft: '32px' }}
        />
        <MapPin
          size={16}
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--ink-soft, #64748b)',
          }}
        />
        {isLoading && (
          <Loader2
            size={15}
            className="spin"
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ink-soft, #64748b)',
            }}
          />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          className="search-results show"
          style={{
            position: 'absolute',
            zIndex: 1000,
            width: '100%',
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--line-strong, #cbd5e1)',
            borderRadius: 'var(--radius, 8px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            marginTop: '4px',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {suggestions.map((item, idx) => (
            <div
              key={item.placeId || idx}
              onClick={() => handleSelect(item)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: idx < suggestions.length - 1 ? '1px solid var(--line, #e2e8f0)' : 'none',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              <MapPin size={15} style={{ flexShrink: 0, marginTop: '2px', color: '#10B981' }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink, #0f172a)' }}>
                  {item.formattedAddress}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--ink-soft, #64748b)' }}>
                  {item.city ? `${item.city}, ` : ''}{item.country || 'Global'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

