import React from 'react';
import { Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken screen shows a recovery page instead of closing the app.
 * The message is shown on screen so testers can screenshot it for a bug report.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('[AppErrorBoundary]', error?.message, info?.componentStack?.slice(0, 600));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: '#64748B', marginBottom: 16 }}>
          Your data is safe. Tap Try again to continue.
        </Text>
        <ScrollView style={{ maxHeight: 160, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <Text selectable style={{ fontSize: 12, color: '#334155' }}>{String(error?.message || error).slice(0, 500)}</Text>
        </ScrollView>
        <TouchableOpacity
          onPress={() => this.setState({ error: null })}
          style={{ backgroundColor: '#059669', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

let installed = false;
/** Stops uncaught JS errors in event handlers from closing the app; shows the message instead. */
export const installGlobalErrorHandler = () => {
  if (installed || Platform.OS === 'web') return;
  const g: any = global as any;
  const utils = g.ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  installed = true;
  const previous = utils.getGlobalHandler?.();
  let lastShown = 0;
  utils.setGlobalHandler((error: any, isFatal?: boolean) => {
    if (__DEV__ && previous) {
      previous(error, isFatal);
      return;
    }
    console.warn('[GlobalError]', isFatal ? 'fatal' : 'non-fatal', error?.message);
    const now = Date.now();
    if (now - lastShown > 4000) {
      lastShown = now;
      Alert.alert('Something went wrong', String(error?.message || error).slice(0, 300));
    }
  });
};
