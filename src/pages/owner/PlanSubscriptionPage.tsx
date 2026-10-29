import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { launchRazorpayPayment, launchStripePayment, launchPayPalPayment, launchEasebuzzPayment, launchStripeRecurringMandate, launchRazorpayRecurringMandate, launchPayPalRecurringMandate, launchEasebuzzRecurringMandate } from '../../lib/payments';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { loadCachedTrialDays } from '../../lib/store';
import { PlatformInvoice } from '../../types';
import { dispatchSubscriptionReceiptEmail } from '../../lib/receiptMailer';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyConverterTrigger } from '../../components/common/CurrencyConverterTrigger';
import { FileText, Printer, Download, CheckCircle2, Clock } from 'lucide-react';
import { downloadSinglePlatformInvoicePDF } from '../../lib/pdf';

export const PlanSubscriptionPage: React.FC = () => {
  const { state, updateState, showToast, updateOwnerAutopay, cancelOwnerAutopay } = useAppData();
  const { user, updateUserProfile } = useAuth();

  const {
    ownerId,
    ownerSettings,
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

  const userFromState = state.users.find(
    (u) => (ownerId && u.id === ownerId) || (user?.email && u.email?.toLowerCase() === user.email.toLowerCase())
  );
  const effectiveOwnerId = ownerId || userFromState?.id || user?.id || '';

  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [isChangePaymentMethodOpen, setIsChangePaymentMethodOpen] = useState(false);
  const [selectedPlanName, setSelectedPlanName] = useState(state.ownerPlan || 'Growth');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlatformInvoice, setSelectedPlatformInvoice] = useState<PlatformInvoice | null>(null);
  const [selectedNewGateway, setSelectedNewGateway] = useState<'stripe' | 'razorpay' | 'paypal' | 'easebuzz'>('stripe');
  const [ownerMandateCardName, setOwnerMandateCardName] = useState(user?.displayName || 'Owner');
  const [ownerMandateCardNumber, setOwnerMandateCardNumber] = useState('');
  const [ownerMandateCardExpiry, setOwnerMandateCardExpiry] = useState('');
  const [ownerMandateCardCvv, setOwnerMandateCardCvv] = useState('');
  const [ownerMandateRzpSubMode, setOwnerMandateRzpSubMode] = useState<'card' | 'upi'>('card');
  const [ownerMandateUpiId, setOwnerMandateUpiId] = useState('');
  const [ownerMandateBankName, setOwnerMandateBankName] = useState('HDFC Bank');
  const [ownerMandateAccountNum, setOwnerMandateAccountNum] = useState('');
  const [ownerMandateIfsc, setOwnerMandateIfsc] = useState('');
  const [ownerMandatePaypalEmail, setOwnerMandatePaypalEmail] = useState(user?.email || '');
  const [ownerMandateConsentChecked, setOwnerMandateConsentChecked] = useState(true);

  const { convert, format } = useCurrency();

  const handleToggleAutoRenew = async () => {
    if (!effectiveOwnerId) return;

    const currentCancels = Boolean(ownerSettings?.cancelsAtPeriodEnd);
    if (!currentCancels) {
      await cancelOwnerAutopay(effectiveOwnerId);
      showToast('Autopay disabled. Your subscription will not automatically renew at the end of the current period.');
    } else {
      const activeGw = (ownerSettings?.subscriptionMandate?.activeGateway || 'stripe') as any;
      await updateOwnerAutopay(effectiveOwnerId, {
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
      showToast('✓ Autopay enabled. Your subscription will automatically renew at the end of the billing period.');
    }
  };

  const handleLaunchLiveOwnerStripeMandate = async () => {
    if (!effectiveOwnerId) return;
    if (!ownerMandateConsentChecked) {
      showToast('⚠️ Please check the standing instruction authorization box to proceed.');
      return;
    }
    const m = state.platformGateways;
    const stripePub = m.stripe?.pubKey || '';
    setIsProcessing(true);
    await launchStripeRecurringMandate({
      publishableKey: stripePub,
      customerName: user?.displayName || 'Owner',
      customerEmail: user?.email || '',
      role: 'owner',
      entityId: effectiveOwnerId,
      ownerId: effectiveOwnerId,
      onSuccess: async (res) => {
        setIsProcessing(false);
        await updateOwnerAutopay(effectiveOwnerId, {
          activeGateway: 'stripe',
          mandateId: res.paymentMethodId,
          customerId: res.customerId,
          status: 'active',
          autoRenew: true,
          displayDetails: res.displayDetails,
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ Stripe card mandate verified with issuing bank! ${res.displayDetails}`);
        setIsChangePaymentMethodOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  const handleLaunchLiveOwnerRazorpayMandate = async () => {
    if (!effectiveOwnerId) return;
    if (!ownerMandateConsentChecked) {
      showToast('⚠️ Please check the standing instruction authorization box to proceed.');
      return;
    }
    const m = state.platformGateways;
    const rzpKey = m.razorpay?.keyId || '';
    setIsProcessing(true);
    await launchRazorpayRecurringMandate({
      keyId: rzpKey,
      customerName: user?.displayName || 'Owner',
      customerEmail: user?.email || '',
      customerPhone: user?.phone || '',
      role: 'owner',
      entityId: effectiveOwnerId,
      ownerId: effectiveOwnerId,
      maxCap: 50000,
      onSuccess: async (res) => {
        setIsProcessing(false);
        await updateOwnerAutopay(effectiveOwnerId, {
          activeGateway: 'razorpay',
          mandateId: res.mandateToken,
          status: 'active',
          autoRenew: true,
          displayDetails: res.displayDetails,
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ Razorpay mandate authorized via UPI PIN / 3DS! ${res.displayDetails}`);
        setIsChangePaymentMethodOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  const handleLaunchLiveOwnerPayPalMandate = async () => {
    if (!effectiveOwnerId) return;
    if (!ownerMandateConsentChecked) {
      showToast('⚠️ Please check the standing instruction authorization box to proceed.');
      return;
    }
    const m = state.platformGateways;
    const clientId = m.paypal?.clientId || '';
    setIsProcessing(true);
    await launchPayPalRecurringMandate({
      clientId,
      customerName: user?.displayName || 'Owner',
      customerEmail: user?.email || '',
      role: 'owner',
      entityId: effectiveOwnerId,
      ownerId: effectiveOwnerId,
      onSuccess: async (res) => {
        setIsProcessing(false);
        await updateOwnerAutopay(effectiveOwnerId, {
          activeGateway: 'paypal',
          mandateId: res.mandateToken,
          status: 'active',
          autoRenew: true,
          displayDetails: res.displayDetails,
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ PayPal Vault recurring mandate authorized! ${res.displayDetails}`);
        setIsChangePaymentMethodOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  const handleLaunchLiveOwnerEasebuzzMandate = async () => {
    if (!effectiveOwnerId) return;
    if (!ownerMandateConsentChecked) {
      showToast('⚠️ Please check the standing instruction authorization box to proceed.');
      return;
    }
    const m = state.platformGateways;
    const merchantKey = m.easebuzz?.merchantKey || '';
    setIsProcessing(true);
    await launchEasebuzzRecurringMandate({
      merchantKey,
      customerName: user?.displayName || 'Owner',
      customerEmail: user?.email || '',
      customerPhone: user?.phone || '',
      role: 'owner',
      entityId: effectiveOwnerId,
      ownerId: effectiveOwnerId,
      bankName: ownerMandateBankName,
      accountNum: ownerMandateAccountNum,
      onSuccess: async (res) => {
        setIsProcessing(false);
        await updateOwnerAutopay(effectiveOwnerId, {
          activeGateway: 'easebuzz',
          mandateId: res.mandateToken,
          status: 'active',
          autoRenew: true,
          displayDetails: res.displayDetails,
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ Easebuzz e-NACH mandate verified with bank! ${res.displayDetails}`);
        setIsChangePaymentMethodOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  // Dynamically detect all active/configured billing gateways enabled by SuperAdmin
  const availableBillingGateways = useMemo(() => {
    const list: Array<{
      key: 'stripe' | 'razorpay' | 'paypal' | 'easebuzz';
      name: string;
      shortTitle: string;
      description?: string;
      icon: string;
      badge?: string;
      badgeClass?: string;
      priceNote?: (usdPrice: number) => string;
    }> = [];

    const g = state.platformGateways;

    // 1. Easebuzz (Full Live Production Gateway - if enabled by SuperAdmin)
    if (g?.easebuzz?.enabled !== false) {
      list.push({
        key: 'easebuzz',
        name: 'Easebuzz',
        shortTitle: 'Easebuzz',
        description: 'Instant live production settlement via UPI, Cards, 50+ Banks',
        icon: '',
        priceNote: (p) => {
          const inr = Math.round(convert(p, 'USD', 'INR'));
          return `₹${inr.toLocaleString('en-IN')} (live rate, approx. $${p}/mo)`;
        },
      });
    }

    // 2. Stripe (if enabled by SuperAdmin)
    if (g?.stripe?.enabled !== false) {
      list.push({
        key: 'stripe',
        name: 'Credit / Debit Card',
        shortTitle: 'Stripe Card',
        description: 'Instant SSL-encrypted card payment in $',
        icon: '',
        badge: 'Global Cards',
        badgeClass: 'brass',
        priceNote: (p) => `$${p.toFixed(2)}`,
      });
    }

    // 3. Razorpay (if enabled by SuperAdmin)
    if (g?.razorpay?.enabled !== false) {
      list.push({
        key: 'razorpay',
        name: 'Razorpay',
        shortTitle: 'Razorpay',
        description: 'Domestic settlement via UPI, Cards, Netbanking',
        icon: '',
        badge: 'UPI & Cards',
        badgeClass: 'green',
        priceNote: (p) => {
          const inr = Math.round(convert(p, 'USD', 'INR'));
          return `₹${inr.toLocaleString('en-IN')} (live rate, approx. $${p}/mo)`;
        },
      });
    }

    // 4. PayPal (if enabled by SuperAdmin)
    if (g?.paypal?.enabled !== false) {
      list.push({
        key: 'paypal',
        name: 'PayPal',
        shortTitle: 'PayPal',
        description: 'Authorize with PayPal balance or linked cards',
        icon: '',
        badge: 'International',
        badgeClass: 'brass',
        priceNote: (p) => `$${p.toFixed(2)}`,
      });
    }

    return list;
  }, [state.platformGateways, convert]);

  const [selectedBillingGateway, setSelectedBillingGateway] = useState<'stripe' | 'razorpay' | 'paypal' | 'easebuzz'>(() => {
    return (availableBillingGateways[0]?.key as any) || 'stripe';
  });

  // Keep selectedBillingGateway aligned with available gateways
  React.useEffect(() => {
    if (availableBillingGateways.length > 0 && !availableBillingGateways.some((gw) => gw.key === selectedBillingGateway)) {
      setSelectedBillingGateway(availableBillingGateways[0].key);
    }
  }, [availableBillingGateways, selectedBillingGateway]);

  const cachedTrialDays = loadCachedTrialDays();
  const dynamicTrialDays = typeof state.defaultTrialDays === 'number'
    ? state.defaultTrialDays
    : (cachedTrialDays !== null ? cachedTrialDays : 14);

  const propertiesUsed = usage.properties.used;
  const unitsUsed = usage.units.used;
  const tenantsUsed = usage.tenants.used;
  const managersUsed = usage.managers.used;
  const staffUsed = usage.staff.used;

  const handleConfirmChange = async () => {
    const targetPlan =
      state.plans.find((p) => p.name.toLowerCase() === selectedPlanName.toLowerCase()) ||
      state.plans.find((p) => p.id.toLowerCase() === selectedPlanName.toLowerCase()) ||
      state.plans[0];

    // Downgrade protection: check if current usage exceeds targetPlan limits
    const downgradeViolations: string[] = [];
    if (targetPlan.properties < 999 && propertiesUsed > targetPlan.properties) {
      downgradeViolations.push(`${propertiesUsed} properties (limit: ${targetPlan.properties})`);
    }
    if (targetPlan.units < 9999 && unitsUsed > targetPlan.units) {
      downgradeViolations.push(`${unitsUsed} units (limit: ${targetPlan.units})`);
    }
    if (targetPlan.tenants < 9999 && tenantsUsed > targetPlan.tenants) {
      downgradeViolations.push(`${tenantsUsed} tenants (limit: ${targetPlan.tenants})`);
    }
    if (managersUsed > (targetPlan.managers ?? 0)) {
      downgradeViolations.push(`${managersUsed} managers (limit: ${targetPlan.managers ?? 0})`);
    }
    if (staffUsed > (targetPlan.staff ?? 0)) {
      downgradeViolations.push(`${staffUsed} staff members (limit: ${targetPlan.staff ?? 0})`);
    }

    if (downgradeViolations.length > 0) {
      showToast(`⚠️ Cannot switch to ${targetPlan.name}: Your account currently uses ${downgradeViolations.join(', ')}. Please delete or archive excess items before switching.`);
      return;
    }

    // Anti-duplicate protection: prevent re-purchasing the same active plan and cycle
    const isCurrentPlanActive = !isTrial && ownerSettings?.planStatus === 'active' && !isExpired;
    const isSamePlanAndCycle = Boolean(
      isCurrentPlanActive &&
      currentPlan &&
      targetPlan.name.toLowerCase() === currentPlan.name.toLowerCase() &&
      billingCycle === (ownerSettings?.billingCycle || 'monthly')
    );

    if (isSamePlanAndCycle) {
      const renewDate = ownerSettings?.subscriptionEndsAt ? new Date(ownerSettings.subscriptionEndsAt).toLocaleDateString() : 'scheduled cycle end';
      showToast(`⚠️ You already have an active subscription for the ${targetPlan.name} plan. Next renewal is on ${renewDate}.`);
      return;
    }

    const billingGateway = selectedBillingGateway;
    const subId = `SUB-${Math.floor(1000 + Math.random() * 9000)}`;

    const isAnnual = billingCycle === 'annual';
    const annualDiscount = state.annualDiscountPercent ?? 20;
    const discountMultiplier = (100 - annualDiscount) / 100;
    const effectivePrice = isAnnual ? Math.round(targetPlan.price * 12 * discountMultiplier) : targetPlan.price;
    const expiryDays = isAnnual ? 365 : 30;

    const applyPlanUpgrade = async () => {
      const now = new Date();
      const expiry = new Date(Date.now() + expiryDays * 86400000).toISOString();
      const effectiveOwnerId = ownerId || userFromState?.id || user?.id || '';
      const chosenPlanName = targetPlan.name || selectedPlanName;

      // Idempotency check: prevent duplicate paid invoices if an unexpired invoice for this plan already exists
      const existingActiveInvoice = (state.platformInvoices || []).find(
        (inv) =>
          inv.ownerId === effectiveOwnerId &&
          inv.planId === targetPlan.id &&
          inv.status === 'paid' &&
          inv.periodEnd &&
          new Date(inv.periodEnd).getTime() > Date.now()
      );
      if (existingActiveInvoice) {
        showToast(`Active subscription invoice for ${chosenPlanName} is already on record.`);
        setIsProcessing(false);
        return;
      }

      const newInvoiceId = `PINV-${Date.now().toString().slice(-6)}`;

      const newInvoice: PlatformInvoice = {
        id: newInvoiceId,
        ownerId: effectiveOwnerId,
        ownerName: user?.displayName || userFromState?.displayName || user?.email?.split('@')[0] || 'Owner',
        ownerEmail: user?.email || userFromState?.email || '',
        planId: targetPlan.id,
        planName: chosenPlanName,
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
        billingCycle: isAnnual ? 'annual' : 'monthly',
        notes: `${isAnnual ? (annualDiscount > 0 ? `Annual (${annualDiscount}% off)` : 'Annual') : 'Monthly'} SaaS Subscription & Platform Cloud License (${chosenPlanName} Tier)`,
        issuerTaxNo: state.platformInvoiceTemplate?.issuerTaxNo || (state.landingConfig as any)?.brandTaxNo || '',
        termsAndConditions: state.platformInvoiceTemplate?.termsAndConditions || (state.landingConfig as any)?.legalTermsSnippet || 'Standard Master Software License Agreement (MSLA).',
        signatoryName: state.platformInvoiceTemplate?.signatoryName || 'Authorized Signatory',
        paymentMethod: billingGateway.toUpperCase(),
        transactionRef: subId,
      };

      const updatedSettings = {
        planId: targetPlan.id,
        planName: chosenPlanName,
        planStatus: 'active' as const,
        subscriptionEndsAt: expiry,
        billingCycle: isAnnual ? ('annual' as const) : ('monthly' as const),
        autoRenew: true,
        cancelsAtPeriodEnd: false,
        previousActivePlanId: targetPlan.id,
        isInitialTrial: false,
        purgeScheduledAt: null,
        subscriptionMandate: {
          activeGateway: (billingGateway.toLowerCase() || 'stripe') as any,
          mandateId: subId || `mandate_${billingGateway}_${Date.now()}`,
          customerId: effectiveOwnerId,
          status: 'active' as const,
          autoRenew: true,
          nextBillingDate: expiry,
          billingCycle: isAnnual ? ('annual' as const) : ('monthly' as const),
          currentPlanId: targetPlan.id,
          planId: targetPlan.id,
          planName: chosenPlanName,
          amount: effectivePrice,
          currency: 'USD',
          failureCount: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      };

      updateState((prev) => {
        const nextOwnerSettings = { ...prev.ownerSettings };
        if (effectiveOwnerId) {
          nextOwnerSettings[effectiveOwnerId] = {
            ...(nextOwnerSettings[effectiveOwnerId] || {}),
            ...updatedSettings,
            ownerId: effectiveOwnerId,
          };
        }
        if (userFromState?.id && userFromState.id !== effectiveOwnerId) {
          nextOwnerSettings[userFromState.id] = {
            ...(nextOwnerSettings[userFromState.id] || {}),
            ...updatedSettings,
            ownerId: userFromState.id,
          };
        }

        const nextUsers = prev.users.map((u) => {
          if (
            (effectiveOwnerId && u.id === effectiveOwnerId) ||
            (userFromState?.id && u.id === userFromState.id) ||
            (user?.email && u.email?.toLowerCase() === user.email.toLowerCase())
          ) {
            return { ...u, plan: chosenPlanName, status: 'active' as const };
          }
          return u;
        });

        return {
          ...prev,
          ownerPlan: chosenPlanName,
          ownerSettings: nextOwnerSettings,
          users: nextUsers,
          platformInvoices: [newInvoice, ...(prev.platformInvoices || [])],
        };
      });

      try {
        if (updateUserProfile) {
          await updateUserProfile({ plan: chosenPlanName, status: 'active' });
        }
      } catch (e) {
        console.warn('updateUserProfile plan sync error:', e);
      }

      if (isFirebaseConfigured && effectiveOwnerId) {
        setDoc(
          doc(db, 'owners', effectiveOwnerId),
          {
            ownerId: effectiveOwnerId,
            planId: targetPlan.id,
            planName: chosenPlanName,
            planStatus: 'active',
            subscriptionEndsAt: expiry,
            billingCycle: isAnnual ? 'annual' : 'monthly',
            autoRenew: true,
            cancelsAtPeriodEnd: false,
            previousActivePlanId: targetPlan.id,
            isInitialTrial: false,
            purgeScheduledAt: null,
            subscriptionMandate: updatedSettings.subscriptionMandate,
          },
          { merge: true }
        ).catch((err) => console.warn('Firestore plan upgrade sync:', err));
        setDoc(
          doc(db, 'users', effectiveOwnerId),
          {
            plan: chosenPlanName,
            status: 'active',
          },
          { merge: true }
        ).catch((err) => console.warn('Firestore user doc plan sync:', err));
        setDoc(
          doc(db, 'platformInvoices', newInvoice.id),
          newInvoice,
          { merge: true }
        ).catch((err) => console.warn('Firestore platform invoice sync:', err));
      }

      if (effectivePrice > 0 && user?.email) {
        dispatchSubscriptionReceiptEmail({
          invoice: newInvoice,
          ownerEmail: user.email,
          ownerName: user.displayName || 'Property Owner',
          ownerId: effectiveOwnerId,
          planName: chosenPlanName,
          billingCycle,
          amount: effectivePrice,
          transactionId: subId,
          paymentMethod: billingGateway.toUpperCase(),
          currencySymbol: '$',
        }).then((res) => {
          if (res.success) {
            showToast(`✓ Plan upgraded! Official tax invoice emailed to ${user.email}.`);
          }
        }).catch((err) => {
          console.warn('[PlanSubscriptionPage] Subscription invoice email dispatch:', err);
        });
      } else {
        showToast(`✓ Plan successfully activated: ${chosenPlanName}! Official invoice generated.`);
      }

      setIsChangeModalOpen(false);
      setIsProcessing(false);
    };

    if (targetPlan.price === 0) {
      applyPlanUpgrade();
      return;
    }

    // 0. Easebuzz live production checkout
    if (billingGateway === 'easebuzz') {
      const ebKey = state.platformGateways.easebuzz?.merchantKey || '';
      const ebSalt = state.platformGateways.easebuzz?.salt || '';
      if (!ebKey || !ebSalt) {
        showToast('⚠️ Easebuzz credentials (Merchant Key & Salt) are not configured by platform admin. Please configure in Admin Connections.');
        return;
      }
      setIsProcessing(true);
      await launchEasebuzzPayment({
        merchantKey: ebKey,
        salt: ebSalt,
        subMerchantId: state.platformGateways.easebuzz?.subMerchantId,
        amount: Math.round(convert(effectivePrice, 'USD', 'INR')),
        currency: 'INR',
        name: `Propithub SaaS: ${selectedPlanName}`,
        description: `${isAnnual ? 'Annual' : 'Monthly'} SaaS Subscription (${selectedPlanName} Tier)`,
        paymentRecordId: subId,
        customerName: user?.displayName || userFromState?.displayName || 'Property Owner',
        customerEmail: user?.email || userFromState?.email || 'billing@propithub.com',
        customerPhone: user?.phone || '9876543210',
        onSuccess: () => {
          applyPlanUpgrade();
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(`Easebuzz payment notice: ${err}`);
        },
      });
      return;
    }

    // 2. Razorpay checkout
    if (billingGateway === 'razorpay') {
      const rzpKey = state.platformGateways.razorpay?.keyId || '';
      if (!rzpKey) {
        showToast('⚠️ Razorpay Key ID is not configured by platform admin. Please configure keys.');
        return;
      }
      setIsProcessing(true);
      await launchRazorpayPayment({
        keyId: rzpKey,
        amount: Math.round(convert(effectivePrice, 'USD', 'INR')), // live forex conversion USD -> INR
        currency: 'INR',
        name: `Propithub Subscription: ${selectedPlanName}`,
        description: `${isAnnual ? 'Annual' : 'Monthly'} subscription fee for ${selectedPlanName} plan`,
        paymentRecordId: subId,
        customerName: user?.displayName || 'Owner',
        customerEmail: user?.email || '',
        customerPhone: user?.phone || '',
        role: 'owner',
        ownerId: effectiveOwnerId,
        planId: targetPlan.id,
        billingCycle: isAnnual ? 'annual' : 'monthly',
        onSuccess: () => {
          applyPlanUpgrade();
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(`Razorpay checkout: ${err}`);
        },
      });
      return;
    }

    // 3. Stripe checkout
    if (billingGateway === 'stripe') {
      const stripePub = state.platformGateways.stripe?.pubKey || '';
      if (!stripePub) {
        showToast('⚠️ Stripe Publishable Key is not configured by platform admin. Please configure keys.');
        return;
      }
      setIsProcessing(true);
      await launchStripePayment({
        publishableKey: stripePub,
        amount: effectivePrice,
        currency: 'usd',
        paymentRecordId: subId,
        customerName: user?.displayName || 'Owner',
        customerEmail: user?.email || '',
        role: 'owner',
        ownerId: effectiveOwnerId,
        onSuccess: () => {
          applyPlanUpgrade();
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(`Stripe checkout: ${err}`);
        },
      });
      return;
    }

    // 4. PayPal checkout
    if (billingGateway === 'paypal') {
      const paypalClientId = state.platformGateways.paypal?.clientId || '';
      if (!paypalClientId) {
        showToast('⚠️ PayPal Client ID is not configured by platform admin. Please configure keys.');
        return;
      }
      setIsProcessing(true);
      await launchPayPalPayment({
        clientId: paypalClientId,
        amount: effectivePrice,
        currency: 'USD',
        name: `Propithub Subscription: ${selectedPlanName}`,
        description: `${isAnnual ? 'Annual' : 'Monthly'} subscription fee for ${selectedPlanName} plan`,
        paymentRecordId: subId,
        customerEmail: user?.email || '',
        onSuccess: () => {
          applyPlanUpgrade();
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(`PayPal checkout: ${err}`);
        },
      });
      return;
    }

    // Unconfigured gateway
    setIsProcessing(false);
    showToast(`Active billing gateway "${billingGateway}" is not configured. Please contact platform admin.`);
  };

  return (
    <div>
      <div className={selectedPlatformInvoice ? 'no-print' : ''}>
      {/* 15-Day Dropout Deletion Warning Banner */}
      {isInitialTrialDropout && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(185, 28, 28, 0.08))',
            border: '1px solid #ef4444',
            borderRadius: 'var(--radius)',
            padding: '18px 22px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🚨 Permanent Account Deletion Warning: {purgeDaysLeft !== null ? `${purgeDaysLeft} Days Remaining` : 'Pending'}
            </div>
            <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '6px', lineHeight: 1.5 }}>
              Your free trial has ended without an active subscription. Per platform policy, unconverted trial accounts and uploaded property photos will be permanently wiped on{' '}
              <strong>{purgeScheduledAt ? new Date(purgeScheduledAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Day 15'}</strong>.
              Activate any subscription plan below to cancel deletion and restore instant access.
            </div>
          </div>
          <button
            type="button"
            className="btn brass"
            onClick={() => {
              setSelectedPlanName('Starter');
              setIsChangeModalOpen(true);
            }}
          >
            Activate Plan to Retain Data
          </button>
        </div>
      )}

      {/* Dynamic Trial / Status Banner */}
      {isTrial && !isExpired && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(197, 160, 89, 0.12), rgba(197, 160, 89, 0.04))',
            border: '1px solid rgba(197, 160, 89, 0.35)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>
              🎉 Free Trial Active: {daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining ({currentPlan?.name} Tier)
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
              You are trialing the Starter tier. Upgrade to Growth or Enterprise to add Managers and expand capacity.
            </div>
          </div>
          <button
            type="button"
            className="btn brass small"
            onClick={() => {
              setSelectedPlanName(currentPlan?.name || 'Growth');
              setIsChangeModalOpen(true);
            }}
          >
            Upgrade / Subscribe Now
          </button>
        </div>
      )}

      {isExpired && (
        <div
          style={{
            background: '#FFF5F5',
            border: '1px solid #FEB2B2',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#9B2C2C' }}>
              {dynamicTrialDays === 0 ? '🔒 Subscription Required (Instant Purchase)' : '⚠️ Your Free Trial or Subscription Has Expired'}
            </div>
            <div style={{ fontSize: '13px', color: '#742A2A', marginTop: '4px' }}>
              {dynamicTrialDays === 0
                ? 'Free trial is disabled by platform policy. Please select and activate a subscription plan below to unlock your owner dashboard and property management tools.'
                : 'Please select and activate a subscription plan below to unlock full property management tools.'}
            </div>
          </div>
          <button
            type="button"
            className="btn brass small"
            onClick={() => {
              setSelectedPlanName(currentPlan?.name || 'Growth');
              setIsChangeModalOpen(true);
            }}
          >
            Select Plan &amp; Activate
          </button>
        </div>
      )}

      {/* Current Plan Overview Card */}
      <div className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0 }}>Your plan: {isTrial ? 'Free Trial' : (currentPlan?.name || currentPlanName || 'Starter')}</h3>
            {isExpired ? (
              <span className="badge amber">{dynamicTrialDays === 0 ? 'Subscription Required' : 'Trial Expired'}</span>
            ) : isTrial ? (
              <span className="badge green">
                Free Trial ({daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining)
              </span>
            ) : (
              <span className="badge green">Active Subscription</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>
              {isTrial ? '$0' : `$${currentPlan?.price || 79}`}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
              {isTrial ? 'during trial' : '/month'}
            </span>
            <CurrencyConverterTrigger amount={isTrial ? 0 : (currentPlan?.price || 79)} currency="USD" label="Convert" />
          </div>
        </div>
        <div className="panel-body">
          <div className="plan-dashboard-grid">
            {/* Left Column: Plan Terms & Billing Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                Subscription &amp; Billing Details
              </div>

              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Current Tier</span>
                <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{isTrial ? 'Free Trial' : (currentPlan?.name || currentPlanName || 'Starter')}</span>
              </div>

              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Base Price</span>
                <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>
                  {isTrial ? '$0 (Trial)' : `$${currentPlan?.price || 79}/month`}
                </span>
              </div>

              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Billing Cycle</span>
                <span style={{ textTransform: 'capitalize', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>
                  {isTrial && !ownerSettings?.subscriptionMandate?.autoRenew
                    ? `Trial Period (${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} remaining)`
                    : `${ownerSettings?.billingCycle || 'Monthly'} (${ownerSettings?.cancelsAtPeriodEnd ? 'Cancels at end of period' : 'Auto-renewing'})`}
                </span>
              </div>

              {ownerSettings?.subscriptionEndsAt && (
                <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="k" style={{ color: 'var(--ink-soft)' }}>Period End / Renewal</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-word' }}>
                    {new Date(ownerSettings.subscriptionEndsAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn brass btn-mobile-full"
                  onClick={() => {
                    const commPlans = state.plans.filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial');
                    setSelectedPlanName(currentPlan?.isTrialOnly ? (commPlans[0]?.name || 'Growth') : (currentPlan?.name || 'Growth'));
                    setIsChangeModalOpen(true);
                  }}
                >
                  Change plan
                </button>
                {!isTrial && ownerSettings?.planStatus === 'active' && (
                  <button
                    type="button"
                    className={`btn btn-mobile-full ${ownerSettings?.cancelsAtPeriodEnd ? 'secondary' : 'danger-soft'}`}
                    style={{ fontSize: '13px' }}
                    onClick={handleToggleAutoRenew}
                  >
                    {ownerSettings?.cancelsAtPeriodEnd ? 'Reactivate Auto-Renew' : 'Cancel Subscription (Do Not Renew)'}
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Quota & Capacity Utilization Gauges */}
            <div className="plan-quota-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Resource Quota &amp; Usage
                </div>
                <span className="badge grey" style={{ fontSize: '11px' }}>Live Capacity</span>
              </div>

              {/* Properties Gauge */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Properties</span>
                  <span style={{ fontWeight: 600 }}>
                    {propertiesUsed} / {currentPlan?.properties >= 999 ? 'Unlimited' : currentPlan?.properties}
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: 'var(--line)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${currentPlan?.properties >= 999 ? Math.min(100, propertiesUsed * 10) : Math.min(100, (propertiesUsed / Math.max(1, currentPlan?.properties || 1)) * 100)}%`,
                      background: 'var(--teal-primary)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Units Gauge */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Units</span>
                  <span style={{ fontWeight: 600 }}>
                    {unitsUsed} / {currentPlan?.units >= 9999 ? 'Unlimited' : currentPlan?.units}
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: 'var(--line)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${currentPlan?.units >= 9999 ? Math.min(100, unitsUsed * 5) : Math.min(100, (unitsUsed / Math.max(1, currentPlan?.units || 1)) * 100)}%`,
                      background: 'var(--teal-primary)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Tenants Gauge */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Tenants</span>
                  <span style={{ fontWeight: 600 }}>
                    {tenantsUsed} / {currentPlan?.tenants >= 9999 ? 'Unlimited' : currentPlan?.tenants}
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: 'var(--line)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${currentPlan?.tenants >= 9999 ? Math.min(100, tenantsUsed * 5) : Math.min(100, (tenantsUsed / Math.max(1, currentPlan?.tenants || 1)) * 100)}%`,
                      background: 'var(--teal-primary)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Managers Gauge */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Managers</span>
                  <span style={{ fontWeight: 600 }}>
                    {managersUsed} / {currentPlan?.managers ?? 0}
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: 'var(--line)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(currentPlan?.managers ?? 0) === 0 ? 0 : Math.min(100, (managersUsed / Math.max(1, currentPlan?.managers ?? 1)) * 100)}%`,
                      background: 'var(--amber)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Staff Gauge */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Staff Techs</span>
                  <span style={{ fontWeight: 600 }}>
                    {staffUsed} / {currentPlan?.staff ?? 0}
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: 'var(--line)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(currentPlan?.staff ?? 0) === 0 ? 0 : Math.min(100, (staffUsed / Math.max(1, currentPlan?.staff ?? 1)) * 100)}%`,
                      background: 'var(--amber)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Autopay & Subscription Mandate Card */}
      {(() => {
        const activeMandate = ownerSettings?.subscriptionMandate;
        const hasMandate = Boolean(activeMandate?.mandateId || (activeMandate?.status === 'active' && activeMandate?.activeGateway));
        const isAutopayActive = Boolean(
          hasMandate &&
          ownerSettings?.autoRenew === true &&
          !ownerSettings?.cancelsAtPeriodEnd
        );
        const currentGatewayKey = activeMandate?.activeGateway;
        const currentGatewayInfo = currentGatewayKey
          ? (availableBillingGateways.find((g) => g.key === currentGatewayKey) || {
              name: currentGatewayKey.toUpperCase(),
              icon: '💳',
              badge: 'Active Gateway',
              badgeClass: 'brass',
            })
          : null;

        // Dynamic base commercial plan configured by admin in Plans database
        const commercialPlans = state.plans
          .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
          .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));

        const baseCommercialPlan = commercialPlans.find(
          (p) =>
            (ownerSettings?.planId && p.id.toLowerCase() === ownerSettings.planId.toLowerCase() && p.id !== 'free_trial') ||
            (ownerSettings?.planName && p.name.toLowerCase() === ownerSettings.planName.toLowerCase() && !p.name.toLowerCase().includes('trial'))
        ) || commercialPlans[0] || { name: 'Starter', price: 29 };

        return (
          <div className="panel" style={{ marginTop: '20px', marginBottom: '24px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🔄</span>
                <div>
                  <h3 style={{ margin: 0 }}>Subscription Autopay &amp; Billing Mandate</h3>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                    Single active mandate across all payment gateways — zero double-billing guarantee
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isAutopayActive ? (
                  <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></span>
                    Autopay Active
                  </span>
                ) : (
                  <span className="badge amber">Autopay Disabled</span>
                )}
              </div>
            </div>
            <div className="panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', alignItems: 'center' }}>
                {/* Active Gateway */}
                <div style={{ background: 'var(--surface-sunken)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 700, marginBottom: '8px' }}>
                    Active Billing Gateway
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '28px' }}>{hasMandate && currentGatewayInfo ? currentGatewayInfo.icon : '💳'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>
                        {hasMandate && currentGatewayInfo ? currentGatewayInfo.name : 'None'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        {hasMandate && activeMandate?.mandateId ? `Mandate Ref: ${activeMandate.mandateId}` : 'No payment method or mandate attached'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scheduled Renewal */}
                <div style={{ background: 'var(--surface-sunken)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 700, marginBottom: '8px' }}>
                    {isTrial ? 'Trial Transition Terms' : 'Next Scheduled Billing'}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>
                    {isTrial
                      ? `Base Plan (${baseCommercialPlan.name} @ $${baseCommercialPlan.price}/mo)`
                      : `${currentPlan?.name || 'Starter'} (${ownerSettings?.billingCycle === 'annual' ? 'Annual' : 'Monthly'})`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                    {ownerSettings?.subscriptionEndsAt
                      ? `Scheduled on ${new Date(ownerSettings.subscriptionEndsAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                      : trialEnds
                      ? (isAutopayActive
                          ? `Auto-bills upon trial expiry (${new Date(trialEnds).toLocaleDateString()})`
                          : `Trial ends on ${new Date(trialEnds).toLocaleDateString()} (Manual renewal required)`)
                      : 'On billing cycle end'}
                  </div>
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px' }}>
                  <button
                    type="button"
                    className="btn brass"
                    onClick={() => {
                      setSelectedNewGateway((currentGatewayKey as any) || 'stripe');
                      setIsChangePaymentMethodOpen(true);
                    }}
                  >
                    {hasMandate ? 'Change Payment Method' : 'Set Up Autopay / Add Card'}
                  </button>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>
                        Auto-Renew Plan
                      </span>
                      <span style={{ fontSize: '11px', color: isAutopayActive ? '#10B981' : 'var(--ink-soft)', fontWeight: isAutopayActive ? 600 : 400 }}>
                        {isAutopayActive ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <label
                      className={`toggle ${isAutopayActive ? 'on' : ''}`}
                      onClick={() => {
                        if (!hasMandate) {
                          setSelectedNewGateway('stripe');
                          setIsChangePaymentMethodOpen(true);
                        } else {
                          handleToggleAutoRenew();
                        }
                      }}
                      title={isAutopayActive ? 'Click to disable autopay' : 'Click to enable autopay'}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="track" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="section-title">All Available Propithub Subscription Tiers</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
        {state.plans
          .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
          .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))
          .map((p) => (
          <div key={p.id} className="panel">
            <div className="panel-head">
              <h3>{p.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge grey">${p.price}/mo</span>
                <CurrencyConverterTrigger amount={p.price} currency="USD" label="Convert" />
              </div>
            </div>
            <div className="panel-body">
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Max Properties:</span>
                <b>{p.properties >= 999 ? 'Unlimited' : p.properties}</b>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Max Units:</span>
                <b>{p.units >= 9999 ? 'Unlimited' : p.units}</b>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Max Tenants:</span>
                <b>{p.tenants >= 9999 ? 'Unlimited' : p.tenants}</b>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Max Managers:</span>
                <b>{p.managers ?? 0}</b>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Max Maintenance Staff:</span>
                <b>{p.staff ?? 0}</b>
              </div>

              <div style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className={`btn ${currentPlan?.name === p.name ? 'secondary' : 'brass'}`}
                  style={{ width: '100%' }}
                  disabled={currentPlan?.name === p.name}
                  onClick={() => {
                    setSelectedPlanName(p.name);
                    setIsChangeModalOpen(true);
                  }}
                >
                  {currentPlan?.name === p.name ? 'Current Plan' : `Switch to ${p.name}`}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Billing History & Platform Invoices (Admin <-> Owner) */}
      <div className="section-title" style={{ marginTop: '32px' }}>
        Billing History & Official Platform Invoices
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Propithub SaaS Subscription Receipts</h3>
            <div className="hint">Invoices issued to your account for platform hosting and plan subscriptions</div>
          </div>
        </div>
        <div className="panel-body">
          <div className="desktop-table-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice ID</th>
                    <th>Subscription Plan</th>
                    <th>Billing Period</th>
                    <th>Total Amount</th>
                    <th>Status</th>
                    <th>Issue / Settlement Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const myInvoices = (state.platformInvoices || []).filter(
                      (i) => i.ownerId === ownerId || (user?.email && i.ownerEmail.toLowerCase() === user.email.toLowerCase())
                    );

                    if (myInvoices.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px' }}>
                            <FileText size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                            No subscription invoices issued yet. When your monthly subscription is billed by Propithub, official invoices and downloadable receipts will appear here.
                          </td>
                        </tr>
                      );
                    }

                    return myInvoices.map((inv) => {
                      const isPaid = inv.status === 'paid';
                      const period = `${new Date(inv.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(inv.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

                      return (
                        <tr key={inv.id}>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.id}</span>
                          </td>
                          <td>
                            <b>{inv.planName} Tier</b>
                          </td>
                          <td>{period}</td>
                          <td>
                            <b>${inv.total.toFixed(2)}</b>
                          </td>
                          <td>
                            <span className={`badge ${isPaid ? 'green' : 'amber'}`}>
                              {inv.status.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div>Issued: {new Date(inv.issueDate).toLocaleDateString()}</div>
                            <div style={{ fontSize: '12px', color: isPaid ? 'var(--green)' : 'var(--ink-soft)' }}>
                              {isPaid && inv.paidAt ? `Paid on ${new Date(inv.paidAt).toLocaleDateString()}` : `Due: ${new Date(inv.dueDate).toLocaleDateString()}`}
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => setSelectedPlatformInvoice(inv)}
                            >
                              View Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mobile-card-view">
            {(() => {
              const myInvoices = (state.platformInvoices || []).filter(
                (i) => i.ownerId === ownerId || (user?.email && i.ownerEmail.toLowerCase() === user.email.toLowerCase())
              );

              if (myInvoices.length === 0) {
                return (
                  <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px' }}>
                    <FileText size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                    No subscription invoices issued yet.
                  </div>
                );
              }

              return myInvoices.map((inv) => {
                const isPaid = inv.status === 'paid';
                const period = `${new Date(inv.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(inv.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

                return (
                  <div key={inv.id} className="staff-card" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>{inv.id}</span>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', marginTop: '2px' }}>{inv.planName} Tier</div>
                      </div>
                      <span className={`badge ${isPaid ? 'green' : 'amber'}`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Billing Period</span>
                      <span style={{ fontSize: '12px' }}>{period}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Total Amount</span>
                      <b style={{ fontSize: '14px', color: 'var(--ledger)' }}>${inv.total.toFixed(2)}</b>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12px' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Issued / Paid</span>
                      <span>{isPaid && inv.paidAt ? `Paid ${new Date(inv.paidAt).toLocaleDateString()}` : `Due: ${new Date(inv.dueDate).toLocaleDateString()}`}</span>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        className="btn secondary small btn-mobile-full"
                        onClick={() => setSelectedPlatformInvoice(inv)}
                      >
                        View Receipt
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
      </div>

      {/* Modal: View Owner's Platform Invoice Receipt */}
      {selectedPlatformInvoice && (
        <div className="modal-backdrop" onClick={() => setSelectedPlatformInvoice(null)}>
          <div
            id="printable-platform-invoice"
            className="modal-card invoice-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '640px',
              padding: 0,
              background: '#FFFFFF',
              color: '#111827',
              border: 'none',
              boxShadow: 'none',
              ['--ink' as any]: '#111827',
              ['--ink-soft' as any]: '#4B5563',
              ['--surface-sunken' as any]: '#F8F9FB',
              ['--line' as any]: '#E5E7EB',
              ['--line-strong' as any]: '#D1D5DB',
            }}
          >
            <div style={{ padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--line)', paddingBottom: '20px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>
                    PROPIT<span style={{ color: 'var(--brass)' }}>HUB</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                    Propithub Technologies Cloud Platform<br />
                    Billing & Licensing Division
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>INVOICE RECEIPT</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, marginTop: '2px' }}>{selectedPlatformInvoice.id}</div>
                  <div style={{ marginTop: '8px' }}>
                    <span className={`badge ${selectedPlatformInvoice.status === 'paid' ? 'green' : 'brass'}`}>
                      {selectedPlatformInvoice.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-2" style={{ marginBottom: '24px', fontSize: '13px', lineHeight: '1.6' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '11px', marginBottom: '4px' }}>
                    Customer Details:
                  </div>
                  <b>{selectedPlatformInvoice.ownerName}</b>
                  <div>{selectedPlatformInvoice.ownerEmail}</div>
                  <div style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Account ID: {selectedPlatformInvoice.ownerId}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '11px', marginBottom: '4px' }}>
                    Timeline:
                  </div>
                  <div>Issue Date: <b>{new Date(selectedPlatformInvoice.issueDate).toLocaleDateString()}</b></div>
                  <div>Due Date: <b>{new Date(selectedPlatformInvoice.dueDate).toLocaleDateString()}</b></div>
                  {selectedPlatformInvoice.paidAt && (
                    <div style={{ color: 'var(--green)', fontWeight: 600 }}>
                      Paid on: {new Date(selectedPlatformInvoice.paidAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              <table style={{ width: '100%', marginBottom: '24px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--line-strong)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Item Description</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '14px 12px' }}>
                      <b>Propithub SaaS Subscription — {selectedPlatformInvoice.planName} Plan</b>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        {selectedPlatformInvoice.notes || 'Multi-property tenant management & cloud dispatch'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '14px 12px', fontWeight: 600, fontSize: '15px' }}>
                      ${selectedPlatformInvoice.amount.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                <div style={{ width: '240px', fontSize: '14px', lineHeight: '1.8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal:</span>
                    <span>${selectedPlatformInvoice.amount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--line-strong)', paddingTop: '6px', fontWeight: 700, fontSize: '16px' }}>
                    <span>Total:</span>
                    <span style={{ color: 'var(--brass)' }}>${selectedPlatformInvoice.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {selectedPlatformInvoice.status === 'paid' ? (
                <div style={{ background: 'var(--ledger-soft)', border: '1px solid var(--ledger)', padding: '14px', borderRadius: 'var(--radius)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle2 size={20} color="var(--ledger)" />
                  <div>
                    <b>Payment Confirmed:</b> Settled via {selectedPlatformInvoice.paymentMethod || 'Stripe / Bank Wire'}.<br />
                    <span style={{ fontSize: '12px', color: 'var(--ink)' }}>Ref: {selectedPlatformInvoice.transactionRef || 'N/A'}</span>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber)', padding: '14px', borderRadius: 'var(--radius)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Clock size={20} color="var(--amber)" />
                  <div>
                    <b>Payment Due:</b> Due by {new Date(selectedPlatformInvoice.dueDate).toLocaleDateString()}.
                  </div>
                </div>
              )}
            </div>

            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', background: 'var(--surface-sunken)', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn secondary small btn-mobile-full"
                  onClick={() => downloadSinglePlatformInvoicePDF(selectedPlatformInvoice)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  type="button"
                  className="btn secondary small btn-mobile-full"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                >
                  <Printer size={14} /> Print Receipt
                </button>
              </div>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setSelectedPlatformInvoice(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {isChangeModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsChangeModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Change plan</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsChangeModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Choose a plan</label>
                <select
                  value={selectedPlanName}
                  onChange={(e) => setSelectedPlanName(e.target.value)}
                >
                  {state.plans
                    .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
                    .map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} — ${p.price}/mo
                      </option>
                    ))}
                </select>
              </div>

              {/* Billing Cycle Toggle */}
              <div className="field" style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span>Billing Frequency</span>
                  {billingCycle === 'annual' && (state.annualDiscountPercent ?? 20) > 0 && (
                    <span className="badge green" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      ✓ {state.annualDiscountPercent ?? 20}% Annual Savings Applied
                    </span>
                  )}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    className={`btn small ${billingCycle === 'monthly' ? 'brass' : 'secondary'}`}
                    onClick={() => setBillingCycle('monthly')}
                    style={{ justifyContent: 'center' }}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={`btn small ${billingCycle === 'annual' ? 'brass' : 'secondary'}`}
                    onClick={() => setBillingCycle('annual')}
                    style={{ justifyContent: 'center' }}
                  >
                    {(state.annualDiscountPercent ?? 20) > 0
                      ? `Annual (Save ${state.annualDiscountPercent ?? 20}%)`
                      : 'Annual'}
                  </button>
                </div>
              </div>

              {(() => {
                const targetPlanObj = state.plans.find((p) => p.name.toLowerCase() === selectedPlanName.toLowerCase()) || state.plans[0];
                const violations: string[] = [];
                if (targetPlanObj) {
                  if (targetPlanObj.properties < 999 && propertiesUsed > targetPlanObj.properties) {
                    violations.push(`${propertiesUsed} properties (limit: ${targetPlanObj.properties})`);
                  }
                  if (targetPlanObj.units < 9999 && unitsUsed > targetPlanObj.units) {
                    violations.push(`${unitsUsed} units (limit: ${targetPlanObj.units})`);
                  }
                  if (targetPlanObj.tenants < 9999 && tenantsUsed > targetPlanObj.tenants) {
                    violations.push(`${tenantsUsed} tenants (limit: ${targetPlanObj.tenants})`);
                  }
                  if (managersUsed > (targetPlanObj.managers ?? 0)) {
                    violations.push(`${managersUsed} managers (limit: ${targetPlanObj.managers ?? 0})`);
                  }
                  if (staffUsed > (targetPlanObj.staff ?? 0)) {
                    violations.push(`${staffUsed} maintenance staff (limit: ${targetPlanObj.staff ?? 0})`);
                  }
                }
                if (violations.length > 0) {
                  return (
                    <div style={{ padding: '12px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: '6px', fontSize: '12.5px', color: 'var(--danger)', marginBottom: '14px', lineHeight: 1.5 }}>
                      ⚠️ <b>Cannot Downgrade to {targetPlanObj?.name}:</b> Your account currently uses {violations.join(', ')}. Please delete or archive excess items before switching to this tier.
                    </div>
                  );
                }
                return null;
              })()}

              {/* Anti-duplicate Plan Warning */}
              {(() => {
                const isCurrentPlanActive = !isTrial && ownerSettings?.planStatus === 'active' && !isExpired;
                const isSamePlanAndCycle = Boolean(
                  isCurrentPlanActive &&
                  currentPlan &&
                  selectedPlanName.toLowerCase() === currentPlan.name.toLowerCase() &&
                  billingCycle === (ownerSettings?.billingCycle || 'monthly')
                );
                if (isSamePlanAndCycle) {
                  return (
                    <div style={{ padding: '12px 14px', background: 'rgba(47, 93, 80, 0.08)', border: '1px solid var(--teal-primary)', borderRadius: '6px', fontSize: '12.5px', color: 'var(--ink)', marginBottom: '14px', lineHeight: 1.5 }}>
                      ℹ️ <b>Already Active Plan:</b> You are currently subscribed to the <b>{currentPlan?.name}</b> tier ({billingCycle === 'annual' ? 'Annual' : 'Monthly'}).
                      {ownerSettings?.subscriptionEndsAt && (
                        <div style={{ marginTop: '4px', color: 'var(--ink-soft)' }}>
                          Your plan is active and scheduled for renewal on <b>{new Date(ownerSettings.subscriptionEndsAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</b>.
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Dynamic Billing Gateway Selector */}
              {(() => {
                const isCurrentPlanActive = !isTrial && ownerSettings?.planStatus === 'active' && !isExpired;
                const isSamePlanAndCycle = Boolean(
                  isCurrentPlanActive &&
                  currentPlan &&
                  selectedPlanName.toLowerCase() === currentPlan.name.toLowerCase() &&
                  billingCycle === (ownerSettings?.billingCycle || 'monthly')
                );
                if (isSamePlanAndCycle) return null;

                const targetPlanObj = state.plans.find((p) => p.name.toLowerCase() === selectedPlanName.toLowerCase()) || state.plans[0];
                if (!targetPlanObj || targetPlanObj.price === 0) {
                  return (
                    <div style={{ padding: '10px 14px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '12px', marginBottom: '14px' }}>
                      🎉 <b>Free Plan Tier:</b> No billing gateway or payment transaction required.
                    </div>
                  );
                }

                return (
                  <div style={{ marginTop: '14px', marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                      Select Billing Gateway
                    </label>

                    {/* Synchronized Select Dropdown */}
                    <select
                      value={selectedBillingGateway}
                      onChange={(e) => setSelectedBillingGateway(e.target.value as any)}
                      style={{ fontWeight: 600, fontSize: '12.5px', padding: '8px 12px' }}
                    >
                      {availableBillingGateways.map((gw) => (
                        <option key={gw.key} value={gw.key}>
                          {gw.name} — {gw.priceNote ? gw.priceNote(targetPlanObj.price) : `$${targetPlanObj.price}/mo`}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              <p className="hint">
                Upgrading or downgrading adjusts your property, unit, and team member limits immediately.
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setIsChangeModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={handleConfirmChange}
                disabled={isProcessing || (() => {
                  const isCurrentPlanActive = !isTrial && ownerSettings?.planStatus === 'active' && !isExpired;
                  const isSamePlanAndCycle = Boolean(
                    isCurrentPlanActive &&
                    currentPlan &&
                    selectedPlanName.toLowerCase() === currentPlan.name.toLowerCase() &&
                    billingCycle === (ownerSettings?.billingCycle || 'monthly')
                  );
                  if (isSamePlanAndCycle) return true;

                  const targetPlanObj = state.plans.find((p) => p.name.toLowerCase() === selectedPlanName.toLowerCase()) || state.plans[0];
                  if (!targetPlanObj) return false;
                  return (
                    (targetPlanObj.properties < 999 && propertiesUsed > targetPlanObj.properties) ||
                    (targetPlanObj.units < 9999 && unitsUsed > targetPlanObj.units) ||
                    (targetPlanObj.tenants < 9999 && tenantsUsed > targetPlanObj.tenants) ||
                    (managersUsed > (targetPlanObj.managers ?? 0)) ||
                    (staffUsed > (targetPlanObj.staff ?? 0))
                  );
                })()}
              >
                {isProcessing
                  ? 'Connecting to Billing Gateway...'
                  : (() => {
                      const isCurrentPlanActive = !isTrial && ownerSettings?.planStatus === 'active' && !isExpired;
                      const isSamePlanAndCycle = Boolean(
                        isCurrentPlanActive &&
                        currentPlan &&
                        selectedPlanName.toLowerCase() === currentPlan.name.toLowerCase() &&
                        billingCycle === (ownerSettings?.billingCycle || 'monthly')
                      );
                      if (isSamePlanAndCycle) return 'Current Active Plan (Already Subscribed)';

                      const targetPlanObj = state.plans.find((p) => p.name.toLowerCase() === selectedPlanName.toLowerCase()) || state.plans[0];
                      if (!targetPlanObj || targetPlanObj.price === 0) return 'Confirm Free Plan';
                      const isAnnual = billingCycle === 'annual';
                      const annualDiscount = state.annualDiscountPercent ?? 20;
                      const discountMultiplier = (100 - annualDiscount) / 100;
                      const effectivePrice = isAnnual ? Math.round(targetPlanObj.price * 12 * discountMultiplier) : targetPlanObj.price;
                      const gwObj = availableBillingGateways.find((g) => g.key === selectedBillingGateway);
                      const annualLabel = annualDiscount > 0 ? `/yr (${annualDiscount}% off)` : '/yr';
                      return `Confirm & Pay ($${effectivePrice}${isAnnual ? annualLabel : '/mo'} via ${gwObj?.shortTitle || 'Gateway'})`;
                    })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Payment Method Modal */}
      {isChangePaymentMethodOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal-head">
              <h3>Change Subscription Payment Method</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setIsChangePaymentMethodOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                Select a payment method below. Your active mandate will immediately migrate to this gateway. 
                Propithub automatically cancels your previous mandate so you are <strong>never double-billed</strong>.
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '8px', color: 'var(--ink)' }}>
                  Select Billing Gateway
                </label>
                <select
                  value={selectedNewGateway}
                  onChange={(e) => setSelectedNewGateway(e.target.value as any)}
                  style={{ width: '100%', padding: '10px 14px', fontWeight: 600, fontSize: '13px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}
                >
                  {availableBillingGateways.map((gw) => (
                    <option key={gw.key} value={gw.key}>
                      {gw.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Interactive Mandate Authorization Form */}
              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                {selectedNewGateway === 'stripe' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Credit / Debit Card
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Cardholder Name</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Owner Full Name"
                        value={ownerMandateCardName}
                        onChange={(e) => setOwnerMandateCardName(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Card Number</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="4242 •••• •••• 4242"
                        maxLength={19}
                        value={ownerMandateCardNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                          const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                          setOwnerMandateCardNumber(formatted);
                        }}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', letterSpacing: '1px' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Expiry</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="MM/YY"
                          maxLength={5}
                          value={ownerMandateCardExpiry}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                            if (val.length >= 3) val = `${val.slice(0, 2)}/${val.slice(2)}`;
                            setOwnerMandateCardExpiry(val);
                          }}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>CVV</label>
                        <input
                          type="password"
                          className="input"
                          placeholder="•••"
                          maxLength={4}
                          value={ownerMandateCardCvv}
                          onChange={(e) => setOwnerMandateCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchLiveOwnerStripeMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #635BFF, #4F46E5)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(99, 91, 255, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                  </div>
                )}

                {selectedNewGateway === 'razorpay' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setOwnerMandateRzpSubMode('card')}
                        style={{
                          flex: 1,
                          padding: '7px 12px',
                          borderRadius: '6px',
                          border: ownerMandateRzpSubMode === 'card' ? '1.5px solid var(--teal-primary)' : '1px solid var(--line)',
                          background: ownerMandateRzpSubMode === 'card' ? 'var(--teal-light)' : 'var(--surface)',
                          color: ownerMandateRzpSubMode === 'card' ? 'var(--teal-primary)' : 'var(--ink-soft)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Debit / Credit Card
                      </button>
                      <button
                        type="button"
                        onClick={() => setOwnerMandateRzpSubMode('upi')}
                        style={{
                          flex: 1,
                          padding: '7px 12px',
                          borderRadius: '6px',
                          border: ownerMandateRzpSubMode === 'upi' ? '1.5px solid var(--teal-primary)' : '1px solid var(--line)',
                          background: ownerMandateRzpSubMode === 'upi' ? 'var(--teal-light)' : 'var(--surface)',
                          color: ownerMandateRzpSubMode === 'upi' ? 'var(--teal-primary)' : 'var(--ink-soft)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        UPI AutoPay
                      </button>
                    </div>

                    {ownerMandateRzpSubMode === 'upi' ? (
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>UPI VPA</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. owner@okhdfcbank"
                          value={ownerMandateUpiId}
                          onChange={(e) => setOwnerMandateUpiId(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                        />
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {['@okhdfcbank', '@okicici', '@okaxis', '@ybl', '@paytm'].map((handle) => (
                            <button
                              key={handle}
                              type="button"
                              onClick={() => {
                                const userPart = ownerMandateUpiId.includes('@') ? ownerMandateUpiId.split('@')[0] : ownerMandateUpiId || 'owner';
                                setOwnerMandateUpiId(`${userPart}${handle}`);
                              }}
                              style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', color: 'var(--ink)', cursor: 'pointer' }}
                            >
                              {handle}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Card Number</label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Card Number"
                            maxLength={19}
                            value={ownerMandateCardNumber}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                              const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                              setOwnerMandateCardNumber(formatted);
                            }}
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Expiry</label>
                            <input
                              type="text"
                              className="input"
                              placeholder="MM/YY"
                              maxLength={5}
                              value={ownerMandateCardExpiry}
                              onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                if (val.length >= 3) val = `${val.slice(0, 2)}/${val.slice(2)}`;
                                setOwnerMandateCardExpiry(val);
                              }}
                              style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>CVV</label>
                            <input
                              type="password"
                              className="input"
                              placeholder="•••"
                              maxLength={4}
                              value={ownerMandateCardCvv}
                              onChange={(e) => setOwnerMandateCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleLaunchLiveOwnerRazorpayMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #10B981, #059669)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                  </div>
                )}

                {selectedNewGateway === 'easebuzz' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Bank</label>
                      <select
                        className="input"
                        value={ownerMandateBankName}
                        onChange={(e) => setOwnerMandateBankName(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      >
                        <option value="HDFC Bank">HDFC Bank</option>
                        <option value="State Bank of India">State Bank of India</option>
                        <option value="ICICI Bank">ICICI Bank</option>
                        <option value="Axis Bank">Axis Bank</option>
                        <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Account Number</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Account Number"
                        value={ownerMandateAccountNum}
                        onChange={(e) => setOwnerMandateAccountNum(e.target.value.replace(/\D/g, ''))}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchLiveOwnerEasebuzzMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #0A58CA, #084298)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(10, 88, 202, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                  </div>
                )}

                {selectedNewGateway === 'paypal' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>PayPal Billing Email</label>
                      <input
                        type="email"
                        className="input"
                        placeholder="owner@example.com"
                        value={ownerMandatePaypalEmail}
                        onChange={(e) => setOwnerMandatePaypalEmail(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchLiveOwnerPayPalMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #003087, #0079C1)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(0, 48, 135, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                  </div>
                )}
              </div>

              {/* Legal Mandate Consent Checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12px', color: 'var(--ink)', cursor: 'pointer', lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={ownerMandateConsentChecked}
                  onChange={(e) => setOwnerMandateConsentChecked(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  I authorize automatic renewal of my subscription plan. You can cancel or pause auto-renew anytime.
                </span>
              </label>

              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', color: 'var(--ink)' }}>
                ℹ️ Propithub enforces strictly 1 active mandate per owner account. The previous gateway mandate is synchronously terminated upon switching.
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsChangePaymentMethodOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                disabled={isProcessing}
                onClick={async () => {
                  if (!effectiveOwnerId) return;

                  if (!ownerMandateConsentChecked) {
                    showToast('⚠️ Please check the standing instruction authorization box to proceed.');
                    return;
                  }

                  let displayDetails = `${selectedNewGateway.toUpperCase()} Active Card`;
                  let token = `mandate_${selectedNewGateway}_${Date.now()}`;
                  const cleanCard = ownerMandateCardNumber.replace(/\s+/g, '');

                  if (selectedNewGateway === 'stripe') {
                    if (!cleanCard || cleanCard.length < 15) {
                      showToast('⚠️ Please enter a valid 16-digit card number.');
                      return;
                    }
                    if (!ownerMandateCardExpiry || !ownerMandateCardExpiry.includes('/')) {
                      showToast('⚠️ Please enter card expiry in MM/YY format.');
                      return;
                    }
                    if (!ownerMandateCardCvv || ownerMandateCardCvv.length < 3) {
                      showToast('⚠️ Please enter a valid 3-digit CVV/CVC.');
                      return;
                    }
                    const last4 = cleanCard.slice(-4);
                    const brand = cleanCard.startsWith('4') ? 'Visa' : cleanCard.startsWith('5') ? 'Mastercard' : 'Card';
                    displayDetails = `${brand} ending in •••• ${last4}`;
                    token = `pm_owner_${last4}_${Date.now()}`;
                  } else if (selectedNewGateway === 'razorpay') {
                    if (ownerMandateRzpSubMode === 'upi') {
                      if (!ownerMandateUpiId || !ownerMandateUpiId.includes('@')) {
                        showToast('⚠️ Please enter a valid UPI ID (e.g. owner@okhdfcbank).');
                        return;
                      }
                      displayDetails = `UPI AutoPay (${ownerMandateUpiId.trim()})`;
                      token = `rzp_upi_${Date.now()}`;
                    } else {
                      if (!cleanCard || cleanCard.length < 15) {
                        showToast('⚠️ Please enter a valid card number.');
                        return;
                      }
                      const last4 = cleanCard.slice(-4);
                      displayDetails = `Card ending in •••• ${last4}`;
                      token = `rzp_card_${last4}_${Date.now()}`;
                    }
                  } else if (selectedNewGateway === 'easebuzz') {
                    if (!ownerMandateAccountNum || ownerMandateAccountNum.length < 6) {
                      showToast('⚠️ Please enter a valid account number.');
                      return;
                    }
                    const last4 = ownerMandateAccountNum.slice(-4);
                    displayDetails = `e-NACH (${ownerMandateBankName} •••• ${last4})`;
                    token = `eb_nach_${last4}_${Date.now()}`;
                  } else if (selectedNewGateway === 'paypal') {
                    if (!ownerMandatePaypalEmail || !ownerMandatePaypalEmail.includes('@')) {
                      showToast('⚠️ Please enter your PayPal billing email address.');
                      return;
                    }
                    displayDetails = `PayPal (${ownerMandatePaypalEmail.trim()})`;
                    token = `B-${Date.now().toString(36).toUpperCase()}`;
                  }

                  setIsProcessing(true);
                  try {
                    await updateOwnerAutopay(effectiveOwnerId, {
                      activeGateway: selectedNewGateway,
                      mandateId: token,
                      status: 'active',
                      autoRenew: true,
                      displayDetails,
                      updatedAt: new Date().toISOString(),
                    });
                    showToast(`✓ Active billing method switched to ${displayDetails}! Old mandate cancelled.`);
                    setIsChangePaymentMethodOpen(false);
                  } catch (err: any) {
                    showToast(`Error switching payment method: ${err.message || err}`);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
              >
                {isProcessing ? 'Authorizing...' : 'Authorize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
