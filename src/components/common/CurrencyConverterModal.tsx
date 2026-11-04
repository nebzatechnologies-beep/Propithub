import React, { useState, useMemo, useEffect } from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import {
  Search,
  X,
  Check,
  CircleDollarSign,
  ChevronDown,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

export const CurrencyConverterModal: React.FC = () => {
  const {
    isConverterOpen,
    closeConverter,
    currencies,
    viewCurrency,
    setViewCurrency,
    isLive,
  } = useCurrency();

  const [selectedCode, setSelectedCode] = useState<string>(viewCurrency || 'USD');
  const [isPicking, setIsPicking] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sync with active viewCurrency when modal opens
  useEffect(() => {
    if (isConverterOpen) {
      setSelectedCode(viewCurrency || 'USD');
      setIsPicking(false);
      setSearchQuery('');
      setFeedback(null);
    }
  }, [isConverterOpen, viewCurrency]);

  const currentMeta = useMemo(() => {
    return (
      currencies.find((c) => c.code === selectedCode) || {
        code: selectedCode,
        name: selectedCode,
        country: '',
        symbol: selectedCode,
        flag: '🌐',
      }
    );
  }, [currencies, selectedCode]);

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

  const isCurrentActive = viewCurrency === selectedCode;

  const handleSelect = (code: string) => {
    setSelectedCode(code);
    setIsPicking(false);
    setSearchQuery('');
  };

  const handleSetAsAppCurrency = () => {
    setViewCurrency(selectedCode);
    setFeedback(`✓ ${selectedCode} is now your app currency`);
    setTimeout(() => setFeedback(null), 2500);
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 99999,
        background: 'rgba(0,0,0,0.55)',
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
          maxWidth: '430px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
          border: '1px solid var(--line, #E2E8F0)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--line, #E2E8F0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-sunken, #F8FAFC)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isPicking ? (
              <button
                type="button"
                className="btn secondary small"
                onClick={() => {
                  setIsPicking(false);
                  setSearchQuery('');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <ArrowLeft size={14} /> Back
              </button>
            ) : (
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--teal-primary, #10B981)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CircleDollarSign size={18} />
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--ink, #0F172A)' }}>
                {isPicking ? 'Select Currency' : 'App Currency'}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--ink-soft, #64748B)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '1px',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isLive ? '#10B981' : '#F59E0B',
                  }}
                />
                <span>{isLive ? 'Live Central Bank Rates' : 'Standard Baseline Rates'}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn secondary small"
            onClick={closeConverter}
            style={{ padding: '6px', borderRadius: '8px' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── View 1: Searchable Currency Picker ────────────────────────── */}
        {isPicking ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Search Input */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line, #E2E8F0)' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-soft, #64748B)',
                  }}
                />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by country (e.g. India, UAE, UK) or currency (EUR, USD)..."
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid var(--line, #CBD5E1)',
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
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--ink-soft, #64748B)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Currency List */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px 18px 16px',
                maxHeight: '400px',
              }}
            >
              {filteredCurrencies.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--ink-soft)' }}>
                  No currencies found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredCurrencies.map((c) => {
                  const isCurrent = c.code === selectedCode;

                  return (
                    <div
                      key={c.code}
                      onClick={() => handleSelect(c.code)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: isCurrent
                          ? '1.5px solid var(--teal-primary, #10B981)'
                          : '1px solid var(--line, #E2E8F0)',
                        background: isCurrent
                          ? 'rgba(16, 185, 129, 0.08)'
                          : 'var(--surface, #FFFFFF)',
                        marginBottom: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.borderColor = 'var(--teal-primary, #10B981)';
                          e.currentTarget.style.background = 'var(--surface-sunken, #F8FAFC)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.borderColor = 'var(--line, #E2E8F0)';
                          e.currentTarget.style.background = 'var(--surface, #FFFFFF)';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '22px', lineHeight: 1 }}>{c.flag}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--ink, #0F172A)' }}>
                              {c.country || c.name}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'var(--surface-sunken, #F1F5F9)',
                                color: 'var(--ink-soft, #475569)',
                              }}
                            >
                              {c.code} ({c.symbol})
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft, #64748B)', marginTop: '1px' }}>
                            {c.name}
                          </div>
                        </div>
                      </div>

                      {isCurrent && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: 'var(--teal-primary, #10B981)',
                            color: '#fff',
                          }}
                        >
                          SELECTED
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ── View 2: Clean Single-Field Currency Selection ─────────────── */
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--ink-soft, #64748B)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                App Currency
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsPicking(true);
                  setSearchQuery('');
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1.5px solid var(--teal-primary, #10B981)',
                  background: 'rgba(16, 185, 129, 0.05)',
                  color: 'var(--ink, #0F172A)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.05)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <span style={{ fontSize: '28px', lineHeight: 1 }}>{currentMeta.flag}</span>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: '15px',
                        color: 'var(--teal-dark, #059669)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {currentMeta.code} ({currentMeta.symbol})
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--ink-soft, #64748B)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '1px',
                      }}
                    >
                      {currentMeta.country ? `${currentMeta.country} • ${currentMeta.name}` : currentMeta.name}
                    </div>
                  </div>
                </div>
                <ChevronDown size={18} color="#059669" style={{ flexShrink: 0 }} />
              </button>
            </div>

            {/* Set as App Currency Action Button */}
            <div style={{ marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleSetAsAppCurrency}
                disabled={isCurrentActive}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '13px 16px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: isCurrentActive ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  border: isCurrentActive
                    ? '1.5px solid var(--teal-primary, #10B981)'
                    : 'none',
                  background: isCurrentActive
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'var(--teal-primary, #10B981)',
                  color: isCurrentActive
                    ? 'var(--teal-dark, #059669)'
                    : '#FFFFFF',
                }}
              >
                {isCurrentActive ? (
                  <>
                    <Check size={18} color="#059669" />
                    <span>{selectedCode} is your active app currency</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Set {selectedCode} as App Currency</span>
                  </>
                )}
              </button>

              {feedback && (
                <div
                  style={{
                    marginTop: '8px',
                    textAlign: 'center',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: 'var(--teal-dark, #059669)',
                  }}
                >
                  {feedback}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
