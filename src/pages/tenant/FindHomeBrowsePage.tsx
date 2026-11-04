import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Unit } from '../../types';
import { sanitizeCountry } from '../../lib/addressUtils';
import { ListingCard } from '../../components/public/ListingCard';
import { ListingDetailsModal } from '../../components/public/ListingDetailsModal';
import { Search, Compass, Clock, CheckCircle2, Phone, Home, Building2 } from 'lucide-react';

export const TenantFindHomeBrowsePage: React.FC = () => {
  const { state } = useAppData();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'browse' | 'enquiries'>('browse');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('All countries');
  const [selectedBeds, setSelectedBeds] = useState('all');

  // Modal
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  // Saved units
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

  // Countries
  const countries = useMemo(() => {
    return [
      'All countries',
      ...Array.from(new Set(listedUnits.map((u) => sanitizeCountry(u.country, u.address)))),
    ];
  }, [listedUnits]);

  // Filtered
  const filteredUnits = useMemo(() => {
    return listedUnits.filter((u) => {
      const prop = state.properties.find((p) => p.id === u.propertyId || p.name === u.propertyName);
      const country = sanitizeCountry(u.country, u.address);

      if (selectedCountry !== 'All countries' && country !== selectedCountry) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const propName = (prop?.name || u.propertyName || '').toLowerCase();
        const city = (prop?.address?.city || '').toLowerCase();
        const addr = (u.address || prop?.address?.formattedAddress || '').toLowerCase();
        const unitNo = (u.unitNumber || '').toLowerCase();
        if (!propName.includes(q) && !city.includes(q) && !addr.includes(q) && !unitNo.includes(q)) {
          return false;
        }
      }

      if (selectedBeds !== 'all') {
        const typeLower = (u.unitType || '').toLowerCase();
        if (selectedBeds === '0' && !typeLower.includes('studio') && u.unitType !== '0') return false;
        if (selectedBeds === '1' && !typeLower.includes('1') && !typeLower.includes('one')) return false;
        if (selectedBeds === '2' && !typeLower.includes('2') && !typeLower.includes('two')) return false;
        if (selectedBeds === '3+' && (typeLower.includes('studio') || typeLower.includes('1') || typeLower.includes('2'))) return false;
      }

      return true;
    });
  }, [listedUnits, state.properties, selectedCountry, searchQuery, selectedBeds]);

  // My submitted enquiries
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

  return (
    <div className="page-wrap" style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Top Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Compass size={22} color="#10B981" />
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'var(--ink)' }}>
            Find a Home
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink-soft)' }}>
          Browse available vacant homes across Propithub. Submit an enquiry to connect directly with the owner or manager.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--line)', marginBottom: '24px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('browse')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'browse' ? '2px solid #10B981' : '2px solid transparent',
            color: activeTab === 'browse' ? '#10B981' : 'var(--ink-soft)',
            fontWeight: activeTab === 'browse' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Explore Listings ({listedUnits.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('enquiries')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'enquiries' ? '2px solid #10B981' : '2px solid transparent',
            color: activeTab === 'enquiries' ? '#10B981' : 'var(--ink-soft)',
            fontWeight: activeTab === 'enquiries' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>My Enquiries</span>
          {myEnquiries.length > 0 && (
            <span
              style={{
                background: '#10B981',
                color: '#fff',
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: 700,
              }}
            >
              {myEnquiries.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Browse Available Homes */}
      {activeTab === 'browse' && (
        <div>
          {/* Filter Bar */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ position: 'relative', width: '100%' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }}
              />
              <input
                type="text"
                className="input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by city, property name, or address..."
                style={{ paddingLeft: '38px', height: '40px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600 }}>Country:</span>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--surface)', fontSize: '12.5px' }}
                >
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600 }}>Layout:</span>
                <select
                  value={selectedBeds}
                  onChange={(e) => setSelectedBeds(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--surface)', fontSize: '12.5px' }}
                >
                  <option value="all">All</option>
                  <option value="0">Studio</option>
                  <option value="1">1 Bed</option>
                  <option value="2">2 Beds</option>
                  <option value="3+">3+ Beds</option>
                </select>
              </div>
            </div>
          </div>

          {/* Grid */}
          {filteredUnits.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 20px',
                background: 'var(--surface)',
                borderRadius: '14px',
                border: '1px dashed var(--line)',
                color: 'var(--ink-soft)',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
              <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                No homes found
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                No active vacant units match your criteria. Try adjusting filters.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
                gap: '20px',
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
        </div>
      )}

      {/* Tab 2: My Sent Enquiries */}
      {activeTab === 'enquiries' && (
        <div>
          {myEnquiries.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 20px',
                background: 'var(--surface)',
                borderRadius: '14px',
                border: '1px dashed var(--line)',
                color: 'var(--ink-soft)',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📬</div>
              <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                No enquiries submitted yet
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px' }}>
                When you find an available listing and click "Send Enquiry", it will appear here.
              </p>
              <button
                type="button"
                className="btn brass small"
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
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span>Desired Move-In: <b>{enq.moveInDate}</b></span>
                      <span>Submitted: <b>{new Date(enq.createdAt).toLocaleDateString()}</b></span>
                      <span>Contact Phone: <b>{enq.prospectPhone}</b></span>
                    </div>
                    {enq.notes && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ink)', fontStyle: 'italic' }}>
                        "{enq.notes}"
                      </div>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div>
                    {enq.status === 'onboarded' ? (
                      <span className="badge green" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}>
                        <CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Lease Invitation Prepared
                      </span>
                    ) : enq.status === 'reviewed' ? (
                      <span className="badge blue" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}>
                        <CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Reviewed by Landlord
                      </span>
                    ) : (
                      <span className="badge amber" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}>
                        <Clock size={13} style={{ marginRight: '4px' }} /> Submitted — Awaiting Call
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

