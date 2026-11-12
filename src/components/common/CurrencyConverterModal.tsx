import React, { useState, useMemo, useEffect } from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import { Search, X, Check } from 'lucide-react';

export const CurrencyConverterModal: React.FC = () => {
  const {
    isConverterOpen,
    closeConverter,
    currencies,
    viewCurrency,
    setViewCurrency,
    isLive,
  } = useCurrency();

  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (isConverterOpen) {
      setSearchQuery('');
    }
  }, [isConverterOpen]);

  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return currencies;
    return currencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [currencies, searchQuery]);

  if (!isConverterOpen) return null;

  const handleSelectCurrency = (code: string) => {
    setViewCurrency(code);
    closeConverter();
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={closeConverter}
    >
      <div
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: '380px',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '14px',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.18)',
          border: '1px solid var(--line, #E2E8F0)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--line, #E2E8F0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--ink, #0F172A)' }}>
              Display Currency
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: 'var(--ink-soft, #64748B)',
                background: 'var(--surface-sunken, #F8FAFC)',
                padding: '2px 8px',
                borderRadius: '999px',
                border: '1px solid var(--line, #E2E8F0)',
              }}
            >
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: isLive ? '#10B981' : '#F59E0B',
                }}
              />
              {isLive ? 'Live rates' : 'Standard'}
            </span>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={closeConverter}
            style={{ width: '28px', height: '28px', minWidth: '28px' }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Clean Search Bar */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line, #E2E8F0)' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '11px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-soft, #64748B)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search currency or country..."
              style={{
                width: '100%',
                padding: '7px 28px 7px 32px',
                borderRadius: '8px',
                border: '1px solid var(--line, #E2E8F0)',
                background: 'var(--surface-sunken, #F8FAFC)',
                color: 'var(--ink, #0F172A)',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-soft, #64748B)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Smooth Currency List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 10px',
            maxHeight: '340px',
          }}
        >
          {(!searchQuery || 'default'.includes(searchQuery.toLowerCase()) || 'local'.includes(searchQuery.toLowerCase())) && (
            <button
              type="button"
              onClick={() => handleSelectCurrency('LOCAL')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: (!viewCurrency || viewCurrency === 'LOCAL') ? '1px solid var(--teal-primary, #10B981)' : '1px dashed var(--line, #CBD5E1)',
                background: (!viewCurrency || viewCurrency === 'LOCAL') ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                color: 'var(--ink, #0F172A)',
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: '8px',
                transition: 'all 0.12s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '17px', lineHeight: 1 }}>🌐</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: (!viewCurrency || viewCurrency === 'LOCAL') ? 'var(--teal-primary, #10B981)' : 'var(--ink)' }}>
                    Default / Local Currency
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    Show native contract currency for each unit
                  </div>
                </div>
              </div>
              {(!viewCurrency || viewCurrency === 'LOCAL') && (
                <Check size={16} color="var(--teal-primary, #10B981)" style={{ flexShrink: 0 }} />
              )}
            </button>
          )}

          {filteredCurrencies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 12px', fontSize: '13px', color: 'var(--ink-soft)' }}>
              No currencies matching &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            filteredCurrencies.map((c) => {
              const isActive = c.code === viewCurrency;

              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleSelectCurrency(c.code)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isActive ? 'var(--surface-sunken, #F1F5F9)' : 'transparent',
                    color: 'var(--ink, #0F172A)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--surface-sunken, #F8FAFC)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '7px',
                        background: isActive ? 'var(--primary, #0D9488)' : 'var(--surface-sunken, #F1F5F9)',
                        color: isActive ? '#FFFFFF' : 'var(--ink, #0F172A)',
                        border: isActive ? 'none' : '1px solid var(--line, #E2E8F0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {c.symbol}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink, #0F172A)' }}>
                          {c.code}
                        </span>
                        <span style={{ fontSize: '12.5px', color: 'var(--ink-soft, #64748B)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.name}
                        </span>
                      </div>
                      {c.country && (
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft, #94A3B8)', marginTop: '1px' }}>
                          {c.country}
                        </div>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <Check size={16} style={{ color: 'var(--primary, #0D9488)', flexShrink: 0 }} />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
