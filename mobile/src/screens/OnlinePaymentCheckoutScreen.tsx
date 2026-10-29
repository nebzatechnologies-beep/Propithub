import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import {
  launchRazorpayPayment,
  launchStripePayment,
  launchPayPalPayment,
  launchEasebuzzPayment,
} from '../lib/payments';
import { dispatchRentPaymentReceiptEmail } from '../lib/receiptMailer';
import { calculateMobileInvoiceLateFee } from '../lib/lateFeeService';
import { useMobileTheme } from '../context/MobileThemeContext';
import { MobilePaymentTransaction } from '../types';

export const OnlinePaymentCheckoutScreen: React.FC<{ onBack?: () => void; onSuccess?: () => void }> = ({
  onBack,
  onSuccess,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, markInvoicePaid, recordPayment, logCommunication, updateAgreementAutopay } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();

  const unpaidInvoices = state.invoices.filter((i) => i.status !== 'paid');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(
    unpaidInvoices[0]?.id || state.invoices[0]?.id || ''
  );
  const [enableAutopay, setEnableAutopay] = useState(false);
  const rawSelectedInvoice = state.invoices.find((i) => i.id === selectedInvoiceId) || state.invoices[0];

  const selectedInvoice = useMemo(() => {
    if (!rawSelectedInvoice) return rawSelectedInvoice;
    if (rawSelectedInvoice.lateFeeWaived) {
      return {
        ...rawSelectedInvoice,
        lateFeeApplied: 0,
        total: (rawSelectedInvoice.amount || 0) + (rawSelectedInvoice.tax || 0),
      };
    }
    const ownerSettings = rawSelectedInvoice.ownerId ? state.ownerSettings[rawSelectedInvoice.ownerId] : undefined;
    const effectiveLateFeeSettings = ownerSettings?.lateFeeConfig || state.lateFeeSettings;
    const lateFeeRes = calculateMobileInvoiceLateFee(rawSelectedInvoice, effectiveLateFeeSettings);
    if (lateFeeRes.accruedLateFee > 0) {
      return {
        ...rawSelectedInvoice,
        lateFeeApplied: lateFeeRes.accruedLateFee,
        lateFeeCalculation: lateFeeRes.ruleDescription,
        total: (rawSelectedInvoice.amount || 0) + (rawSelectedInvoice.tax || 0) + lateFeeRes.accruedLateFee,
      };
    }
    return rawSelectedInvoice;
  }, [rawSelectedInvoice, state.lateFeeSettings, state.ownerSettings]);

  const [paymentRail, setPaymentRail] = useState<
    'easebuzz' | 'razorpay' | 'stripe' | 'paypal' | 'upi' | 'card' | 'netbanking'
  >('easebuzz');
  const [selectedUpiApp, setSelectedUpiApp] = useState<'gpay' | 'phonepe' | 'paytm'>('gpay');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const [lastTxnId, setLastTxnId] = useState('');
  const [lastRailLabel, setLastRailLabel] = useState('');

  const finalizePayment = async (txnId: string, railLabel: string) => {
    if (!selectedInvoice) return;
    setLastTxnId(txnId);
    setLastRailLabel(railLabel);

    const paymentDoc: MobilePaymentTransaction = {
      id: txnId,
      invoiceId: selectedInvoice.id,
      ownerId: selectedInvoice.ownerId || '',
      tenant: selectedInvoice.tenant || user?.displayName || 'Resident',
      tenantId: selectedInvoice.tenantId || user?.id || '',
      unit: selectedInvoice.unit,
      propertyName: selectedInvoice.propertyName || 'Property',
      amount: selectedInvoice.total,
      currency: selectedInvoice.currency || viewCurrency,
      date: new Date().toISOString().split('T')[0],
      dueDate: selectedInvoice.due,
      method: railLabel,
      type: 'rent',
      status: 'paid',
      referenceNo: txnId,
    };

    // 1. Record real transaction in ledger state & Firestore
    recordPayment(paymentDoc);
    markInvoicePaid(selectedInvoice.id, railLabel, txnId, {
      lateFeeApplied: selectedInvoice.lateFeeApplied,
      lateFeeCalculation: selectedInvoice.lateFeeCalculation,
      finalTotal: selectedInvoice.total,
    });

    // 1b. Register Autopay Mandate if tenant opted-in
    if (enableAutopay) {
      const leaseId =
        selectedInvoice.leaseAgreementId ||
        (selectedInvoice as any).agreementId ||
        (state.agreements || []).find(
          (a) =>
            (a.tenantId === selectedInvoice.tenantId || a.tenantId === user?.id) &&
            (!selectedInvoice.propertyId || !a.propertyId || a.propertyId === selectedInvoice.propertyId) &&
            (a.unit === selectedInvoice.unit || a.id === selectedInvoice.unit)
        )?.id;
      if (leaseId) {
        const activeGw = (paymentRail === 'easebuzz' ? 'easebuzz' : paymentRail === 'razorpay' ? 'razorpay' : paymentRail === 'stripe' ? 'stripe' : 'paypal') as any;
        updateAgreementAutopay(leaseId, {
          activeGateway: activeGw,
          mandateId: `mandate_${activeGw}_${Date.now()}`,
          status: 'active',
          paymentMethodDisplay: `${activeGw.toUpperCase()} AutoPay`,
          rentAmount: selectedInvoice.total,
          currency: selectedInvoice.currency || viewCurrency,
          nextDebitDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        }).catch(console.warn);
      }
    }

    // 2. Automated Confirmation Email with Receipt attached to BOTH Tenant & Owner
    dispatchRentPaymentReceiptEmail({
      invoice: selectedInvoice,
      payment: paymentDoc,
      tenantEmail: user?.email,
      tenantName: user?.displayName || selectedInvoice.tenant,
      tenantId: user?.id,
      currencySymbol: selectedInvoice.currency,
    }).catch(console.warn);

    // 3. Multi-channel Notification and Audit Logging
    logCommunication({
      type: 'PAYMENT_RECEIVED',
      category: 'rent',
      title: `Rent Payment Settled: Unit ${selectedInvoice.unit}`,
      body: `Payment of ${format(selectedInvoice.total, selectedInvoice.currency || viewCurrency)} settled via ${railLabel}. Transaction Ref: ${txnId}.`,
      channels: ['in_app', 'email', 'sms'],
      recipientId: selectedInvoice.tenantId || user?.id || '',
      recipientName: user?.displayName || selectedInvoice.tenant || 'Resident',
      recipientRole: 'tenant',
      recipientContact: {
        email: user?.email,
        phone: user?.phone,
      },
      senderId: selectedInvoice.ownerId || 'system',
      senderName: 'Property Owner',
      senderRole: 'owner',
      unitNumber: selectedInvoice.unit,
      propertyName: selectedInvoice.propertyName,
      relatedEntityId: txnId,
      deliveryStatus: {
        inApp: 'delivered',
        email: user?.email ? 'delivered' : 'skipped',
        sms: user?.phone ? 'delivered' : 'skipped',
      },
    }).catch(console.warn);

    setIsProcessing(false);
    setIsPaidSuccess(true);
  };

  const handlePay = async () => {
    if (!selectedInvoice) return;
    setIsProcessing(true);

    const payAmount = selectedInvoice.total;
    const invCurr = selectedInvoice.currency || 'USD';
    const ownerMethods = (selectedInvoice.ownerId && state.ownerSettings[selectedInvoice.ownerId]?.paymentMethods) || state.paymentMethods || {};

    // 1. Easebuzz Live Production Gateway
    if (paymentRail === 'easebuzz' || paymentRail === 'netbanking') {
      const ebKey = ownerMethods.easebuzz?.merchantKey || state.platformGateways.easebuzz?.merchantKey || '';
      const ebSalt = ownerMethods.easebuzz?.salt || state.platformGateways.easebuzz?.salt || '';
      if (!ebKey || ebKey === 'LIVE_EBZ_PROD') {
        // If netbanking requested and Easebuzz not configured, try Razorpay
        if (paymentRail === 'netbanking' && (ownerMethods.razorpay?.keyId || state.platformGateways.razorpay?.keyId)) {
          const rzpKey = ownerMethods.razorpay?.keyId || state.platformGateways.razorpay?.keyId || '';
          await launchRazorpayPayment({
            keyId: rzpKey,
            amount: payAmount,
            currency: invCurr,
            name: 'Propithub Rent Settlement',
            description: `Rent for Unit ${selectedInvoice.unit} (NetBanking)`,
            paymentRecordId: selectedInvoice.id,
            customerName: user?.displayName || selectedInvoice.tenant,
            customerEmail: user?.email,
            customerPhone: user?.phone,
            ownerId: selectedInvoice.ownerId,
            onSuccess: (res) => {
              finalizePayment(res.paymentId, 'NetBanking (Razorpay)');
            },
            onError: (err) => {
              setIsProcessing(false);
              Alert.alert('NetBanking Notice', err);
            },
          });
          return;
        }

        setIsProcessing(false);
        Alert.alert(
          'Gateway Key Missing',
          'Live merchant credentials are not configured for this payment method. Please configure your payment gateway in Platform Settings.'
        );
        return;
      }
      await launchEasebuzzPayment({
        merchantKey: ebKey,
        salt: ebSalt,
        amount: payAmount,
        currency: invCurr,
        name: 'Propithub Rent Settlement',
        description: `Unit ${selectedInvoice.unit} Rent`,
        paymentRecordId: selectedInvoice.id,
        customerName: user?.displayName || selectedInvoice.tenant,
        customerEmail: user?.email,
        customerPhone: user?.phone,
        ownerId: selectedInvoice.ownerId,
        onSuccess: (res) => {
          finalizePayment(res.paymentId || res.txnid, 'Easebuzz (Live Production)');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('Easebuzz Notice', err);
        },
      });
      return;
    }

    // 3. Razorpay Official Gateway
    if (paymentRail === 'razorpay') {
      const rzpKey = ownerMethods.razorpay?.keyId || state.platformGateways.razorpay?.keyId || '';
      if (!rzpKey || rzpKey === 'rzp_live_sample' || rzpKey === 'rzp_test_sample') {
        setIsProcessing(false);
        Alert.alert(
          'Razorpay Key Missing',
          'Please configure a live Razorpay Key ID in Gateway Settings to process payments.'
        );
        return;
      }
      await launchRazorpayPayment({
        keyId: rzpKey,
        amount: payAmount,
        currency: invCurr,
        name: 'Propithub Rent Settlement',
        description: `Rent for Unit ${selectedInvoice.unit}`,
        paymentRecordId: selectedInvoice.id,
        customerName: user?.displayName || selectedInvoice.tenant,
        customerEmail: user?.email,
        customerPhone: user?.phone,
        ownerId: selectedInvoice.ownerId,
        onSuccess: (res) => {
          finalizePayment(res.paymentId, 'Razorpay');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('Razorpay Notice', err);
        },
      });
      return;
    }

    // 4. Stripe 256-Bit SSL Rail or Card
    if (paymentRail === 'stripe' || paymentRail === 'card') {
      const stripePub = ownerMethods.stripe?.pubKey || (ownerMethods.stripe as any)?.publishableKey || state.platformGateways.stripe?.pubKey || '';
      if (!stripePub || stripePub === 'pk_live_sample' || stripePub === 'pk_test_sample') {
        // Fallback to Razorpay Card if Razorpay is configured
        const rzpKey = ownerMethods.razorpay?.keyId || state.platformGateways.razorpay?.keyId || '';
        if (rzpKey && rzpKey !== 'rzp_live_sample' && rzpKey !== 'rzp_test_sample') {
          await launchRazorpayPayment({
            keyId: rzpKey,
            amount: payAmount,
            currency: invCurr,
            name: 'Propithub Rent Settlement',
            description: `Rent for Unit ${selectedInvoice.unit} (Card)`,
            paymentRecordId: selectedInvoice.id,
            customerName: user?.displayName || selectedInvoice.tenant,
            customerEmail: user?.email,
            customerPhone: user?.phone,
            ownerId: selectedInvoice.ownerId,
            onSuccess: (res) => {
              finalizePayment(res.paymentId, 'Card (Razorpay)');
            },
            onError: (err) => {
              setIsProcessing(false);
              Alert.alert('Card Payment Notice', err);
            },
          });
          return;
        }

        setIsProcessing(false);
        Alert.alert(
          'Card Gateway Not Configured',
          'Please configure live Stripe Publishable Key or Razorpay keys in Gateway Settings to process card payments.'
        );
        return;
      }
      await launchStripePayment({
        publishableKey: stripePub,
        amount: payAmount,
        currency: invCurr,
        paymentRecordId: selectedInvoice.id,
        customerName: user?.displayName || selectedInvoice.tenant,
        customerEmail: user?.email,
        ownerId: selectedInvoice.ownerId,
        role: 'tenant',
        onSuccess: (res) => {
          finalizePayment(res.paymentIntentId, 'Stripe Card');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('Stripe Notice', err);
        },
      });
      return;
    }

    // 5. PayPal Global Checkout
    if (paymentRail === 'paypal') {
      const ppClientId = ownerMethods.paypal?.clientId || state.platformGateways.paypal?.clientId || '';
      if (!ppClientId || ppClientId === 'paypal_live_sample') {
        setIsProcessing(false);
        Alert.alert(
          'PayPal Client ID Missing',
          'PayPal credentials are not configured for this property. Please configure live credentials in Platform Settings.'
        );
        return;
      }
      await launchPayPalPayment({
        clientId: ppClientId,
        amount: payAmount,
        currency: 'USD',
        name: 'Propithub Rent Settlement',
        description: `Rent for Unit ${selectedInvoice.unit}`,
        paymentRecordId: selectedInvoice.id,
        customerEmail: user?.email,
        ownerId: selectedInvoice.ownerId,
        onSuccess: (res) => {
          finalizePayment(res.paymentId, 'PayPal');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('PayPal Notice', err);
        },
      });
      return;
    }

    // 6. Direct UPI
    if (paymentRail === 'upi') {
      const upiId = ownerMethods.upi?.upiId;
      if (upiId) {
        const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(ownerMethods.upi?.merchantName || 'Property Owner')}&am=${payAmount}&cu=INR&tn=${encodeURIComponent(`Rent Unit ${selectedInvoice.unit}`)}`;
        setIsProcessing(false);
        Linking.openURL(upiUrl).catch(() => {
          Alert.alert('UPI App', `Could not open UPI app automatically. Please transfer to ${upiId} and provide the reference to your landlord.`);
        });
        return;
      }

      // If Razorpay available, launch Razorpay UPI
      const rzpKey = ownerMethods.razorpay?.keyId || state.platformGateways.razorpay?.keyId || '';
      if (rzpKey && rzpKey !== 'rzp_live_sample' && rzpKey !== 'rzp_test_sample') {
        await launchRazorpayPayment({
          keyId: rzpKey,
          amount: payAmount,
          currency: invCurr,
          name: 'Propithub Rent Settlement',
          description: `Rent for Unit ${selectedInvoice.unit} (UPI)`,
          paymentRecordId: selectedInvoice.id,
          customerName: user?.displayName || selectedInvoice.tenant,
          customerEmail: user?.email,
          customerPhone: user?.phone,
          ownerId: selectedInvoice.ownerId,
          onSuccess: (res) => {
            finalizePayment(res.paymentId, 'UPI (Razorpay)');
          },
          onError: (err) => {
            setIsProcessing(false);
            Alert.alert('UPI Payment Notice', err);
          },
        });
        return;
      }

      setIsProcessing(false);
      Alert.alert('UPI Not Configured', 'No UPI VPA or online UPI gateway configured for this property.');
      return;
    }

    setIsProcessing(false);
    Alert.alert('Invalid Method', 'Please select a valid payment method.');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Standard Dynamic Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="shield" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Online Payment Checkout</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isPaidSuccess ? (
          <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Ionicons name="checkmark-circle" size={60} color="#10B981" />
            <Text style={[styles.successTitle, { color: colors.navy }]}>Payment Completed! 🎉</Text>
            <Text style={[styles.successSub, { color: colors.inkSoft }]}>
              {format(selectedInvoice?.total || 0, selectedInvoice?.currency || viewCurrency)} settled successfully. Official receipt emailed to resident and landlord.
            </Text>

            <View style={[styles.receiptBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptKey, { color: colors.inkSoft }]}>Invoice ID</Text>
                <Text style={[styles.receiptVal, { color: colors.navy }]}>{selectedInvoice?.id}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptKey, { color: colors.inkSoft }]}>Apartment</Text>
                <Text style={[styles.receiptVal, { color: colors.navy }]}>Unit {selectedInvoice?.unit} • {selectedInvoice?.propertyName}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptKey, { color: colors.inkSoft }]}>Paid By</Text>
                <Text style={[styles.receiptVal, { color: colors.navy }]}>{selectedInvoice?.tenant || user?.displayName}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptKey, { color: colors.inkSoft }]}>Transaction Ref</Text>
                <Text style={[styles.receiptVal, { fontFamily: 'monospace', fontWeight: '700', color: colors.navy }]}>{lastTxnId}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptKey, { color: colors.inkSoft }]}>Payment Method</Text>
                <Text style={[styles.receiptVal, { color: '#0D9488', fontWeight: '700' }]}>
                  {lastRailLabel}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptKey, { color: colors.inkSoft }]}>Settlement Status</Text>
                <Text style={[styles.receiptVal, { color: '#059669', fontWeight: '700' }]}>
                  ✓ Settled & Recorded to Ledger
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => {
                if (onSuccess) onSuccess();
                else if (onBack) onBack();
              }}
            >
              <Text style={styles.doneBtnText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {/* Invoice Picker Card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={[styles.cardTitle, { color: colors.navy }]}>1. Select Bill for Payment</Text>
              <Text style={[styles.cardSub, { color: colors.inkSoft }]}>
                {unpaidInvoices.length > 0
                  ? `${unpaidInvoices.length} outstanding invoice(s) found`
                  : 'All current invoices are settled'}
              </Text>

              {state.invoices.map((inv) => {
                const isSelected = inv.id === selectedInvoiceId;
                const isPaid = inv.status === 'paid';
                return (
                  <TouchableOpacity
                    key={inv.id}
                    style={[
                      styles.invoiceCard,
                      { backgroundColor: colors.surfaceSunken, borderColor: colors.line },
                      isSelected && [styles.invoiceCardActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                    ]}
                    onPress={() => setSelectedInvoiceId(inv.id)}
                    disabled={isPaid}
                  >
                    <View style={styles.invTop}>
                      <View>
                        <Text style={[styles.invTitle, { color: colors.navy }]}>{inv.id}</Text>
                        <Text style={[styles.invSub, { color: colors.inkSoft }]}>Unit {inv.unit} • Due: {inv.due}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.invAmount, { color: colors.navy }]}>
                          {format(inv.total, inv.currency || viewCurrency)}
                        </Text>
                        <View
                          style={
                            isPaid
                              ? styles.paidBadge
                              : inv.status === 'overdue'
                              ? [styles.dueBadge, { backgroundColor: '#FEE2E2' }]
                              : styles.dueBadge
                          }
                        >
                          <Text
                            style={
                              isPaid
                                ? styles.paidBadgeText
                                : inv.status === 'overdue'
                                ? [styles.dueBadgeText, { color: '#DC2626' }]
                                : styles.dueBadgeText
                            }
                          >
                            {isPaid ? 'PAID' : inv.status === 'overdue' ? 'OVERDUE' : 'DUE'}
                          </Text>
                        </View>
                        {(inv.lateFeeApplied || 0) > 0 && (
                          <Text style={{ fontSize: 10, color: '#DC2626', fontWeight: '600', marginTop: 2 }}>
                            Incl. fee
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Payment Method Rails */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line, marginTop: 14 }]}>
              <Text style={[styles.cardTitle, { color: colors.navy }]}>2. Choose Payment Rail / Gateway</Text>

              {/* Easebuzz Live Production Gateway Option */}
              <TouchableOpacity
                style={[
                  styles.railOption,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  paymentRail === 'easebuzz' && [styles.railOptionActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                ]}
                onPress={() => setPaymentRail('easebuzz')}
              >
                <View style={styles.railLeft}>
                  <Feather name="shield" size={18} color="#0D9488" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.railTitle, { color: colors.navy }]}>Easebuzz Instant Pay</Text>
                    <Text style={[styles.railSub, { color: colors.inkSoft }]}>UPI, RuPay, All Bank Cards, NetBanking</Text>
                  </View>
                </View>
                <Ionicons
                  name={paymentRail === 'easebuzz' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentRail === 'easebuzz' ? '#0D9488' : colors.inkSoft}
                />
              </TouchableOpacity>

              {/* Razorpay Option */}
              <TouchableOpacity
                style={[
                  styles.railOption,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  paymentRail === 'razorpay' && [styles.railOptionActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                ]}
                onPress={() => setPaymentRail('razorpay')}
              >
                <View style={styles.railLeft}>
                  <Feather name="credit-card" size={18} color="#2563EB" />
                  <View style={{ marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.railTitle, { color: colors.navy }]}>Razorpay Gateway</Text>
                      <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginLeft: 6 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#1D4ED8' }}>OFFICIAL SDK</Text>
                      </View>
                    </View>
                    <Text style={[styles.railSub, { color: colors.inkSoft }]}>Direct Merchant Checkout Rail</Text>
                  </View>
                </View>
                <Ionicons
                  name={paymentRail === 'razorpay' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentRail === 'razorpay' ? '#2563EB' : colors.inkSoft}
                />
              </TouchableOpacity>

              {/* Stripe Option */}
              <TouchableOpacity
                style={[
                  styles.railOption,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  paymentRail === 'stripe' && [styles.railOptionActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                ]}
                onPress={() => setPaymentRail('stripe')}
              >
                <View style={styles.railLeft}>
                  <Feather name="lock" size={18} color="#6366F1" />
                  <View style={{ marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.railTitle, { color: colors.navy }]}>Stripe 256-Bit SSL</Text>
                      <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginLeft: 6 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#4F46E5' }}>GLOBAL CARDS</Text>
                      </View>
                    </View>
                    <Text style={[styles.railSub, { color: colors.inkSoft }]}>International Visa, Mastercard, AMEX</Text>
                  </View>
                </View>
                <Ionicons
                  name={paymentRail === 'stripe' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentRail === 'stripe' ? '#6366F1' : colors.inkSoft}
                />
              </TouchableOpacity>

              {/* PayPal Option */}
              <TouchableOpacity
                style={[
                  styles.railOption,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  paymentRail === 'paypal' && [styles.railOptionActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                ]}
                onPress={() => setPaymentRail('paypal')}
              >
                <View style={styles.railLeft}>
                  <Ionicons name="globe-outline" size={18} color="#0284C7" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.railTitle, { color: colors.navy }]}>PayPal Express Checkout</Text>
                    <Text style={[styles.railSub, { color: colors.inkSoft }]}>Worldwide Multi-Currency Rail</Text>
                  </View>
                </View>
                <Ionicons
                  name={paymentRail === 'paypal' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentRail === 'paypal' ? '#0284C7' : colors.inkSoft}
                />
              </TouchableOpacity>


              {/* UPI Option */}
              <TouchableOpacity
                style={[
                  styles.railOption,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  paymentRail === 'upi' && [styles.railOptionActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                ]}
                onPress={() => setPaymentRail('upi')}
              >
                <View style={styles.railLeft}>
                  <Ionicons name="flash" size={18} color="#10B981" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.railTitle, { color: colors.navy }]}>Instant UPI (Zero Fee)</Text>
                    <Text style={[styles.railSub, { color: colors.inkSoft }]}>Google Pay, PhonePe, Paytm</Text>
                  </View>
                </View>
                <Ionicons
                  name={paymentRail === 'upi' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentRail === 'upi' ? '#10B981' : colors.inkSoft}
                />
              </TouchableOpacity>

              {paymentRail === 'upi' && (
                <View style={styles.upiAppsRow}>
                  {[
                    { key: 'gpay', label: 'Google Pay' },
                    { key: 'phonepe', label: 'PhonePe' },
                    { key: 'paytm', label: 'Paytm UPI' },
                  ].map((app) => (
                    <TouchableOpacity
                      key={app.key}
                      style={[styles.upiAppBtn, { backgroundColor: colors.surface, borderColor: colors.line }, selectedUpiApp === app.key && styles.upiAppBtnActive]}
                      onPress={() => setSelectedUpiApp(app.key as any)}
                    >
                      <Text style={[styles.upiAppText, selectedUpiApp === app.key && styles.upiAppTextActive]}>
                        {app.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Card Option */}
              <TouchableOpacity
                style={[
                  styles.railOption,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  paymentRail === 'card' && [styles.railOptionActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                ]}
                onPress={() => setPaymentRail('card')}
              >
                <View style={styles.railLeft}>
                  <Ionicons name="card" size={18} color="#3B82F6" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.railTitle, { color: colors.navy }]}>Credit / Debit Card</Text>
                    <Text style={[styles.railSub, { color: colors.inkSoft }]}>Visa, Mastercard, RuPay</Text>
                  </View>
                </View>
                <Ionicons
                  name={paymentRail === 'card' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentRail === 'card' ? '#10B981' : colors.inkSoft}
                />
              </TouchableOpacity>

              {/* NetBanking Option */}
              <TouchableOpacity
                style={[
                  styles.railOption,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  paymentRail === 'netbanking' && [styles.railOptionActive, isDark && { backgroundColor: '#0D948815', borderColor: '#0D9488' }],
                ]}
                onPress={() => setPaymentRail('netbanking')}
              >
                <View style={styles.railLeft}>
                  <Ionicons name="business" size={18} color="#8B5CF6" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.railTitle, { color: colors.navy }]}>Net Banking</Text>
                    <Text style={[styles.railSub, { color: colors.inkSoft }]}>HDFC, ICICI, SBI, Axis</Text>
                  </View>
                </View>
                <Ionicons
                  name={paymentRail === 'netbanking' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentRail === 'netbanking' ? '#10B981' : colors.inkSoft}
                />
              </TouchableOpacity>
            </View>

            {/* Total Checkout Bar */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line, marginTop: 14 }]}>
              {((selectedInvoice?.lateFeeApplied || 0) > 0 || selectedInvoice?.lateFeeWaived) && (
                <View style={{ marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, color: colors.inkSoft }}>Base Bill Amount:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>
                      {format(selectedInvoice?.amount || 0, selectedInvoice?.currency || viewCurrency)}
                    </Text>
                  </View>
                  {(selectedInvoice?.tax || 0) > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.inkSoft }}>Tax / GST:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>
                        +{format(selectedInvoice?.tax || 0, selectedInvoice?.currency || viewCurrency)}
                      </Text>
                    </View>
                  )}
                  {(selectedInvoice?.lateFeeApplied || 0) > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>
                        Late Fee Penalty ({selectedInvoice?.lateFeeCalculation || 'Overdue'}):
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                        +{format(selectedInvoice?.lateFeeApplied || 0, selectedInvoice?.currency || viewCurrency)}
                      </Text>
                    </View>
                  )}
                  {selectedInvoice?.lateFeeWaived && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '600' }}>
                        Late Fee Penalty:
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#16A34A' }}>
                        Waived by Landlord
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Autopay Opt-in Checkbox */}
              {selectedInvoice?.leaseAgreementId && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    backgroundColor: enableAutopay ? 'rgba(197, 160, 89, 0.08)' : (isDark ? colors.surfaceSunken : '#F8FAFC'),
                    borderWidth: 1,
                    borderColor: enableAutopay ? colors.brass : colors.line,
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                  onPress={() => setEnableAutopay(!enableAutopay)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={enableAutopay ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={enableAutopay ? colors.brass : colors.inkSoft}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.navy }}>
                      Save as Active Mandate for Monthly Autopay
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 1 }}>
                      48h advance WhatsApp alert sent before each debit • Skip if paid early
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              <View style={styles.checkoutTotalRow}>
                <View>
                  <Text style={[styles.checkoutLabel, { color: colors.inkSoft }]}>TOTAL AMOUNT</Text>
                  <Text style={[styles.checkoutVal, { color: colors.navy }]}>
                    {format(selectedInvoice?.total || 0, selectedInvoice?.currency || viewCurrency)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.payNowBtn, isProcessing && { opacity: 0.7 }]}
                  onPress={handlePay}
                  disabled={isProcessing || selectedInvoice?.status === 'paid'}
                >
                  <Text style={styles.payNowBtnText}>
                    {isProcessing ? 'Connecting...' : `Pay ${format(selectedInvoice?.total || 0, selectedInvoice?.currency || viewCurrency)}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.navy,
  },
  headerSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  cardSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
    marginBottom: 12,
  },
  invoiceCard: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    marginTop: 8,
  },
  invoiceCardActive: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
  },
  invTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  invSub: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  invAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.navy,
  },
  paidBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  dueBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  dueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  railOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    marginTop: 10,
    backgroundColor: colors.surface,
  },
  railOptionActive: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
  },
  railLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  railTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  railSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  upiAppsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginLeft: 36,
  },
  upiAppBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  upiAppBtnActive: {
    borderColor: '#10B981',
    backgroundColor: '#DCFCE7',
  },
  upiAppText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  upiAppTextActive: {
    color: '#166534',
  },
  checkoutTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkoutLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  checkoutVal: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.navy,
    marginTop: 2,
  },
  payNowBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  payNowBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 20,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    marginTop: 12,
  },
  successSub: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  receiptBox: {
    width: '100%',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  receiptKey: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  receiptVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  doneBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
