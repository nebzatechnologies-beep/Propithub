import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getAllListings,
  formatMoney,
  toUSD,
  calculateBenchmark,
} from '../../lib/listingsData';
import { PropithubLogo } from '../../components/common/PropithubLogo';
import { AddressDisplay } from '../../components/common/AddressDisplay';
import { ArrowLeft, Share2, Heart, Check, ShieldCheck, X, Sun, Moon, MapPin, LayoutDashboard } from 'lucide-react';

export const ListingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, submitEnquiry, showToast } = useAppData();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const allListings = useMemo(() => {
    return getAllListings(state.units || [], state.properties || [], state.reviews);
  }, [state.units, state.properties, state.reviews]);

  const listing = useMemo(() => {
    return allListings.find((l) => l.id === id);
  }, [allListings, id]);

  // Saved state
  const [saved, setSaved] = useState<boolean>(() => {
    if (!id) return false;
    try {
      const raw = localStorage.getItem('propithub_saved_homes');
      const list = raw ? JSON.parse(raw) : [];
      return list.includes(id);
    } catch {
      return false;
    }
  });

  const toggleSave = () => {
    if (!id) return;
    try {
      const raw = localStorage.getItem('propithub_saved_homes');
      let list: string[] = raw ? JSON.parse(raw) : [];
      if (list.includes(id)) {
        list = list.filter((x) => x !== id);
        setSaved(false);
        showToast('Removed from saved homes');
      } else {
        list.push(id);
        setSaved(true);
        showToast('Saved to your favorites');
      }
      localStorage.setItem('propithub_saved_homes', JSON.stringify(list));
    } catch {}
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Listing URL copied to clipboard!');
    } catch {
      showToast('Sharing link: ' + window.location.href);
    }
  };

  // Gallery viewer modal state
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Enquiry form state — prefilled from logged-in user if available
  const [prospectName, setProspectName] = useState(user?.displayName || '');
  const [prospectPhone, setProspectPhone] = useState(user?.phone || '');
  const [prospectEmail, setProspectEmail] = useState(user?.email || '');
  const [moveInDate, setMoveInDate] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      if (!prospectName && user.displayName) setProspectName(user.displayName);
      if (!prospectPhone && user.phone) setProspectPhone(user.phone);
      if (!prospectEmail && user.email) setProspectEmail(user.email);
    }
  }, [user]);

  const benchmark = useMemo(() => {
    if (!listing) return null;
    return calculateBenchmark(listing, allListings);
  }, [listing, allListings]);

  const similarHomes = useMemo(() => {
    if (!listing) return [];
    return allListings
      .filter((x) => x.id !== listing.id && (x.country === listing.country || x.city === listing.city))
      .slice(0, 3);
  }, [listing, allListings]);

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing) return;
    if (!prospectName.trim()) {
      showToast('Please enter your full name');
      return;
    }
    if (!prospectPhone.trim() || prospectPhone.trim().length < 7) {
      showToast('Please enter a valid phone number');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitEnquiry({
        unitId: listing.unitId || listing.id,
        unitNumber: listing.unitNumber,
        propertyId: listing.propertyId || '',
        propertyName: listing.propertyName,
        ownerId: listing.ownerId || '',
        managerId: listing.managerId,
        tenantId: user?.id,
        prospectName: prospectName.trim(),
        prospectPhone: prospectPhone.trim(),
        prospectEmail: prospectEmail.trim() || undefined,
        moveInDate: moveInDate || new Date().toISOString().split('T')[0],
        notes: message.trim() || 'Interested in booking a viewing and rental terms.',
      });
      setSubmittedSuccess(true);
    } catch (err: any) {
      showToast(err?.message || 'Failed to submit enquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!listing) {
    return (
      <div className="site">
        <header className="snav">
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            <PropithubLogo size={30} showText={true} />
          </Link>
          <div className="slinks">
            <Link to="/homes">Browse homes</Link>
          </div>
          <span className="sp" />
          {user ? (
            <Link to={`/${user.role === 'manager' ? 'manager' : user.role}`} className="btn sm">
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn sm">Log in</Link>
          )}
        </header>
        <div className="browse" style={{ textAlign: 'center', padding: '80px 20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>
            Listing Not Found
          </h2>
          <p className="mute" style={{ marginBottom: '24px' }}>
            This property listing may have been rented or removed by the landlord.
          </p>
          <button className="btn pri" onClick={() => navigate('/homes')}>
            Back to all homes
          </button>
        </div>
      </div>
    );
  }

  const galleryImages = listing.images;

  return (
    <div className="site">
      {/* Top Header */}
      <header className="snav">
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          <PropithubLogo size={30} showText={true} />
        </Link>
        <nav className="slinks">
          <Link to="/homes" style={{ color: 'var(--teal-dark)', fontWeight: 700 }}>
            Browse homes
          </Link>
          <Link to="/#sec-how">How it works</Link>
          <Link to="/#sec-pricing">Pricing</Link>
          <Link to="/#sec-faq">FAQ</Link>
        </nav>
        <span className="sp" />
        <div className="snav-actions">
          {/* Dark/Light Mode Toggle */}
          <button
            type="button"
            className="theme-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {user ? (
            <Link
              to={`/${user.role === 'manager' ? 'manager' : user.role}`}
              className="btn sm snav-trial-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <LayoutDashboard size={15} /> Back to Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn sm snav-login-btn">
                Log in
              </Link>
              <Link to="/register" className="btn pri sm snav-trial-btn">
                Start free trial
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Main Browse Container */}
      <main className="browse">
        {/* Navigation / Action Bar */}
        <div className="dbar">
          <button className="btn sm" onClick={() => navigate('/homes')} style={{ display: 'inline-flex', gap: '6px' }}>
            <ArrowLeft size={16} /> All homes
          </button>
          <span className="sp" />
          <button className="btn sm" onClick={handleShare} style={{ display: 'inline-flex', gap: '6px' }}>
            <Share2 size={15} /> Share
          </button>
          <button
            className="btn sm"
            onClick={toggleSave}
            style={{
              display: 'inline-flex',
              gap: '6px',
              color: saved ? '#ef4444' : 'inherit',
              borderColor: saved ? '#fca5a5' : 'var(--line-strong)',
            }}
          >
            <Heart size={15} fill={saved ? '#ef4444' : 'none'} color={saved ? '#ef4444' : 'currentColor'} />
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

        {/* Photo Gallery — Real Photos Only (0, 1, or multiple) */}
        {galleryImages.length === 0 ? (
          <div
            style={{
              width: '100%',
              height: '260px',
              borderRadius: '18px',
              marginBottom: '28px',
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              gap: '8px',
              border: '1px solid var(--line)',
            }}
          >
            <span style={{ fontSize: '42px', opacity: 0.75 }}>🏢</span>
            <b style={{ fontSize: '18px', color: '#f8fafc', fontWeight: 700 }}>
              Unit {listing.unitNumber} · {listing.propertyName}
            </b>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
              No property photos uploaded by landlord yet
            </span>
          </div>
        ) : galleryImages.length === 1 ? (
          <div
            style={{
              width: '100%',
              height: '380px',
              borderRadius: '18px',
              overflow: 'hidden',
              marginBottom: '28px',
              position: 'relative',
              border: '1px solid var(--line)',
            }}
          >
            <img
              src={galleryImages[0]}
              alt={listing.title}
              onClick={() => {
                setActivePhotoIdx(0);
                setPhotoModalOpen(true);
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
            />
          </div>
        ) : (
          <div className="lgal">
            <button
              className="lg-main"
              onClick={() => {
                setActivePhotoIdx(0);
                setPhotoModalOpen(true);
              }}
              aria-label="View main photo"
            >
              <img src={galleryImages[0]} alt={listing.title} />
            </button>
            {galleryImages.slice(1, 5).map((imgUrl, idx) => (
              <button
                key={idx + 1}
                className="lg-sub"
                onClick={() => {
                  setActivePhotoIdx(idx + 1);
                  setPhotoModalOpen(true);
                }}
                aria-label={`View photo ${idx + 2}`}
              >
                <img
                  src={imgUrl}
                  alt={`${listing.title} photo ${idx + 2}`}
                />
              </button>
            ))}
            <button
              className="btn sm lg-all"
              onClick={() => {
                setActivePhotoIdx(0);
                setPhotoModalOpen(true);
              }}
            >
              Show all {galleryImages.length} photos
            </button>
          </div>
        )}

        {/* Content & Booking Split Grid */}
        <div className="ldt-grid">
          {/* Left Column: Details */}
          <div className="ldt-main">
            <h1>{listing.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: 'var(--ink-soft)', fontSize: '14.5px' }}>
              <MapPin size={16} style={{ color: 'var(--teal)', flexShrink: 0 }} />
              <AddressDisplay
                address={listing.rawAddress}
                fallback={listing.displayLocation || 'Address on file'}
              />
            </div>
            <p className="mute" style={{ fontSize: '14px', marginTop: '6px' }}>
              {listing.bedsLabel}
              {listing.baths > 0 ? ` · ${listing.baths} Full Bath` : ''}
              {listing.areaSqFt > 0 ? ` · ${listing.areaSqFt.toLocaleString('en-US')} sq ft` : ''}
              {' · '}{listing.furnishing}
              {listing.floor !== undefined && listing.floor !== ''
                ? ` · ${/floor/i.test(String(listing.floor)) ? listing.floor : `Floor ${listing.floor}`}`
                : ''}
            </p>

            {/* Host Verification Bar */}
            <div className="host">
              <span className="avatar">
                {listing.listedBy.charAt(0).toUpperCase()}
              </span>
              <div>
                <b style={{ fontSize: '14.5px' }}>Listed by {listing.listedBy}</b>
                <span className="mute" style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={14} color="var(--teal)" /> Verified on Propithub
                  {listing.rating !== null ? ` · ★ ${listing.rating} (${listing.reviewsCount} reviews)` : ' · Direct Landlord Listing'}
                </span>
              </div>
            </div>

            {/* Pricing Intelligence Benchmark */}
            {benchmark && (
              <div
                className={`insight ${
                  benchmark.percentage <= -5
                    ? 'good'
                    : benchmark.percentage >= 15
                    ? 'warn'
                    : ''
                }`}
              >
                <b>
                  {benchmark.percentage <= -5
                    ? `Priced ${Math.abs(benchmark.percentage)}% below similar homes`
                    : benchmark.percentage >= 15
                    ? `Priced ${benchmark.percentage}% above similar homes`
                    : 'Priced in line with similar homes'}
                </b>
                <span>
                  Calculated against {benchmark.sampleCount} similar listings in {listing.country || listing.city || 'this area'}, per square foot.
                </span>
              </div>
            )}

            {/* Quick Specs Cards — Real unit specs only */}
            <div className="facts">
              <div>
                <b>{listing.bedsLabel}</b>
                <span>Bedrooms</span>
              </div>
              {listing.baths > 0 && (
                <div>
                  <b>{listing.baths} Full Bath</b>
                  <span>Bathrooms</span>
                </div>
              )}
              {listing.areaSqFt > 0 && (
                <div>
                  <b>{listing.areaSqFt.toLocaleString('en-US')} sq ft</b>
                  <span>Area</span>
                </div>
              )}
              <div>
                <b>{listing.furnishing}</b>
                <span>Furnishing</span>
              </div>
              {listing.floor !== undefined && listing.floor !== '' && (
                <div>
                  <b>{/floor/i.test(String(listing.floor)) ? listing.floor : `Floor ${listing.floor}`}</b>
                  <span>Level</span>
                </div>
              )}
            </div>

            {/* Description */}
            <h3 style={{ marginTop: '28px' }}>About this home</h3>
            <p style={{ color: 'var(--ink)', fontSize: '15px', lineHeight: 1.65 }}>
              {listing.description}
            </p>

            {/* Real Amenities — Only rendered if property has real amenities */}
            {listing.amenities.length > 0 && (
              <>
                <h3 style={{ marginTop: '32px' }}>Building Amenities</h3>
                <div className="amen">
                  {listing.amenities.map((item, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={16} color="var(--teal-dark)" /> {item}
                    </span>
                  ))}
                </div>
                {listing.amenityPhotos && listing.amenityPhotos.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginTop: '14px' }}>
                    {listing.amenityPhotos.map((ap, idx) =>
                      ap?.image ? (
                        <div
                          key={`${ap.name}-${idx}`}
                          style={{
                            position: 'relative',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            height: '100px',
                            border: '1px solid var(--line)',
                          }}
                        >
                          <img src={ap.image} alt={ap.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              insetInline: 0,
                              background: 'rgba(0,0,0,0.65)',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '4px 8px',
                            }}
                          >
                            {ap.name}
                          </span>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </>
            )}

            {/* Good to Know Policies */}
            <h3 style={{ marginTop: '32px' }}>Move-in & Lease Details</h3>
            <ul className="gtk">
              <li>
                Property: <b>{listing.propertyName} (Unit {listing.unitNumber})</b>
              </li>
              <li>
                Available from: <b>{listing.availableFrom || 'Immediately'}</b>
              </li>
              <li>
                First Month's Rent: <b>{formatMoney(listing.rent, listing.currency)}</b>
              </li>
              <li>
                Security Deposit: <b>{formatMoney(listing.deposit, listing.currency)}</b>
              </li>
              <li>
                Move-in Platform Fee: <b>{listing.currencySymbol}0 (Waived)</b>
              </li>
            </ul>
          </div>

          {/* Right Column: Sticky Booking & Enquiry Card */}
          <aside className="ldt-side">
            <div className="bookcard">
              <div className="lc-price big">
                <b>{formatMoney(listing.rent, listing.currency)}</b>
                <span style={{ fontSize: '14px', color: 'var(--ink-soft)', fontWeight: 500, marginLeft: '6px' }}>
                  / month
                </span>
              </div>

              {listing.currency !== 'USD' && (
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '-8px' }}>
                  ≈ USD {Math.round(toUSD(listing.rent, listing.currency)).toLocaleString('en-US')} / mo
                </div>
              )}

              {/* Move-in total breakdown matching real ListingDetailsModal */}
              <div className="movein">
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600 }}>Total Due at Move-in</span>
                <b>{formatMoney(listing.rent + listing.deposit, listing.currency)}</b>
                <small>
                  First Month's Rent ({formatMoney(listing.rent, listing.currency)}) + Security Deposit ({formatMoney(listing.deposit, listing.currency)}) · Platform Fee {listing.currencySymbol}0
                </small>
              </div>

              {/* Enquiry Form */}
              {submittedSuccess ? (
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--mint-bg)',
                    color: 'var(--mint-ink)',
                    textAlign: 'center',
                  }}
                >
                  <Check size={32} style={{ margin: '0 auto 8px', display: 'block' }} />
                  <b style={{ fontSize: '16px', display: 'block' }}>Enquiry Submitted!</b>
                  <p style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.5 }}>
                    The property host has received your details. They will contact you shortly to schedule your viewing.
                  </p>
                  <button
                    className="btn sm"
                    onClick={() => setSubmittedSuccess(false)}
                    style={{ marginTop: '12px' }}
                  >
                    Send another question
                  </button>
                </div>
              ) : (
                <form onSubmit={handleEnquirySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <b style={{ fontSize: '14.5px', marginTop: '4px' }}>Request Viewing / Enquire</b>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>
                    Full Name
                    <input
                      type="text"
                      placeholder="Your full name"
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                      required
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>
                    Phone Number
                    <input
                      type="tel"
                      placeholder="+1 234 567 8900"
                      value={prospectPhone}
                      onChange={(e) => setProspectPhone(e.target.value)}
                      required
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>
                    Email Address (Optional)
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={prospectEmail}
                      onChange={(e) => setProspectEmail(e.target.value)}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>
                    Preferred Move-in Date
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>
                    Notes / Questions (Optional)
                    <textarea
                      placeholder="Ask about parking, lease duration, pet policy, etc."
                      rows={2}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </label>

                  <button
                    type="submit"
                    className="btn pri"
                    disabled={isSubmitting}
                    style={{ minHeight: '46px', marginTop: '4px', fontSize: '14.5px' }}
                  >
                    {isSubmitting ? 'Sending...' : 'Submit Enquiry'}
                  </button>
                  <p className="mute" style={{ fontSize: '11.5px', textAlign: 'center', margin: 0 }}>
                    No fee to enquire. Your request goes directly to the landlord.
                  </p>
                </form>
              )}
            </div>
          </aside>
        </div>

        {/* Similar Homes Section */}
        {similarHomes.length > 0 && (
          <section style={{ marginTop: '56px', borderTop: '1px solid var(--line)', paddingTop: '40px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '20px' }}>
              Similar homes nearby
            </h2>
            <div className="lrow">
              {similarHomes.map((sh) => (
                <div
                  key={sh.id}
                  className="lc"
                  onClick={() => {
                    navigate(`/homes/${sh.id}`);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="lc-img">
                    {sh.images.length > 0 ? (
                      <img src={sh.images[0]} alt={sh.title} />
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
                          color: '#94a3b8',
                          gap: '4px',
                        }}
                      >
                        <span style={{ fontSize: '28px' }}>🏢</span>
                        <b style={{ fontSize: '12px', color: '#e2e8f0' }}>Unit {sh.unitNumber}</b>
                      </div>
                    )}
                    <span className="lc-badge">Available Now</span>
                  </div>
                  <div className="lc-body">
                    <div className="lc-top">
                      <b>{sh.propertyName}</b>
                      <span className="lc-rate">
                        {sh.rating !== null ? `★ ${sh.rating}` : 'Verified'}
                      </span>
                    </div>
                    <span className="mute" style={{ fontSize: '13px' }}>{sh.title}</span>
                    <span className="mute" style={{ fontSize: '12px' }}>
                      {sh.bedsLabel}{sh.baths > 0 ? ` · ${sh.baths} bath` : ''}{sh.areaSqFt > 0 ? ` · ${sh.areaSqFt} sq ft` : ''}
                    </span>
                    <div className="lc-price">
                      <b>{formatMoney(sh.rent, sh.currency)}</b> / mo
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Lightbox / Gallery Full View Modal */}
      {photoModalOpen && galleryImages.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', marginBottom: '14px' }}>
            <b style={{ fontSize: '16px' }}>
              {listing.title} ({activePhotoIdx + 1} of {galleryImages.length})
            </b>
            <button
              onClick={() => setPhotoModalOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 0,
                color: '#fff',
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={galleryImages[activePhotoIdx]}
              alt="Listing full view"
              style={{ maxHeight: '80vh', maxWidth: '90vw', objectFit: 'contain', borderRadius: '12px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '14px', overflowX: 'auto', padding: '6px' }}>
            {galleryImages.map((img, i) => (
              <img
                key={i}
                src={img}
                alt=""
                onClick={() => setActivePhotoIdx(i)}
                style={{
                  width: '64px',
                  height: '48px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: i === activePhotoIdx ? '2px solid var(--teal)' : '2px solid transparent',
                  opacity: i === activePhotoIdx ? 1 : 0.6,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="sfoot">
        <div>
          <PropithubLogo size={24} showText={true} />
          <div style={{ marginTop: '8px', fontSize: '12px' }}>
            © {new Date().getFullYear()} Propithub Inc. All rights reserved.
          </div>
        </div>
        <button className="btn sm" onClick={() => navigate('/homes')}>
          Browse homes
        </button>
      </footer>
    </div>
  );
};
export default ListingDetailPage;
