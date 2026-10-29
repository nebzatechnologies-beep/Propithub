import { Linking, Alert } from 'react-native';

export interface ParsedDeepLink {
  scheme: string;
  path: string;
  params: Record<string, string>;
  rawUrl: string;
}

export function parseDeepLink(url: string): ParsedDeepLink | null {
  if (!url) return null;
  try {
    const schemeMatch = url.match(/^([a-zA-Z0-9+.-]+):\/\//);
    const scheme = schemeMatch ? schemeMatch[1] : '';
    const withoutScheme = schemeMatch ? url.slice(schemeMatch[0].length) : url;
    const [pathPart, queryPart] = withoutScheme.split('?');
    const path = pathPart.replace(/^\/+|\/+$/g, '');

    const params: Record<string, string> = {};
    if (queryPart) {
      queryPart.split('&').forEach((pair) => {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }

    return {
      scheme,
      path,
      params,
      rawUrl: url,
    };
  } catch {
    return null;
  }
}

/**
 * Initializes deep link listener for native iOS / Android and browser URL switches
 */
export function initializeDeepLinking(
  onNavigateToScreen?: (screenKey: string, params?: Record<string, string>) => void
): () => void {
  const handleUrl = (url: string | null) => {
    if (!url) return;
    const parsed = parseDeepLink(url);
    if (!parsed) return;

    // Handle payment return redirects
    if (parsed.path === 'payment-callback' || parsed.path.includes('payment')) {
      Alert.alert(
        'Payment Verified ✓',
        'Your transaction was processed. Your financial records and tenancy ledger have been updated.'
      );
      if (onNavigateToScreen) {
        onNavigateToScreen('financial_ledger', parsed.params);
      }
      return;
    }

    // Direct routing for invoices, agreements, or units
    if (parsed.path === 'invoice' || parsed.params.invoiceId) {
      if (onNavigateToScreen) {
        onNavigateToScreen('financial_ledger', parsed.params);
      }
      return;
    }

    if (parsed.path === 'lease' || parsed.params.agreementId) {
      if (onNavigateToScreen) {
        onNavigateToScreen('tenant_lease', parsed.params);
      }
      return;
    }

    if (parsed.path === 'legal' || parsed.path === 'policies') {
      if (onNavigateToScreen) {
        onNavigateToScreen('legal_policies', parsed.params);
      }
      return;
    }
  };

  // Check initial URL (when app was opened via link)
  Linking.getInitialURL().then(handleUrl).catch((err) => {
    console.warn('[DeepLinking] getInitialURL error:', err);
  });

  // Listen for links while app is open or in background
  const subscription = Linking.addEventListener('url', (event) => {
    handleUrl(event.url);
  });

  return () => {
    subscription.remove();
  };
}
