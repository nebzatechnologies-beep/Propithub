import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Unit } from '../../types';
import { sanitizeCountry, resolveDisplayLocation } from '../../lib/addressUtils';
import { PropithubIcon } from '../../components/common/PropithubLogo';
import { ListingCard } from '../../components/public/ListingCard';
import { ListingDetailsModal } from '../../components/public/ListingDetailsModal';
import { Search, Filter, ArrowLeft, SlidersHorizontal, Home, ShieldCheck } from 'lucide-react';

export const ListingsPage: React.FC = () => {
  const { state } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('All countries');
  const [selectedBeds, setSelectedBeds] = useState('all');
  const [selectedFurnishing, setSelectedFurnishing] = useState('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc'>('featured');

  // Selected unit for details modal
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  // Saved homes set
  const [savedUnitIds, setSavedUnitIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('propithub_saved_homes');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleSaveUnit = (unitId: string) => {
    setSavedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      try {
        localStorage.setItem('propithub_saved_homes', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // Only publicly listed vacant units
  const listedUnits = useMemo(() => {
    return (state.units || []).filter((u) => u.isListedPublicly && u.status === 'vacant');
  }, [state.units]);

  // Dynamic countries
  const countries = useMemo(() => {
    return [
      'All countries',
      ...Array.from(new Set(listedUnits.map((u) => sanitizeCountry(u.country, u.address)))),
    ];
  }, [listedUnits]);

  // Filter & sort
  const filteredUnits = useMemo(() => {
    let result = listedUnits.filter((u) => {
      const prop = state.properties.find((p) => p.id === u.propertyId || p.name === u.propertyName);
      const country = sanitizeCountry(u.country, u.address);

      // 1. Country filter
      if (selectedCountry !== 'All countries' && country !== selectedCountry) {
        return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const propName = (prop?.name || u.propertyName || '').toLowerCase();
        const city = (prop?.address?.city || '').toLowerCase();
        const addr = (u.address || prop?.address?.formattedAddress || '').toLowerCase();
        const unitNo = (u.unitNumber || '').toLowerCase();
        const matches = propName.includes(q) || city.includes(q) || addr.includes(q) || unitNo.includes(q);
        if (!matches) return false;
      }

      // 3. Bedrooms filter
      if (selectedBeds !== 'all') {
        const typeLower = (u.unitType || '').toLowerCase();
        if (selectedBeds === '0' && !typeLower.includes('studio') && u.unitType !== '0') return false;
        if (selectedBeds === '1' && !typeLower.includes('1') && !typeLower.includes('one')) return false;
        if (selectedBeds === '2' && !typeLower.includes('2') && !typeLower.includes('two')) return false;
        if (selectedBeds === '3+' && (typeLower.includes('studio') || typeLower.includes('1') || typeLower.includes('2'))) return false;
      }

      // 4. Furnishing filter
      if (selectedFurnishing !== 'all') {
        if ((u.furnishing || 'Unfurnished').toLowerCase() !== selectedFurnishing.toLowerCase()) {
          return false;
        }
      }

      return true;
    });

    // Sort
    if (sortBy === 'price_asc') {
      result.sort((a, b) => (a.rent || 0) - (b.rent || 0));
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => (b.rent || 0) - (a.rent || 0));
    }

    return result;
  }, [listedUnits, state.properties, selectedCountry, searchQuery, selectedBeds, selectedFurnishing, sortBy]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCountry('All countries');
    setSelectedBeds('all');
    setSelectedFurnishing('all');
    setSortBy('featured');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base, #F8FAFC)', color: 'var(--ink, #0F172A)' }}>
      {/* Top Navigation */}
      <header
        style={{
          background: 'var(--surface, #FFFFFF)',
          borderBottom: '1px solid var(--line, #E2E8F0)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0 24px',
          height: '68px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => navigate('/')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '18px' }}
          >
            <PropithubIcon size={28} />
            <span>propithub</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user ? (
            <button
              type="button"
              className="btn brass small"
              onClick={() => navigate(`/${user.role}/dashboard`)}
            >
              My Portal →
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => navigate('/login')}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn brass small"
                onClick={() => navigate('/register')}
              >
                List Property
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Browse Container */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Title & Trust Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>
            <ShieldCheck size={14} /> Direct Verified Landlord & Manager Rentals
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: '28px', fontWeight: 800, color: 'var(--ink, #0F172A)' }}>
            Available Rental Homes & Apartments
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--slate, #64748B)' }}>
            Explore verified vacant units across all buildings on Propithub. View transparent move-in costs and send direct enquiries.
          </p>
        </div>

        {/* Filter & Search Bar Cluster */}
        <div
          style={{
            background: 'var(--surface, #FFFFFF)',
            border: '1px solid var(--line, #E2E8F0)',
            borderRadius: '16px',
            padding: '18px 20px',
            marginBottom: '32px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Top Search Input */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
            />
            <input
              type="text"
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by city, neighborhood, building name, or address..."
              style={{
                paddingLeft: '42px',
                height: '44px',
                fontSize: '14px',
                borderRadius: '10px',
                border: '1px solid var(--line, #CBD5E1)',
              }}
            />
          </div>

          {/* Filter Selects Row */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Country */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate, #64748B)' }}>Country:</span>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #CBD5E1)',
                  background: 'var(--surface, #FFFFFF)',
                  fontSize: '13px',
                }}
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Bedrooms */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate, #64748B)' }}>Layout:</span>
              <select
                value={selectedBeds}
                onChange={(e) => setSelectedBeds(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #CBD5E1)',
                  background: 'var(--surface, #FFFFFF)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Layouts</option>
                <option value="0">Studio</option>
                <option value="1">1 Bedroom</option>
                <option value="2">2 Bedrooms</option>
                <option value="3+">3+ Bedrooms</option>
              </select>
            </div>

            {/* Furnishing */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate, #64748B)' }}>Furnishing:</span>
              <select
                value={selectedFurnishing}
                onChange={(e) => setSelectedFurnishing(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #CBD5E1)',
                  background: 'var(--surface, #FFFFFF)',
                  fontSize: '13px',
                }}
              >
                <option value="all">Any Furnishing</option>
                <option value="Unfurnished">Unfurnished</option>
                <option value="Semi-Furnished">Semi-Furnished</option>
                <option value="Fully Furnished">Fully Furnished</option>
              </select>
            </div>

            {/* Sort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate, #64748B)' }}>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #CBD5E1)',
                  background: 'var(--surface, #FFFFFF)',
                  fontSize: '13px',
                }}
              >
                <option value="featured">Featured First</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ink, #0F172A)' }}>
            Showing {filteredUnits.length} verified {filteredUnits.length === 1 ? 'home' : 'homes'} available
          </div>
          {(searchQuery || selectedCountry !== 'All countries' || selectedBeds !== 'all' || selectedFurnishing !== 'all') && (
            <button
              type="button"
              className="btn secondary small"
              onClick={resetFilters}
              style={{ fontSize: '12px' }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Listings Responsive Grid */}
        {filteredUnits.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              background: 'var(--surface, #FFFFFF)',
              borderRadius: '16px',
              border: '1px dashed var(--line, #CBD5E1)',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔍</div>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>
              No available homes match your search
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--slate, #64748B)' }}>
              Try broadening your location, adjusting your bedroom filters, or resetting filters.
            </p>
            <button type="button" className="btn secondary" onClick={resetFilters}>
              Reset All Filters
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
              gap: '24px',
            }}
          >
            {filteredUnits.map((u) => {
              const prop = state.properties.find(
                (p) =>
                  (u.propertyId && p.id === u.propertyId) ||
                  (p.name && u.propertyName && p.name.trim().toLowerCase() === u.propertyName.trim().toLowerCase()) ||
                  (u.id && p.id && u.id.includes(p.id))
              );
              return (
                <ListingCard
                  key={u.id}
                  unit={u}
                  property={prop}
                  onSelect={(selected) => setSelectedUnit(selected)}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Listing Details Modal */}
      <ListingDetailsModal
        isOpen={!!selectedUnit}
        unit={selectedUnit}
        property={state.properties.find((p) => p.id === selectedUnit?.propertyId || p.name === selectedUnit?.propertyName)}
        onClose={() => setSelectedUnit(null)}
      />
    </div>
  );
};

