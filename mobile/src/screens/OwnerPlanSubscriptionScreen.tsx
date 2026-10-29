import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon, PropithubLogo } from '../components/PropithubLogo';
import { useMobileTheme } from '../context/MobileThemeContext';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { MobilePlan, MobilePlatformInvoice } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import {
  launchStripePayment,
  launchRazorpayPayment,
  launchEasebuzzPayment,
  launchPayPalPayment,
} from '../lib/payments';

interface Props {
  onProfilePress?: () => void;
  onNavigate?: (key: string) => void;
  onBack?: () => void;
}

export const OwnerPlanSubscriptionScreen: React.FC<Props> = ({
  onProfilePress,
  onNavigate,
  onBack,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, savePlatformInvoice, saveOwnerSettings, updateOwnerAutopay, cancelOwnerAutopay } = useMobileAppData();
  const { user, updateUserProfile } = useMobileAuth();
  const { convert, format } = useMobileCurrency();
  const {
    ownerId,
    ownerSettings,
    hasActivePaidSubscription,
    isTrial,
    trialEnds,
    daysLeft,
    isExpired,
    isInitialTrialDropout,
    purgeScheduledAt,
    purgeDaysLeft,
    currentPlan,
    currentPlanName,
    usage,
  } = usePlanLimits();

  const [activeTab, setActiveTab] = useState<'plans' | 'invoices'>('plans');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [isChangePaymentMethodOpen, setIsChangePaymentMethodOpen] = useState(false);
  const [selectedPlanName, setSelectedPlanName] = useState<string>('Growth');
  const [selectedGateway, setSelectedGateway] = useState<'stripe' | 'razorpay' | 'paypal' | 'easebuzz'>('easebuzz');
  const [selectedNewGateway, setSelectedNewGateway] = useState<'stripe' | 'razorpay' | 'paypal' | 'easebuzz'>('stripe');
  const [isGatewayDropdownOpen, setIsGatewayDropdownOpen] = useState(false);
  const [isNewGatewayDropdownOpen, setIsNewGatewayDropdownOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<MobilePlatformInvoice | null>(null);
  const [mandateCardName, setMandateCardName] = useState(user?.displayName || 'Owner');
  const [mandateCardNumber, setMandateCardNumber] = useState('');
  const [mandateCardExpiry, setMandateCardExpiry] = useState('');
  const [mandateCardCvv, setMandateCardCvv] = useState('');
  const [mandateRzpSubMode, setMandateRzpSubMode] = useState<'card' | 'upi'>('card');
  const [mandateUpiId, setMandateUpiId] = useState('');
  const [mandateBankName, setMandateBankName] = useState('HDFC Bank');
  const [mandateAccountNum, setMandateAccountNum] = useState('');
  const [mandatePaypalEmail, setMandatePaypalEmail] = useState(user?.email || '');
  const [mandateConsentChecked, setMandateConsentChecked] = useState(true);

  // Available billing gateways detected from SuperAdmin config
  const availableGateways = useMemo(() => {
    const list: Array<{
      key: 'stripe' | 'razorpay' | 'paypal' | 'easebuzz';
      title: string;
      shortTitle: string;
      description: string;
      icon: string;
      badge: string;
      badgeColor: string;
      badgeBg: string;
    }> = [];

    const g = state.platformGateways;

    if (g?.stripe?.enabled !== false) {
      list.push({
        key: 'stripe',
        title: 'Credit / Debit Card',
        shortTitle: 'Credit / Debit Card',
        description: 'Instant SSL-encrypted card payment in USD',
        icon: 'credit-card',
        badge: 'Global Cards',
        badgeColor: '#4F46E5',
        badgeBg: '#EEF2FF',
      });
    }

    if (g?.razorpay?.enabled !== false) {
      list.push({
        key: 'razorpay',
        title: 'Razorpay',
        shortTitle: 'Razorpay',
        description: 'Domestic settlement via UPI, Cards, Netbanking',
        icon: 'credit-card',
        badge: 'UPI & Cards',
        badgeColor: '#16A34A',
        badgeBg: '#DCFCE7',
      });
    }

    if (g?.paypal?.enabled !== false) {
      list.push({
        key: 'paypal',
        title: 'PayPal',
        shortTitle: 'PayPal',
        description: 'Authorize with PayPal balance or linked cards',
        icon: 'globe',
        badge: 'International',
        badgeColor: '#2563EB',
        badgeBg: '#EFF6FF',
      });
    }

    if (g?.easebuzz?.enabled !== false) {
      list.push({
        key: 'easebuzz',
        title: 'Easebuzz Online (UPI, Cards & NetBanking)',
        shortTitle: 'Easebuzz',
        description: 'Instant Indian payment gateway with 100+ payment modes',
        icon: 'shield',
        badge: 'Instant UPI',
        badgeColor: '#059669',
        badgeBg: '#ECFDF5',
      });
    }

    return list;
  }, [state.platformGateways]);

  // Keep selectedGateway in sync
  React.useEffect(() => {
    if (availableGateways.length > 0 && !availableGateways.some((gw) => gw.key === selectedGateway)) {
      setSelectedGateway(availableGateways[0].key);
    }
  }, [availableGateways, selectedGateway]);

  // Commercial plans from state (excluding archived / trial-only) - sorted ascending by price
  const commercialPlans = useMemo(() => {
    return (state.plans || [])
      .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
      .sort((a, b) => a.price - b.price);
  }, [state.plans]);

  // Owner's platform invoices
  const myInvoices = useMemo(() => {
    return (state.platformInvoices || []).filter(
      (inv) =>
        inv.ownerId === ownerId ||
        (user?.id && inv.ownerId === user.id) ||
        (user?.email && inv.ownerEmail?.toLowerCase() === user.email.toLowerCase())
    );
  }, [state.platformInvoices, ownerId, user]);

  const targetPlanObj = useMemo(() => {
    return (
      commercialPlans.find((p) => p.name.toLowerCase() === selectedPlanName.toLowerCase()) ||
      commercialPlans[0]
    );
  }, [commercialPlans, selectedPlanName]);

  const annualDiscount = state.annualDiscountPercent ?? 20;

  const effectivePrice = useMemo(() => {
    if (!targetPlanObj) return 0;
    const base = targetPlanObj.price;
    if (billingCycle === 'annual') {
      const multiplier = (100 - annualDiscount) / 100;
      return Math.round(base * 12 * multiplier);
    }
    return base;
  }, [targetPlanObj, billingCycle, annualDiscount]);

  // Capacity violation check for downgrades
  const downgradeViolations = useMemo(() => {
    if (!targetPlanObj) return [];
    const violations: string[] = [];
    if (targetPlanObj.properties < 999 && usage.properties.used > targetPlanObj.properties) {
      violations.push(`${usage.properties.used} properties (limit: ${targetPlanObj.properties})`);
    }
    if (targetPlanObj.units < 9999 && usage.units.used > targetPlanObj.units) {
      violations.push(`${usage.units.used} units (limit: ${targetPlanObj.units})`);
    }
    if (targetPlanObj.tenants < 9999 && usage.tenants.used > targetPlanObj.tenants) {
      violations.push(`${usage.tenants.used} tenants (limit: ${targetPlanObj.tenants})`);
    }
    if (usage.managers.used > (targetPlanObj.managers ?? 0)) {
      violations.push(`${usage.managers.used} managers (limit: ${targetPlanObj.managers ?? 0})`);
    }
    if (usage.staff.used > (targetPlanObj.staff ?? 0)) {
      violations.push(`${usage.staff.used} staff (limit: ${targetPlanObj.staff ?? 0})`);
    }
    return violations;
  }, [targetPlanObj, usage]);

  const isSamePlanAndCycle = useMemo(() => {
    return Boolean(
      hasActivePaidSubscription &&
      currentPlan &&
      targetPlanObj &&
      targetPlanObj.name.toLowerCase() === currentPlan.name.toLowerCase() &&
      billingCycle === (ownerSettings?.billingCycle || 'monthly')
    );
  }, [hasActivePaidSubscription, currentPlan, targetPlanObj, billingCycle, ownerSettings?.billingCycle]);

  const handleToggleAutoRenew = async () => {
    if (!ownerId) return;
    const currentCancels = Boolean(ownerSettings?.cancelsAtPeriodEnd);
    if (!currentCancels) {
      await cancelOwnerAutopay(ownerId);
      Alert.alert(
        'Autopay Disabled',
        'Auto-renewal cancelled. Account remains active until the end of your billing cycle.'
      );
    } else {
      const activeGw = (ownerSettings?.subscriptionMandate?.activeGateway || 'stripe') as any;
      await updateOwnerAutopay(ownerId, {
        autoRenew: true,
        status: 'active',
        activeGateway: activeGw,
        currentPlanId: currentPlan?.id || 'starter',
        previousActivePlanId: ownerSettings?.previousActivePlanId || currentPlan?.id || 'starter',
        billingCycle: ownerSettings?.billingCycle || 'monthly',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: ownerSettings?.subscriptionEndsAt || new Date(Date.now() + 30 * 86400000).toISOString(),
        displayDetails: `${activeGw.toUpperCase()} Active Billing`,
        failureCount: 0,
        updatedAt: new Date().toISOString(),
      });
      Alert.alert('Auto-Renewal Updated', 'Subscription auto-renewal reactivated.');
    }
  };

  const handleExecuteCheckout = async () => {
    if (!targetPlanObj || !ownerId) return;

    if (isSamePlanAndCycle) {
      Alert.alert(
        'Already Subscribed',
        `You already have an active subscription to the ${targetPlanObj.name} plan on ${billingCycle === 'annual' ? 'an annual' : 'a monthly'} billing cycle.${
          ownerSettings?.subscriptionEndsAt ? ` Active until ${new Date(ownerSettings.subscriptionEndsAt).toLocaleDateString()}.` : ''
        }`
      );
      return;
    }

    if (downgradeViolations.length > 0) {
      Alert.alert(
        'Cannot Switch Tier',
        `Your account currently exceeds the limits of this tier: ${downgradeViolations.join(', ')}. Please delete or archive excess items first.`
      );
      return;
    }

    if (Platform.OS === 'ios') {
      Alert.alert(
        'Enterprise Plan Management',
        'Owner subscription plans are provisioned at the organization account level. Please visit your Propithub Web Dashboard at propithub.app to manage billing and invoices.',
        [{ text: 'OK', onPress: () => setIsChangeModalOpen(false) }]
      );
      return;
    }

    setIsProcessing(true);

    const now = new Date();
    const invoiceId = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const finalizeSubscription = async (transactionRef: string, paymentMethodName: string) => {
      try {
        const isAnnual = billingCycle === 'annual';
        const periodDurationDays = isAnnual ? 365 : 30;
        const expiry = new Date(Date.now() + periodDurationDays * 24 * 60 * 60 * 1000).toISOString();
        const subId = transactionRef || `SUB-${selectedGateway.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

        const newInvoice: MobilePlatformInvoice = {
          id: invoiceId,
          ownerId,
          ownerName: user?.displayName || 'Property Owner',
          ownerEmail: user?.email || '',
          planId: targetPlanObj.id,
          planName: targetPlanObj.name,
          amount: effectivePrice,
          tax: 0,
          total: effectivePrice,
          currency: 'USD',
          status: 'paid',
          issueDate: now.toISOString(),
          dueDate: now.toISOString(),
          paidAt: now.toISOString(),
          periodStart: now.toISOString(),
          periodEnd: expiry,
          billingCycle,
          paymentMethod: paymentMethodName,
          transactionRef: subId,
          notes: `Official platform invoice for ${targetPlanObj.name} plan (${isAnnual ? 'Annual' : 'Monthly'})`,
        };

        // 1. Save Platform Invoice
        await savePlatformInvoice(newInvoice);

        // 2. Update Owner Settings
        const mandate = {
          activeGateway: selectedGateway as any,
          mandateId: subId,
          customerId: ownerId,
          status: 'active' as const,
          autoRenew: true,
          nextBillingDate: expiry,
          billingCycle,
          currentPlanId: targetPlanObj.id,
          planId: targetPlanObj.id,
          planName: targetPlanObj.name,
          amount: effectivePrice,
          currency: 'USD',
          failureCount: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        await saveOwnerSettings(ownerId, {
          planId: targetPlanObj.id,
          planName: targetPlanObj.name,
          planStatus: 'active',
          subscriptionEndsAt: expiry,
          trialEndsAt: null,
          billingCycle,
          autoRenew: true,
          cancelsAtPeriodEnd: false,
          previousActivePlanId: targetPlanObj.id,
          isInitialTrial: false,
          purgeScheduledAt: null,
          subscriptionMandate: mandate,
        });

        // 3. Update User Profile
        if (updateUserProfile) {
          await updateUserProfile({
            plan: targetPlanObj.name as any,
            status: 'active',
          });
        }

        if (isFirebaseConfigured) {
          await setDoc(
            doc(db, 'owners', ownerId),
            {
              planId: targetPlanObj.id,
              planName: targetPlanObj.name,
              planStatus: 'active',
              subscriptionEndsAt: expiry,
              trialEndsAt: null,
              billingCycle,
              autoRenew: true,
              cancelsAtPeriodEnd: false,
              previousActivePlanId: targetPlanObj.id,
              isInitialTrial: false,
              purgeScheduledAt: null,
              subscriptionMandate: mandate,
            },
            { merge: true }
          ).catch(console.warn);

          await setDoc(
            doc(db, 'users', ownerId),
            { plan: targetPlanObj.name, status: 'active' },
            { merge: true }
          ).catch(console.warn);
        }

        setIsProcessing(false);
        setIsChangeModalOpen(false);

        Alert.alert(
          'Subscription Activated! 🎉',
          `Successfully subscribed to ${targetPlanObj.name} plan via ${paymentMethodName}.\n\nYour operational workspace is now fully unlocked!`,
          [
            {
              text: 'Go to Dashboard',
              onPress: () => {
                if (onNavigate) onNavigate('owner_dashboard');
              },
            },
          ]
        );
      } catch (err: any) {
        setIsProcessing(false);
        Alert.alert('Activation Error', err?.message || 'Failed to complete subscription activation.');
      }
    };

    // 1. Stripe Checkout (Real Gateway)
    if (selectedGateway === 'stripe') {
      const stripePub = state.platformGateways?.stripe?.pubKey || '';
      if (!stripePub || stripePub === 'pk_test_sample') {
        setIsProcessing(false);
        Alert.alert(
          'Stripe Key Missing',
          'Please configure your live Stripe Publishable Key in Platform Gateway Settings to accept real card subscriptions.'
        );
        return;
      }
      await launchStripePayment({
        publishableKey: stripePub,
        amount: effectivePrice,
        currency: 'USD',
        paymentRecordId: invoiceId,
        customerName: user?.displayName || 'Property Owner',
        customerEmail: user?.email || '',
        ownerId,
        role: 'owner',
        onSuccess: (res) => {
          finalizeSubscription(res.paymentIntentId, 'Stripe Card');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('Stripe Notice', err);
        },
      });
      return;
    }

    // 3. Razorpay Checkout (Real Gateway)
    if (selectedGateway === 'razorpay') {
      const rzpKey = state.platformGateways?.razorpay?.keyId || '';
      if (!rzpKey || rzpKey === 'rzp_test_sample') {
        setIsProcessing(false);
        Alert.alert(
          'Razorpay Key Missing',
          'Please configure your live Razorpay Key ID in Platform Gateway Settings to accept real UPI/card subscriptions.'
        );
        return;
      }
      const inrAmount = Math.round(convert(effectivePrice, 'USD', 'INR'));
      await launchRazorpayPayment({
        keyId: rzpKey,
        amount: inrAmount,
        currency: 'INR',
        name: `Propithub ${targetPlanObj.name}`,
        description: `Subscription fee for ${targetPlanObj.name} plan`,
        paymentRecordId: invoiceId,
        customerName: user?.displayName || 'Property Owner',
        customerEmail: user?.email || '',
        customerPhone: user?.phone || '',
        ownerId,
        onSuccess: (res) => {
          finalizeSubscription(res.paymentId, 'Razorpay');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('Razorpay Notice', err);
        },
      });
      return;
    }

    // 4. Easebuzz Live Production Gateway (Real Gateway)
    if (selectedGateway === 'easebuzz') {
      const ebKey = state.platformGateways?.easebuzz?.merchantKey || '';
      const ebSalt = state.platformGateways?.easebuzz?.salt || '';
      if (!ebKey || ebKey === 'LIVE_EBZ_PROD') {
        setIsProcessing(false);
        Alert.alert(
          'Easebuzz Key Missing',
          'Please configure your Easebuzz Merchant Key in Platform Gateway Settings.'
        );
        return;
      }
      const inrAmount = Math.round(convert(effectivePrice, 'USD', 'INR'));
      await launchEasebuzzPayment({
        merchantKey: ebKey,
        salt: ebSalt,
        amount: inrAmount,
        currency: 'INR',
        name: `Propithub ${targetPlanObj.name}`,
        description: `Subscription fee for ${targetPlanObj.name} plan`,
        paymentRecordId: invoiceId,
        customerName: user?.displayName || 'Property Owner',
        customerEmail: user?.email || '',
        customerPhone: user?.phone || '',
        ownerId,
        onSuccess: (res) => {
          finalizeSubscription(res.paymentId || res.txnid, 'Easebuzz');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('Easebuzz Notice', err);
        },
      });
      return;
    }

    // 5. PayPal Checkout (Real Gateway)
    if (selectedGateway === 'paypal') {
      const ppClientId = state.platformGateways?.paypal?.clientId || '';
      if (!ppClientId || ppClientId === 'paypal_test_sample') {
        setIsProcessing(false);
        Alert.alert(
          'PayPal Key Missing',
          'Please configure your live PayPal Client ID in Platform Gateway Settings.'
        );
        return;
      }
      await launchPayPalPayment({
        clientId: ppClientId,
        amount: effectivePrice,
        currency: 'USD',
        name: `Propithub ${targetPlanObj.name}`,
        description: `Subscription fee for ${targetPlanObj.name} plan`,
        paymentRecordId: invoiceId,
        customerEmail: user?.email || '',
        ownerId,
        onSuccess: (res) => {
          finalizeSubscription(res.paymentId, 'PayPal');
        },
        onError: (err) => {
          setIsProcessing(false);
          Alert.alert('PayPal Notice', err);
        },
      });
      return;
    }

    setIsProcessing(false);
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.surface }]}>
      {/* Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header matching Helpdesk & Reputation screens */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={[styles.backBtn, isDark && { backgroundColor: '#1E293B' }]} activeOpacity={0.7}>
              <Feather name="arrow-left" size={18} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={[styles.logoBadge, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
            <PropithubIcon size={20} />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Plans</Text>
          </View>
        </View>
        <View style={[styles.ownerBadge, isDark && { backgroundColor: '#1E293B', borderColor: colors.border }]}>
          <Text style={[styles.ownerBadgeText, { color: colors.text }]}>OWNER</Text>
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 15-Day Dropout Permanent Deletion Warning Banner */}
        {isInitialTrialDropout && (
          <View
            style={{
              backgroundColor: '#FEF2F2',
              borderWidth: 1.5,
              borderColor: '#EF4444',
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Feather name="alert-triangle" size={16} color="#DC2626" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>
                Account Deletion Warning: {purgeDaysLeft !== null ? `${purgeDaysLeft}d Remaining` : 'Pending'}
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: '#7F1D1D', lineHeight: 16 }}>
              Your trial expired without an active plan. Unconverted accounts and property photos will be wiped permanently on{' '}
              {purgeScheduledAt ? new Date(purgeScheduledAt).toLocaleDateString() : 'Day 15'}. Choose a plan below to retain your data.
            </Text>
          </View>
        )}

        {/* Support Dark Hero Card - Exact match of Helpdesk screen */}
        <View style={[styles.supportDarkCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.heroEyebrow}>CURRENT SUBSCRIPTION</Text>
              <Text style={[styles.bannerHeading, { color: colors.navy }]} numberOfLines={1}>
                {isTrial ? 'Free Trial' : `${currentPlanName} Plan`}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                hasActivePaidSubscription
                  ? styles.statusBadgeActive
                  : isTrial
                  ? styles.statusBadgeTrial
                  : styles.statusBadgeExpired,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  hasActivePaidSubscription
                    ? styles.statusBadgeTextActive
                    : isTrial
                    ? styles.statusBadgeTextTrial
                    : styles.statusBadgeTextExpired,
                ]}
                numberOfLines={1}
              >
                {hasActivePaidSubscription
                  ? 'ACTIVE PLAN'
                  : isTrial
                  ? `TRIAL (${daysLeft}d left)`
                  : 'EXPIRED'}
              </Text>
            </View>
          </View>

          <Text style={[styles.bannerSub, { color: colors.inkSoft }]}>
            {hasActivePaidSubscription
              ? `Your workspace is active. Renews on ${new Date(
                  ownerSettings?.subscriptionEndsAt || Date.now() + 30 * 86400000
                ).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}.`
              : isTrial
              ? 'You are trialing the Starter tier. Upgrade to Growth or Enterprise to add Managers and expand capacity.'
              : 'Your subscription has ended. Upgrade to an active plan below to restore full operational access.'}
          </Text>

          <View style={styles.heroBtnRow}>
            <TouchableOpacity
              style={styles.raiseTicketBtn}
              onPress={() => {
                setSelectedPlanName(currentPlan?.name || 'Growth');
                setIsChangeModalOpen(true);
              }}
              activeOpacity={0.85}
            >
              <Feather name="arrow-up-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.raiseTicketBtnText}>Change Plan</Text>
            </TouchableOpacity>

            {!isTrial && hasActivePaidSubscription && (
              <TouchableOpacity
                style={styles.cancelRenewBtn}
                onPress={handleToggleAutoRenew}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelRenewBtnText}>
                  {ownerSettings?.cancelsAtPeriodEnd ? 'Reactivate' : 'Cancel Renewal'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Subscription Autopay & Mandate Card */}
        {(() => {
          const activeMandate = ownerSettings?.subscriptionMandate;
          const hasMandate = Boolean(activeMandate?.mandateId || (activeMandate?.status === 'active' && activeMandate?.activeGateway));
          const isAutopayActive = Boolean(
            hasMandate &&
            ownerSettings?.autoRenew === true &&
            !ownerSettings?.cancelsAtPeriodEnd
          );
          const currentGatewayKey = activeMandate?.activeGateway;
          const gwInfo = currentGatewayKey ? availableGateways.find((g) => g.key === currentGatewayKey) : null;

          const commercialPlans = state.plans
            .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
            .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));

          const baseCommercialPlan = commercialPlans.find(
            (p) =>
              (ownerSettings?.planId && p.id.toLowerCase() === ownerSettings.planId.toLowerCase() && p.id !== 'free_trial') ||
              (ownerSettings?.planName && p.name.toLowerCase() === ownerSettings.planName.toLowerCase() && !p.name.toLowerCase().includes('trial'))
          ) || commercialPlans[0] || { name: 'Starter', price: 29 };

          return (
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.line,
                marginBottom: 14,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 14,
                  backgroundColor: colors.surfaceSunken,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="repeat" size={16} color={colors.brass} />
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy }}>Subscription Autopay</Text>
                    <Text style={{ fontSize: 11, color: colors.inkSoft }}>Single active mandate • Zero double-billing</Text>
                  </View>
                </View>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: isAutopayActive ? '#DCFCE7' : '#FEF3C7',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: isAutopayActive ? '#166534' : '#92400E',
                    }}
                  >
                    {isAutopayActive ? 'Active' : 'Disabled'}
                  </Text>
                </View>
              </View>

              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flex: 1, marginRight: 8, backgroundColor: colors.surfaceSunken, padding: 10, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase' }}>
                      Active Gateway
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy, marginTop: 2 }}>
                      {hasMandate && gwInfo ? gwInfo.shortTitle : 'None'}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.inkSoft, marginTop: 1 }}>
                      {hasMandate && activeMandate?.mandateId ? `Ref: ${activeMandate.mandateId.slice(-8)}` : 'No mandate'}
                    </Text>
                  </View>

                  <View style={{ flex: 1, backgroundColor: colors.surfaceSunken, padding: 10, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase' }}>
                      {isTrial ? 'Trial Transition Terms' : 'Next Renewal'}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy, marginTop: 2 }}>
                      {isTrial ? `Base Plan (${baseCommercialPlan.name} @ $${baseCommercialPlan.price}/mo)` : `${currentPlan?.name || 'Growth'}`}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.inkSoft, marginTop: 1 }}>
                      {ownerSettings?.subscriptionEndsAt
                        ? new Date(ownerSettings.subscriptionEndsAt).toLocaleDateString()
                        : isTrial
                        ? `${daysLeft} days remaining (Manual renewal)`
                        : 'On period end'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: colors.surfaceSunken,
                      borderWidth: 1,
                      borderColor: colors.line,
                      paddingVertical: 9,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      setSelectedNewGateway((activeMandate?.activeGateway || 'stripe') as any);
                      setIsChangePaymentMethodOpen(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy }}>
                      {hasMandate ? 'Change Method' : 'Add Method'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: isAutopayActive ? '#FEE2E2' : colors.brass,
                      paddingVertical: 9,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      if (!hasMandate) {
                        setSelectedNewGateway('stripe');
                        setIsChangePaymentMethodOpen(true);
                      } else {
                        handleToggleAutoRenew();
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: isAutopayActive ? '#991B1B' : '#FFFFFF',
                      }}
                    >
                      {isAutopayActive ? 'Pause Autopay' : 'Enable Autopay'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Status Filter / Segmented Tabs - Exact match of Helpdesk screen */}
        <View style={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'plans' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
            onPress={() => setActiveTab('plans')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'plans' && [styles.tabTextActive, { color: colors.navy }]]}>
              Plans
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'invoices' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
            onPress={() => setActiveTab('invoices')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'invoices' && [styles.tabTextActive, { color: colors.navy }]]}>
              Receipts ({myInvoices.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'plans' ? (
          <>
            {/* Resource Quota & Live Capacity Gauges */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.navy }]} numberOfLines={1}>Resource Quota &amp; Usage</Text>
                <View style={[styles.liveCapacityBadge, isDark && { backgroundColor: '#1E293B' }]}>
                  <Text style={[styles.liveCapacityBadgeText, { color: colors.inkSoft }]}>Live Capacity</Text>
                </View>
              </View>

              {/* Properties Gauge */}
              <QuotaMeter
                label="Properties"
                used={usage.properties.used}
                max={usage.properties.max}
                accentColor="#10B981"
              />

              {/* Units Gauge */}
              <QuotaMeter
                label="Units"
                used={usage.units.used}
                max={usage.units.max}
                accentColor="#3B82F6"
              />

              {/* Tenants Gauge */}
              <QuotaMeter
                label="Tenants"
                used={usage.tenants.used}
                max={usage.tenants.max}
                accentColor="#8B5CF6"
              />

              {/* Managers Gauge */}
              <QuotaMeter
                label="Managers"
                used={usage.managers.used}
                max={usage.managers.max}
                accentColor="#F59E0B"
              />

              {/* Staff Gauge */}
              <QuotaMeter
                label="Maintenance Staff"
                used={usage.staff.used}
                max={usage.staff.max}
                accentColor="#EC4899"
              />
            </View>

            {/* Commercial Subscription Tiers */}
            <Text style={[styles.sectionHeading, { color: colors.inkSoft }]}>AVAILABLE SUBSCRIPTION TIERS</Text>

            {commercialPlans.map((plan) => {
              const isCurrent = currentPlan?.name.toLowerCase() === plan.name.toLowerCase();
              return (
                <View
                  key={plan.id}
                  style={[
                    styles.tierCard,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                    isCurrent && {
                      borderColor: '#10B981',
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                    },
                  ]}
                >
                  <View style={styles.tierHeader}>
                    <View>
                      <Text style={[styles.tierName, { color: isCurrent && !isDark ? '#0F172A' : colors.navy }]}>{plan.name}</Text>
                      <Text style={styles.tierPricing}>
                        ${plan.price}
                        <Text style={[styles.tierPeriod, { color: isCurrent && !isDark ? '#475569' : colors.inkSoft }]}> / month</Text>
                      </Text>
                    </View>
                    {isCurrent ? (
                      <View style={[styles.currentTierPill, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.25)', borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
                        <Text style={[styles.currentTierPillText, isDark && { color: '#34D399' }]}>Current Plan</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.tierSelectBtn}
                        onPress={() => {
                          setSelectedPlanName(plan.name);
                          setIsChangeModalOpen(true);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.tierSelectBtnText}>Select</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={[styles.tierLimitsGrid, { borderTopColor: isCurrent && !isDark ? '#BBF7D0' : colors.line }]}>
                    <View style={styles.tierLimitsRow}>
                      <View style={styles.tierLimitItem}>
                        <Text style={[styles.tierLimitValue, { color: isCurrent && !isDark ? '#0F172A' : colors.navy }]} numberOfLines={1}>
                          {plan.properties >= 999 ? 'Unlimited' : plan.properties}
                        </Text>
                        <Text style={[styles.tierLimitLabel, { color: isCurrent && !isDark ? '#475569' : colors.inkSoft }]} numberOfLines={1}>Properties</Text>
                      </View>
                      <View style={styles.tierLimitItem}>
                        <Text style={[styles.tierLimitValue, { color: isCurrent && !isDark ? '#0F172A' : colors.navy }]} numberOfLines={1}>
                          {plan.units >= 9999 ? 'Unlimited' : plan.units}
                        </Text>
                        <Text style={[styles.tierLimitLabel, { color: isCurrent && !isDark ? '#475569' : colors.inkSoft }]} numberOfLines={1}>Units</Text>
                      </View>
                      <View style={styles.tierLimitItem}>
                        <Text style={[styles.tierLimitValue, { color: isCurrent && !isDark ? '#0F172A' : colors.navy }]} numberOfLines={1}>
                          {plan.tenants >= 9999 ? 'Unlimited' : plan.tenants}
                        </Text>
                        <Text style={[styles.tierLimitLabel, { color: isCurrent && !isDark ? '#475569' : colors.inkSoft }]} numberOfLines={1}>Tenants</Text>
                      </View>
                    </View>

                    <View style={[styles.tierLimitsRow, { marginTop: 10 }]}>
                      <View style={styles.tierLimitItem}>
                        <Text style={[styles.tierLimitValue, { color: isCurrent && !isDark ? '#0F172A' : colors.navy }]} numberOfLines={1}>{plan.managers ?? 0}</Text>
                        <Text style={[styles.tierLimitLabel, { color: isCurrent && !isDark ? '#475569' : colors.inkSoft }]} numberOfLines={1}>Managers</Text>
                      </View>
                      <View style={styles.tierLimitItem}>
                        <Text style={[styles.tierLimitValue, { color: isCurrent && !isDark ? '#0F172A' : colors.navy }]} numberOfLines={1}>{plan.staff ?? 0}</Text>
                        <Text style={[styles.tierLimitLabel, { color: isCurrent && !isDark ? '#475569' : colors.inkSoft }]} numberOfLines={1}>Tech Staff</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Text style={[styles.sectionHeading, { color: colors.inkSoft }]}>OFFICIAL PLATFORM INVOICES</Text>

            {myInvoices.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Feather name="file-text" size={32} color={colors.inkSoft} />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Invoices Issued Yet</Text>
                <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                  Official tax invoices and downloadable receipts will appear here whenever your subscription is settled.
                </Text>
              </View>
            ) : (
              myInvoices.map((inv) => {
                const isPaid = inv.status === 'paid';
                return (
                  <TouchableOpacity
                    key={inv.id}
                    style={[styles.invoiceCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
                    onPress={() => setSelectedInvoice(inv)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.invoiceCardHead}>
                      <View>
                        <Text style={[styles.invoiceId, { color: colors.navy }]}>{inv.id}</Text>
                        <Text style={[styles.invoicePlanName, { color: colors.inkSoft }]}>{inv.planName} Tier</Text>
                      </View>
                      <View style={[styles.invoiceStatusBadge, isPaid ? styles.invPaidBadge : styles.invPendingBadge]}>
                        <Text style={[styles.invoiceStatusText, isPaid ? styles.invPaidText : styles.invPendingText]}>
                          {inv.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.invoiceCardBody, { borderTopColor: colors.line }]}>
                      <View>
                        <Text style={[styles.invoiceAmount, { color: colors.navy }]}>${inv.total.toFixed(2)} USD</Text>
                        {inv.paymentMethod && (
                          <Text style={{ fontSize: 11, color: '#0D9488', fontWeight: '600', marginTop: 2 }}>
                            Mode: {inv.paymentMethod}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.invoiceDate, { color: colors.inkSoft }]}>
                        {isPaid && inv.paidAt
                          ? `Paid on ${new Date(inv.paidAt).toLocaleDateString()}`
                          : `Issued: ${new Date(inv.issueDate).toLocaleDateString()}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* ─── Change / Upgrade Plan Modal ────────────────────────────────────── */}
      <Modal visible={isChangeModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>Upgrade / Change Plan</Text>
              <TouchableOpacity onPress={() => setIsChangeModalOpen(false)} style={styles.modalCloseBtn}>
                <Feather name="x" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Plan Choice Selector */}
              <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Choose Subscription Tier</Text>
              <View style={styles.planSelectorRow}>
                {commercialPlans.map((p) => {
                  const isSel = selectedPlanName.toLowerCase() === p.name.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.planSelectPill,
                        { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line },
                        isSel && styles.planSelectPillActive,
                      ]}
                      onPress={() => setSelectedPlanName(p.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.planSelectPillTitle, { color: colors.navy }, isSel && styles.planSelectPillTitleActive]}>
                        {p.name}
                      </Text>
                      <Text style={[styles.planSelectPillPrice, isSel && styles.planSelectPillPriceActive]}>
                        ${p.price}/mo
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Billing Cycle Frequency (Monthly vs Annual dynamic discount) */}
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.inputLabelNoMargin, { color: colors.inkSoft }]}>Billing Frequency</Text>
                  {billingCycle === 'annual' && annualDiscount > 0 && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsBadgeText}>✓ {annualDiscount}% Savings Applied</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.cycleToggleWrap, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <TouchableOpacity
                    style={[styles.cycleBtn, billingCycle === 'monthly' && [styles.cycleBtnActive, { backgroundColor: colors.surface }]]}
                    onPress={() => setBillingCycle('monthly')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.cycleBtnText, billingCycle === 'monthly' && [styles.cycleBtnTextActive, { color: colors.navy }]]}>
                      Monthly
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cycleBtn, billingCycle === 'annual' && [styles.cycleBtnActive, { backgroundColor: colors.surface }]]}
                    onPress={() => setBillingCycle('annual')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.cycleBtnText, billingCycle === 'annual' && [styles.cycleBtnTextActive, { color: colors.navy }]]}>
                      {annualDiscount > 0 ? `Annual (Save ${annualDiscount}%)` : 'Annual'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Downgrade Violations Warning */}
              {downgradeViolations.length > 0 && (
                <View style={styles.violationWarning}>
                  <Feather name="alert-triangle" size={16} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={styles.violationWarningText}>
                    Cannot switch to {targetPlanObj?.name}: Your portfolio uses {downgradeViolations.join(', ')}. Archive or delete excess entities first.
                  </Text>
                </View>
              )}

              {/* Duplicate Active Subscription Notice */}
              {isSamePlanAndCycle && (
                <View
                  style={{
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 1,
                    borderColor: '#10B981',
                    borderRadius: 10,
                    padding: 12,
                    marginTop: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981' }}>Current Active Plan</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.navy, lineHeight: 17 }}>
                    You are already subscribed to the {currentPlan?.name} tier on {billingCycle === 'annual' ? 'an Annual' : 'a Monthly'} billing cycle.
                    {ownerSettings?.subscriptionEndsAt ? ` Active through ${new Date(ownerSettings.subscriptionEndsAt).toLocaleDateString()}.` : ''}
                  </Text>
                </View>
              )}

              {/* Payment Gateway Engine Selector (Web/Android only; iOS compliant info card) */}
              {!isSamePlanAndCycle && (Platform.OS === 'ios' ? (
                <View style={{ marginTop: 16, padding: 14, backgroundColor: isDark ? '#1E293B' : '#F0F9FF', borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Feather name="shield" size={16} color="#0284C7" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0369A1' }}>Multiplatform Organization Plan</Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: '#0C4A6E', lineHeight: 17 }}>
                    Propithub Owner subscriptions are managed centrally via your enterprise web portal at propithub.app.
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.inputLabel, { color: colors.inkSoft, marginBottom: 8 }]}>Select Payment Gateway Engine</Text>
                  
                  {/* Dropdown trigger */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.surface,
                    }}
                    onPress={() => setIsGatewayDropdownOpen((prev) => !prev)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Feather
                        name={(availableGateways.find((gw) => gw.key === selectedGateway)?.icon as any) || 'credit-card'}
                        size={18}
                        color={colors.navy}
                      />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                        {availableGateways.find((gw) => gw.key === selectedGateway)?.title || 'Select Gateway'}
                      </Text>
                    </View>
                    <Feather name={isGatewayDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
                  </TouchableOpacity>

                  {/* Dropdown options */}
                  {isGatewayDropdownOpen && (
                    <View
                      style={{
                        marginTop: 4,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.line,
                        backgroundColor: colors.surface,
                        overflow: 'hidden',
                      }}
                    >
                      {availableGateways.map((gw) => {
                        const isSel = selectedGateway === gw.key;
                        return (
                          <TouchableOpacity
                            key={gw.key}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: 12,
                              backgroundColor: isSel ? (isDark ? '#1E293B' : 'rgba(16, 185, 129, 0.08)') : colors.surface,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.line,
                            }}
                            onPress={() => {
                              setSelectedGateway(gw.key);
                              setIsGatewayDropdownOpen(false);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <Feather name={gw.icon as any} size={16} color={isSel ? '#10B981' : colors.inkSoft} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: isSel ? '700' : '500', color: colors.navy }}>
                                  {gw.title}
                                </Text>
                                <Text style={{ fontSize: 11, color: colors.inkSoft }}>{gw.description}</Text>
                              </View>
                            </View>
                            {isSel && <Ionicons name="checkmark" size={18} color="#10B981" />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}

              {/* Price Breakdown Summary */}
              <View style={[styles.summaryBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line }]}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.inkSoft }]}>Subscription Fee:</Text>
                  <Text style={[styles.summaryValue, { color: colors.navy }]}>${effectivePrice}.00 USD</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.inkSoft }]}>Billing Cycle:</Text>
                  <Text style={[styles.summaryValue, { color: colors.navy }]}>
                    {billingCycle === 'annual'
                      ? (annualDiscount > 0 ? `12 Months (${annualDiscount}% Off)` : '12 Months')
                      : 'Monthly'}
                  </Text>
                </View>
                <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.summaryTotalLabel, { color: colors.navy }]}>Total Due Today:</Text>
                  <Text style={styles.summaryTotalValue}>${effectivePrice}.00 USD</Text>
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelBtn, isDark && { backgroundColor: '#1E293B' }]}
                onPress={() => setIsChangeModalOpen(false)}
                disabled={isProcessing}
              >
                <Text style={[styles.cancelBtnText, isDark && { color: '#E2E8F0' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmPayBtn,
                  (downgradeViolations.length > 0 || isSamePlanAndCycle) && { opacity: 0.6, backgroundColor: isSamePlanAndCycle ? '#10B981' : undefined }
                ]}
                onPress={handleExecuteCheckout}
                disabled={isProcessing || downgradeViolations.length > 0 || isSamePlanAndCycle}
                activeOpacity={0.85}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmPayBtnText}>
                    {isSamePlanAndCycle ? 'Current Active Plan' : `Confirm & Activate ($${effectivePrice})`}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Receipt Modal ─────────────────────────────────────────────────── */}
      <Modal visible={!!selectedInvoice} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
            {selectedInvoice && (
              <>
                <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
                  <View>
                    <PropithubLogo size={20} showText={true} />
                    <Text style={[styles.modalTitle, { color: colors.navy }]}>Tax Invoice Receipt</Text>
                    <Text style={{ color: colors.inkSoft, fontSize: 12, marginTop: 2 }}>{selectedInvoice.id}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedInvoice(null)} style={[styles.modalCloseBtn, isDark && { backgroundColor: '#1E293B' }]}>
                    <Feather name="x" size={20} color={colors.inkSoft} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                  <View style={[styles.receiptBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line }]}>
                    <Text style={[styles.receiptSectionTitle, { color: colors.inkSoft }]}>Customer Details</Text>
                    <Text style={[styles.receiptTextBold, { color: colors.navy }]}>{selectedInvoice.ownerName}</Text>
                    <Text style={[styles.receiptText, { color: isDark ? '#CBD5E1' : '#334155' }]}>{selectedInvoice.ownerEmail}</Text>
                    <Text style={[styles.receiptTextMuted, { color: colors.inkSoft }]}>ID: {selectedInvoice.ownerId}</Text>
                  </View>

                  <View style={[styles.receiptBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line }]}>
                    <Text style={[styles.receiptSectionTitle, { color: colors.inkSoft }]}>Line Item</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.receiptTextBold, { color: colors.navy }]}>
                        Propithub SaaS Subscription ({selectedInvoice.planName} Tier)
                      </Text>
                      <Text style={[styles.receiptTextBold, { color: colors.navy }]}>${selectedInvoice.amount.toFixed(2)}</Text>
                    </View>
                    <Text style={[styles.receiptTextMuted, { color: colors.inkSoft }]}>{selectedInvoice.notes}</Text>
                  </View>

                  <View style={[styles.receiptBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line }]}>
                    <Text style={[styles.receiptSectionTitle, { color: colors.inkSoft }]}>Settlement Details</Text>
                    <Text style={[styles.receiptText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                      Method: <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: '700' }}>{selectedInvoice.paymentMethod}</Text>
                    </Text>
                    <Text style={[styles.receiptText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                      Transaction Ref: <Text style={{ fontFamily: 'monospace', color: '#16A34A' }}>{selectedInvoice.transactionRef}</Text>
                    </Text>
                    <Text style={[styles.receiptText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                      Settled Date: {new Date(selectedInvoice.paidAt || selectedInvoice.issueDate).toLocaleString()}
                    </Text>
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={styles.closeReceiptBtn}
                  onPress={() => setSelectedInvoice(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.closeReceiptBtnText}>Close Receipt</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Change Owner Billing Payment Method Modal */}
      <Modal
        visible={isChangePaymentMethodOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsChangePaymentMethodOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.navy }}>Change Subscription Billing Method</Text>
              <TouchableOpacity onPress={() => setIsChangePaymentMethodOpen(false)}>
                <Feather name="x" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
                Select a payment method. Propithub automatically cancels your previous mandate so you are never double-billed.
              </Text>

              {/* Dropdown trigger */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.surfaceSunken,
                  marginBottom: isNewGatewayDropdownOpen ? 4 : 12,
                }}
                onPress={() => setIsNewGatewayDropdownOpen((prev) => !prev)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Feather
                    name={(availableGateways.find((gw) => gw.key === selectedNewGateway)?.icon as any) || 'credit-card'}
                    size={18}
                    color={colors.navy}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                    {availableGateways.find((gw) => gw.key === selectedNewGateway)?.title || 'Select Gateway'}
                  </Text>
                </View>
                <Feather name={isNewGatewayDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
              </TouchableOpacity>

              {/* Dropdown options */}
              {isNewGatewayDropdownOpen && (
                <View
                  style={{
                    marginBottom: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.surface,
                    overflow: 'hidden',
                  }}
                >
                  {availableGateways.map((gw) => {
                    const isSelected = selectedNewGateway === gw.key;
                    return (
                      <TouchableOpacity
                        key={gw.key}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 12,
                          backgroundColor: isSelected ? 'rgba(197, 160, 89, 0.12)' : colors.surface,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.line,
                        }}
                        onPress={() => {
                          setSelectedNewGateway(gw.key);
                          setIsNewGatewayDropdownOpen(false);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Feather name={gw.icon as any} size={16} color={isSelected ? colors.brass : colors.inkSoft} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '500', color: colors.navy }}>{gw.title}</Text>
                            <Text style={{ fontSize: 11, color: colors.inkSoft }}>{gw.description}</Text>
                          </View>
                        </View>
                        {isSelected && <Ionicons name="checkmark" size={18} color={colors.brass} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Interactive Mandate Input Form */}
              <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 10, padding: 14, marginVertical: 10, borderWidth: 1, borderColor: colors.line }}>
                {selectedNewGateway === 'stripe' && (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy, textTransform: 'uppercase' }}>
                      Credit / Debit Card
                    </Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                      placeholder="Name on Card"
                      placeholderTextColor={colors.inkSoft}
                      value={mandateCardName}
                      onChangeText={setMandateCardName}
                    />
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink, letterSpacing: 1 }}
                      placeholder="Card Number"
                      placeholderTextColor={colors.inkSoft}
                      keyboardType="numeric"
                      maxLength={19}
                      value={mandateCardNumber}
                      onChangeText={(val) => {
                        const raw = val.replace(/\D/g, '').slice(0, 16);
                        const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
                        setMandateCardNumber(formatted);
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TextInput
                        style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                        placeholder="MM/YY"
                        placeholderTextColor={colors.inkSoft}
                        maxLength={5}
                        value={mandateCardExpiry}
                        onChangeText={(val) => {
                          let clean = val.replace(/\D/g, '').slice(0, 4);
                          if (clean.length >= 3) clean = `${clean.slice(0, 2)}/${clean.slice(2)}`;
                          setMandateCardExpiry(clean);
                        }}
                      />
                      <TextInput
                        style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                        placeholder="CVV"
                        placeholderTextColor={colors.inkSoft}
                        secureTextEntry
                        keyboardType="numeric"
                        maxLength={4}
                        value={mandateCardCvv}
                        onChangeText={(val) => setMandateCardCvv(val.replace(/\D/g, '').slice(0, 4))}
                      />
                    </View>
                  </View>
                )}

                {selectedNewGateway === 'razorpay' && (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 6,
                          alignItems: 'center',
                          backgroundColor: mandateRzpSubMode === 'card' ? '#ECFDF5' : colors.surface,
                          borderWidth: 1,
                          borderColor: mandateRzpSubMode === 'card' ? '#10B981' : colors.line,
                        }}
                        onPress={() => setMandateRzpSubMode('card')}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: mandateRzpSubMode === 'card' ? '#065F46' : colors.inkSoft }}>Debit / Credit Card</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 6,
                          alignItems: 'center',
                          backgroundColor: mandateRzpSubMode === 'upi' ? '#ECFDF5' : colors.surface,
                          borderWidth: 1,
                          borderColor: mandateRzpSubMode === 'upi' ? '#10B981' : colors.line,
                        }}
                        onPress={() => setMandateRzpSubMode('upi')}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: mandateRzpSubMode === 'upi' ? '#065F46' : colors.inkSoft }}>UPI AutoPay</Text>
                      </TouchableOpacity>
                    </View>

                    {mandateRzpSubMode === 'upi' ? (
                      <View style={{ gap: 6 }}>
                        <TextInput
                          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                          placeholder="UPI ID (e.g. owner@okhdfcbank)"
                          placeholderTextColor={colors.inkSoft}
                          autoCapitalize="none"
                          value={mandateUpiId}
                          onChangeText={setMandateUpiId}
                        />
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <TextInput
                          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                          placeholder="Card Number"
                          placeholderTextColor={colors.inkSoft}
                          keyboardType="numeric"
                          maxLength={19}
                          value={mandateCardNumber}
                          onChangeText={setMandateCardNumber}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                            placeholder="MM/YY"
                            placeholderTextColor={colors.inkSoft}
                            maxLength={5}
                            value={mandateCardExpiry}
                            onChangeText={setMandateCardExpiry}
                          />
                          <TextInput
                            style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                            placeholder="CVV"
                            placeholderTextColor={colors.inkSoft}
                            secureTextEntry
                            maxLength={4}
                            value={mandateCardCvv}
                            onChangeText={(val) => setMandateCardCvv(val.replace(/\D/g, '').slice(0, 4))}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {selectedNewGateway === 'easebuzz' && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>e-NACH NetBanking</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                      placeholder="Savings Account Number"
                      placeholderTextColor={colors.inkSoft}
                      keyboardType="numeric"
                      value={mandateAccountNum}
                      onChangeText={setMandateAccountNum}
                    />
                  </View>
                )}

                {selectedNewGateway === 'paypal' && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>PayPal Account Email</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, fontSize: 13, color: colors.ink }}
                      placeholder="owner@example.com"
                      placeholderTextColor={colors.inkSoft}
                      autoCapitalize="none"
                      value={mandatePaypalEmail}
                      onChangeText={setMandatePaypalEmail}
                    />
                  </View>
                )}
              </View>

              {/* Consent Toggle */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 8 }}
                onPress={() => setMandateConsentChecked(!mandateConsentChecked)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={mandateConsentChecked ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={mandateConsentChecked ? '#10B981' : colors.inkSoft}
                  style={{ marginTop: 2 }}
                />
                <Text style={{ flex: 1, fontSize: 11, color: colors.ink, lineHeight: 16 }}>
                  I authorize Propithub to register an automated recurring subscription mandate on this payment instrument to renew my active plan upon expiration.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: colors.brass,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 8,
                  marginBottom: 10,
                }}
                disabled={isProcessing}
                onPress={async () => {
                  if (!ownerId) return;

                  if (!mandateConsentChecked) {
                    Alert.alert('Consent Required', 'Please check the mandate authorization checkbox to proceed.');
                    return;
                  }

                  let displayDetails = `${selectedNewGateway.toUpperCase()} Active Card`;
                  let token = `mandate_${selectedNewGateway}_${Date.now()}`;
                  const cleanCard = mandateCardNumber.replace(/\s+/g, '');

                  if (selectedNewGateway === 'stripe') {
                    if (!cleanCard || cleanCard.length < 15) {
                      Alert.alert('Invalid Card', 'Please enter a valid 16-digit card number.');
                      return;
                    }
                    if (!mandateCardExpiry || !mandateCardExpiry.includes('/')) {
                      Alert.alert('Invalid Expiry', 'Please enter card expiry (MM/YY).');
                      return;
                    }
                    if (!mandateCardCvv || mandateCardCvv.length < 3) {
                      Alert.alert('Invalid CVV', 'Please enter a valid 3-digit CVV.');
                      return;
                    }
                    const last4 = cleanCard.slice(-4);
                    const brand = cleanCard.startsWith('4') ? 'Visa' : cleanCard.startsWith('5') ? 'Mastercard' : 'Card';
                    displayDetails = `${brand} ending in •••• ${last4}`;
                    token = `pm_owner_${last4}_${Date.now()}`;
                  } else if (selectedNewGateway === 'razorpay') {
                    if (mandateRzpSubMode === 'upi') {
                      if (!mandateUpiId || !mandateUpiId.includes('@')) {
                        Alert.alert('Invalid UPI', 'Please enter a valid UPI ID (e.g. owner@okhdfcbank).');
                        return;
                      }
                      displayDetails = `UPI AutoPay (${mandateUpiId.trim()})`;
                      token = `rzp_upi_${Date.now()}`;
                    } else {
                      if (!cleanCard || cleanCard.length < 15) {
                        Alert.alert('Invalid Card', 'Please enter a valid card number.');
                        return;
                      }
                      const last4 = cleanCard.slice(-4);
                      displayDetails = `Card ending in •••• ${last4}`;
                      token = `rzp_card_${last4}_${Date.now()}`;
                    }
                  } else if (selectedNewGateway === 'easebuzz') {
                    if (!mandateAccountNum || mandateAccountNum.length < 6) {
                      Alert.alert('Invalid Account', 'Please enter your bank account number.');
                      return;
                    }
                    const last4 = mandateAccountNum.slice(-4);
                    displayDetails = `e-NACH (${mandateBankName} •••• ${last4})`;
                    token = `eb_nach_${last4}_${Date.now()}`;
                  } else if (selectedNewGateway === 'paypal') {
                    if (!mandatePaypalEmail || !mandatePaypalEmail.includes('@')) {
                      Alert.alert('Invalid Email', 'Please enter your PayPal billing email.');
                      return;
                    }
                    displayDetails = `PayPal (${mandatePaypalEmail.trim()})`;
                    token = `B-${Date.now().toString(36).toUpperCase()}`;
                  }

                  setIsProcessing(true);
                  try {
                    await updateOwnerAutopay(ownerId, {
                      activeGateway: selectedNewGateway,
                      mandateId: token,
                      status: 'active',
                      autoRenew: true,
                      displayDetails,
                      updatedAt: new Date().toISOString(),
                    });
                    Alert.alert('Payment Method Switched', `✓ Active billing method switched to ${displayDetails}. Old mandate cancelled.`);
                    setIsChangePaymentMethodOpen(false);
                  } catch (err: any) {
                    Alert.alert('Error', err?.message || 'Failed to switch payment method.');
                  } finally {
                    setIsProcessing(false);
                  }
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                  {isProcessing ? 'Authorizing...' : 'Authorize'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ─── Subcomponent: Quota Meter ────────────────────────────────────────────────
const QuotaMeter: React.FC<{
  label: string;
  used: number;
  max: number;
  accentColor: string;
}> = ({ label, used, max, accentColor }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const isUnlimited = max >= 999;
  const pct = isUnlimited ? Math.min(100, used * 10) : Math.min(100, (used / Math.max(1, max)) * 100);

  return (
    <View style={styles.meterContainer}>
      <View style={styles.meterLabelsRow}>
        <Text style={[styles.meterLabel, { color: colors.inkSoft }]}>{label}</Text>
        <Text style={styles.meterValue}>
          <Text style={{ fontWeight: '700', color: colors.navy }}>{used}</Text>
          <Text style={{ color: colors.inkMuted }}> / {isUnlimited ? 'Unlimited' : max}</Text>
        </Text>
      </View>
      <View style={[styles.meterTrack, { backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9' }]}>
        <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: accentColor }]} />
      </View>
    </View>
  );
};

// ─── Stylesheet matching Helpdesk & Reputation screens ───────────────────────
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
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    marginRight: 10,
    padding: 6,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
  },
  headerSub: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  ownerBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ownerBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.navy,
  },
  scroll: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  supportDarkCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.8,
  },
  bannerHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    marginTop: 2,
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 18,
    marginBottom: 14,
  },
  heroBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  raiseTicketBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 140,
    justifyContent: 'center',
  },
  raiseTicketBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelRenewBtn: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexShrink: 1,
    alignItems: 'center',
  },
  cancelRenewBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeTrial: {
    backgroundColor: '#EFF6FF',
  },
  statusBadgeExpired: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  statusBadgeTextActive: {
    color: '#15803D',
  },
  statusBadgeTextTrial: {
    color: '#1D4ED8',
  },
  statusBadgeTextExpired: {
    color: '#DC2626',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  tabTextActive: {
    color: colors.navy,
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    flex: 1,
    marginRight: 8,
  },
  liveCapacityBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveCapacityBadgeText: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  meterContainer: {
    marginTop: 10,
  },
  meterLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  meterLabel: {
    fontSize: 12.5,
    color: colors.ink,
    fontWeight: '600',
  },
  meterValue: {
    fontSize: 12.5,
  },
  meterTrack: {
    height: 7,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },
  tierCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tierCardCurrent: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tierName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.navy,
  },
  tierPricing: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },
  tierPeriod: {
    fontSize: 12,
    color: colors.inkSoft,
    fontWeight: '400',
  },
  currentTierPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  currentTierPillText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },
  tierSelectBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tierSelectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },
  tierLimitsGrid: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
    marginTop: 8,
  },
  tierLimitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierLimitItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tierLimitValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  tierLimitLabel: {
    fontSize: 10.5,
    color: colors.inkSoft,
    marginTop: 2,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  invoiceCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  invoiceCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceId: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: colors.navy,
  },
  invoicePlanName: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 1,
  },
  invoiceStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  invPaidBadge: {
    backgroundColor: '#DCFCE7',
  },
  invPaidText: {
    color: '#15803D',
    fontWeight: '700',
    fontSize: 10,
  },
  invPendingBadge: {
    backgroundColor: '#FEF3C7',
  },
  invPendingText: {
    color: '#B45309',
    fontWeight: '700',
    fontSize: 10,
  },
  invoiceStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  invoiceCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  invoiceAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  invoiceDate: {
    fontSize: 11.5,
    color: colors.inkSoft,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.navy,
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
  },
  inputLabelNoMargin: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  planSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  planSelectPill: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  planSelectPillActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  planSelectPillTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  planSelectPillTitleActive: {
    color: colors.navy,
  },
  planSelectPillPrice: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  planSelectPillPriceActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  savingsBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
  },
  savingsBadgeText: {
    color: '#15803D',
    fontSize: 10.5,
    fontWeight: '700',
  },
  cycleToggleWrap: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 8,
    padding: 3,
  },
  cycleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  cycleBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cycleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  cycleBtnTextActive: {
    color: colors.navy,
    fontWeight: '700',
  },
  violationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  violationWarningText: {
    flex: 1,
    fontSize: 11.5,
    color: '#DC2626',
    lineHeight: 16,
  },
  gatewaysList: {
    gap: 8,
  },
  gatewayCard: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 10,
  },
  gatewayCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  gwIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gwIconWrapActive: {
    borderColor: '#BBF7D0',
    backgroundColor: '#DCFCE7',
  },
  gwTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.navy,
  },
  gwTitleActive: {
    color: colors.navy,
  },
  gwDesc: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  gwBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gwBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  summaryBox: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  summaryTotalLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.navy,
  },
  summaryTotalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  cancelBtnText: {
    color: colors.inkSoft,
    fontWeight: '600',
    fontSize: 13,
  },
  confirmPayBtn: {
    flex: 2,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#10B981',
  },
  confirmPayBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  receiptBox: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  receiptSectionTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  receiptTextBold: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  receiptText: {
    fontSize: 12,
    color: colors.ink,
    marginTop: 2,
  },
  receiptTextMuted: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  closeReceiptBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  closeReceiptBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  });
