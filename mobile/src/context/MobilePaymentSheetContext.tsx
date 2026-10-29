import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  MobilePaymentSheetModal,
  PaymentSheetRequest,
} from '../components/MobilePaymentSheetModal';
import { registerPaymentSheetLauncher } from '../lib/payments';

interface MobilePaymentSheetContextType {
  openPaymentSheet: (request: PaymentSheetRequest) => void;
  closePaymentSheet: () => void;
  isSheetOpen: boolean;
}

const MobilePaymentSheetContext = createContext<MobilePaymentSheetContextType | undefined>(
  undefined
);

export const MobilePaymentSheetProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeRequest, setActiveRequest] = useState<PaymentSheetRequest | null>(null);

  const openPaymentSheet = useCallback((request: PaymentSheetRequest) => {
    setActiveRequest(request);
  }, []);

  const closePaymentSheet = useCallback(() => {
    setActiveRequest(null);
  }, []);

  // Register global launcher hook with payments library
  useEffect(() => {
    registerPaymentSheetLauncher(openPaymentSheet);
    return () => {
      registerPaymentSheetLauncher(null);
    };
  }, [openPaymentSheet]);

  return (
    <MobilePaymentSheetContext.Provider
      value={{
        openPaymentSheet,
        closePaymentSheet,
        isSheetOpen: Boolean(activeRequest),
      }}
    >
      {children}
      <MobilePaymentSheetModal
        visible={Boolean(activeRequest)}
        request={activeRequest}
        onClose={closePaymentSheet}
      />
    </MobilePaymentSheetContext.Provider>
  );
};

export const useMobilePaymentSheet = () => {
  const context = useContext(MobilePaymentSheetContext);
  if (!context) {
    throw new Error('useMobilePaymentSheet must be used within a MobilePaymentSheetProvider');
  }
  return context;
};
