import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PropithubLogo } from '../../components/common/PropithubLogo';
import { AddressDisplay } from '../../components/common/AddressDisplay';
import { AppStoreBadges } from '../../components/common/AppStoreBadges';
import {
  getAllListings,
  formatMoney,
  toUSD,
  calculateBenchmark,
  parseNaturalQuery,
  PublicListingItem,
} from '../../lib/listingsData';
import { Heart, Sun, Moon, MapPin, CheckCircle2, Clock, ArrowLeft, Menu, X } from 'lucide-react';

export const ListingsPage: React.FC = () => {
  const { state, showToast } = useAppData();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'browse' | 'enquiries'>('browse');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // All real publicly listed vacant units from Firebase
  const allListings = useMemo(() => {
    return getAllListings(state.units || [], state.properties || [], state.reviews);
  }, [state.units, state.properties, state.reviews]);

  // My submitted enquiries (for logged-in tenants/users)
  const myEnquiries = useMemo(() => {
    if (!user) return [];
    const userEmailLower = user.email?.toLowerCase().trim();
    const userPhoneClean = (user.phone || '').replace(/[^0-9]/g, '');

    return (state.enquiries || []).filter((e) => {
      if (e.tenantId && e.tenantId === user.id) return true;
      if (userEmailLower && e.prospectEmail?.toLowerCase().trim() === userEmailLower) return true;
      if (userPhoneClean && e.prospectPhone.replace(/[^0-9]/g, '') === userPhoneClean) return true;
      return false;
    });
  }, [state.enquiries, user]);

  // Read initial values from URL query
  const initialQ = searchParams.get('q') || '';
  const initialCountry = searchParams.get('country') || 'all';
  const initialBeds = searchParams.get('beds') || 'any';
  const initialMax = searchParams.get('max') || 'any';

  // Search & Filter State
  const [query, setQuery] = useState(initialQ);
  const [selectedCountry, setSelectedCountry] = useState(initialCountry);
  const [selectedBeds, setSelectedBeds] = useState(initialBeds);
  const [selectedMaxRent, setSelectedMaxRent] = useState(initialMax);
  const [selectedFurnishing, setSelectedFurnishing] = useState('all');
  const [sortBy, setSortBy] = useState<'rec' | 'lo' | 'hi' | 'new'>('rec');
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  // Gallery active slide index per listing card
  const [cardPhotoIndex, setCardPhotoIndex] = useState<Record<string, number>>({});

  // Saved Listings from localStorage
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('propithub_saved_homes');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleSave = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast('Removed from saved homes');
      } else {
        next.add(id);
        showToast('Saved to your favorites');
      }
      try {
        localStorage.setItem('propithub_saved_homes', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const handleNextPhoto = (id: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardPhotoIndex((prev) => ({
      ...prev,
      [id]: ((prev[id] || 0) + 1) % total,
    }));
  };

  const handlePrevPhoto = (id: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardPhotoIndex((prev) => ({
      ...prev,
      [id]: ((prev[id] || 0) - 1 + total) % total,
    }));
  };

  // Distinct countries for filter
  const countries = useMemo(() => {
    const set = new Set(allListings.map((l) => l.country).filter(Boolean));
    return Array.from(set).sort();
  }, [allListings]);

  // Smart Query Parsing
  const parsedQuery = useMemo(() => {
    return parseNaturalQuery(query);
  }, [query]);

  // Filtering Logic
  const filteredListings = useMemo(() => {
    return allListings.filter((l) => {
      // 1. Saved filter
      if (showSavedOnly && !savedIds.has(l.id)) return false;

      // 2. Country filter
      if (selectedCountry !== 'all' && l.country !== selectedCountry) return false;

      // 3. Bedrooms filter (dropdown or smart parsed)
      const targetBeds = parsedQuery.beds != null ? String(parsedQuery.beds) : selectedBeds;
      if (targetBeds !== 'any') {
        if (targetBeds === '0' && l.beds !== 0) return false;
        if (targetBeds === '1' && l.beds !== 1) return false;
        if (targetBeds === '2' && l.beds !== 2) return false;
        if (targetBeds === '3' && l.beds < 3) return false;
      }

      // 4. Max Rent filter (dropdown or smart parsed in USD)
      const maxUSD =
        parsedQuery.maxRentUSD != null
          ? parsedQuery.maxRentUSD
          : selectedMaxRent !== 'any'
          ? parseFloat(selectedMaxRent)
          : null;
      if (maxUSD != null) {
        const itemUSD = toUSD(l.rent, l.currency);
        if (itemUSD > maxUSD) return false;
      }

      // 5. Furnishing
      if (selectedFurnishing !== 'all') {
        if (!l.furnishing.toLowerCase().includes(selectedFurnishing.toLowerCase())) return false;
      }

      // 6. Keywords
      if (parsedQuery.tokens.length > 0) {
        const text = `${l.city} ${l.country} ${l.displayLocation} ${l.propertyName} ${l.unitNumber} ${l.title} ${l.propertyType} ${l.furnishing} ${l.amenities.join(' ')}`.toLowerCase();
        const matches = parsedQuery.tokens.every((t) => text.includes(t));
        if (!matches) return false;
      }

      return true;
    });
  }, [
    allListings,
    showSavedOnly,
    savedIds,
    selectedCountry,
    selectedBeds,
    selectedMaxRent,
    selectedFurnishing,
    parsedQuery,
  ]);

  // Sorting (Guaranteed Top Placement for Active Popular Listings)
  const sortedListings = useMemo(() => {
    const list = [...filteredListings];
    const popularRank = (a: PublicListingItem, b: PublicListingItem) => {
      if (a.isPopular && !b.isPopular) return -1;
      if (!a.isPopular && b.isPopular) return 1;
      return 0;
    };

    if (sortBy === 'lo') {
      return list.sort((a, b) => popularRank(a, b) || toUSD(a.rent, a.currency) - toUSD(b.rent, b.currency));
    }
    if (sortBy === 'hi') {
      return list.sort((a, b) => popularRank(a, b) || toUSD(b.rent, b.currency) - toUSD(a.rent, a.currency));
    }
    if (sortBy === 'new') {
      return list.sort((a, b) => popularRank(a, b) || a.ageDays - b.ageDays);
    }
    // 'rec'
    return list.sort(
      (a, b) =>
        popularRank(a, b) ||
        (b.verified ? 1 : 0) - (a.verified ? 1 : 0) ||
        (b.rating || 0) - (a.rating || 0)
    );
  }, [filteredListings, sortBy]);

  const hasActiveFilters =
    query.trim() !== '' ||
    selectedCountry !== 'all' ||
    selectedBeds !== 'any' ||
    selectedMaxRent !== 'any' ||
    selectedFurnishing !== 'all' ||
    showSavedOnly;

  const clearFilters = () => {
    setQuery('');
    setSelectedCountry('all');
    setSelectedBeds('any');
    setSelectedMaxRent('any');
    setSelectedFurnishing('all');
    setShowSavedOnly(false);
  };

  const dashboardPath = user
    ? user.role === 'superadmin'
      ? '/admin/overview'
      : `/${user.role}/dashboard`
    : null;

  return (
    <div className="site">
      {/* Navigation */}
      <header className="snav">
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          <PropithubLogo size={30} showText={true} />
        </Link>
        <nav className="slinks">
          <Link to="/homes" style={{ color: 'var(--teal-dark)', fontWeight: 700 }}>
            Browse homes
          </Link>
          <Link to="/#sec-how">How it works</Link>
          <Link to="/#sec-landlords">For landlords</Link>
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
          {dashboardPath ? (
            <Link to={dashboardPath} className="btn pri sm snav-trial-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeft size={15} /> Back to Dashboard
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
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          <div className="mobile-nav-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-content">
            <nav className="mobile-nav-links">
              <Link to="/homes" onClick={() => setMobileMenuOpen(false)}>
                <span>Browse homes</span>
                <span className="mobile-nav-arrow">→</span>
              </Link>
              <Link to="/#sec-how" onClick={() => setMobileMenuOpen(false)}>
                <span>How it works</span>
                <span className="mobile-nav-arrow">→</span>
              </Link>
              <Link to="/#sec-landlords" onClick={() => setMobileMenuOpen(false)}>
                <span>For landlords</span>
                <span className="mobile-nav-arrow">→</span>
              </Link>
              <Link to="/#sec-pricing" onClick={() => setMobileMenuOpen(false)}>
                <span>Pricing</span>
                <span className="mobile-nav-arrow">→</span>
              </Link>
              <Link to="/#sec-faq" onClick={() => setMobileMenuOpen(false)}>
                <span>FAQ</span>
                <span className="mobile-nav-arrow">→</span>
              </Link>
            </nav>
            <div className="mobile-nav-footer">
              {dashboardPath ? (
                <Link
                  to={dashboardPath}
                  className="btn pri sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Back to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="btn sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    className="btn pri sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Start free trial
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Browse Container */}
      <main className="browse">
        {/* Optional Tabs if user is logged in or has submitted enquiries */}
        {(user || myEnquiries.length > 0) && (
          <div
            style={{
              display: 'flex',
              gap: '12px',
              borderBottom: '1px solid var(--line)',
              marginBottom: '20px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('browse')}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom:
                  activeTab === 'browse' ? '2px solid var(--teal)' : '2px solid transparent',
                color: activeTab === 'browse' ? 'var(--teal)' : 'var(--ink-soft)',
                fontWeight: activeTab === 'browse' ? 700 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Explore Listings ({allListings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('enquiries')}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom:
                  activeTab === 'enquiries' ? '2px solid var(--teal)' : '2px solid transparent',
                color: activeTab === 'enquiries' ? 'var(--teal)' : 'var(--ink-soft)',
                fontWeight: activeTab === 'enquiries' ? 700 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font)',
              }}
            >
              <span>My Enquiries</span>
              {myEnquiries.length > 0 && (
                <span
                  style={{
                    background: 'var(--teal)',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '1px 7px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {myEnquiries.length}
                </span>
              )}
            </button>
          </div>
        )}

        {activeTab === 'enquiries' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {myEnquiries.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 20px',
                  background: 'var(--surface)',
                  borderRadius: '14px',
                  border: '1px dashed var(--line)',
                  color: 'var(--ink-soft)',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📬</div>
                <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                  No enquiries submitted yet
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '13px' }}>
                  When you find an available listing and submit an enquiry, its live status will appear here.
                </p>
                <button
                  type="button"
                  className="btn pri sm"
                  onClick={() => setActiveTab('browse')}
                >
                  Browse Available Homes →
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {myEnquiries.map((enq) => (
                  <div
                    key={enq.id}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: '14px',
                      padding: '18px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '14px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>
                          Unit {enq.unitNumber}
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>•</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                          {enq.propertyName}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12.5px',
                          color: 'var(--ink-soft)',
                          display: 'flex',
                          gap: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>
                          Desired Move-In: <b>{enq.moveInDate}</b>
                        </span>
                        <span>
                          Submitted: <b>{new Date(enq.createdAt).toLocaleDateString()}</b>
                        </span>
                        <span>
                          Contact Phone: <b>{enq.prospectPhone}</b>
                        </span>
                      </div>
                      {enq.notes && (
                        <div
                          style={{
                            marginTop: '6px',
                            fontSize: '12px',
                            color: 'var(--ink)',
                            fontStyle: 'italic',
                          }}
                        >
                          "{enq.notes}"
                        </div>
                      )}
                    </div>

                    <div>
                      {enq.status === 'onboarded' ? (
                        <span
                          className="badge green"
                          style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}
                        >
                          <CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Lease Invitation Prepared
                        </span>
                      ) : enq.status === 'reviewed' ? (
                        <span
                          className="badge blue"
                          style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}
                        >
                          <CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Reviewed by Landlord
                        </span>
                      ) : (
                        <span
                          className="badge amber"
                          style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}
                        >
                          <Clock size={13} style={{ marginRight: '4px' }} /> Submitted — Awaiting Call
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Sticky Multi-Filter Toolbar */}
            <div className="bfilters">
              <div className="bq">
                <input
                  type="text"
                  placeholder="Search by property name, city, address, or unit number..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search homes worldwide"
                />
              </div>

              <div className="bsel">
                {/* Country Selector */}
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  aria-label="Filter by country"
                >
                  <option value="all">All countries ({countries.length})</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* Bedrooms Selector */}
                <select
                  value={selectedBeds}
                  onChange={(e) => setSelectedBeds(e.target.value)}
                  aria-label="Filter by bedrooms"
                >
                  <option value="any">Any bedrooms</option>
                  <option value="0">Studio</option>
                  <option value="1">1 bedroom</option>
                  <option value="2">2 bedrooms</option>
                  <option value="3">3+ bedrooms</option>
                </select>

                {/* Max Rent (USD) */}
                <select
                  value={selectedMaxRent}
                  onChange={(e) => setSelectedMaxRent(e.target.value)}
                  aria-label="Filter by maximum rent"
                >
                  <option value="any">Any budget</option>
                  <option value="1000">Up to USD 1,000</option>
                  <option value="2000">Up to USD 2,000</option>
                  <option value="3000">Up to USD 3,000</option>
                  <option value="5000">Up to USD 5,000</option>
                </select>

                {/* Furnishing */}
                <select
                  value={selectedFurnishing}
                  onChange={(e) => setSelectedFurnishing(e.target.value)}
                  aria-label="Filter by furnishing"
                >
                  <option value="all">Any furnishing</option>
                  <option value="Fully">Fully furnished</option>
                  <option value="Semi">Semi-furnished</option>
                  <option value="Unfurnished">Unfurnished</option>
                </select>

                {/* Sort Order */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort listings"
                >
                  <option value="rec">Recommended</option>
                  <option value="lo">Price: low to high</option>
                  <option value="hi">Price: high to low</option>
                  <option value="new">Newest</option>
                </select>

                {/* Saved Toggle Button */}
                <button
                  className={`chipb ${showSavedOnly ? 'on' : ''}`}
                  onClick={() => setShowSavedOnly(!showSavedOnly)}
                >
                  <Heart
                    size={14}
                    fill={showSavedOnly ? 'var(--teal-dark)' : 'none'}
                    color={showSavedOnly ? 'var(--teal-dark)' : 'currentColor'}
                  />
                  Saved ({savedIds.size})
                </button>
              </div>
            </div>

            {/* Results Count & Understood Chips */}
            <div className="bhead">
              <div>
                <b>
                  {sortedListings.length} home{sortedListings.length === 1 ? '' : 's'}
                </b>
                <span className="mute" style={{ marginLeft: '6px' }}>
                  in {new Set(sortedListings.map((l) => l.country)).size} countries
                </span>

                {/* Intelligent query parsing indicator */}
                {(parsedQuery.beds != null ||
                  parsedQuery.maxRentUSD != null ||
                  parsedQuery.tokens.length > 0) && (
                  <div className="understood">
                    <span>Understood:</span>
                    {parsedQuery.beds != null && (
                      <span className="pill info">
                        {parsedQuery.beds === 0 ? 'Studio' : `${parsedQuery.beds} bed`}
                      </span>
                    )}
                    {parsedQuery.maxRentUSD != null && (
                      <span className="pill info">
                        Under USD ${Math.round(parsedQuery.maxRentUSD)}
                      </span>
                    )}
                    {parsedQuery.tokens.map((t, idx) => (
                      <span key={idx} className="pill info">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {hasActiveFilters && (
                <button className="btn sm" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            {/* Listings Grid */}
            {sortedListings.length > 0 ? (
              <div className="lgrid">
                {sortedListings.map((item) => {
                  const totalImages = item.images.length;
                  const activeIdx = totalImages > 0 ? (cardPhotoIndex[item.id] || 0) % totalImages : 0;
                  const isSaved = savedIds.has(item.id);
                  const benchmark = calculateBenchmark(item, allListings);

                  return (
                    <article
                      key={item.id}
                      className={`lc ${item.isPopular ? 'lc-popular' : ''}`}
                      onClick={() => navigate(`/homes/${item.id}`)}
                      style={{
                        cursor: 'pointer',
                        border: item.isPopular ? '1.5px solid rgba(245, 158, 11, 0.55)' : undefined,
                        boxShadow: item.isPopular ? '0 6px 18px rgba(245, 158, 11, 0.12)' : undefined,
                      }}
                    >
                      {/* Photo Carousel or Architectural Placeholder */}
                      <div className="lc-img">
                        {totalImages > 0 ? (
                          <img src={item.images[activeIdx]} alt={item.title} loading="lazy" />
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
                              padding: '16px',
                              textAlign: 'center',
                            }}
                          >
                            <div style={{ fontSize: '32px', marginBottom: '4px' }}>🏢</div>
                            <div style={{ fontSize: '14px', fontWeight: 700 }}>
                              Unit {item.unitNumber}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                              {item.propertyName}
                            </div>
                          </div>
                        )}

                        {/* Top Left Badges */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '10px',
                            left: '10px',
                            display: 'flex',
                            gap: '6px',
                            zIndex: 2,
                            flexWrap: 'wrap',
                          }}
                        >
                          {item.isPopular && (
                            <span
                              style={{
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.45)',
                                letterSpacing: '0.3px',
                                textTransform: 'uppercase',
                              }}
                            >
                              🔥 Popular
                            </span>
                          )}
                          {item.ageDays <= 2 && (
                            <span
                              style={{
                                background: '#10B981',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                              }}
                            >
                              New
                            </span>
                          )}
                          {benchmark && benchmark.percentage <= -8 && (
                            <span
                              style={{
                                background: '#10B981',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              Great value
                            </span>
                          )}
                          <span
                            style={{
                              background: 'rgba(15, 23, 42, 0.78)',
                              backdropFilter: 'blur(4px)',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            Unit {item.unitNumber}
                          </span>
                        </div>

                        {/* Save Button */}
                        <button
                          className="lc-save"
                          onClick={(e) => toggleSave(item.id, e)}
                          aria-label="Save home"
                        >
                          <Heart
                            size={18}
                            fill={isSaved ? '#ef4444' : 'none'}
                            color={isSaved ? '#ef4444' : '#fff'}
                          />
                        </button>

                        {/* Carousel Prev/Next Buttons */}
                        {totalImages > 1 && (
                          <>
                            <button
                              className="lc-nav prev"
                              onClick={(e) => handlePrevPhoto(item.id, totalImages, e)}
                              aria-label="Previous photo"
                            >
                              ‹
                            </button>
                            <button
                              className="lc-nav next"
                              onClick={(e) => handleNextPhoto(item.id, totalImages, e)}
                              aria-label="Next photo"
                            >
                              ›
                            </button>
                            <span className="lc-dots">
                              {Array.from({ length: totalImages }).map((_, i) => (
                                <i key={i} className={i === activeIdx ? 'on' : ''} />
                              ))}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Card Body */}
                      <div className="lc-body">
                        <div className="lc-top">
                          <b
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={item.propertyName}
                          >
                            {item.propertyName}
                          </b>
                          {item.rating !== null ? (
                            <span className="lc-rate">★ {item.rating}</span>
                          ) : (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: 'var(--teal-dark)',
                                background: 'var(--mint-bg)',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                flexShrink: 0,
                              }}
                            >
                              Verified
                            </span>
                          )}
                        </div>

                        {/* Real Address with Google Maps link */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12.5px',
                            color: 'var(--ink-soft)',
                            marginTop: '2px',
                            flexWrap: 'wrap',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MapPin size={12} color="#10B981" style={{ flexShrink: 0 }} />
                          <AddressDisplay
                            address={item.rawAddress}
                            fallback={item.displayLocation || 'Address on file'}
                            style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}
                            linkStyle={{ fontSize: '11.5px', color: 'var(--teal)' }}
                          />
                        </div>

                        <span className="mute" style={{ fontSize: '12.5px' }}>
                          {item.bedsLabel}{item.baths > 0 ? ` · ${item.baths} bath` : ''}
                          {item.areaSqFt > 0 ? ` · ${item.areaSqFt.toLocaleString('en-US')} sq ft` : ''} ·{' '}
                          {item.furnishing}
                        </span>

                        <div className="lc-price">
                          <b>{formatMoney(item.rent, item.currency)}</b> / month
                          {item.currency !== 'USD' && (
                            <small style={{ marginLeft: '6px' }}>
                              ≈ USD ${Math.round(toUSD(item.rent, item.currency)).toLocaleString('en-US')}
                            </small>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: '60px 20px',
                  textAlign: 'center',
                  background: 'var(--surface)',
                  borderRadius: '16px',
                  border: '1px dashed var(--line-strong)',
                  marginTop: '16px',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '300px',
                }}
              >
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
                  No homes match your current criteria
                </h3>
                <p className="mute" style={{ fontSize: '14px', marginBottom: '18px' }}>
                  {allListings.length === 0
                    ? 'There are currently no vacant units published publicly.'
                    : 'Try loosening your filters, choosing a different city, or clearing the search box.'}
                </p>
                {hasActiveFilters && (
                  <button className="btn pri" onClick={clearFilters}>
                    Reset all filters
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="sfoot">
        <div>
          <PropithubLogo size={24} showText={true} />
          <div style={{ marginTop: '8px', fontSize: '12px' }}>
            {state.landingConfig?.footerCopyright || `© ${new Date().getFullYear()} Propithub Inc. All rights reserved.`}
          </div>
        </div>

        {/* Option 1: Mobile App Store Badges */}
        {(state.landingConfig?.showAppStoreLinks ?? true) && (
          <AppStoreBadges
            playStoreUrl={state.landingConfig?.playStoreUrl}
            appStoreUrl={state.landingConfig?.appStoreUrl}
            label={state.landingConfig?.appStoreLabel || 'Get the mobile app'}
          />
        )}

        <button className="btn sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          Back to top ↑
        </button>
      </footer>
    </div>
  );
};
export default ListingsPage;
