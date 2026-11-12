import React from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import {
  getCurrencySymbol,
  normalizeCurrencyCode,
  formatCurrencyAmount,
} from '../../lib/currencyService';

interface CurrencyAmountProps {
  amount: number | null | undefined;
  currency?: string | null;
  className?: string;
  style?: React.CSSProperties;
  showOriginalTooltip?: boolean;
}

/**
 * Clean Single-Number Currency Display
 * - When viewCurrency is "LOCAL" or matches the item's currency: displays single native amount (e.g. ₹2,500).
 * - When viewCurrency is another currency (e.g. GBP): converts and displays ONLY that currency (e.g. £19.91)
 *   with an accessible tooltip showing the original contract amount ("Original: ₹2,500 INR").
 */
export const CurrencyAmount: React.FC<CurrencyAmountProps> = ({
  amount,
  currency,
  className,
  style,
  showOriginalTooltip = true,
}) => {
  const { viewCurrency, convert, format } = useCurrency();
  const rawAmt = typeof amount === 'number' && !isNaN(amount) ? amount : (Number(amount) || 0);
  const rawCode = normalizeCurrencyCode(currency || 'USD');
  const rawSym = getCurrencySymbol(rawCode);

  const isLocalView = !viewCurrency || viewCurrency === 'LOCAL' || viewCurrency === 'DEFAULT';
  const isConverted = !isLocalView && normalizeCurrencyCode(viewCurrency) !== rawCode;

  if (isConverted) {
    const convertedVal = convert(rawAmt, rawCode, viewCurrency);
    const hasDecimals = convertedVal % 1 !== 0;
    const formattedConverted = format(convertedVal, viewCurrency, {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    });

    const originalFormatted = `${rawSym}${rawAmt.toLocaleString(rawCode === 'INR' ? 'en-IN' : 'en-US')}`;
    const tooltip = showOriginalTooltip ? `Original: ${originalFormatted} ${rawCode}` : undefined;

    return (
      <span className={className} style={style} title={tooltip}>
        {formattedConverted}
      </span>
    );
  }

  // Native / Local currency display (Single clean number)
  const formattedNative = `${rawSym}${rawAmt.toLocaleString(rawCode === 'INR' ? 'en-IN' : 'en-US')}`;
  return (
    <span className={className} style={style}>
      {formattedNative}
    </span>
  );
};

/**
 * Returns a dynamic column header label that automatically appends the active viewing currency code.
 * e.g. getTableCurrencyHeader("Rent", "GBP") => "Rent (GBP)"
 *      getTableCurrencyHeader("Rent", "LOCAL") => "Rent"
 */
export function getTableCurrencyHeader(baseLabel: string, viewCurrency?: string): string {
  if (!viewCurrency || viewCurrency === 'LOCAL' || viewCurrency === 'DEFAULT') {
    return baseLabel;
  }
  return `${baseLabel} (${viewCurrency})`;
}
