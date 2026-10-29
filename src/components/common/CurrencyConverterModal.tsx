import React, { useState, useMemo, useEffect } from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import {
  Search,
  X,
  ArrowRightLeft,
  Check,
  CircleDollarSign,
  Info,
  ChevronDown,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

const POPULAR_DESTINATIONS = [
  { code: 'INR', country: 'India', flag: '🇮🇳' },
  { code: 'USD', country: 'United States', flag: '🇺🇸' },
  { code: 'AED', country: 'UAE', flag: '🇦🇪' },
  { code: 'GBP', country: 'UK', flag: '🇬🇧' },
  { code: 'EUR', country: 'Eurozone', flag: '🇪🇺' },
  { code: 'SGD', country: 'Singapore', flag: '🇸🇬' },
  { code: 'CAD', country: 'Canada', flag: '🇨🇦' },
  { code: 'AUD', country: 'Australia', flag: '🇦🇺' },
  { code: 'SAR', country: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'JPY', country: 'Japan', flag: '🇯🇵' },
];

export const CurrencyConverterModal: React.FC = () => {
  const {
    isConverterOpen,
    closeConverter,
    converterBaseAmount,
    converterBaseCurrency,
    currencies,
    convert,
    format,
    getRate,
    viewCurrency,
    setViewCurrency,
    lastUpdated,
    isLive,
  } = useCurrency();

  const [amount, setAmount] = useState<number>(converterBaseAmount || 100);
  const [baseCode, setBaseCode] = useState<string>(converterBaseCurrency || 'USD');
  const [targetCode, setTargetCode] = useState<string>(() => {
    if (converterBaseCurrency && converterBaseCurrency !== 'INR') return 'INR';
    return 'USD';
  });
  const [isSelectingCountry, setIsSelectingCountry] = useState<'from' | 'to' | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedFeedback, setCopiedFeedback] = useState<string | null>(null);

  // Sync when converter opens with new base amount/currency
  useEffect(() => {
    if (isConverterOpen) {
      setAmount(converterBaseAmount || 100);
      const initialBase = converterBaseCurrency || 'USD';
      setBaseCode(initialBase);
      setTargetCode(initialBase === 'INR' ? 'USD' : 'INR');
      setIsSelectingCountry(null);
      setSearchQuery('');
      setCopiedFeedback(null);
    }
  }, [isConverterOpen, converterBaseAmount, converterBaseCurrency]);

  const currentBaseMeta = useMemo(() => {
    return (
      currencies.find((c) => c.code === baseCode) || {
        code: baseCode,
        name: baseCode,
        country: '',
        symbol: baseCode,
        flag: '🌐',
      }
    );
  }, [currencies, baseCode]);

  const currentTargetMeta = useMemo(() => {
    return (
      currencies.find((c) => c.code === targetCode) || {
        code: targetCode,
        name: targetCode,
        country: '',
        symbol: targetCode,
        flag: '🌐',
      }
    );
  }, [currencies, targetCode]);

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

  const convertedVal = convert(amount, baseCode, targetCode);
  const unitRate = getRate(baseCode, targetCode);
  const inverseRate = getRate(targetCode, baseCode);
  const isTargetViewCurrency = viewCurrency === targetCode;

  const handleSwap = () => {
    const prevBase = baseCode;
    setBaseCode(targetCode);
    setTargetCode(prevBase);
  };

  const handleSelectCountry = (code: string) => {
    if (isSelectingCountry === 'from') {
      if (code === targetCode) {
        setTargetCode(baseCode);
      }
      setBaseCode(code);
    } else {
      if (code === baseCode) {
        setBaseCode(targetCode);
      }
      setTargetCode(code);
    }
    setIsSelectingCountry(null);
    setSearchQuery('');
  };

  const handleSetAsAppCurrency = () => {
    setViewCurrency(targetCode);
    setCopiedFeedback(`✓ Set ${targetCode} as app display currency!`);
    setTimeout(() => setCopiedFeedback(null), 3000);
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
          maxWidth: '560px',
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
            {isSelectingCountry ? (
              <button
                type="button"
                className="btn secondary small"
                onClick={() => {
                  setIsSelectingCountry(null);
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
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
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
              <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--ink, #0F172A)' }}>
                {isSelectingCountry
                  ? `Select ${isSelectingCountry === 'from' ? 'Source' : 'Target'} Country`
                  : 'Live Currency Converter'}
              </div>
              <div
                style={{
                  fontSize: '11.5px',
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
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: isLive ? '#10B981' : '#F59E0B',
                  }}
                />
                <span>{isLive ? 'Central Bank Rates' : 'Baseline Rates'}</span>
                <span>•</span>
                <span>{lastUpdated}</span>
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

        {/* ── View 1: Country Picker (Searchable & Clickable) ────────────────────────── */}
        {isSelectingCountry ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Search Input */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line, #E2E8F0)' }}>
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
                  placeholder="Search by country (e.g. India, UAE, UK, Japan) or currency (EUR, USD)..."
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

            {/* Country List */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px 20px 16px',
                maxHeight: '440px',
              }}
            >
              {filteredCurrencies.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--ink-soft)' }}>
                  No countries found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredCurrencies.map((c) => {
                  const isCurrentActive =
                    isSelectingCountry === 'from' ? c.code === baseCode : c.code === targetCode;
                  const previewVal = convert(amount, baseCode, c.code);

                  return (
                    <div
                      key={c.code}
                      onClick={() => handleSelectCountry(c.code)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        border: isCurrentActive
                          ? '1.5px solid var(--teal-primary, #10B981)'
                          : '1px solid var(--line, #E2E8F0)',
                        background: isCurrentActive
                          ? 'rgba(16, 185, 129, 0.08)'
                          : 'var(--surface, #FFFFFF)',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrentActive) {
                          e.currentTarget.style.borderColor = 'var(--teal-primary, #10B981)';
                          e.currentTarget.style.background = 'var(--surface-sunken, #F8FAFC)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrentActive) {
                          e.currentTarget.style.borderColor = 'var(--line, #E2E8F0)';
                          e.currentTarget.style.background = 'var(--surface, #FFFFFF)';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '26px', lineHeight: 1 }}>{c.flag}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, fontSize: '14.5px', color: 'var(--ink, #0F172A)' }}>
                              {c.country}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'var(--surface-sunken, #F1F5F9)',
                                color: 'var(--ink-soft, #475569)',
                              }}
                            >
                              {c.code} ({c.symbol})
                            </span>
                            {isCurrentActive && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'var(--teal-primary, #10B981)',
                                  color: '#fff',
                                }}
                              >
                                SELECTED
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft, #64748B)', marginTop: '2px' }}>
                            {c.name}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink, #0F172A)' }}>
                          {format(previewVal, c.code)}
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--ink-soft, #64748B)', marginTop: '2px' }}>
                          Tap to select
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ── View 2: Converter Main Screen (Target Country Selectable) ─────────────── */
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Amount & Convert From / To Card */}
            <div
              style={{
                background: 'var(--surface-sunken, #F8FAFC)',
                borderRadius: '12px',
                border: '1px solid var(--line, #E2E8F0)',
                padding: '16px',
              }}
            >
              {/* Amount Input */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--ink-soft, #64748B)',
                    marginBottom: '6px',
                    letterSpacing: '0.5px',
                  }}
                >
                  Amount to Convert
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={isNaN(amount) || amount === 0 ? '' : amount}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setAmount(cleaned === '' ? 0 : parseFloat(cleaned) || 0);
                    }}
                    placeholder="100"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--line, #CBD5E1)',
                      background: 'var(--surface, #FFFFFF)',
                      color: 'var(--ink, #0F172A)',
                      fontSize: '20px',
                      fontWeight: 800,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--ink-soft, #64748B)',
                    }}
                  >
                    {currentBaseMeta.code}
                  </span>
                </div>
              </div>

              {/* From & To Selector Row with Swap Button */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  position: 'relative',
                }}
              >
                {/* FROM COUNTRY */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--ink-soft, #64748B)',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    From Country
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectingCountry('from');
                      setSearchQuery('');
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--line, #CBD5E1)',
                      background: 'var(--surface, #FFFFFF)',
                      color: 'var(--ink, #0F172A)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '20px', lineHeight: 1 }}>{currentBaseMeta.flag}</span>
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '13px',
                            color: 'var(--ink, #0F172A)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {currentBaseMeta.country || currentBaseMeta.code}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft, #64748B)' }}>
                          {currentBaseMeta.code} ({currentBaseMeta.symbol})
                        </div>
                      </div>
                    </div>
                    <ChevronDown size={15} color="#64748B" style={{ flexShrink: 0 }} />
                  </button>
                </div>

                {/* SWAP BUTTON */}
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingTop: '16px' }}>
                  <button
                    type="button"
                    onClick={handleSwap}
                    title="Swap currencies"
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      border: '1px solid var(--teal-primary, #10B981)',
                      background: 'var(--teal-light, rgba(16, 185, 129, 0.12))',
                      color: 'var(--teal-dark, #059669)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <ArrowRightLeft size={16} />
                  </button>
                </div>

                {/* TO COUNTRY (CLICKABLE) */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--teal-dark, #059669)',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    To Country (Click to Pick)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectingCountry('to');
                      setSearchQuery('');
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid var(--teal-primary, #10B981)',
                      background: 'rgba(16, 185, 129, 0.06)',
                      color: 'var(--ink, #0F172A)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '20px', lineHeight: 1 }}>{currentTargetMeta.flag}</span>
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: '13px',
                            color: 'var(--teal-dark, #059669)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {currentTargetMeta.country || currentTargetMeta.code}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft, #64748B)' }}>
                          {currentTargetMeta.code} ({currentTargetMeta.symbol})
                        </div>
                      </div>
                    </div>
                    <ChevronDown size={15} color="#059669" style={{ flexShrink: 0 }} />
                  </button>
                </div>
              </div>
            </div>

            {/* Popular Countries Quick-Pills (Clickable) */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--ink-soft, #64748B)',
                  }}
                >
                  Select Target Country:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectingCountry('to');
                    setSearchQuery('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--teal-dark, #059669)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Browse all 160+ countries →
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {POPULAR_DESTINATIONS.map((p) => {
                  const isSelected = targetCode === p.code;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => setTargetCode(p.code)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        borderRadius: '20px',
                        border: isSelected
                          ? '1.5px solid var(--teal-primary, #10B981)'
                          : '1px solid var(--line, #CBD5E1)',
                        background: isSelected
                          ? 'var(--teal-primary, #10B981)'
                          : 'var(--surface, #FFFFFF)',
                        color: isSelected ? '#FFFFFF' : 'var(--ink, #0F172A)',
                        fontSize: '12px',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{p.flag}</span>
                      <span>{p.country}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hero Conversion Result Card */}
            <div
              style={{
                borderRadius: '14px',
                border: '1.5px solid var(--teal-border, rgba(16, 185, 129, 0.3))',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)',
                padding: '20px',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: '13px', color: 'var(--ink-soft, #64748B)', fontWeight: 600 }}>
                {amount.toLocaleString()} {currentBaseMeta.code} ({currentBaseMeta.country || currentBaseMeta.name}) =
              </div>

              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 900,
                  color: 'var(--ink, #0F172A)',
                  letterSpacing: '-0.5px',
                  margin: '6px 0 8px',
                }}
              >
                {format(convertedVal, targetCode)}
              </div>

              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--teal-dark, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '12px',
                }}
              >
                <span>{currentTargetMeta.flag}</span>
                <span>
                  {currentTargetMeta.country} • {currentTargetMeta.name} ({currentTargetMeta.code})
                </span>
              </div>

              {/* Rate Details */}
              <div
                style={{
                  paddingTop: '10px',
                  borderTop: '1px dashed var(--line, #CBD5E1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '6px',
                  fontSize: '12px',
                  color: 'var(--ink-soft, #64748B)',
                }}
              >
                <div>
                  1 {baseCode} = {format(unitRate, targetCode, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
                <div>
                  1 {targetCode} = {format(inverseRate, baseCode, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
              </div>
            </div>

            {/* Set as Active App Currency Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              {isTargetViewCurrency ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: 'var(--teal-dark, #059669)',
                  }}
                >
                  <Check size={16} />
                  <span>{targetCode} is currently your active app display currency</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleSetAsAppCurrency}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    color: 'var(--teal-dark, #059669)',
                    borderColor: 'var(--teal-primary, #10B981)',
                  }}
                >
                  <Sparkles size={14} /> Set {targetCode} ({currentTargetMeta.country}) as App Currency
                </button>
              )}

              {copiedFeedback && (
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--teal-dark, #059669)' }}>
                  {copiedFeedback}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer Note */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--line, #E2E8F0)',
            background: 'var(--surface-sunken, #F8FAFC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '11.5px',
            color: 'var(--ink-soft, #64748B)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={14} style={{ color: 'var(--teal-primary, #10B981)', flexShrink: 0 }} />
            <span>Reference rates updated real-time. Executed leases preserve original contracted currency.</span>
          </div>
          <button
            type="button"
            className="btn secondary small"
            onClick={closeConverter}
            style={{ fontWeight: 600 }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
