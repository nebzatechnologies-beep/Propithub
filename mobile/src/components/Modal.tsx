import React from 'react';
import { Modal as RNModal, ModalProps, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DIM = 'rgba(15, 23, 42, 0.5)';

/**
 * Modal that keeps its content clear of the Android status bar, notch and navigation bar.
 * The inset bands are dimmed to match the sheet overlay so the backdrop still looks continuous.
 */
export const Modal: React.FC<ModalProps> = ({ children, transparent, ...rest }) => {
  const insets = useSafeAreaInsets();
  const dim = transparent ? DIM : 'transparent';
  return (
    <RNModal
      transparent={transparent}
      statusBarTranslucent={Platform.OS === 'android'}
      navigationBarTranslucent={Platform.OS === 'android'}
      {...rest}
    >
      <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {children}
      </View>
      {insets.top > 0 && <View pointerEvents="none" style={[styles.band, { top: 0, height: insets.top, backgroundColor: dim }]} />}
      {insets.bottom > 0 && <View pointerEvents="none" style={[styles.band, { bottom: 0, height: insets.bottom, backgroundColor: dim }]} />}
    </RNModal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  band: { position: 'absolute', left: 0, right: 0 },
});

export default Modal;
