import React, { useState } from 'react';
import { Unit, LandingConfig } from '../types';
import { sanitizeCountry, resolveDisplayLocation } from '../lib/addressUtils';

interface LandingPageProps {
  config: LandingConfig;
  units: Unit[];
  onStartAuth: (mode: 'login' | 'signup', role?: 'owner' | 'tenant') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  config,
  units,
  onStartAuth,
}) => {
  const [selectedCountry, setSelectedCountry] = useState<string>('All countries');

  // Filter listed vacant units
  const listedUnits = units.filter((u) => u.isListedPublicly && u.status === 'vacant');
  const countries = [
    'All countries',
    ...Array.from(new Set(listedUnits.map((u) => sanitizeCountry(u.country, u.address)))),
  ];

  const filteredUnits = listedUnits.filter((u) => {
    if (selectedCountry === 'All countries') return true;
    return sanitizeCountry(u.country, u.address) === selectedCountry;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* Landing Nav */}
      <div className="landing-nav">
        <div className="brand-mark">
          Propithub<span>·</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => onStartAuth('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className="btn brass small"
            onClick={() => onStartAuth('signup', 'owner')}
          >
            Sign up as Owner
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="hero">
        <h1>{config.headline}</h1>
        <p>{config.subheadline}</p>
        <div className="actions">
          <button
            type="button"
            className="btn brass"
            onClick={() => onStartAuth('signup', 'owner')}
          >
            {config.ctaText}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              document.getElementById('listingsSection')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Browse listings
          </button>
        </div>
      </div>

      {/* Public Listings Section */}
      <div className="listings-section" id="listingsSection">
        <div className="listings-bar">
          <div>
            <h2 style={{ fontSize: '22px' }}>Available Listings</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: '13px', marginTop: '2px' }}>
              Direct rentals from verified property owners on Propithub
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Filter by Country:</span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={{
                padding: '7px 11px',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--radius)',
              }}
            >
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="listing-grid">
          {filteredUnits.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)' }}>
              No active listings found in this country.
            </div>
          ) : (
            filteredUnits.map((u) => (
              <div key={u.id} className="listing-card">
                <div
                  className="listing-photo"
                  style={{
                    backgroundImage: `url(${
                      (u.images && u.images[0]) ||
                      u.image ||
                      (u.currency === '$'
                        ? 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&q=80'
                        : u.currency === '£'
                        ? 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80'
                        : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&q=80')
                    })`,
                  }}
                >
                  <span>Unit {u.unitNumber}</span>
                </div>
                <div className="listing-body">
                  <div className="price">
                    {u.currency}
                    {u.rent.toLocaleString()}
                    <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--ink-soft)' }}> / month</span>
                  </div>
                  <div className="loc" style={{ fontWeight: 600, marginTop: '4px' }}>
                    {u.propertyName}
                  </div>
                  <div
                    className="loc"
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--ink-soft)',
                      marginTop: '4px',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minHeight: '35px',
                    }}
                    title={u.address}
                  >
                    {u.address}
                  </div>
                  <div
                    className="loc"
                    style={{
                      color: 'var(--brass)',
                      fontWeight: 600,
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <span>📍</span>
                    <span>{resolveDisplayLocation(u.address, u.country)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn secondary small"
                    style={{ marginTop: '14px', width: '100%' }}
                    onClick={() => onStartAuth('login', 'tenant')}
                  >
                    Enquire — sign in to view lease
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: '1px solid var(--line)',
          padding: '24px 48px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: 'var(--ink-soft)',
        }}
      >
        <div>© 2026 Propithub Platform. All rights reserved.</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Terms of Service</span>
          <span>Privacy Policy</span>
          <span>Security & Compliance</span>
        </div>
      </div>
    </div>
  );
};
