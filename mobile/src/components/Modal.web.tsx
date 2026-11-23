import React, { useEffect, useRef, useState } from 'react';
import { ModalProps, View } from 'react-native';
import { createPortal } from 'react-dom';

// Web build only: react-native-web stacks modals by mount order, so a confirmation dialog opened
// from inside a sheet would render behind it. This version stacks strictly by open order.
let stackCounter = 10000;

export const Modal: React.FC<ModalProps> = ({ visible, children, onRequestClose }) => {
  const [z, setZ] = useState(stackCounter);
  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) setZ(++stackCounter);
    wasVisible.current = !!visible;
  }, [visible]);

  useEffect(() => {
    if (!visible || !onRequestClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (onRequestClose as any)();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onRequestClose]);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <View
      style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: z, display: 'flex' }}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </View>,
    document.body
  );
};

export default Modal;
