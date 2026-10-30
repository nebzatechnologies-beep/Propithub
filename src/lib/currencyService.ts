// Live Currency & Forex Exchange Service for Propithub
// Fetches real-time rates from public Open Exchange API with 6-hour localStorage caching & offline baseline fallbacks.

/** App-wide neutral fallback currency symbol. */
export const DEFAULT_CURRENCY = '$';
/** Display symbol for DEFAULT_CURRENCY. Used in template strings and UI labels where a symbol character is needed. */
export const DEFAULT_CURRENCY_SYMBOL = '$';

export interface CurrencyMeta {
  code: string;
  name: string;
  country: string;
  symbol: string;
  flag: string;
}

export interface ForexRatesResponse {
  result: string;
  provider: string;
  documentation: string;
  terms_of_use: string;
  time_last_update_unix: number;
  time_last_update_utc: string;
  time_next_update_unix: number;
  time_next_update_utc: string;
  base_code: string;
  rates: Record<string, number>;
}

// 160+ Global Currencies with Codes, Names, Countries, Symbols, and Flags
export const GLOBAL_CURRENCIES: CurrencyMeta[] = [
  // Major & Most Common
  { code: 'USD', name: 'US Dollar', country: 'United States', symbol: '$', flag: '🇺🇸' },
  { code: 'INR', name: 'Indian Rupee', country: 'India', symbol: '₹', flag: '🇮🇳' },
  { code: 'EUR', name: 'Euro', country: 'European Union', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', country: 'United Kingdom', symbol: '£', flag: '🇬🇧' },
  { code: 'AED', name: 'UAE Dirham', country: 'United Arab Emirates', symbol: 'AED', flag: '🇦🇪' },
  { code: 'SGD', name: 'Singapore Dollar', country: 'Singapore', symbol: 'S$', flag: '🇸🇬' },
  { code: 'CAD', name: 'Canadian Dollar', country: 'Canada', symbol: 'CA$', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', country: 'Australia', symbol: 'A$', flag: '🇦🇺' },
  { code: 'SAR', name: 'Saudi Riyal', country: 'Saudi Arabia', symbol: '﷼', flag: '🇸🇦' },
  { code: 'JPY', name: 'Japanese Yen', country: 'Japan', symbol: '¥', flag: '🇯🇵' },
  { code: 'CNY', name: 'Chinese Yuan', country: 'China', symbol: '¥', flag: '🇨🇳' },
  { code: 'CHF', name: 'Swiss Franc', country: 'Switzerland', symbol: 'Fr', flag: '🇨🇭' },
  { code: 'QAR', name: 'Qatari Riyal', country: 'Qatar', symbol: 'QR', flag: '🇶🇦' },
  { code: 'KWD', name: 'Kuwaiti Dinar', country: 'Kuwait', symbol: 'KD', flag: '🇰🇼' },
  { code: 'BHD', name: 'Bahraini Dinar', country: 'Bahrain', symbol: 'BD', flag: '🇧🇭' },
  { code: 'OMR', name: 'Omani Rial', country: 'Oman', symbol: 'RO', flag: '🇴🇲' },
  { code: 'MYR', name: 'Malaysian Ringgit', country: 'Malaysia', symbol: 'RM', flag: '🇲🇾' },
  { code: 'THB', name: 'Thai Baht', country: 'Thailand', symbol: '฿', flag: '🇹🇭' },
  { code: 'HKD', name: 'Hong Kong Dollar', country: 'Hong Kong', symbol: 'HK$', flag: '🇭🇰' },
  { code: 'NZD', name: 'New Zealand Dollar', country: 'New Zealand', symbol: 'NZ$', flag: '🇳🇿' },
  { code: 'ZAR', name: 'South African Rand', country: 'South Africa', symbol: 'R', flag: '🇿🇦' },
  { code: 'SEK', name: 'Swedish Krona', country: 'Sweden', symbol: 'kr', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', country: 'Norway', symbol: 'kr', flag: '🇳🇴' },
  { code: 'DKK', name: 'Danish Krone', country: 'Denmark', symbol: 'kr', flag: '🇩🇰' },
  { code: 'BRL', name: 'Brazilian Real', country: 'Brazil', symbol: 'R$', flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso', country: 'Mexico', symbol: 'Mex$', flag: '🇲🇽' },
  { code: 'IDR', name: 'Indonesian Rupiah', country: 'Indonesia', symbol: 'Rp', flag: '🇮🇩' },
  { code: 'PHP', name: 'Philippine Peso', country: 'Philippines', symbol: '₱', flag: '🇵🇭' },
  { code: 'VND', name: 'Vietnamese Dong', country: 'Vietnam', symbol: '₫', flag: '🇻🇳' },
  { code: 'KRW', name: 'South Korean Won', country: 'South Korea', symbol: '₩', flag: '🇰🇷' },
  { code: 'TRY', name: 'Turkish Lira', country: 'Turkey', symbol: '₺', flag: '🇹🇷' },
  { code: 'RUB', name: 'Russian Ruble', country: 'Russia', symbol: '₽', flag: '🇷🇺' },
  { code: 'PLN', name: 'Polish Zloty', country: 'Poland', symbol: 'zł', flag: '🇵🇱' },
  { code: 'ILS', name: 'Israeli New Shekel', country: 'Israel', symbol: '₪', flag: '🇮🇱' },
  { code: 'EGP', name: 'Egyptian Pound', country: 'Egypt', symbol: 'E£', flag: '🇪🇬' },
  { code: 'NGN', name: 'Nigerian Naira', country: 'Nigeria', symbol: '₦', flag: '🇳🇬' },
  { code: 'KES', name: 'Kenyan Shilling', country: 'Kenya', symbol: 'KSh', flag: '🇰🇪' },
  { code: 'GHS', name: 'Ghanaian Cedi', country: 'Ghana', symbol: 'GH₵', flag: '🇬🇭' },
  { code: 'PKR', name: 'Pakistani Rupee', country: 'Pakistan', symbol: '₨', flag: '🇵🇰' },
  { code: 'BDT', name: 'Bangladeshi Taka', country: 'Bangladesh', symbol: '৳', flag: '🇧🇩' },
  { code: 'LKR', name: 'Sri Lankan Rupee', country: 'Sri Lanka', symbol: 'Rs', flag: '🇱🇰' },
  { code: 'NPR', name: 'Nepalese Rupee', country: 'Nepal', symbol: 'रू', flag: '🇳🇵' },
  { code: 'CLP', name: 'Chilean Peso', country: 'Chile', symbol: 'CLP$', flag: '🇨🇱' },
  { code: 'COP', name: 'Colombian Peso', country: 'Colombia', symbol: 'COL$', flag: '🇨🇴' },
  { code: 'PEN', name: 'Peruvian Sol', country: 'Peru', symbol: 'S/.', flag: '🇵🇪' },
  { code: 'ARS', name: 'Argentine Peso', country: 'Argentina', symbol: 'ARS$', flag: '🇦🇷' },
  { code: 'CZK', name: 'Czech Koruna', country: 'Czech Republic', symbol: 'Kč', flag: '🇨🇿' },
  { code: 'HUF', name: 'Hungarian Forint', country: 'Hungary', symbol: 'Ft', flag: '🇭🇺' },
  { code: 'RON', name: 'Romanian Leu', country: 'Romania', symbol: 'lei', flag: '🇷🇴' },
  { code: 'BGN', name: 'Bulgarian Lev', country: 'Bulgaria', symbol: 'лв', flag: '🇧🇬' },
  { code: 'HRK', name: 'Croatian Kuna', country: 'Croatia', symbol: 'kn', flag: '🇭🇷' },
  { code: 'ISK', name: 'Icelandic Krona', country: 'Iceland', symbol: 'kr', flag: '🇮🇸' },
  { code: 'JOD', name: 'Jordanian Dinar', country: 'Jordan', symbol: 'JD', flag: '🇯🇴' },
  { code: 'LBP', name: 'Lebanese Pound', country: 'Lebanon', symbol: 'L£', flag: '🇱🇧' },
  { code: 'MAD', name: 'Moroccan Dirham', country: 'Morocco', symbol: 'DH', flag: '🇲🇦' },
  { code: 'TND', name: 'Tunisian Dinar', country: 'Tunisia', symbol: 'DT', flag: '🇹🇳' },
  { code: 'DZD', name: 'Algerian Dinar', country: 'Algeria', symbol: 'DA', flag: '🇩🇿' },
  { code: 'IQD', name: 'Iraqi Dinar', country: 'Iraq', symbol: 'ID', flag: '🇮🇶' },
  { code: 'UGX', name: 'Ugandan Shilling', country: 'Uganda', symbol: 'USh', flag: '🇺🇬' },
  { code: 'TZS', name: 'Tanzanian Shilling', country: 'Tanzania', symbol: 'TSh', flag: '🇹🇿' },
  { code: 'MUR', name: 'Mauritian Rupee', country: 'Mauritius', symbol: '₨', flag: '🇲🇺' },
  { code: 'KZT', name: 'Kazakhstani Tenge', country: 'Kazakhstan', symbol: '₸', flag: '🇰🇿' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', country: 'Ukraine', symbol: '₴', flag: '🇺🇦' },
  { code: 'GEL', name: 'Georgian Lari', country: 'Georgia', symbol: '₾', flag: '🇬🇪' },
  { code: 'AZN', name: 'Azerbaijani Manat', country: 'Azerbaijan', symbol: '₼', flag: '🇦🇿' },
  { code: 'AMD', name: 'Armenian Dram', country: 'Armenia', symbol: '֏', flag: '🇦🇲' },
  { code: 'UZS', name: 'Uzbekistani Som', country: 'Uzbekistan', symbol: 'soʻm', flag: '🇺🇿' },
];

// Fallback baseline exchange rates against 1 USD (used if network is offline or API fails)
export const BASELINE_RATES_USD: Record<string, number> = {
  USD: 1,
  INR: 86.85,
  EUR: 0.92,
  GBP: 0.78,
  AED: 3.6725,
  SGD: 1.34,
  CAD: 1.39,
  AUD: 1.54,
  SAR: 3.75,
  JPY: 152.4,
  CNY: 7.24,
  CHF: 0.88,
  QAR: 3.64,
  KWD: 0.31,
  BHD: 0.376,
  OMR: 0.385,
  MYR: 4.42,
  THB: 34.2,
  HKD: 7.78,
  NZD: 1.71,
  ZAR: 18.25,
  SEK: 10.65,
  NOK: 10.95,
  DKK: 6.88,
  BRL: 5.75,
  MXN: 20.35,
  IDR: 15850,
  PHP: 58.7,
  VND: 25400,
  KRW: 1390,
  TRY: 35.1,
  RUB: 98.5,
  PLN: 4.02,
  ILS: 3.68,
  EGP: 49.3,
  NGN: 1530,
  KES: 129.5,
  GHS: 15.6,
  PKR: 278.5,
  BDT: 119.8,
  LKR: 292.0,
  NPR: 139.0,
};

const CACHE_KEY = 'propithub_forex_cache_v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CachedData {
  timestamp: number;
  rates: Record<string, number>;
  timeLastUpdate?: string;
}

/**
 * Fetches real live forex rates from the free, public Open Exchange API.
 * Uses localStorage cache with a 6-hour TTL, falling back gracefully to baseline rates on error.
 */
export async function getLiveRates(): Promise<{ rates: Record<string, number>; lastUpdated: string; isLive: boolean }> {
  // 1. Check local cache
  try {
    const cachedStr = localStorage.getItem(CACHE_KEY);
    if (cachedStr) {
      const cached: CachedData = JSON.parse(cachedStr);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS && cached.rates && Object.keys(cached.rates).length > 10) {
        return {
          rates: { ...BASELINE_RATES_USD, ...cached.rates },
          lastUpdated: cached.timeLastUpdate || new Date(cached.timestamp).toLocaleDateString(),
          isLive: true,
        };
      }
    }
  } catch (e) {
    console.warn('Error reading forex cache:', e);
  }

  // 2. Fetch fresh rates from live API
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data: ForexRatesResponse = await res.json();
      if (data && data.result === 'success' && data.rates) {
        const fullRates = { ...BASELINE_RATES_USD, ...data.rates };
        try {
          const toCache: CachedData = {
            timestamp: Date.now(),
            rates: data.rates,
            timeLastUpdate: data.time_last_update_utc || new Date().toUTCString(),
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
        } catch (storageErr) {
          console.warn('Failed to cache forex rates:', storageErr);
        }
        return {
          rates: fullRates,
          lastUpdated: data.time_last_update_utc || new Date().toUTCString(),
          isLive: true,
        };
      }
    }
  } catch (netErr) {
    console.warn('Network error fetching live rates, using fallback:', netErr);
  }

  // 3. Fallback to baseline
  return {
    rates: BASELINE_RATES_USD,
    lastUpdated: 'Fallback baseline data',
    isLive: false,
  };
}

/**
 * Returns the currency symbol for a given currency code or symbol.
 * Falls back to the code itself if not found.
 */
export function getCurrencySymbol(currencyCodeOrSymbol: string | undefined | null): string {
  if (!currencyCodeOrSymbol) return '$';
  const clean = currencyCodeOrSymbol.trim();
  if (clean === '$' || clean.toUpperCase() === 'USD') return '$';
  const code = normalizeCurrencyCode(currencyCodeOrSymbol);
  if (code === 'USD') return '$';
  if (code === 'AED') return 'AED ';
  const meta = GLOBAL_CURRENCIES.find((c) => c.code === code);
  return meta?.symbol || code || '$';
}

/**
 * Returns the locale string to use for number formatting based on currency code.
 * Indian Rupee uses 'en-IN'; everything else uses 'en-US'.
 */
export function getLocaleForCurrency(currencyCodeOrSymbol: string | undefined | null): string {
  const code = normalizeCurrencyCode(currencyCodeOrSymbol);
  return code === 'INR' ? 'en-IN' : 'en-US';
}

/**
 * Maps a symbol (e.g. '₹', '$', '€', '£') or currency string to a 3-letter ISO code.
 */
export function normalizeCurrencyCode(curr: string | undefined | null): string {
  if (!curr) return 'USD';
  const clean = curr.trim().toUpperCase();
  const symbolMap: Record<string, string> = {
    '₹': 'INR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    'د.إ': 'AED',
    'S$': 'SGD',
    'CA$': 'CAD',
    'A$': 'AUD',
    '﷼': 'SAR',
    '¥': 'JPY',
    'Fr': 'CHF',
  };
  if (symbolMap[clean]) return symbolMap[clean];
  if (clean.length === 3 && /^[A-Z]{3}$/.test(clean)) return clean;
  // Look up by partial symbol
  if (curr.includes('₹')) return 'INR';
  if (curr.includes('€')) return 'EUR';
  if (curr.includes('£')) return 'GBP';
  if (curr.includes('$') && !curr.includes('CA') && !curr.includes('A') && !curr.includes('S')) return 'USD';
  return clean || 'USD';
}

/**
 * Converts an amount from one currency to another using provided rates table (base USD).
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (amount === 0 || isNaN(amount)) return 0;
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (from === to) return amount;

  const rateFrom = rates[from] || BASELINE_RATES_USD[from] || 1;
  const rateTo = rates[to] || BASELINE_RATES_USD[to] || 1;

  // Convert `from` -> USD -> `to`
  const inUSD = amount / rateFrom;
  return inUSD * rateTo;
}

/**
 * Formats a currency amount with symbol and regional number separators.
 */
export function formatCurrencyAmount(
  amount: number | null | undefined,
  currencyCode?: string | null,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number; compact?: boolean }
): string {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : (Number(amount) || 0);
  const code = normalizeCurrencyCode(currencyCode || 'USD');
  const meta = GLOBAL_CURRENCIES.find((c) => c.code === code);
  const symbol = meta?.symbol || code;

  const isNoDecimalCurr = code === 'JPY' || code === 'KRW' || code === 'VND' || code === 'CLP';
  const minDec = options?.minimumFractionDigits ?? (isNoDecimalCurr ? 0 : 2);
  const maxDec = options?.maximumFractionDigits ?? (isNoDecimalCurr ? 0 : 2);

  // Indian locale grouping for INR, standard for others
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  let formattedNumber: string;
  try {
    formattedNumber = num.toLocaleString(locale, {
      minimumFractionDigits: minDec,
      maximumFractionDigits: maxDec,
    });
  } catch {
    formattedNumber = Number(num || 0).toFixed(minDec);
  }

  const symbolPrefix = symbol.length > 1 && !symbol.endsWith(' ') ? `${symbol} ` : symbol;
  return `${symbolPrefix}${formattedNumber}`;
}

/**
 * Cleanly formats a currency code and its symbol without duplication (e.g. 'USD ($)' vs 'AED').
 */
export function formatCurrencyLabel(code?: string | null, symbol?: string | null): string {
  const c = normalizeCurrencyCode(code);
  const meta = GLOBAL_CURRENCIES.find((item) => item.code === c);
  const s = (symbol || meta?.symbol || c).trim();
  if (!s || s === c) return c;
  return `${c} (${s})`;
}
