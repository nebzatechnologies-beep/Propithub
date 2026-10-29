import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  CurrencyMeta,
  GLOBAL_CURRENCIES,
  BASELINE_RATES_USD,
  getLiveRates,
  convertCurrency,
  formatCurrencyAmount,
  normalizeCurrencyCode,
} from '../lib/currencyService';
import { useAuth } from './AuthContext';

interface CurrencyContextType {
  rates: Record<string, number>;
  loading: boolean;
  isLive: boolean;
  lastUpdated: string;
  viewCurrency: string;
  setViewCurrency: (code: string) => void;
  currencies: CurrencyMeta[];
  convert: (amount: number, from: string, to: string) => number;
  format: (amount: number | null | undefined, currencyCode?: string, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => string;
  getRate: (from: string, to: string) => number;
  // Global View Converter Modal state
  isConverterOpen: boolean;
  converterBaseAmount: number;
  converterBaseCurrency: string;
  openConverter: (baseAmount?: number, baseCurrency?: string) => void;
  closeConverter: () => void;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

const LEGACY_STORAGE_VIEW_CURRENCY = 'propithub_preferred_view_currency_v1';

const getRoleKey = (role?: string | null): string => {
  if (role === 'superadmin') return 'propithub_preferred_view_currency_superadmin';
  if (role === 'owner') return 'propithub_preferred_view_currency_owner';
  if (role === 'tenant') return 'propithub_preferred_view_currency_tenant';
  if (role === 'manager') return 'propithub_preferred_view_currency_manager';
  if (role === 'staff') return 'propithub_preferred_view_currency_staff';

  // Fallback to checking location pathname if role state isn't initialized yet
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/superadmin')) {
    return 'propithub_preferred_view_currency_superadmin';
  }
  return 'propithub_preferred_view_currency_default';
};

const getInitialCurrencyForRole = (roleKey: string): string => {
  try {
    const saved = localStorage.getItem(roleKey);
    if (saved) return saved;
    // Fall back to legacy key if non-admin and legacy key exists
    if (roleKey !== 'propithub_preferred_view_currency_superadmin') {
      const legacy = localStorage.getItem(LEGACY_STORAGE_VIEW_CURRENCY);
      if (legacy) return legacy;
    }
    return 'USD';
  } catch {
    return 'USD';
  }
};

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role } = useAuth();
  const roleKey = useMemo(() => getRoleKey(role), [role]);

  const [rates, setRates] = useState<Record<string, number>>(BASELINE_RATES_USD);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('Initializing...');
  const [viewCurrency, setViewCurrencyState] = useState<string>(() => getInitialCurrencyForRole(getRoleKey(role)));

  // Sync view currency state when active role changes
  useEffect(() => {
    setViewCurrencyState(getInitialCurrencyForRole(roleKey));
  }, [roleKey]);

  // Converter Modal state
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [converterBaseAmount, setConverterBaseAmount] = useState<number>(100);
  const [converterBaseCurrency, setConverterBaseCurrency] = useState<string>('USD');

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

  const setViewCurrency = useCallback(
    (code: string) => {
      const clean = normalizeCurrencyCode(code);
      setViewCurrencyState(clean);
      try {
        localStorage.setItem(roleKey, clean);
      } catch (e) {
        console.warn('Failed to save preferred currency:', e);
      }
    },
    [roleKey]
  );

  const convert = useCallback(
    (amount: number, from: string, to: string) => {
      return convertCurrency(amount, from, to, rates);
    },
    [rates]
  );

  const format = useCallback((amount: number | null | undefined, currencyCode?: string, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => {
    return formatCurrencyAmount(amount, currencyCode || 'USD', options);
  }, []);

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

  const openConverter = useCallback((baseAmount: number = 100, baseCurrency: string = 'USD') => {
    setConverterBaseAmount(baseAmount);
    setConverterBaseCurrency(normalizeCurrencyCode(baseCurrency));
    setIsConverterOpen(true);
  }, []);

  const closeConverter = useCallback(() => {
    setIsConverterOpen(false);
  }, []);

  const contextValue = useMemo<CurrencyContextType>(
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
      isConverterOpen,
      converterBaseAmount,
      converterBaseCurrency,
      openConverter,
      closeConverter,
    }),
    [
      rates,
      loading,
      isLive,
      lastUpdated,
      viewCurrency,
      setViewCurrency,
      convert,
      format,
      getRate,
      isConverterOpen,
      converterBaseAmount,
      converterBaseCurrency,
      openConverter,
      closeConverter,
    ]
  );

  return <CurrencyContext.Provider value={contextValue}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
