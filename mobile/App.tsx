import './src/lib/polyfills';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Ionicons,
  Feather,
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome,
  FontAwesome5,
} from '@expo/vector-icons';
import { RootNavigator } from './src/navigation/RootNavigator';
import { MobileAppDataProvider } from './src/context/MobileAppDataContext';
import { MobileAuthProvider } from './src/context/MobileAuthContext';
import { MobileCurrencyProvider } from './src/context/MobileCurrencyContext';
import { MobileToastProvider } from './src/context/MobileToastContext';
import { MobileAlertProvider } from './src/context/MobileAlertContext';

import { MobileThemeProvider, useMobileTheme } from './src/context/MobileThemeContext';
import { MobilePaymentSheetProvider } from './src/context/MobilePaymentSheetContext';
import { initializeDeepLinking } from './src/lib/deepLinking';
import { MobileTourProvider } from './src/context/MobileTourContext';

function ThemedApp() {
  const { isDark, colors } = useMobileTheme();

  useEffect(() => {
    const cleanup = initializeDeepLinking();
    return () => cleanup();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <MobileToastProvider>
        <MobileAlertProvider>
          <MobileAuthProvider>
            <MobileCurrencyProvider>
              <MobileAppDataProvider>
                <MobilePaymentSheetProvider>
                  <MobileTourProvider>
                    <RootNavigator initialRole="owner" />
                  </MobileTourProvider>
                </MobilePaymentSheetProvider>
              </MobileAppDataProvider>
            </MobileCurrencyProvider>
          </MobileAuthProvider>
        </MobileAlertProvider>
      </MobileToastProvider>
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
    ...MaterialIcons.font,
    ...MaterialCommunityIcons.font,
    ...FontAwesome.font,
    ...FontAwesome5.font,
  });
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      let link = document.getElementById('propithub-fonts') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.id = 'propithub-fonts';
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap';
        document.head.appendChild(link);
      }

      let style = document.getElementById('propithub-typography') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = 'propithub-typography';
        document.head.appendChild(style);
      }

      // DO NOT override vector icon font families (Feather, Ionicons, etc.)
      style.textContent = `
        html, body, #root, [data-testid="root"] {
          font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        input, textarea, select, [contenteditable="true"] {
          outline: none !important;
          outline-style: none !important;
          box-shadow: none !important;
        }
      `;
    }
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <MobileThemeProvider>
        <ThemedApp />
      </MobileThemeProvider>
    </SafeAreaProvider>
  );
}
