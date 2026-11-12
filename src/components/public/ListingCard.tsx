import React, { useState } from 'react';
import { Unit, Property } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { convertCurrency, BASELINE_RATES_USD, normalizeCurrencyCode, getCurrencySymbol } from '../../lib/currencyService';
import { CurrencyAmount } from '../common/CurrencyAmount';
import { resolveDisplayLocation } from '../../lib/addressUtils';
import { AddressDisplay } from '../common/AddressDisplay';
import { ChevronLeft, ChevronRight, Star, MapPin } from 'lucide-react';

interface ListingCardProps {
  unit: Unit;
  property?: Property;
  onSelect?: (unit: Unit) => void;
  isSaved?: boolean;
  onToggleSave?: (unitId: string) => void;
}

export const ListingCard: React.FC<ListingCardProps> = ({
  unit,
  property,
  onSelect,
}) => {
  const { state } = useAppData();
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Robust property lookup across ID, case-insensitive name, or unit ID substring
  const resolvedProp =
    property ||
    state.properties.find(
      (p) =>
        (unit.propertyId && p.id === unit.propertyId) ||
        (p.name && unit.propertyName && (p.name || '').trim().toLowerCase() === (unit.propertyName || '').trim().toLowerCase()) ||
        (unit.id && p.id && unit.id.includes(p.id))
    );

  // Real ratings from state.reviews.owners
  const propertyReviews = (state.reviews?.owners || []).filter(
    (r: any) =>
      (resolvedProp?.id && r.propertyId === resolvedProp.id) ||
      (resolvedProp?.ownerId && r.ownerId === resolvedProp.ownerId) ||
      (unit.ownerId && r.ownerId === unit.ownerId)
  );
  const avgRating =
    propertyReviews.length > 0
      ? (propertyReviews.reduce((sum: number, r: any) => sum + (Number(r.rating) || 5), 0) / propertyReviews.length).toFixed(1)
      : null;

  // Collect real photos from unit and property
  const allPhotos: string[] = [];
  const addPhoto = (img?: any) => {
    if (typeof img === 'string' && img.trim().length > 10) {
      const clean = img.trim();
      if (!allPhotos.includes(clean)) {
        allPhotos.push(clean);
      }
    }
  };

  // 1. Unit photos first
  if (Array.isArray(unit.images)) {
    unit.images.forEach(addPhoto);
  }
  if (Array.isArray((unit as any).photos)) {
    (unit as any).photos.forEach(addPhoto);
  }
  addPhoto(unit.image);
  addPhoto((unit as any).photo);
  addPhoto((unit as any).coverImage);

  // 2. Property photos fallback
  if (resolvedProp) {
    if (Array.isArray(resolvedProp.images)) {
      resolvedProp.images.forEach(addPhoto);
    }
    if (Array.isArray((resolvedProp as any).photos)) {
      (resolvedProp as any).photos.forEach(addPhoto);
    }
    addPhoto((resolvedProp as any).image);
    addPhoto((resolvedProp as any).coverImage);
    if (Array.isArray(resolvedProp.amenityPhotos)) {
      resolvedProp.amenityPhotos.forEach((ap) => addPhoto(ap.image));
    }
  }

  // Location fallback text
  const locationText = resolveDisplayLocation(
    resolvedProp?.address?.formattedAddress || unit.address,
    resolvedProp?.address?.country || resolvedProp?.country || unit.country
  );

  // Specs text
  const bedsText = (() => {
    if (unit.unitType?.toLowerCase().includes('studio') || unit.unitType === '0') return 'Studio';
    if (unit.unitType && !isNaN(Number(unit.unitType))) {
      const num = Number(unit.unitType);
      return `${num} ${num === 1 ? 'bed' : 'beds'}`;
    }
    return unit.unitType || '1 bed';
  })();

  const bathsText = `${unit.bathrooms || 1} bath`;
  const areaText = unit.areaSqFt ? `${unit.areaSqFt.toLocaleString()} sq ft` : '';

  // Currency & USD conversion
  const rawCurr = unit.currency || resolvedProp?.currency || '$';
  const currSymbol = getCurrencySymbol(rawCurr);
  const currCode = normalizeCurrencyCode(rawCurr);
  const usdAmount = currCode !== 'USD' ? Math.round(convertCurrency(unit.rent, currCode, 'USD', BASELINE_RATES_USD)) : null;

  // New badge: if unit created within 7 days
  const isNew = (() => {
    const createdTime = (unit as any).createdAt ? new Date((unit as any).createdAt).getTime() : 0;
    if (!createdTime) return true; // Newly added
    return Date.now() - createdTime <= 7 * 86400000;
  })();

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allPhotos.length <= 1) return;
    setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : allPhotos.length - 1));
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allPhotos.length <= 1) return;
    setActivePhotoIdx((prev) => (prev < allPhotos.length - 1 ? prev + 1 : 0));
  };

  return (
    <article
      className="prop-listing-card"
      onClick={() => onSelect?.(unit)}
      style={{
        background: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease',
        position: 'relative',
        height: '100%',
      }}
    >
      {/* 1. Image area (16:10 aspect ratio) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 10',
          background: 'var(--surface-sunken, #f8fafc)',
          overflow: 'hidden',
        }}
      >
        {allPhotos.length > 0 ? (
          <img
            src={allPhotos[activePhotoIdx]}
            alt={`Unit ${unit.unitNumber}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s ease',
            }}
          />
        ) : (
          /* Architectural gradient fallback when owner hasn't uploaded photos yet */
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '4px' }}>🏢</div>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Unit {unit.unitNumber}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{resolvedProp?.name || 'Verified Residence'}</div>
          </div>
        )}

        {/* Badges on top left */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px', zIndex: 2 }}>
          {isNew && (
            <span
              style={{
                background: '#10B981',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
                letterSpacing: '0.02em',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              New
            </span>
          )}
          <span
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(4px)',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            Unit {unit.unitNumber}
          </span>
        </div>

        {/* Photo arrows if multiple photos */}
        {allPhotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevPhoto}
              style={{
                position: 'absolute',
                top: '50%',
                left: '8px',
                transform: 'translateY(-50%)',
                background: 'rgba(0, 0, 0, 0.5)',
                border: 'none',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNextPhoto}
              style={{
                position: 'absolute',
                top: '50%',
                right: '8px',
                transform: 'translateY(-50%)',
                background: 'rgba(0, 0, 0, 0.5)',
                border: 'none',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              <ChevronRight size={16} />
            </button>
            {/* Dots */}
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '4px',
                zIndex: 2,
              }}
            >
              {allPhotos.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === activePhotoIdx ? '12px' : '5px',
                    height: '5px',
                    borderRadius: '3px',
                    background: i === activePhotoIdx ? '#ffffff' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 2. Card Body */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
        <div>
          {/* Top Line: Property / Unit Name + Rating */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
            <h4
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--heading-color, #0f172a)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={resolvedProp?.name || `Unit ${unit.unitNumber}`}
            >
              {resolvedProp?.name || `Unit ${unit.unitNumber}`}
            </h4>
            {avgRating ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#10B981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  flexShrink: 0,
                }}
              >
                <Star size={11} fill="#10B981" /> {avgRating}
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#059669',
                  background: '#ecfdf5',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  flexShrink: 0,
                }}
              >
                Verified
              </span>
            )}
          </div>

          {/* Location Line with Google Maps link, matching Owner Properties */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--slate, #64748b)',
              marginBottom: '8px',
              flexWrap: 'wrap',
              lineHeight: 1.4,
            }}
          >
            <MapPin size={12} color="#10B981" style={{ flexShrink: 0 }} />
            <AddressDisplay
              address={resolvedProp?.address || unit.address}
              fallback={locationText || 'Address on file'}
              style={{ fontSize: '12px', color: 'var(--slate, #64748b)' }}
              linkStyle={{ fontSize: '11.5px', color: 'var(--teal-primary, #0d9488)' }}
            />
          </div>

          {/* Specs: beds · baths · sq ft */}
          <div style={{ fontSize: '12px', color: 'var(--slate, #64748b)', marginBottom: '10px' }}>
            {bedsText} • {bathsText} {areaText ? `• ${areaText}` : ''}
          </div>
        </div>

        {/* Price Line */}
        <div style={{ borderTop: '1px solid var(--border-color, #f1f5f9)', paddingTop: '10px', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--heading-color, #0f172a)' }}>
              <CurrencyAmount amount={unit.rent} currency={currCode} />
            </span>
            <span style={{ fontSize: '12px', color: 'var(--slate, #64748b)' }}>/ month</span>
          </div>
        </div>
      </div>
    </article>
  );
};
