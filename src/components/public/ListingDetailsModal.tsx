import React, { useState } from 'react';
import { Unit, Property } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { getCurrencySymbol, normalizeCurrencyCode, convertCurrency, BASELINE_RATES_USD } from '../../lib/currencyService';
import { CurrencyAmount } from '../common/CurrencyAmount';
import { resolveDisplayLocation, getCleanAddressText } from '../../lib/addressUtils';
import { AddressDisplay } from '../common/AddressDisplay';
import { ButtonProcessing } from '../common/Spinner';
import {
  X,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  CheckCircle2,
  Calendar,
  Phone,
  User,
  MessageSquare,
  ShieldCheck,
  Building,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface ListingDetailsModalProps {
  unit: Unit | null;
  property?: Property;
  isOpen: boolean;
  onClose: () => void;
}

export const ListingDetailsModal: React.FC<ListingDetailsModalProps> = ({
  unit,
  property,
  isOpen,
  onClose,
}) => {
  const { state, submitEnquiry } = useAppData();
  const { user } = useAuth();

  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Enquiry form state
  const [prospectName, setProspectName] = useState(user?.displayName || '');
  const [prospectPhone, setProspectPhone] = useState(user?.phone || '');
  const [prospectEmail, setProspectEmail] = useState(user?.email || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [formError, setFormError] = useState('');

  if (!isOpen || !unit) return null;

  // Robust property lookup across ID, case-insensitive name, or unit ID substring
  const resolvedProp =
    property ||
    state.properties.find(
      (p) =>
        (unit.propertyId && p.id === unit.propertyId) ||
        (p.name && unit.propertyName && (p.name || '').trim().toLowerCase() === (unit.propertyName || '').trim().toLowerCase()) ||
        (unit.id && p.id && unit.id.includes(p.id))
    );

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

  const rawCurr = unit.currency || resolvedProp?.currency || '$';
  const currSymbol = getCurrencySymbol(rawCurr);
  const currCode = normalizeCurrencyCode(rawCurr);
  const totalMoveIn = (unit.rent || 0) + (unit.deposit || 0);

  const displayLocation = resolveDisplayLocation(
    resolvedProp?.address?.formattedAddress || unit.address,
    resolvedProp?.address?.country || resolvedProp?.country || unit.country
  );

  const bedsText = (() => {
    if (unit.unitType?.toLowerCase().includes('studio') || unit.unitType === '0') return 'Studio';
    if (unit.unitType && !isNaN(Number(unit.unitType))) {
      const num = Number(unit.unitType);
      return `${num} ${num === 1 ? 'Bedroom' : 'Bedrooms'}`;
    }
    return unit.unitType || '1 Bedroom';
  })();

  const handleSubmitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!prospectName.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    if (!prospectPhone.trim() || prospectPhone.trim().length < 7) {
      setFormError('Please enter a valid contact phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitEnquiry({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        propertyId: unit.propertyId || resolvedProp?.id || property?.id || '',
        propertyName: resolvedProp?.name || property?.name || `Unit ${unit.unitNumber}`,
        ownerId: unit.ownerId || resolvedProp?.ownerId || property?.ownerId || '',
        managerId: resolvedProp?.assignedManagerId || property?.assignedManagerId || undefined,
        prospectName: prospectName.trim(),
        prospectPhone: prospectPhone.trim(),
        prospectEmail: prospectEmail.trim() || user?.email || undefined,
        moveInDate: new Date().toISOString().split('T')[0],
        notes: notes.trim() || undefined,
        tenantId: user?.id || undefined,
      });
      setIsSent(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit enquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1200, padding: '16px' }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '920px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'var(--surface, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Head */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--line, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--ink, #0f172a)' }}>
              Unit {unit.unitNumber} • {resolvedProp?.name || 'Verified Residence'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--slate, #64748b)', marginTop: '2px', flexWrap: 'wrap' }}>
              <MapPin size={13} color="#10B981" style={{ flexShrink: 0 }} />
              <AddressDisplay
                address={resolvedProp?.address || unit.address}
                fallback={displayLocation || 'Address on file'}
                style={{ fontSize: '12px', color: 'var(--slate, #64748b)' }}
                linkStyle={{ fontSize: '12px', color: 'var(--teal-primary, #0d9488)' }}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn secondary small"
            onClick={onClose}
            aria-label="Close"
            style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {/* 1. Photo Gallery */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                maxHeight: '380px',
                borderRadius: '14px',
                overflow: 'hidden',
                background: 'var(--surface-sunken, #0f172a)',
              }}
            >
              {allPhotos.length > 0 ? (
                <img
                  src={allPhotos[activePhotoIdx]}
                  alt={`Unit ${unit.unitNumber}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
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
                    padding: '24px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>🏢</div>
                  <div style={{ fontSize: '18px', fontWeight: 800 }}>Unit {unit.unitNumber}</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>{property?.name}</div>
                </div>
              )}

              {allPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActivePhotoIdx((p) => (p > 0 ? p - 1 : allPhotos.length - 1))}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '12px',
                      transform: 'translateY(-50%)',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePhotoIdx((p) => (p < allPhotos.length - 1 ? p + 1 : 0))}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: '12px',
                      transform: 'translateY(-50%)',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails row */}
            {allPhotos.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                {allPhotos.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePhotoIdx(i)}
                    style={{
                      width: '68px',
                      height: '48px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: i === activePhotoIdx ? '2px solid #10B981' : '1px solid var(--border-color, #e2e8f0)',
                      padding: 0,
                      cursor: 'pointer',
                      flexShrink: 0,
                      opacity: i === activePhotoIdx ? 1 : 0.65,
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Specs & Move-In Costs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Specs Panel */}
            <div style={{ background: 'var(--surface-sunken, #f8fafc)', padding: '18px 20px', borderRadius: '14px', border: '1px solid var(--line, #e2e8f0)' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                Home Specifications
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate, #64748b)' }}>Layout / Bedrooms:</span>
                  <span style={{ fontWeight: 600 }}>{bedsText}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate, #64748b)' }}>Bathrooms:</span>
                  <span style={{ fontWeight: 600 }}>{unit.bathrooms || 1} Full Bath</span>
                </div>
                {unit.areaSqFt ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--slate, #64748b)' }}>Floor Area:</span>
                    <span style={{ fontWeight: 600 }}>{unit.areaSqFt.toLocaleString()} sq ft</span>
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate, #64748b)' }}>Furnishing:</span>
                  <span style={{ fontWeight: 600 }}>{unit.furnishing || 'Unfurnished'}</span>
                </div>
                {unit.floor ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--slate, #64748b)' }}>Floor Level:</span>
                    <span style={{ fontWeight: 600 }}>{unit.floor}</span>
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate, #64748b)' }}>Status:</span>
                  <span style={{ fontWeight: 700, color: '#10B981' }}>Available Now (Vacant)</span>
                </div>
              </div>
            </div>

            {/* Move-in Cost Transparency Panel */}
            <div style={{ background: 'var(--surface-sunken, #f8fafc)', padding: '18px 20px', borderRadius: '14px', border: '1px solid var(--line, #e2e8f0)' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                Transparent Move-In Costs
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate, #64748b)' }}>First Month's Rent:</span>
                  <span style={{ fontWeight: 600 }}><CurrencyAmount amount={unit.rent} currency={currCode} /></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate, #64748b)' }}>Security Deposit:</span>
                  <span style={{ fontWeight: 600 }}><CurrencyAmount amount={unit.deposit || 0} currency={currCode} /></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate, #64748b)' }}>Move-in Platform Fee:</span>
                  <span style={{ fontWeight: 600, color: '#10B981' }}><CurrencyAmount amount={0} currency={currCode} /> (Waived)</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid var(--border-color, #e2e8f0)',
                    paddingTop: '10px',
                    marginTop: '4px',
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--ink, #0f172a)' }}>Total Due at Move-in:</span>
                  <span style={{ fontSize: '17px', fontWeight: 800, color: '#10B981' }}>
                    <CurrencyAmount amount={totalMoveIn} currency={currCode} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Amenities List */}
          {property?.amenities && property.amenities.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                Building & Unit Amenities
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {property.amenities.map((am) => (
                  <span
                    key={am}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'var(--surface-sunken, #f1f5f9)',
                      border: '1px solid var(--line, #e2e8f0)',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--ink, #1e293b)',
                    }}
                  >
                    <CheckCircle2 size={13} color="#10B981" />
                    {am}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 4. Send Enquiry Section */}
          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '16px',
              padding: '22px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Phone size={18} color="#059669" />
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#065F46' }}>
                Send Enquiry
              </h4>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: '#047857', lineHeight: 1.45 }}>
              Interested in Unit {unit.unitNumber}? Submit your details below. The property owner or manager will receive your contact information directly and call you to arrange a walkthrough.
            </p>

            {isSent ? (
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #86EFAC',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <CheckCircle2 size={36} color="#10B981" style={{ margin: '0 auto 8px' }} />
                <h5 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#065F46' }}>
                  Enquiry Submitted Successfully!
                </h5>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#047857' }}>
                  Your request has been delivered to the property owner and manager. They will reach out to you at <b>{prospectPhone}</b>.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitEnquiry}>
                {formError && (
                  <div
                    style={{
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#DC2626',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      marginBottom: '12px',
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>
                      Name *
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                      required
                      style={{ background: '#FFFFFF', borderColor: '#86EFAC' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      className="input"
                      value={prospectEmail}
                      onChange={(e) => setProspectEmail(e.target.value)}
                      placeholder="e.g. sarah@example.com"
                      required
                      style={{ background: '#FFFFFF', borderColor: '#86EFAC' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>
                      Number *
                    </label>
                    <input
                      type="tel"
                      className="input"
                      value={prospectPhone}
                      onChange={(e) => setProspectPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 234-5678"
                      required
                      style={{ background: '#FFFFFF', borderColor: '#86EFAC' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>
                    Note (Optional)
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. I work nearby and would like to schedule an in-person viewing."
                    style={{ background: '#FFFFFF', borderColor: '#86EFAC', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#047857' }}>
                    <ShieldCheck size={14} color="#10B981" />
                    <span>Your phone is shared directly with the verified property team only.</span>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn brass"
                    style={{
                      background: '#059669',
                      borderColor: '#059669',
                      color: '#ffffff',
                      fontWeight: 700,
                      padding: '10px 22px',
                      borderRadius: '8px',
                    }}
                  >
                    <ButtonProcessing
                      loading={isSubmitting}
                      defaultText="Send Enquiry"
                      loadingText="Sending Enquiry..."
                    />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
