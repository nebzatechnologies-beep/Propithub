/**
 * Default payment gateway for owner -> platform (subscription / boost) payments:
 * Razorpay first for owners in India, PayPal first everywhere else.
 */
export type BillingGatewayKey = 'stripe' | 'razorpay' | 'paypal' | 'easebuzz';

const isIndiaName = (c?: string | null) => !!c && /^(india|in|bharat)$/i.test(c.trim());

export function isIndiaOwner(user?: { country?: string } | null, properties?: Array<{ country?: string }>): boolean {
  if (user?.country) return isIndiaName(user.country);
  const propCountry = (properties || []).map((p) => p.country).find(Boolean);
  if (propCountry) return isIndiaName(propCountry);
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta';
  } catch {
    return false;
  }
}

/** Puts the regional default first; the rest keep their existing order. Gateways the admin disabled are simply absent. */
export function sortGatewaysByRegion<T extends { key: BillingGatewayKey }>(list: T[], india: boolean): T[] {
  const first: BillingGatewayKey = india ? 'razorpay' : 'paypal';
  return [...list].sort((a, b) => (a.key === first ? -1 : 0) - (b.key === first ? -1 : 0));
}
