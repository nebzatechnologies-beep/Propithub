import React from 'react';
import { SafeAreaView as ContextSafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';

/**
 * Drop-in replacement for react-native's SafeAreaView, which does nothing on Android.
 * Applies real status-bar / notch insets on the top and sides; the bottom is left to the tab bar.
 */
export const SafeAreaView: React.FC<SafeAreaViewProps> = ({ edges, ...rest }) => (
  <ContextSafeAreaView edges={edges ?? ['top', 'left', 'right']} {...rest} />
);

export default SafeAreaView;
