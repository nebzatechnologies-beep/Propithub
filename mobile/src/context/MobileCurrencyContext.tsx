import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  CurrencyMeta,
  GLOBAL_CURRENCIES,
  BASELINE_RATES_USD,
  getLiveRates,
  convertCurrency,
  formatCurrencyAmount,
  normalizeCurrencyCode,
  getCurrencySymbol,
} from '../lib/currencyService';

interface MobileCurrencyContextType {
  rates: Record<string, number>;
  loading: boolean;
  isLive: boolean;
  lastUpdated: string;
  viewCurrency: string;
  setViewCurrency: (code: string) => void;
  currencies: CurrencyMeta[];
  convert: (amount: number, from: string, to: string) => number;
  format: (
    amount: number | null | undefined,
    currencyCode?: string,
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
  ) => string;
  getRate: (from: string, to: string) => number;
  currencySymbol: string;
  getSymbol: (code?: string) => string;
}

const MobileCurrencyContext = createContext<MobileCurrencyContextType | null>(null);

const STORAGE_VIEW_CURRENCY_WEB = 'propithub_preferred_view_currency_v1';
const STORAGE_VIEW_CURRENCY_MOB = 'propithub_mobile_view_currency_v1';

const getInitialCurrency = (): string => {
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (
        (globalThis as any).localStorage.getItem(STORAGE_VIEW_CURRENCY_WEB) ||
        (globalThis as any).localStorage.getItem(STORAGE_VIEW_CURRENCY_MOB) ||
        'USD'
      );
    }
  } catch {}
  return 'USD';
};

export const MobileCurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rates, setRates] = useState<Record<string, number>>(BASELINE_RATES_USD);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('Initializing...');
  const [viewCurrency, setViewCurrencyState] = useState<string>(getInitialCurrency);

  // Load live rates on mount
  useEffect(() => {
    let isMounted = true;
    getLiveRates().then((result) => {
      if (!isMounted) return;
      setRates(result.rates);
      setLastUpdated(result.lastUpdated);
      setIsLive(result.isLive);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const setViewCurrency = useCallback((code: string) => {
    const clean = normalizeCurrencyCode(code);
    setViewCurrencyState(clean);
    try {
      if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
        (globalThis as any).localStorage.setItem(STORAGE_VIEW_CURRENCY_MOB, clean);
        (globalThis as any).localStorage.setItem(STORAGE_VIEW_CURRENCY_WEB, clean);
      }
    } catch (e) {
      console.warn('Failed to save preferred currency:', e);
    }
  }, []);

  const convert = useCallback(
    (amount: number, from: string, to: string) => {
      return convertCurrency(amount, from, to, rates);
    },
    [rates]
  );

  const format = useCallback(
    (
      amount: number | null | undefined,
      currencyCode?: string,
      options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
    ) => {
      return formatCurrencyAmount(amount, currencyCode || viewCurrency, options);
    },
    [viewCurrency]
  );

  const getRate = useCallback(
    (from: string, to: string) => {
      const fromCode = normalizeCurrencyCode(from);
      const toCode = normalizeCurrencyCode(to);
      if (fromCode === toCode) return 1;
      const rateFrom = rates[fromCode] || BASELINE_RATES_USD[fromCode] || 1;
      const rateTo = rates[toCode] || BASELINE_RATES_USD[toCode] || 1;
      return (1 / rateFrom) * rateTo;
    },
    [rates]
  );

  const currencySymbol = useMemo(() => getCurrencySymbol(viewCurrency), [viewCurrency]);

  const getSymbol = useCallback(
    (code?: string) => getCurrencySymbol(code || viewCurrency),
    [viewCurrency]
  );

  const contextValue = useMemo<MobileCurrencyContextType>(
    () => ({
      rates,
      loading,
      isLive,
      lastUpdated,
      viewCurrency,
      setViewCurrency,
      currencies: GLOBAL_CURRENCIES,
      convert,
      format,
      getRate,
      currencySymbol,
      getSymbol,
    }),
    [rates, loading, isLive, lastUpdated, viewCurrency, setViewCurrency, convert, format, getRate, currencySymbol, getSymbol]
  );

  return (
    <MobileCurrencyContext.Provider value={contextValue}>
      {children}
    </MobileCurrencyContext.Provider>
  );
};

export const useMobileCurrency = () => {
  const context = useContext(MobileCurrencyContext);
  if (!context) {
    throw new Error('useMobileCurrency must be used within a MobileCurrencyProvider');
  }
  return context;
};
