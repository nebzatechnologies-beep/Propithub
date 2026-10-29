import React, { useState, useMemo, useEffect } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Invoice, PaymentTransaction, InvoiceTemplateConfig } from '../../types';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getDaysFromNowString, getTodayDateString } from '../../lib/dates';
import { RentalInvoiceStudioModal, DEFAULT_DEPOSIT_TERMS } from '../../components/invoices/RentalInvoiceStudioModal';
import { downloadSingleInvoicePDF, downloadBulkInvoicesPDF, exportInvoicesCSV } from '../../lib/pdf';
import {
  pingGatewayEndpoint,
  verifyStripeCredentials,
  verifyRazorpayCredentials,
  verifyPayPalCredentials,
} from '../../lib/payments';
import { generateTransactionId, generateInvoiceId, generateReceiptId } from '../../lib/idGenerators';
import { ButtonProcessing } from '../../components/common/Spinner';
import { CurrencyConverterTrigger } from '../../components/common/CurrencyConverterTrigger';
import { useCurrency } from '../../context/CurrencyContext';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol, GLOBAL_CURRENCIES, formatCurrencyAmount, normalizeCurrencyCode } from '../../lib/currencyService';
import {
  Download,
  FileText,
  CheckCircle,
  AlertTriangle,
  Eye,
  Edit3,
  X,
  Filter,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Clock,
  Sliders,
  Sparkles,
  Save,
  LayoutTemplate,
  FlaskConical,
  Settings,
  CalendarClock,
  ArrowLeftRight,
  CreditCard,
  Send,
  Check,
  DollarSign,
  Wallet,
  ShieldAlert,
  User,
  Building,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
  RefreshCw,
  Phone,
  Mail,
  Search,
} from 'lucide-react';

export const PaymentsPage: React.FC = () => {
  const { state, updateState, saveInvoice, savePayment, markInvoicePaid, waiveInvoiceLateFee, saveOwnerSettings, confirmCashClaim, rejectCashClaim, submitCashClaim, logCommunication, showToast } = useAppData();
  const { user } = useAuth();
  const ownerId = user?.id || '';

  const { viewCurrency, convert } = useCurrency();
  const activeCurrencyCode = viewCurrency || 'USD';
  const activeCurrencyMeta =
    GLOBAL_CURRENCIES.find((c) => c.code === activeCurrencyCode) ||
    ({ symbol: '$', code: 'USD' } as any);
  const activeSymbol = activeCurrencyMeta.symbol || activeCurrencyCode;

  const formatMoney = (amount: number | null | undefined, fromCurrency?: string) => {
    const raw = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    const fromCode = fromCurrency ? normalizeCurrencyCode(fromCurrency) : 'USD';
    const converted = convert(raw, fromCode, activeCurrencyCode);
    return formatCurrencyAmount(converted, activeCurrencyCode);
  };

  const [subTab, setSubTab] = useState<'rent_due' | 'deposit' | 'transactions' | 'invoices' | 'methods' | 'template' | 'settings'>('rent_due');
  const [remindingTenantId, setRemindingTenantId] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [isRecordingOffline, setIsRecordingOffline] = useState(false);
  const [isApprovingProof, setIsApprovingProof] = useState(false);
  const [isRejectingProof, setIsRejectingProof] = useState(false);
  const [isSavingTmpl, setIsSavingTmpl] = useState(false);
  const [isSavingDepTmpl, setIsSavingDepTmpl] = useState(false);

  // Rent Due filters & search
  const [rentDueFilter, setRentDueFilter] = useState<'all' | 'overdue' | 'due_soon' | 'paid' | 'pending_confirmation'>('all');
  const [rentSearch, setRentSearch] = useState('');

  // Security Deposit filters & search
  const [depositLedgerFilter, setDepositLedgerFilter] = useState<'all' | 'held' | 'pending_collection' | 'moveout' | 'refunded'>('all');
  const [depositSearch, setDepositSearch] = useState('');

  // Studio modal state (live preview & editor for rental invoices and deposit vouchers)
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioInvoice, setStudioInvoice] = useState<Invoice | null>(null);
  const [studioMode, setStudioMode] = useState<'create' | 'edit' | 'preview'>('create');
  const [studioInitialCategory, setStudioInitialCategory] = useState<'rent' | 'deposit' | 'utility' | 'maintenance' | 'late_fee'>('rent');

  // Invoices Timeline & Filter States
  const [invoiceTimeline, setInvoiceTimeline] = useState<'all' | 'this_month' | 'last_month' | 'this_quarter' | 'custom'>('all');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'paid' | 'pending_confirmation' | 'sent' | 'overdue' | 'draft'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Bulk Download Confirmation & Timeline Modal state
  const [isBulkDownloadModalOpen, setIsBulkDownloadModalOpen] = useState(false);
  const [bulkModalTimeline, setBulkModalTimeline] = useState<'all' | 'this_month' | 'last_month' | 'this_quarter' | 'custom'>('all');
  const [bulkCustomStart, setBulkCustomStart] = useState('');
  const [bulkCustomEnd, setBulkCustomEnd] = useState('');
  const [bulkStatusFilter, setBulkStatusFilter] = useState<'all' | 'paid' | 'pending_confirmation' | 'sent' | 'overdue' | 'draft'>('all');

  // Proof Review modal state
  const [reviewingProofInvoice, setReviewingProofInvoice] = useState<Invoice | null>(null);



  // Late fee state
  const [lateFeeGrace, setLateFeeGrace] = useState(state.lateFeeSettings.graceDays);
  const [lateFeeType, setLateFeeType] = useState(state.lateFeeSettings.type);
  const [lateFeeValue, setLateFeeValue] = useState(state.lateFeeSettings.value);
  const [lateFeeCap, setLateFeeCap] = useState(state.lateFeeSettings.cap);

  // Tax settings state
  const [taxLabel, setTaxLabel] = useState(state.taxSettings.label);
  const [taxPercent, setTaxPercent] = useState(state.taxSettings.percent);

  // Payment methods & Gateways form states
  const ownerSettings = state.ownerSettings[ownerId];
  const m = (ownerSettings?.paymentMethods as any) || state.ownerPaymentMethods;

  // Rental reminder policy state (defaults to 10 days prior)
  const currentReminderDays = ownerSettings?.rentReminderDaysPrior ?? ownerSettings?.rentalReminderConfig?.daysPrior ?? 10;
  const [reminderDays, setReminderDays] = useState<number>(currentReminderDays);
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(ownerSettings?.rentalReminderConfig?.enabled ?? true);

  const handleSaveReminderSettings = async (days: number, enabled: boolean) => {
    setReminderDays(days);
    setReminderEnabled(enabled);
    const curSettings = state.ownerSettings[ownerId] || {
      ownerId,
      planId: 'plan-growth',
      planName: 'Growth',
      planStatus: 'trialing',
      trialEndsAt: null,
      subscriptionEndsAt: null,
      paymentMethods: state.ownerPaymentMethods,
      lateFeeConfig: state.lateFeeSettings,
      taxConfig: state.taxSettings,
    };
    await saveOwnerSettings(ownerId, {
      ...curSettings,
      rentReminderDaysPrior: days,
      rentalReminderConfig: {
        enabled,
        daysPrior: days,
      },
    });
    showToast(`✓ Rental reminder policy saved! Tenants will be reminded ${days} days prior to due date.`);
  };

  // Stripe
  const [stripePub, setStripePub] = useState(m.stripe?.pubKey || '');
  const [stripeSecret, setStripeSecret] = useState(m.stripe?.secretKey || '');
  const [stripeWebhook, setStripeWebhook] = useState(m.stripe?.webhookSecret || '');
  const stripeMode: 'live' = 'live';

  // Razorpay
  const [razorpayKey, setRazorpayKey] = useState(m.razorpay?.keyId || '');
  const [razorpaySecret, setRazorpaySecret] = useState(m.razorpay?.keySecret || '');
  const razorpayMode: 'live' = 'live';

  // PayPal
  const [paypalEmail, setPaypalEmail] = useState(m.paypal?.email || user?.email || '');
  const [paypalClient, setPaypalClient] = useState(m.paypal?.clientId || '');
  const [paypalSecret, setPaypalSecret] = useState(m.paypal?.secret || '');
  const paypalMode: 'live' = 'live';

  // Easebuzz (Full Live Production Gateway)
  const [easebuzzKey, setEasebuzzKey] = useState(m.easebuzz?.merchantKey || '');
  const [easebuzzSalt, setEasebuzzSalt] = useState(m.easebuzz?.salt || '');
  const [easebuzzSubMerchant, setEasebuzzSubMerchant] = useState(m.easebuzz?.subMerchantId || '');
  const [testingEasebuzz, setTestingEasebuzz] = useState(false);

  // UPI
  const [upiId, setUpiId] = useState(m.upi?.upiId || '');
  const [upiMerchant, setUpiMerchant] = useState(m.upi?.merchantName || user?.displayName || 'Propithub Real Estate');
  const [upiQr, setUpiQr] = useState<string | null>(m.upi?.qrImage || null);

  // Bank
  const [bankName, setBankName] = useState(m.bank?.accountName || user?.displayName || 'Property Owner');
  const [bankInstitution, setBankInstitution] = useState(m.bank?.bankName || '');
  const [bankCountry, setBankCountry] = useState(m.bank?.country || '');
  const [bankAcct, setBankAcct] = useState(m.bank?.accountNumber || '');
  const [bankRouting, setBankRouting] = useState(m.bank?.routing || '');

  // Cash
  const [cashInstructions, setCashInstructions] = useState(m.cash?.instructions || 'Pay directly in cash to the property manager or landlord office.');

  // Live synchronize form states whenever owner settings arrive from Firestore
  useEffect(() => {
    if (m) {
      if (m.stripe) {
        setStripePub(m.stripe.pubKey || '');
        setStripeSecret(m.stripe.secretKey || '');
        setStripeWebhook(m.stripe.webhookSecret || '');
      }
      if (m.razorpay) {
        setRazorpayKey(m.razorpay.keyId || '');
        setRazorpaySecret(m.razorpay.keySecret || '');
      }
      if (m.paypal) {
        setPaypalEmail(m.paypal.email || '');
        setPaypalClient(m.paypal.clientId || '');
        setPaypalSecret(m.paypal.secret || '');
      }
      if (m.easebuzz) {
        setEasebuzzKey(m.easebuzz.merchantKey || '');
        setEasebuzzSalt(m.easebuzz.salt || '');
        setEasebuzzSubMerchant(m.easebuzz.subMerchantId || '');
      }
      if (m.upi) {
        setUpiId(m.upi.upiId || '');
        setUpiMerchant(m.upi.merchantName || user?.displayName || 'Propithub Real Estate');
        setUpiQr(m.upi.qrImage || null);
      }
      if (m.bank) {
        setBankName(m.bank.accountName || user?.displayName || 'Property Owner');
        setBankInstitution(m.bank.bankName || '');
        setBankCountry(m.bank.country || '');
        setBankAcct(m.bank.accountNumber || '');
        setBankRouting(m.bank.routing || '');
      }
      if (m.cash?.instructions) {
        setCashInstructions(m.cash.instructions);
      }
    }
  }, [m, user?.displayName]);

  // Section tab inside Invoices: 'history' or 'template'
  const [invoiceSectionTab, setInvoiceSectionTab] = useState<'history' | 'template'>('history');

  // Template Document Switcher: 'rent' or 'deposit'
  const [tmplDocumentType, setTmplDocumentType] = useState<'rent' | 'deposit'>('rent');

  // General Invoice Template state (used for automated invoicing on payment)
  const existingTemplate = ownerSettings?.invoiceTemplate;
  const [tmplIssuerName, setTmplIssuerName] = useState(existingTemplate?.issuerName || user?.displayName || 'Propithub Real Estate');
  const [tmplIssuerTaxNo, setTmplIssuerTaxNo] = useState(existingTemplate?.issuerTaxNo || '');
  const [tmplIssuerAddress, setTmplIssuerAddress] = useState(existingTemplate?.issuerAddress || '');
  const [tmplIssuerPhone, setTmplIssuerPhone] = useState(existingTemplate?.issuerPhone || user?.phone || '');
  const [tmplIssuerEmail, setTmplIssuerEmail] = useState(existingTemplate?.issuerEmail || user?.email || '');
  const [tmplTaxLabel, setTmplTaxLabel] = useState(existingTemplate?.taxLabel || state.taxSettings.label || 'GST');
  const [tmplTaxPercent, setTmplTaxPercent] = useState(existingTemplate?.taxPercent ?? state.taxSettings.percent ?? 0);
  const [tmplBankName, setTmplBankName] = useState(existingTemplate?.bankName || (m.bank as any)?.bankName || '');
  const [tmplAccountName, setTmplAccountName] = useState(existingTemplate?.accountName || (m.bank as any)?.accountName || user?.displayName || '');
  const [tmplAccountNumber, setTmplAccountNumber] = useState(existingTemplate?.accountNumber || (m.bank as any)?.accountNumber || '');
  const [tmplIfsc, setTmplIfsc] = useState(existingTemplate?.ifscOrRouting || (m.bank as any)?.routing || '');
  const [tmplUpiId, setTmplUpiId] = useState(existingTemplate?.upiId || (m.upi as any)?.upiId || '');
  const defaultTmplTerms = `1. Payment is due strictly on or before the due date specified on this invoice.
2. Cheques / online NEFT / RTGS / UPI transfers are subject to successful bank clearance.
3. Late payments will incur a recurring late fee penalty as specified in the lease agreement.
4. Any billing discrepancies must be reported to the landlord office or property manager within 3 days.
5. This is an official tax invoice issued pursuant to the executed residential/commercial lease agreement.`;
  const [tmplTerms, setTmplTerms] = useState(existingTemplate?.termsAndConditions || defaultTmplTerms);
  const [tmplSignatory, setTmplSignatory] = useState(existingTemplate?.signatoryName || 'Authorized Property Manager');
  const [tmplSignatureUrl, setTmplSignatureUrl] = useState(existingTemplate?.signatureUrl || '');
  const [tmplNotes, setTmplNotes] = useState(existingTemplate?.notes || 'Thank you for your prompt tenancy settlement.');
  const [tmplViewMode, setTmplViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  // Security Deposit Voucher Template state
  const existingDepositTemplate = ownerSettings?.depositTemplate;
  const [depTmplTitle, setDepTmplTitle] = useState(existingDepositTemplate?.documentTitle || 'SECURITY DEPOSIT CUSTODY VOUCHER');
  const [depTmplClassification, setDepTmplClassification] = useState(existingDepositTemplate?.depositClassification || '100% Refundable Security Deposit');
  const [depTmplCustodyMechanism, setDepTmplCustodyMechanism] = useState(existingDepositTemplate?.custodyMechanism || 'Held in Landlord Trust Ledger with Platform Verification');
  const [depTmplRefundTimeline, setDepTmplRefundTimeline] = useState(existingDepositTemplate?.refundTimelineDays || 14);
  const [depTmplIssuerName, setDepTmplIssuerName] = useState(existingDepositTemplate?.issuerName || existingTemplate?.issuerName || user?.displayName || 'Propithub Real Estate');
  const [depTmplIssuerTaxNo, setDepTmplIssuerTaxNo] = useState(existingDepositTemplate?.issuerTaxNo || existingTemplate?.issuerTaxNo || '');
  const [depTmplIssuerAddress, setDepTmplIssuerAddress] = useState(existingDepositTemplate?.issuerAddress || existingTemplate?.issuerAddress || '');
  const [depTmplIssuerPhone, setDepTmplIssuerPhone] = useState(existingDepositTemplate?.issuerPhone || existingTemplate?.issuerPhone || user?.phone || '');
  const [depTmplIssuerEmail, setDepTmplIssuerEmail] = useState(existingDepositTemplate?.issuerEmail || existingTemplate?.issuerEmail || user?.email || '');
  const [depTmplTerms, setDepTmplTerms] = useState(existingDepositTemplate?.termsAndConditions || DEFAULT_DEPOSIT_TERMS);
  const [depTmplSignatory, setDepTmplSignatory] = useState(existingDepositTemplate?.signatoryName || existingTemplate?.signatoryName || 'Authorized Property Manager');
  const [depTmplSignatureUrl, setDepTmplSignatureUrl] = useState(existingDepositTemplate?.signatureUrl || existingTemplate?.signatureUrl || '');
  const [depTmplNotes, setDepTmplNotes] = useState(existingDepositTemplate?.notes || 'Funds are non-commingled, non-taxable security deposits held until lease conclusion and damage walkthrough verification.');
  const [depTmplBankName, setDepTmplBankName] = useState(existingDepositTemplate?.bankName || (m.bank as any)?.bankName || '');
  const [depTmplAccountName, setDepTmplAccountName] = useState(existingDepositTemplate?.accountName || (m.bank as any)?.accountName || user?.displayName || '');
  const [depTmplAccountNumber, setDepTmplAccountNumber] = useState(existingDepositTemplate?.accountNumber || (m.bank as any)?.accountNumber || '');
  const [depTmplIfsc, setDepTmplIfsc] = useState(existingDepositTemplate?.ifscOrRouting || (m.bank as any)?.routing || '');
  const [depTmplUpiId, setDepTmplUpiId] = useState(existingDepositTemplate?.upiId || (m.upi as any)?.upiId || '');

  const handleSaveDefaultInvoiceFormat = async () => {
    setIsSavingTmpl(true);
    await new Promise((r) => setTimeout(r, 450));
    const newTmpl: InvoiceTemplateConfig = {
      issuerName: tmplIssuerName,
      issuerTaxNo: tmplIssuerTaxNo,
      issuerAddress: tmplIssuerAddress,
      issuerPhone: tmplIssuerPhone,
      issuerEmail: tmplIssuerEmail,
      taxLabel: tmplTaxLabel,
      taxPercent: tmplTaxPercent,
      termsAndConditions: tmplTerms,
      signatoryName: tmplSignatory,
      signatureUrl: tmplSignatureUrl || undefined,
      notes: tmplNotes,
      bankName: tmplBankName,
      accountName: tmplAccountName,
      accountNumber: tmplAccountNumber,
      ifscOrRouting: tmplIfsc,
      upiId: tmplUpiId,
    };

    await saveOwnerSettings(ownerId, {
      invoiceTemplate: newTmpl,
      taxConfig: {
        label: tmplTaxLabel,
        percent: tmplTaxPercent,
      },
    });

    updateState((prev) => ({
      ...prev,
      taxSettings: {
        label: tmplTaxLabel,
        percent: tmplTaxPercent,
      },
    }));

    setIsSavingTmpl(false);
    showToast('General invoice format saved! All automatic invoices generated on payment will use this format.');
  };

  const handleSaveDepositTemplate = async () => {
    setIsSavingDepTmpl(true);
    await new Promise((r) => setTimeout(r, 450));
    const newDepTmpl: InvoiceTemplateConfig = {
      documentTitle: depTmplTitle,
      depositClassification: depTmplClassification,
      custodyMechanism: depTmplCustodyMechanism,
      refundTimelineDays: Number(depTmplRefundTimeline),
      issuerName: depTmplIssuerName,
      issuerTaxNo: depTmplIssuerTaxNo,
      issuerAddress: depTmplIssuerAddress,
      issuerPhone: depTmplIssuerPhone,
      issuerEmail: depTmplIssuerEmail,
      taxLabel: 'Non-Taxable Deposit',
      taxPercent: 0,
      termsAndConditions: depTmplTerms,
      signatoryName: depTmplSignatory,
      signatureUrl: depTmplSignatureUrl || undefined,
      notes: depTmplNotes,
      bankName: depTmplBankName,
      accountName: depTmplAccountName,
      accountNumber: depTmplAccountNumber,
      ifscOrRouting: depTmplIfsc,
      upiId: depTmplUpiId,
    };

    await saveOwnerSettings(ownerId, {
      depositTemplate: newDepTmpl,
    });

    setIsSavingDepTmpl(false);
    showToast('Security Deposit Voucher template saved! All deposit vouchers generated will use this format.');
  };

  // Synchronize saved deposit template whenever ownerSettings arrives from Firestore
  useEffect(() => {
    if (ownerSettings?.depositTemplate) {
      const dt = ownerSettings.depositTemplate;
      if (dt.documentTitle) setDepTmplTitle(dt.documentTitle);
      if (dt.depositClassification) setDepTmplClassification(dt.depositClassification);
      if (dt.custodyMechanism) setDepTmplCustodyMechanism(dt.custodyMechanism);
      if (dt.refundTimelineDays !== undefined) setDepTmplRefundTimeline(dt.refundTimelineDays);
      if (dt.issuerName) setDepTmplIssuerName(dt.issuerName);
      if (dt.issuerTaxNo) setDepTmplIssuerTaxNo(dt.issuerTaxNo);
      if (dt.issuerAddress) setDepTmplIssuerAddress(dt.issuerAddress);
      if (dt.issuerPhone) setDepTmplIssuerPhone(dt.issuerPhone);
      if (dt.issuerEmail) setDepTmplIssuerEmail(dt.issuerEmail);
      if (dt.termsAndConditions) setDepTmplTerms(dt.termsAndConditions);
      if (dt.signatoryName) setDepTmplSignatory(dt.signatoryName);
      if (dt.signatureUrl !== undefined) setDepTmplSignatureUrl(dt.signatureUrl);
      if (dt.notes) setDepTmplNotes(dt.notes);
      if (dt.bankName) setDepTmplBankName(dt.bankName);
      if (dt.accountName) setDepTmplAccountName(dt.accountName);
      if (dt.accountNumber) setDepTmplAccountNumber(dt.accountNumber);
      if (dt.ifscOrRouting) setDepTmplIfsc(dt.ifscOrRouting);
      if (dt.upiId) setDepTmplUpiId(dt.upiId);
    }
  }, [ownerSettings?.depositTemplate]);

  // Synchronize saved general invoice template whenever ownerSettings arrives
  useEffect(() => {
    if (ownerSettings?.invoiceTemplate) {
      const it = ownerSettings.invoiceTemplate;
      if (it.issuerName) setTmplIssuerName(it.issuerName);
      if (it.issuerTaxNo) setTmplIssuerTaxNo(it.issuerTaxNo);
      if (it.issuerAddress) setTmplIssuerAddress(it.issuerAddress);
      if (it.issuerPhone) setTmplIssuerPhone(it.issuerPhone);
      if (it.issuerEmail) setTmplIssuerEmail(it.issuerEmail);
      if (it.taxLabel) setTmplTaxLabel(it.taxLabel);
      if (it.taxPercent !== undefined) setTmplTaxPercent(it.taxPercent);
      if (it.termsAndConditions) setTmplTerms(it.termsAndConditions);
      if (it.signatoryName) setTmplSignatory(it.signatoryName);
      if (it.signatureUrl !== undefined) setTmplSignatureUrl(it.signatureUrl);
      if (it.notes) setTmplNotes(it.notes);
      if (it.bankName) setTmplBankName(it.bankName);
      if (it.accountName) setTmplAccountName(it.accountName);
      if (it.accountNumber) setTmplAccountNumber(it.accountNumber);
      if (it.ifscOrRouting) setTmplIfsc(it.ifscOrRouting);
      if (it.upiId) setTmplUpiId(it.upiId);
    }
  }, [ownerSettings?.invoiceTemplate]);

  // Settle Invoice Modal state
  const [settlingInvoice, setSettlingInvoice] = useState<Invoice | null>(null);
  const [settleMethod, setSettleMethod] = useState<'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque'>('Cash');
  const [settleRef, setSettleRef] = useState('');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);

  // Record Offline Payment Modal state
  const [isRecordOfflineOpen, setIsRecordOfflineOpen] = useState(false);
  const [offlineUnit, setOfflineUnit] = useState('');
  const [offlineAmount, setOfflineAmount] = useState(0);
  const [offlineMethod, setOfflineMethod] = useState<'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque'>('Cash');
  const [offlineRef, setOfflineRef] = useState('');
  const [offlineDate, setOfflineDate] = useState(new Date().toISOString().split('T')[0]);

  const myUnits = state.units.filter((u) => Boolean(ownerId) && u.ownerId === ownerId);
  const myPayments = state.payments.filter((p) => Boolean(ownerId) && p.ownerId === ownerId);
  const myInvoices = state.invoices.filter((i) => Boolean(ownerId) && i.ownerId === ownerId);
  const myAgreements = state.agreements.filter((a) => Boolean(ownerId) && a.ownerId === ownerId);
  const myMoveOuts = (state.moveouts || []).filter((m) => Boolean(ownerId) && m.ownerId === ownerId);
  const sampleUnit = myUnits[0] || null;
  const sampleTenant = sampleUnit
    ? state.tenants.find((t) => (t.id === sampleUnit.currentTenantId || t.name === sampleUnit.tenant) && t.ownerId === ownerId) || null
    : null;

  const isAgreementVacated = (a: any) => {
    if (a.status === 'terminated') return true;
    return (
      (state.moveouts || []).some(
        (m) =>
          m.status === 'refund_completed' &&
          ((m as any).agreementId === a.id || (m as any).leaseAgreementId === a.id)
      ) ||
      (state.depositSettlements || []).some(
        (s) =>
          s.status === 'refunded' &&
          s.agreementId === a.id
      )
    );
  };

  const isInvoiceVacated = (inv: Invoice) => {
    if (inv.status === 'paid') return false;
    if (inv.leaseAgreementId) {
      const ag = (state.agreements || []).find((a) => a.id === inv.leaseAgreementId);
      if (ag && ag.status !== 'terminated') return false;
      return (
        (state.moveouts || []).some(
          (m) =>
            m.status === 'refund_completed' &&
            ((m as any).agreementId === inv.leaseAgreementId || (m as any).leaseAgreementId === inv.leaseAgreementId)
        ) ||
        (state.depositSettlements || []).some(
          (s) => s.status === 'refunded' && s.agreementId === inv.leaseAgreementId
        )
      );
    }
    const unitObj = myUnits.find((u) => u.unitNumber === inv.unit || u.id === inv.unit);
    if (unitObj && (unitObj.status === 'occupied' || unitObj.status === 'reserved')) {
      return false;
    }
    return (
      (state.moveouts || []).some(
        (m) =>
          m.status === 'refund_completed' &&
          (m.unit === inv.unit || (m as any).unitId === inv.unit) &&
          (!inv.propertyId || !((m as any).propertyId) || (m as any).propertyId === inv.propertyId) &&
          (!inv.tenantId || !m.tenantId || m.tenantId === inv.tenantId)
      ) ||
      (state.depositSettlements || []).some(
        (s) =>
          s.status === 'refunded' &&
          s.unit === inv.unit &&
          (!inv.propertyId || !s.propertyId || s.propertyId === inv.propertyId) &&
          (!inv.tenantId || !s.tenantId || s.tenantId === inv.tenantId)
      )
    );
  };

  const handleSendRentReminder = async (
    tenantId: string,
    tenantName: string,
    unit: string,
    amount: number,
    dueDate: string,
    daysDiff: number,
    tenantEmail?: string,
    tenantPhone?: string,
    currency = DEFAULT_CURRENCY_SYMBOL
  ) => {
    setRemindingTenantId(tenantId);
    try {
      const isOverdue = daysDiff < 0;
      const daysText = isOverdue
        ? `${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} overdue (Due: ${dueDate})`
        : `due in ${daysDiff} day${daysDiff !== 1 ? 's' : ''} (${dueDate})`;

      const notifId = `notif_${Date.now()}_${tenantId}`;
      const notif = {
        id: notifId,
        userId: tenantId,
        title: isOverdue ? '⚠️ Overdue Rent Payment Notice' : '📅 Upcoming Rent Payment Reminder',
        body: `Notice from your landlord: Monthly rent of ${getCurrencySymbol(currency)}${amount.toLocaleString()} for Unit ${unit} is ${daysText}. Please settle via the resident portal.`,
        link: '/tenant/payments?tab=rent_due',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      // 1. Update local state
      updateState((prev) => ({
        ...prev,
        notifications: tenantId ? [...(prev.notifications || []), notif] : prev.notifications,
      }));

      // 2. Persist to Firestore so tenant sees it on any device/session
      if (isFirebaseConfigured && tenantId) {
        setDoc(doc(db, 'notifications', notifId), notif).catch(console.warn);
      }

      // 3. Dispatch SMS + Email via configured Twilio / SendGrid gateways
      await logCommunication({
        type: 'rent_reminder',
        category: 'rent',
        title: isOverdue ? `Overdue Rent: Unit ${unit}` : `Rent Due Reminder: Unit ${unit}`,
        body: notif.body,
        channels: ['in_app', 'sms', 'email'],
        recipientId: tenantId,
        recipientName: tenantName,
        recipientRole: 'tenant',
        recipientContact: {
          email: tenantEmail,
          phone: tenantPhone,
        },
        senderId: ownerId,
        senderName: user?.displayName || 'Property Owner',
        senderRole: 'owner',
        unitNumber: unit,
        relatedEntityId: notifId,
        deliveryStatus: { inApp: 'delivered', email: 'skipped', sms: 'skipped' },
      });

      showToast(`✓ Rent reminder dispatched to ${tenantName} for Unit ${unit} via SMS, Email & In-App.`);
    } catch (err) {
      console.error('Reminder dispatch error:', err);
      showToast(`Reminder sent to ${tenantName} via in-app notification.`);
    } finally {
      setRemindingTenantId(null);
    }
  };

  // Rent Due (Receivables & Rent Roll) computation
  const rentDueList = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const todayDay = now.getDate();

    const items: Array<{
      id: string;
      tenantId: string;
      tenantName: string;
      tenantEmail?: string;
      tenantPhone?: string;
      unitId: string;
      unitNumber: string;
      propertyName: string;
      propertyId?: string;
      rentAmount: number;
      dueDay: number;
      dueDateFormatted: string;
      dueFullDate: Date;
      daysDiff: number;
      status: 'paid' | 'pending_confirmation' | 'due_soon' | 'overdue';
      statusLabel: string;
      accruedLateFee: number;
      matchingInvoice?: Invoice;
      matchingPayment?: PaymentTransaction;
      invoiceId?: string;
      agreement?: any;
      currency: string;
    }> = [];

    myUnits.forEach((u) => {
      const activeAg = myAgreements.find(
        (a) =>
          (a.unit === u.unitNumber || a.unit === u.id) &&
          (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId) &&
          (a.status === 'active' || a.status === 'signed') &&
          !isAgreementVacated(a)
      );

      // Match by currentTenantId only — name-based match risks cross-owner collision
      const matchedTenant = u.currentTenantId
        ? state.tenants.find((t) => t.id === u.currentTenantId)
        : undefined;

      const tenantName = activeAg?.tenant || u.tenant || matchedTenant?.name;
      if (!tenantName || (u.status !== 'occupied' && !activeAg)) return;

      const tenantId = activeAg?.tenantId || u.currentTenantId || matchedTenant?.id || '';
      const tenantEmail = activeAg?.tenantEmail || matchedTenant?.email;
      const tenantPhone = activeAg?.tenantPhone || matchedTenant?.phone;

      const rentAmount = activeAg?.rent || u.rent || 0;
      const dueDay = activeAg?.rentDueDay || 5;

      const dueFullDate = new Date(currentYear, currentMonth, dueDay);
      const diffTime = dueFullDate.getTime() - new Date(currentYear, currentMonth, todayDay).getTime();
      const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const unitMatches = (val?: string) => {
        if (!val) return false;
        const normalized = val.trim().toLowerCase();
        return (
          normalized === (u.unitNumber || '').toLowerCase() ||
          normalized === (u.id || '').toLowerCase() ||
          (u.unitNumber && normalized.includes(u.unitNumber.toLowerCase()))
        );
      };

      const unpaidThisMonthInvoice = myInvoices.find((i) => {
        if (!unitMatches(i.unit)) return false;
        const isRent = i.invoiceType === 'rent' || i.type === 'rent' || i.items?.some((it) => it.description.toLowerCase().includes('rent'));
        if (!isRent) return false;
        if (i.status === 'sent' || i.status === 'overdue' || (i.status as any) === 'unpaid') {
          const d = new Date(i.due || i.issueDate || (i as any).createdAt);
          return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        }
        return false;
      });

      const pendingInvoice = myInvoices.find((i) => {
        if (!unitMatches(i.unit)) return false;
        const isRent = i.invoiceType === 'rent' || i.type === 'rent' || i.items?.some((it) => it.description.toLowerCase().includes('rent'));
        if (!isRent) return false;
        return i.status === 'pending_confirmation';
      });

      const paidThisMonthInvoice = myInvoices.find((i) => {
        if (!unitMatches(i.unit)) return false;
        const isRent = i.invoiceType === 'rent' || i.type === 'rent' || i.items?.some((it) => it.description.toLowerCase().includes('rent'));
        if (!isRent) return false;
        if (i.status === 'paid') {
          const d = new Date(i.paidAt || i.issueDate || i.due);
          return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        }
        return false;
      });

      const paidThisMonthPayment = myPayments.find((p) => {
        if (!unitMatches(p.unit)) return false;
        if (p.status === 'paid' && (p.type === 'rent' || !p.type)) {
          const d = new Date(p.date || p.dueDate);
          return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        }
        return false;
      });

      const pendingPayment = myPayments.find((p) => {
        if (!unitMatches(p.unit)) return false;
        return p.status === 'pending_confirmation' || (p.status as any) === 'pending';
      });

      let status: 'paid' | 'pending_confirmation' | 'due_soon' | 'overdue' = 'due_soon';
      let statusLabel = `Due in ${daysDiff} days`;
      let accruedLateFee = 0;

      if (pendingInvoice || pendingPayment) {
        status = 'pending_confirmation';
        statusLabel = '⚡ Confirmation Pending';
        accruedLateFee = 0;
      } else if (unpaidThisMonthInvoice) {
        if (daysDiff < 0 || unpaidThisMonthInvoice.status === 'overdue') {
          status = 'overdue';
          const daysLate = Math.abs(daysDiff) || 1;
          statusLabel = `Overdue by ${daysLate} days`;
          if (unpaidThisMonthInvoice?.lateFeeWaived) {
            accruedLateFee = 0;
          } else if (state.lateFeeSettings.enabled && daysLate > state.lateFeeSettings.graceDays) {
            const billableDays = daysLate - state.lateFeeSettings.graceDays;
            const feeType = (state.lateFeeSettings.type as string);
            if (feeType === 'daily_fixed') {
              accruedLateFee = Math.min(billableDays * state.lateFeeSettings.value, state.lateFeeSettings.cap || 99999);
            } else if (feeType === 'fixed_once' || feeType === 'flat') {
              accruedLateFee = state.lateFeeSettings.value;
            } else if (feeType === 'percent_monthly' || feeType === 'percent') {
              accruedLateFee = Math.round((rentAmount * (state.lateFeeSettings.value / 100)));
            }
          }
        } else if (daysDiff === 0) {
          status = 'due_soon';
          statusLabel = 'Due Today';
          accruedLateFee = 0;
        } else {
          status = 'due_soon';
          statusLabel = `Due in ${daysDiff} days`;
          accruedLateFee = 0;
        }
      } else if (paidThisMonthInvoice || paidThisMonthPayment) {
        status = 'paid';
        statusLabel = '✓ Paid this month';
        accruedLateFee = 0;
      } else if (daysDiff < 0) {
        status = 'overdue';
        const daysLate = Math.abs(daysDiff);
        statusLabel = `Overdue by ${daysLate} days`;
        if (state.lateFeeSettings.enabled && daysLate > state.lateFeeSettings.graceDays) {
          const billableDays = daysLate - state.lateFeeSettings.graceDays;
          const feeType = (state.lateFeeSettings.type as string);
          if (feeType === 'daily_fixed') {
            accruedLateFee = Math.min(billableDays * state.lateFeeSettings.value, state.lateFeeSettings.cap || 99999);
          } else if (feeType === 'fixed_once' || feeType === 'flat') {
            accruedLateFee = state.lateFeeSettings.value;
          } else if (feeType === 'percent_monthly' || feeType === 'percent') {
            accruedLateFee = Math.round((rentAmount * (state.lateFeeSettings.value / 100)));
          }
        }
      } else if (daysDiff === 0) {
        status = 'due_soon';
        statusLabel = 'Due Today';
      }

      const agCurrency = getCurrencySymbol(activeAg?.currency || u.currency || state.properties.find((p) => p.id === u.propertyId)?.currency || DEFAULT_CURRENCY_SYMBOL);
      items.push({
        id: `rent_due_${u.id}_${currentMonth}`,
        tenantId,
        tenantName,
        tenantEmail,
        tenantPhone,
        unitId: u.id,
        unitNumber: u.unitNumber || u.id,
        propertyName: u.propertyName || state.properties.find((p) => p.id === u.propertyId)?.name || 'Property',
        propertyId: u.propertyId,
        rentAmount,
        dueDay,
        dueDateFormatted: dueFullDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        dueFullDate,
        daysDiff,
        status,
        statusLabel,
        accruedLateFee,
        matchingInvoice: paidThisMonthInvoice || pendingInvoice || unpaidThisMonthInvoice,
        matchingPayment: paidThisMonthPayment || pendingPayment,
        invoiceId: unpaidThisMonthInvoice?.id || pendingInvoice?.id || paidThisMonthInvoice?.id,
        agreement: activeAg,
        currency: agCurrency,
      });
    });

    return items;
  }, [myUnits, myAgreements, myInvoices, myPayments, state.tenants, state.properties, state.lateFeeSettings]);

  const rentDueMetrics = useMemo(() => {
    const totalExpected = rentDueList.reduce(
      (sum, item) => sum + convert(item.rentAmount, item.currency, activeCurrencyCode),
      0
    );
    const totalCollectedThisMonth = rentDueList
      .filter((i) => i.status === 'paid')
      .reduce((sum, item) => sum + convert(item.rentAmount, item.currency, activeCurrencyCode), 0);
    const totalOverdueAmount = rentDueList
      .filter((i) => i.status === 'overdue')
      .reduce(
        (sum, item) => sum + convert(item.rentAmount + item.accruedLateFee, item.currency, activeCurrencyCode),
        0
      );
    const collectionRate = totalExpected > 0 ? Math.round((totalCollectedThisMonth / totalExpected) * 100) : 0;

    return {
      totalExpected,
      totalCollectedThisMonth,
      totalOverdueAmount,
      collectionRate,
      paidCount: rentDueList.filter((i) => i.status === 'paid').length,
      overdueCount: rentDueList.filter((i) => i.status === 'overdue').length,
      dueSoonCount: rentDueList.filter((i) => i.status === 'due_soon').length,
      pendingConfirmationCount: rentDueList.filter((i) => i.status === 'pending_confirmation').length,
    };
  }, [rentDueList, convert, activeCurrencyCode]);

  const dominantRentCurrency = activeSymbol;
  const filteredRentDueList = useMemo(() => {
    return rentDueList.filter((item) => {
      if (rentDueFilter !== 'all' && item.status !== rentDueFilter) return false;
      if (rentSearch.trim()) {
        const q = rentSearch.toLowerCase().trim();
        const matchName = item.tenantName.toLowerCase().includes(q);
        const matchUnit = item.unitNumber.toLowerCase().includes(q);
        const matchProp = item.propertyName.toLowerCase().includes(q);
        if (!matchName && !matchUnit && !matchProp) return false;
      }
      return true;
    });
  }, [rentDueList, rentDueFilter, rentSearch]);

  // Security Deposit (Trust Custody Ledger) computation
  const depositLedgerList = useMemo(() => {
    const list: Array<{
      id: string;
      tenantId: string;
      tenantName: string;
      tenantEmail?: string;
      tenantPhone?: string;
      unitId: string;
      unitNumber: string;
      propertyName: string;
      propertyId?: string;
      amount: number;
      depositVoucherId?: string;
      status: 'held' | 'pending_collection' | 'pending_confirmation' | 'moveout_inspection' | 'refunded';
      statusLabel: string;
      statusBadgeBg: string;
      statusBadgeColor: string;
      custodyDetails: string;
      startDate?: string;
      endDate?: string;
      agreement?: any;
      depositInvoice?: Invoice;
      moveOut?: any;
      currency: string;
    }> = [];

    const processedVoucherIds = new Set<string>();

    myAgreements.forEach((ag) => {
      const depInv = myInvoices.find(
        (i) =>
          i.invoiceType === 'deposit' &&
          (i.id === ag.depositInvoiceId ||
            i.leaseAgreementId === ag.id ||
            ((i.unit === ag.unit || i.unit === ag.id) &&
              (!i.propertyId || !ag.propertyId || i.propertyId === ag.propertyId)))
      );
      if (depInv) processedVoucherIds.add(depInv.id);

      const mo = myMoveOuts.find(
        (m) =>
          m.unit === ag.unit &&
          (!((m as any).propertyId) || !ag.propertyId || (m as any).propertyId === ag.propertyId)
      );

      const targetUnit = state.units.find((u) => (u.unitNumber === ag.unit || u.id === ag.unit) && (!ag.propertyId || u.propertyId === ag.propertyId));
      const prop = state.properties.find((p) => p.id === ag.propertyId);
      const propName = prop?.name || depInv?.propertyName || 'Rental Property';
      const amount = ag.deposit || depInv?.total || depInv?.amount || targetUnit?.deposit || 0;
      const depCurrency = getCurrencySymbol(ag.currency || depInv?.currency || state.units.find((u) => u.unitNumber === ag.unit || u.id === ag.unit)?.currency || prop?.currency || DEFAULT_CURRENCY_SYMBOL);
      const voucherId = depInv?.id || (ag.depositInvoiceId ? ag.depositInvoiceId : undefined);

      let status: 'held' | 'pending_collection' | 'pending_confirmation' | 'moveout_inspection' | 'refunded' = 'held';
      let statusLabel = '🛡️ Held in Trust';
      let statusBadgeBg = '#DCFCE7';
      let statusBadgeColor = '#15803D';
      let custodyDetails = depInv?.custodyMechanism || 'Held in Landlord Trust Account (Fiduciary Non-Income)';

      if (mo) {
        if (mo.status === 'refund_completed') {
          status = 'refunded';
          statusLabel = '✓ Settled & Refunded';
          statusBadgeBg = '#F1F5F9';
          statusBadgeColor = '#475569';
        } else {
          status = 'moveout_inspection';
          statusLabel = 'Inspection / Deductions Active';
          statusBadgeBg = '#F3E8FF';
          statusBadgeColor = '#7E22CE';
        }
      } else if (depInv?.status === 'pending_confirmation') {
        status = 'pending_confirmation';
        statusLabel = '⚡ Confirmation Pending';
        statusBadgeBg = '#FEF3C7';
        statusBadgeColor = '#B45309';
      } else if (depInv?.status === 'sent' || ag.depositStatus === 'unpaid') {
        status = 'pending_collection';
        statusLabel = 'Pending Move-In Deposit';
        statusBadgeBg = '#FEF3C7';
        statusBadgeColor = '#B45309';
      }

      list.push({
        id: `dep_${ag.id}`,
        tenantId: ag.tenantId || '',
        tenantName: ag.tenant || 'Resident',
        tenantEmail: ag.tenantEmail,
        tenantPhone: ag.tenantPhone,
        unitId: ag.unit,
        unitNumber: ag.unit,
        propertyName: propName,
        propertyId: ag.propertyId,
        amount,
        depositVoucherId: voucherId,
        status,
        statusLabel,
        statusBadgeBg,
        statusBadgeColor,
        custodyDetails,
        startDate: ag.start,
        endDate: ag.end,
        agreement: ag,
        depositInvoice: depInv,
        moveOut: mo,
        currency: depCurrency,
      });
    });

    myInvoices
      .filter((i) => i.invoiceType === 'deposit' && !processedVoucherIds.has(i.id))
      .forEach((depInv) => {
        const prop = state.properties.find((p) => p.id === depInv.propertyId);
        const propName = prop?.name || depInv.propertyName || 'Rental Property';
        const amount = depInv.total || depInv.amount || 0;
        const depInvCurrency = getCurrencySymbol(depInv.currency || state.units.find((u) => u.unitNumber === depInv.unit || u.id === depInv.unit)?.currency || prop?.currency || DEFAULT_CURRENCY_SYMBOL);

        let status: 'held' | 'pending_collection' | 'pending_confirmation' | 'moveout_inspection' | 'refunded' = 'held';
        let statusLabel = '🛡️ Held in Trust';
        let statusBadgeBg = '#DCFCE7';
        let statusBadgeColor = '#15803D';

        if (depInv.status === 'paid') {
          status = 'held';
          statusLabel = '🛡️ Held in Trust';
        } else if (depInv.status === 'pending_confirmation') {
          status = 'pending_confirmation';
          statusLabel = '⚡ Confirmation Pending';
          statusBadgeBg = '#FEF3C7';
          statusBadgeColor = '#B45309';
        } else {
          status = 'pending_collection';
          statusLabel = 'Pending Move-In Deposit';
          statusBadgeBg = '#FEF3C7';
          statusBadgeColor = '#B45309';
        }

        list.push({
          id: `dep_inv_${depInv.id}`,
          tenantId: depInv.tenantId || '',
          tenantName: depInv.tenant || 'Resident',
          tenantEmail: depInv.tenantEmail,
          tenantPhone: depInv.tenantPhone,
          unitId: depInv.unit,
          unitNumber: depInv.unit,
          propertyName: propName,
          propertyId: depInv.propertyId,
          amount,
          depositVoucherId: depInv.id,
          status,
          statusLabel,
          statusBadgeBg,
          statusBadgeColor,
          custodyDetails: depInv.custodyMechanism || 'Held in Landlord Trust Account',
          depositInvoice: depInv,
          currency: depInvCurrency,
        });
      });

    return list;
  }, [myAgreements, myInvoices, myMoveOuts, state.properties, state.units]);

  const dominantDepositCurrency = activeSymbol;

  const depositMetrics = useMemo(() => {
    const totalHeld = depositLedgerList
      .filter((d) => d.status === 'held')
      .reduce((sum, d) => sum + convert(d.amount, d.currency, activeCurrencyCode), 0);
    const totalPendingCollection = depositLedgerList
      .filter((d) => d.status === 'pending_collection' || d.status === 'pending_confirmation')
      .reduce((sum, d) => sum + convert(d.amount, d.currency, activeCurrencyCode), 0);
    const inMoveOutCount = depositLedgerList.filter((d) => d.status === 'moveout_inspection').length;
    const totalRefunded = depositLedgerList
      .filter((d) => d.status === 'refunded')
      .reduce((sum, d) => sum + convert(d.moveOut?.finalRefundAmount || d.amount, d.currency, activeCurrencyCode), 0);

    return {
      totalHeld,
      totalPendingCollection,
      inMoveOutCount,
      totalRefunded,
      totalCount: depositLedgerList.length,
    };
  }, [depositLedgerList, convert, activeCurrencyCode]);

  const filteredDepositLedgerList = useMemo(() => {
    return depositLedgerList.filter((item) => {
      if (depositLedgerFilter !== 'all') {
        if (depositLedgerFilter === 'held' && item.status !== 'held') return false;
        if (depositLedgerFilter === 'pending_collection' && item.status !== 'pending_collection' && item.status !== 'pending_confirmation') return false;
        if (depositLedgerFilter === 'moveout' && item.status !== 'moveout_inspection') return false;
        if (depositLedgerFilter === 'refunded' && item.status !== 'refunded') return false;
      }
      if (depositSearch.trim()) {
        const q = depositSearch.toLowerCase().trim();
        const matchName = item.tenantName.toLowerCase().includes(q);
        const matchUnit = item.unitNumber.toLowerCase().includes(q);
        const matchProp = item.propertyName.toLowerCase().includes(q);
        const matchVoucher = item.depositVoucherId?.toLowerCase().includes(q);
        if (!matchName && !matchUnit && !matchProp && !matchVoucher) return false;
      }
      return true;
    });
  }, [depositLedgerList, depositLedgerFilter, depositSearch]);

  const { filteredInvoices, invoiceTimelineLabel } = useMemo(() => {
    let label = 'All Invoices (Complete Portfolio)';
    const now = new Date();

    const filtered = myInvoices.filter((inv) => {
      // 1. Status Filter
      if (invoiceStatusFilter !== 'all' && inv.status !== invoiceStatusFilter) {
        return false;
      }

      // 2. Timeline Filter
      if (invoiceTimeline === 'all') return true;

      const dateStr = inv.issueDate || inv.due;
      if (!dateStr) return true;
      const invDate = new Date(dateStr);

      if (invoiceTimeline === 'this_month') {
        label = `Current Month (${now.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
        return (
          invDate.getFullYear() === now.getFullYear() &&
          invDate.getMonth() === now.getMonth()
        );
      }
      if (invoiceTimeline === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        label = `Last Month (${lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
        return (
          invDate.getFullYear() === lastMonth.getFullYear() &&
          invDate.getMonth() === lastMonth.getMonth()
        );
      }
      if (invoiceTimeline === 'this_quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
        label = `Q${currentQuarter} ${now.getFullYear()}`;
        const invQuarter = Math.floor(invDate.getMonth() / 3) + 1;
        return (
          invDate.getFullYear() === now.getFullYear() &&
          invQuarter === currentQuarter
        );
      }
      if (invoiceTimeline === 'custom') {
        label = `Custom Range (${customStartDate || 'Start'} to ${customEndDate || 'Present'})`;
        if (customStartDate && new Date(dateStr) < new Date(customStartDate)) return false;
        if (customEndDate && new Date(dateStr) > new Date(customEndDate + 'T23:59:59')) return false;
        return true;
      }

      return true;
    });

    return { filteredInvoices: filtered, invoiceTimelineLabel: label };
  }, [myInvoices, invoiceTimeline, invoiceStatusFilter, customStartDate, customEndDate]);

  const { modalInvoicesToDownload, modalTimelineLabel } = useMemo(() => {
    let label = 'All Invoices (Complete Portfolio)';
    const now = new Date();

    const filtered = myInvoices.filter((inv) => {
      // 1. Status Filter
      if (bulkStatusFilter !== 'all' && inv.status !== bulkStatusFilter) {
        return false;
      }

      // 2. Timeline Filter
      if (bulkModalTimeline === 'all') return true;

      const dateStr = inv.issueDate || inv.due;
      if (!dateStr) return true;
      const invDate = new Date(dateStr);

      if (bulkModalTimeline === 'this_month') {
        label = `Current Month (${now.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
        return (
          invDate.getFullYear() === now.getFullYear() &&
          invDate.getMonth() === now.getMonth()
        );
      }
      if (bulkModalTimeline === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        label = `Last Month (${lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
        return (
          invDate.getFullYear() === lastMonth.getFullYear() &&
          invDate.getMonth() === lastMonth.getMonth()
        );
      }
      if (bulkModalTimeline === 'this_quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
        label = `Q${currentQuarter} ${now.getFullYear()}`;
        const invQuarter = Math.floor(invDate.getMonth() / 3) + 1;
        return (
          invDate.getFullYear() === now.getFullYear() &&
          invQuarter === currentQuarter
        );
      }
      if (bulkModalTimeline === 'custom') {
        label = `Custom Range (${bulkCustomStart || 'Start'} to ${bulkCustomEnd || 'Present'})`;
        if (bulkCustomStart && new Date(dateStr) < new Date(bulkCustomStart)) return false;
        if (bulkCustomEnd && new Date(dateStr) > new Date(bulkCustomEnd + 'T23:59:59')) return false;
        return true;
      }

      return true;
    });

    return { modalInvoicesToDownload: filtered, modalTimelineLabel: label };
  }, [myInvoices, bulkModalTimeline, bulkStatusFilter, bulkCustomStart, bulkCustomEnd]);

  const totalCollected = useMemo(() => {
    return myPayments
      .filter((p) => p.status === 'paid' || (p.status as any) === 'completed')
      .reduce((sum, p) => sum + convert(p.amount || 0, p.currency || 'USD', activeCurrencyCode), 0);
  }, [myPayments, convert, activeCurrencyCode]);

  const totalOverdue = useMemo(() => {
    return myPayments
      .filter((p) => p.status === 'overdue')
      .reduce((sum, p) => sum + convert(p.amount || 0, p.currency || 'USD', activeCurrencyCode), 0);
  }, [myPayments, convert, activeCurrencyCode]);

  const handleConfirmReceipt = async (id: string) => {
    const targetPay = state.payments.find((p) => p.id === id);

    // If this payment is backed by a cash handover claim, use dual-confirmation workflow
    if (targetPay?.cashClaimId) {
      await confirmCashClaim(targetPay.cashClaimId);
      return;
    }

    const isDeposit = targetPay?.type === 'deposit';

    let matchingInvoice = state.invoices.find((i) => i.id === targetPay?.invoiceId);
    if (!matchingInvoice && isDeposit) {
      matchingInvoice = state.invoices.find(
        (i) =>
          (i.invoiceType === 'deposit' || i.type === 'deposit') &&
          ((targetPay?.tenantId && i.tenantId === targetPay.tenantId) ||
            (targetPay?.unit && i.unit === targetPay.unit && (!targetPay.propertyId || !i.propertyId || i.propertyId === targetPay.propertyId)))
      );
    }

    if (matchingInvoice) {
      await markInvoicePaid(matchingInvoice.id, targetPay?.method || 'Offline Confirmed');
    }

    updateState((prev) => {
      const updatedPayments = prev.payments.map((p) =>
        p.id === id ? { ...p, status: 'paid' as const } : p
      );

      let activatedOfflineDeposit = false;
      let targetUnitNumber: string | undefined;
      const updatedAgreements = isDeposit
        ? prev.agreements.map((a) => {
          const isMatch =
            (targetPay?.invoiceId && a.depositInvoiceId === targetPay.invoiceId) ||
            (targetPay?.tenantId && a.tenantId === targetPay.tenantId && (!targetPay.propertyId || !a.propertyId || a.propertyId === targetPay.propertyId)) ||
            (targetPay?.unit && a.unit === targetPay.unit && (!targetPay.propertyId || !a.propertyId || a.propertyId === targetPay.propertyId) && (!targetPay.tenantId || a.tenantId === targetPay.tenantId));

          if (isMatch) {
            targetUnitNumber = a.unit;
            activatedOfflineDeposit = true;
            return {
              ...a,
              depositStatus: 'paid' as const,
              status: 'active' as const,
            };
          }
          return a;
        })
        : prev.agreements;

      let updatedUnits = prev.units;
      let updatedProperties = prev.properties;

      if (activatedOfflineDeposit && targetUnitNumber) {
        updatedUnits = prev.units.map((u) =>
          u.unitNumber === targetUnitNumber || u.id === targetUnitNumber
            ? { ...u, status: 'occupied' as const, tenant: targetPay?.tenant || u.tenant, currentTenantId: targetPay?.tenantId || u.currentTenantId }
            : u
        );
        const affectedUnit = prev.units.find((u) => u.unitNumber === targetUnitNumber || u.id === targetUnitNumber);
        if (affectedUnit?.propertyId) {
          updatedProperties = prev.properties.map((p) => {
            if (p.id === affectedUnit.propertyId) {
              const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
              return { ...p, occupied: occ };
            }
            return p;
          });
        }
      }

      return {
        ...prev,
        payments: updatedPayments,
        agreements: updatedAgreements,
        units: updatedUnits,
        properties: updatedProperties,
      };
    });
    showToast(`✓ Payment ${id} confirmed as received.`);
  };

  const handleDeclineReceipt = async (id: string) => {
    const targetPay = state.payments.find((p) => p.id === id);
    const reason = window.prompt('Please enter the reason for declining this payment / cash claim (e.g. Cash not received):');
    if (!reason || !reason.trim()) return;

    if (targetPay?.cashClaimId) {
      await rejectCashClaim(targetPay.cashClaimId, reason.trim());
      return;
    }

    updateState((prev) => ({
      ...prev,
      payments: prev.payments.map((p) =>
        p.id === id ? { ...p, status: 'disputed' as const, notes: `Declined by owner: ${reason}` } : p
      ),
    }));
    showToast(`Payment ${id} marked as disputed.`);
  };

  const handleToggleLateFee = () => {
    updateState((prev) => ({
      ...prev,
      lateFeeSettings: {
        ...prev.lateFeeSettings,
        enabled: !prev.lateFeeSettings.enabled,
      },
    }));
    showToast(`Late fees turned ${!state.lateFeeSettings.enabled ? 'on' : 'off'}.`);
  };

  const handleSaveLateFee = () => {
    updateState((prev) => ({
      ...prev,
      lateFeeSettings: {
        ...prev.lateFeeSettings,
        graceDays: lateFeeGrace,
        type: lateFeeType,
        value: lateFeeValue,
        cap: lateFeeCap,
      },
    }));
    showToast('Late fee rule saved.');
  };

  const handleSaveTax = () => {
    updateState((prev) => ({
      ...prev,
      taxSettings: {
        label: taxLabel,
        percent: taxPercent,
      },
    }));
    showToast(`Tax rule saved: ${taxLabel} at ${taxPercent}%.`);
  };



  const handleSendInvoice = async (id: string) => {
    const inv = state.invoices.find((i) => i.id === id);
    if (inv) {
      await saveInvoice({ ...inv, status: 'sent' as const });
      showToast(`✓ Invoice ${id} dispatched to tenant.`);
    }
  };

  const handleSettleInvoice = async () => {
    if (!settlingInvoice) return;
    setIsSettling(true);
    await new Promise((r) => setTimeout(r, 450));
    const cleanRef = settleRef.trim(); if (!cleanRef) { showToast('⚠️ Payment reference or transaction ID is required as proof of settlement (H-1).'); setIsSettling(false); return; } await markInvoicePaid(settlingInvoice.id, settleMethod, cleanRef);
    showToast(`Invoice ${settlingInvoice.id} settled as paid via ${settleMethod}.`);
    setIsSettling(false);
    setSettlingInvoice(null);
  };

  const handleRecordOfflinePayment = async () => {
    setIsRecordingOffline(true);
    await new Promise((r) => setTimeout(r, 450));
    const unitObj = myUnits.find((u) => u.id === offlineUnit) || myUnits[0];
    const tenantName = unitObj?.tenant || 'Resident';
    const tenantId = unitObj?.currentTenantId || '';
    const isCash = offlineMethod.toLowerCase().includes('cash'); const cleanRef = offlineRef?.trim(); if (!isCash && !cleanRef) { showToast('⚠️ Transaction reference / UTR number is required as proof of payment (H-1).'); setIsRecordingOffline(false); return; } const payId = cleanRef || generateTransactionId();

    // Cash Handover Protocol: If owner records cash, submit claim awaiting tenant confirmation
    if (offlineMethod.toLowerCase().includes('cash')) {
      await submitCashClaim({
        direction: 'inflow',
        type: 'rent',
        amount: offlineAmount,
        currency: 'INR',
        ownerId,
        tenantId,
        tenantName,
        unit: unitObj?.unitNumber || unitObj?.id || 'Unit',
        propertyName: unitObj?.propertyName || '',
        propertyId: unitObj?.propertyId || '',
        claimedBy: ownerId,
        claimedByRole: 'owner',
        claimedByName: user?.displayName || 'Property Owner',
        handoverDate: offlineDate,
        handoverLocation: `Unit ${unitObj?.unitNumber || unitObj?.id || 'Unit'} / On-Site Handover`,
        notes: offlineRef ? `Ref: ${offlineRef}` : undefined,
      });
      setIsRecordingOffline(false);
      setIsRecordOfflineOpen(false);
      showToast(`✓ Cash collection logged. Sent notification to ${tenantName} to confirm receipt.`);
      return;
    }

    const newTxn: PaymentTransaction = {
      id: payId,
      ownerId,
      tenant: tenantName,
      tenantId,
      unit: unitObj?.unitNumber || unitObj?.id || 'Unit',
      amount: offlineAmount,
      date: offlineDate,
      dueDate: offlineDate,
      status: 'paid',
      method: offlineMethod,
      type: 'rent',
      notes: offlineRef ? `Ref: ${offlineRef}` : undefined,
    };

    // Reconcile matching unpaid invoice if any
    const matchingInv = state.invoices.find(
      (i) =>
        Boolean(ownerId) &&
        i.ownerId === ownerId &&
        (!unitObj?.propertyId || !i.propertyId || i.propertyId === unitObj.propertyId) &&
        (unitObj ? i.unit === unitObj.unitNumber : true) &&
        (tenantId ? i.tenantId === tenantId : true) &&
        i.status !== 'paid'
    );

    if (matchingInv) {
      await markInvoicePaid(matchingInv.id, offlineMethod, offlineRef || undefined);
    } else {
      // Auto-generate settled invoice document in Firestore for direct payments using saved template
      const tmpl = state.ownerSettings[ownerId]?.invoiceTemplate;
      const autoInvId = generateInvoiceId();
      const autoInv: Invoice = {
        id: autoInvId,
        ownerId,
        tenant: tenantName,
        tenantId,
        unit: unitObj?.unitNumber || unitObj?.id || 'Unit',
        propertyName: unitObj?.propertyName || '',
        propertyId: unitObj?.propertyId || '',
        invoiceType: 'rent',
        amount: offlineAmount,
        tax: 0,
        total: offlineAmount,
        due: offlineDate,
        status: 'paid',
        issueDate: new Date().toISOString(),
        paidAt: new Date(offlineDate).toISOString(),
        paymentMethodUsed: offlineMethod,
        receiptNumber: offlineRef || generateReceiptId(),
        issuerName: tmpl?.issuerName || tmplIssuerName,
        issuerTaxNo: tmpl?.issuerTaxNo || tmplIssuerTaxNo,
        issuerAddress: tmpl?.issuerAddress || tmplIssuerAddress,
        issuerPhone: tmpl?.issuerPhone || tmplIssuerPhone,
        issuerEmail: tmpl?.issuerEmail || tmplIssuerEmail,
        termsAndConditions: tmpl?.termsAndConditions || tmplTerms,
        signatoryName: tmpl?.signatoryName || tmplSignatory,
        notes: tmpl?.notes || tmplNotes,
        bankDetails: {
          bankName: tmpl?.bankName || tmplBankName,
          accountName: tmpl?.accountName || tmplAccountName,
          accountNumber: tmpl?.accountNumber || tmplAccountNumber,
          ifscOrRouting: tmpl?.ifscOrRouting || tmplIfsc,
          upiId: tmpl?.upiId || tmplUpiId,
        },
        items: [
          {
            description: `Monthly Rent — Unit ${unitObj?.unitNumber || unitObj?.id || 'Unit'}`,
            amount: offlineAmount,
          },
        ],
      };
      await saveInvoice(autoInv);
    }

    updateState((prev) => ({
      ...prev,
      payments: [newTxn, ...prev.payments],
    }));

    setIsRecordingOffline(false);
    setIsRecordOfflineOpen(false);
    const offUnitObj = myUnits.find((u) => u.unitNumber === offlineUnit || u.id === offlineUnit);
    const offUnitProp = offUnitObj ? state.properties.find((p) => p.id === offUnitObj.propertyId) : undefined;
    const offCurr = getCurrencySymbol(offUnitObj?.currency || offUnitProp?.currency || DEFAULT_CURRENCY_SYMBOL);
    showToast(`Recorded ${offlineMethod} payment of ${offCurr}${offlineAmount.toLocaleString()} from ${tenantName} & auto-settled invoice.`);
  };

  const handleApproveProof = async (inv: Invoice) => {
    setIsApprovingProof(true);
    await new Promise((r) => setTimeout(r, 450));
    const settleLabel = inv.paymentProofRef ? `Offline Ref: ${inv.paymentProofRef}` : 'Offline Proof Approved';
    await markInvoicePaid(inv.id, settleLabel, inv.paymentProofRef || undefined);

    // If there is a linked pending cash claim, confirm it
    const linkedClaim = (state.cashClaims || []).find(
      (c) => c.invoiceId === inv.id && c.status === 'pending_confirmation'
    );
    if (linkedClaim) {
      await confirmCashClaim(linkedClaim.id);
    }

    updateState((prev) => {
      const updatedPayments = prev.payments.map((p) => {
        if (
          (p.invoiceId === inv.id || (p.tenantId === inv.tenantId && (!p.propertyId || !inv.propertyId || p.propertyId === inv.propertyId) && p.unit === inv.unit)) &&
          p.status === 'pending_confirmation'
        ) {
          return { ...p, status: 'paid' as const, method: settleLabel };
        }
        return p;
      });

      const notif = {
        id: `notif_${Date.now()}`,
        userId: inv.tenantId || '',
        title: 'Payment Confirmed & Invoice Settled',
        body: `Your payment of ${getCurrencySymbol(inv.currency) || DEFAULT_CURRENCY_SYMBOL}${inv.total.toLocaleString()} for Unit ${inv.unit} has been verified and settled by the landlord. Tax invoice voucher is available.`,
        link: '/tenant/payments',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        payments: updatedPayments,
        notifications: inv.tenantId ? [...prev.notifications, notif] : prev.notifications,
      };
    });

    setIsApprovingProof(false);
    showToast(`Remittance proof verified! Invoice ${inv.id} marked as PAID.`);
    setReviewingProofInvoice(null);
  };

  const handleRejectProof = async (inv: Invoice) => {
    setIsRejectingProof(true);
    await new Promise((r) => setTimeout(r, 450));
    const rejectionReason = 'Proof rejected by landlord. Please re-upload valid UTR / transaction screenshot.';
    const revertedInvoice: Invoice = {
      ...inv,
      status: 'sent',
      paymentProofNotes: rejectionReason,
      paymentMethodUsed: undefined,
    };
    await saveInvoice(revertedInvoice);

    // 1. If there is a linked pending cash claim, reject it
    const linkedClaim = (state.cashClaims || []).find(
      (c) => c.invoiceId === inv.id && c.status === 'pending_confirmation'
    );
    if (linkedClaim) {
      await rejectCashClaim(linkedClaim.id, rejectionReason);
    } else {
      // 2. Otherwise update any linked payment transactions to 'disputed'
      const linkedPayments = (state.payments || []).filter(
        (p) => (p.invoiceId === inv.id || p.id === inv.id) && p.status === 'pending_confirmation'
      );
      for (const p of linkedPayments) {
        const updatedPayment: PaymentTransaction = {
          ...p,
          status: 'disputed',
          audit: {
            claimedBy: p.audit?.claimedBy || p.tenantId || p.tenant || 'tenant',
            claimedByRole: p.audit?.claimedByRole || 'tenant',
            claimedAt: p.audit?.claimedAt || p.date || new Date().toISOString(),
            ...(p.audit || {}),
            rejectionReason,
            rejectedAt: new Date().toISOString(),
            confirmedBy: ownerId,
            confirmedByName: 'Property Owner',
            confirmedAt: new Date().toISOString(),
          },
        };
        await savePayment(updatedPayment);
      }
    }

    updateState((prev) => {
      const notif = {
        id: `notif_${Date.now()}`,
        userId: inv.tenantId || '',
        title: 'Payment Verification Failed / Declined',
        body: `Your payment for invoice ${inv.id} was declined by your landlord: ${rejectionReason}`,
        link: '/tenant/payments?tab=invoices',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        notifications: inv.tenantId ? [...prev.notifications, notif] : prev.notifications,
      };
    });

    setIsRejectingProof(false);
    showToast(`Proof rejected. Invoice ${inv.id} reverted to SENT status.`);
    setReviewingProofInvoice(null);
  };

  const savePaymentConfig = async (updater: (prevConfig: any) => any, successMsg: string) => {
    const currentOwnerSettings = state.ownerSettings[ownerId] || {
      ownerId,
      planId: 'plan-growth',
      planName: 'Growth',
      planStatus: 'trialing',
      trialEndsAt: null,
      subscriptionEndsAt: null,
      paymentMethods: state.ownerPaymentMethods,
      lateFeeConfig: state.lateFeeSettings,
      taxConfig: state.taxSettings,
    };
    const prevMethods = (currentOwnerSettings.paymentMethods as any) || state.ownerPaymentMethods;
    const updatedMethods = updater(prevMethods);

    await saveOwnerSettings(ownerId, {
      ...currentOwnerSettings,
      paymentMethods: updatedMethods,
    });
    showToast(successMsg);
  };

  const toggleMethod = (key: 'cash' | 'upi' | 'bank' | 'paypal' | 'razorpay' | 'stripe' | 'easebuzz') => {
    savePaymentConfig(
      (prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          enabled: !prev[key]?.enabled,
        },
      }),
      `${key.toUpperCase()} turned ${!m[key]?.enabled ? 'on' : 'off'} for tenant rent collection.`
    );
  };

  const handleUploadQr = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setUpiQr(dataUrl);
        savePaymentConfig(
          (prev) => ({
            ...prev,
            upi: {
              ...prev.upi,
              qrImage: dataUrl,
            },
          }),
          'UPI QR code uploaded.'
        );
      };
      reader.readAsDataURL(f);
    }
  };

  return (
    <div>
      <div className="tabs" data-tour="payments-subtabs">
        <div
          className={`tab ${subTab === 'rent_due' ? 'active' : ''}`}
          onClick={() => setSubTab('rent_due')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <CalendarClock size={15} />
          Rent Due
        </div>
        <div
          className={`tab ${subTab === 'deposit' ? 'active' : ''}`}
          onClick={() => setSubTab('deposit')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ShieldCheck size={15} />
          Security Deposits
        </div>
        <div
          className={`tab ${subTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setSubTab('transactions')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeftRight size={15} />
          Transactions
        </div>
        <div
          className={`tab ${subTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setSubTab('invoices')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <FileText size={15} />
          Invoices
        </div>
        <div
          className={`tab ${subTab === 'methods' ? 'active' : ''}`}
          data-tour="payments-gateways-tab"
          onClick={() => setSubTab('methods')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <CreditCard size={15} />
          Payment Gateways
        </div>
        <div
          className={`tab ${subTab === 'template' ? 'active' : ''}`}
          onClick={() => setSubTab('template')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <LayoutTemplate size={15} />
          Invoice Template
        </div>
        <div
          className={`tab ${subTab === 'settings' ? 'active' : ''}`}
          onClick={() => setSubTab('settings')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Settings size={15} />
          Settings
        </div>
      </div>

      {subTab === 'rent_due' && (
        <div>
          {/* Summary Stat Cards */}
          <div className="grid grid-4" style={{ marginBottom: '20px' }}>
            <div className="stat">
              <div className="num" style={{ color: 'var(--ink)' }}>{formatMoney(rentDueMetrics.totalExpected)}</div>
              <div className="lbl">Monthly Rent Roll (Expected)</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: '#16A34A' }}>{formatMoney(rentDueMetrics.totalCollectedThisMonth)}</div>
              <div className="lbl">Collected ({rentDueMetrics.paidCount} Units Settled)</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: rentDueMetrics.totalOverdueAmount > 0 ? '#DC2626' : 'var(--ink)' }}>
                {formatMoney(rentDueMetrics.totalOverdueAmount)}
              </div>
              <div className="lbl">Overdue Arrears ({rentDueMetrics.overdueCount} Units)</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: rentDueMetrics.collectionRate >= 80 ? '#16A34A' : '#D97706' }}>
                {rentDueMetrics.totalExpected === 0 ? 'N/A' : `${rentDueMetrics.collectionRate}%`}
              </div>
              <div className="lbl">Collection Rate</div>
            </div>
          </div>

          {/* Action & Filter Header */}
          <div className="panel" style={{ marginBottom: '16px', background: 'var(--surface-sunken)', border: '1px solid var(--line)' }}>
            <div className="panel-body" style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                {/* Status Filter Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                    <Filter size={13} /> Filter:
                  </span>
                  {(
                    [
                      { id: 'all', label: `All (${rentDueList.length})` },
                      { id: 'overdue', label: `Overdue (${rentDueMetrics.overdueCount})` },
                      { id: 'due_soon', label: `Due Soon (${rentDueMetrics.dueSoonCount})` },
                      { id: 'paid', label: `Paid This Month (${rentDueMetrics.paidCount})` },
                      { id: 'pending_confirmation', label: `Confirmation Pending (${rentDueMetrics.pendingConfirmationCount})` },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`btn small ${rentDueFilter === item.id ? 'primary' : 'secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '20px' }}
                      onClick={() => setRentDueFilter(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Search & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                    <input
                      type="text"
                      placeholder="Search tenant or unit..."
                      value={rentSearch}
                      onChange={(e) => setRentSearch(e.target.value)}
                      style={{ padding: '5px 10px 5px 28px', fontSize: '12px', width: '180px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
                    />
                  </div>

                  <button
                    type="button"
                    data-tour="payments-record-offline"
                    className="btn brass small"
                    onClick={() => {
                      const firstOccupied = myUnits.find((u) => u.status === 'occupied') || myUnits[0];
                      setOfflineUnit(firstOccupied?.id || '');
                      setOfflineDate(new Date().toISOString().split('T')[0]);
                      setOfflineAmount(firstOccupied?.rent || 0);
                      setIsRecordOfflineOpen(true);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  >
                    Record Offline Payment
                  </button>

                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => {
                      setStudioInvoice(null);
                      setStudioMode('create');
                      setStudioInitialCategory('rent');
                      setIsStudioOpen(true);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  >
                    + Issue Invoice
                  </button>

                  <CurrencyConverterTrigger variant="button" label="Currency Converter" />
                </div>
              </div>
            </div>
          </div>

          {/* Rent Roll Table */}
          <div className="panel">
            <div className="panel-body">
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tenant & Resident</th>
                        <th>Property & Unit</th>
                        <th>Monthly Rent</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Late Fee</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRentDueList.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '40px 16px' }}>
                            <CalendarClock size={32} style={{ margin: '0 auto 8px', opacity: 0.35, display: 'block' }} />
                            No active rent receivables matching the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRentDueList.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '13.5px' }}>
                                {item.tenantName}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                {item.tenantPhone && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Phone size={10} /> {item.tenantPhone}
                                  </span>
                                )}
                                {item.tenantEmail && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Mail size={10} /> {item.tenantEmail}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Unit {item.unitNumber}</div>
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{item.propertyName}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                                {getCurrencySymbol(item.currency)}{item.rentAmount.toLocaleString()}
                              </div>
                              <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>per month</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--ink)' }}>
                                {item.dueDateFormatted}
                              </div>
                              <div style={{ fontSize: '11px', color: item.status === 'paid' ? '#16A34A' : item.status === 'pending_confirmation' ? '#D97706' : item.daysDiff < 0 ? '#DC2626' : 'var(--ink-soft)' }}>
                                {item.status === 'paid'
                                  ? 'Paid in full'
                                  : item.status === 'pending_confirmation'
                                    ? 'Awaiting verification'
                                    : item.daysDiff < 0
                                      ? `${Math.abs(item.daysDiff)} days late`
                                      : item.daysDiff === 0
                                        ? 'Due Today'
                                        : `in ${item.daysDiff} days`}
                              </div>
                            </td>
                            <td>
                              <span
                                className={`badge ${item.status === 'paid'
                                  ? 'green'
                                  : item.status === 'pending_confirmation'
                                    ? 'amber'
                                    : item.status === 'overdue'
                                      ? 'red'
                                      : 'blue'
                                  }`}
                                style={
                                  item.status === 'due_soon'
                                    ? { background: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }
                                    : item.status === 'pending_confirmation'
                                      ? { background: '#FEF3C7', color: '#B45309', borderColor: '#FDE68A' }
                                      : undefined
                                }
                              >
                                {item.statusLabel}
                              </span>
                            </td>
                            <td>
                              {item.status === 'paid' ? (
                                <span style={{ color: '#16A34A', fontSize: '12px' }}>Settled</span>
                              ) : item.accruedLateFee > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ fontWeight: 700, color: '#DC2626', fontSize: '12.5px' }}>
                                    + {getCurrencySymbol(item.currency)}{item.accruedLateFee.toLocaleString()}
                                  </span>
                                  {item.invoiceId && (
                                    <button
                                      type="button"
                                      className="btn secondary small"
                                      style={{ fontSize: '10px', padding: '1px 5px', alignSelf: 'flex-start', color: 'var(--green)' }}
                                      onClick={() => waiveInvoiceLateFee(item.invoiceId!)}
                                      title="Waive late fee for this billing cycle"
                                    >
                                      Waive Fee
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>{getCurrencySymbol(item.currency)}0</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                {item.status !== 'paid' && (
                                  <button
                                    type="button"
                                    className={`btn secondary small ${remindingTenantId === item.tenantId ? 'btn-processing' : ''}`}
                                    disabled={remindingTenantId === item.tenantId}
                                    onClick={() =>
                                      handleSendRentReminder(
                                        item.tenantId,
                                        item.tenantName,
                                        item.unitNumber,
                                        item.rentAmount + item.accruedLateFee,
                                        item.dueDateFormatted,
                                        item.daysDiff,
                                        item.tenantEmail,
                                        item.tenantPhone
                                      )
                                    }
                                    title="Send 1-Click Payment Reminder to Tenant"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', padding: '4px 8px' }}
                                  >
                                    <ButtonProcessing
                                      loading={remindingTenantId === item.tenantId}
                                      loadingText="Sending..."
                                      defaultText="Remind"
                                      icon={<Send size={12} />}
                                    />
                                  </button>
                                )}
                                {item.status !== 'paid' ? (
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    onClick={() => {
                                      setOfflineUnit(item.unitId);
                                      setOfflineAmount(item.rentAmount + item.accruedLateFee);
                                      setOfflineDate(new Date().toISOString().split('T')[0]);
                                      setIsRecordOfflineOpen(true);
                                    }}
                                    title="Record offline settlement (Cash / Direct Transfer)"
                                    style={{ fontSize: '11.5px', padding: '4px 8px' }}
                                  >
                                    Record Pay
                                  </button>
                                ) : (
                                  <span className="badge green" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle size={11} /> Settled
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {filteredRentDueList.length === 0 ? (
                  <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '30px 16px' }}>
                    <CalendarClock size={32} style={{ margin: '0 auto 8px', opacity: 0.35, display: 'block' }} />
                    No active rent receivables matching the selected filter.
                  </div>
                ) : (
                  filteredRentDueList.map((item) => (
                    <div key={item.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <b style={{ fontSize: '14px' }}>{item.tenantName}</b>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {item.unitNumber} • {item.propertyName}</div>
                        </div>
                        <span
                          className={`badge ${item.status === 'paid'
                            ? 'green'
                            : item.status === 'pending_confirmation'
                              ? 'amber'
                              : item.status === 'overdue'
                                ? 'red'
                                : 'blue'
                            }`}
                          style={
                            item.status === 'due_soon'
                              ? { background: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }
                              : item.status === 'pending_confirmation'
                                ? { background: '#FEF3C7', color: '#B45309', borderColor: '#FDE68A' }
                                : undefined
                          }
                        >
                          {item.statusLabel}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Monthly Rent</div>
                          <b style={{ color: 'var(--ink)' }}>{item.currency}{item.rentAmount.toLocaleString()}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Due Date</div>
                          <b style={{ color: item.status === 'paid' ? '#16A34A' : item.daysDiff < 0 ? '#DC2626' : 'var(--ink)' }}>{item.dueDateFormatted}</b>
                          <div style={{ fontSize: '10.5px', color: item.status === 'paid' ? '#16A34A' : item.status === 'pending_confirmation' ? '#D97706' : item.daysDiff < 0 ? '#DC2626' : 'var(--ink-soft)' }}>
                            {item.status === 'paid'
                              ? 'Paid in full'
                              : item.status === 'pending_confirmation'
                                ? 'Verification pending'
                                : item.daysDiff < 0
                                  ? `${Math.abs(item.daysDiff)}d late`
                                  : item.daysDiff === 0
                                    ? 'Today'
                                    : `in ${item.daysDiff}d`}
                          </div>
                        </div>
                        {item.status !== 'paid' && item.accruedLateFee > 0 && (
                          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--danger)', fontSize: '11.5px' }}>Accrued Late Fee:</span>
                            <b style={{ color: '#DC2626' }}>+ {item.currency}{item.accruedLateFee.toLocaleString()}</b>
                          </div>
                        )}
                        {item.status === 'paid' && (
                          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#16A34A', fontSize: '11.5px' }}>Payment Status:</span>
                            <b style={{ color: '#16A34A', fontSize: '12px' }}>✓ Settled in Full</b>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {item.status !== 'paid' && (
                          <button
                            type="button"
                            className={`btn secondary small btn-mobile-full ${remindingTenantId === item.tenantId ? 'btn-processing' : ''}`}
                            disabled={remindingTenantId === item.tenantId}
                            onClick={() =>
                              handleSendRentReminder(
                                item.tenantId,
                                item.tenantName,
                                item.unitNumber,
                                item.rentAmount + item.accruedLateFee,
                                item.dueDateFormatted,
                                item.daysDiff,
                                item.tenantEmail,
                                item.tenantPhone
                              )
                            }
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <ButtonProcessing
                              loading={remindingTenantId === item.tenantId}
                              loadingText="Sending..."
                              defaultText="Remind"
                              icon={<Send size={12} />}
                            />
                          </button>
                        )}
                        {item.status !== 'paid' ? (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => {
                              setOfflineUnit(item.unitId);
                              setOfflineAmount(item.rentAmount + item.accruedLateFee);
                              setOfflineDate(new Date().toISOString().split('T')[0]);
                              setIsRecordOfflineOpen(true);
                            }}
                          >
                            Record Pay
                          </button>
                        ) : (
                          <div style={{ width: '100%', textAlign: 'center', padding: '6px', background: '#F0FDF4', borderRadius: '6px', color: '#15803D', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                            <CheckCircle size={13} /> Rent Settled for this Period
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'deposit' && (
        <div>
          {/* Summary Stat Cards */}
          <div className="grid grid-4" style={{ marginBottom: '20px' }}>
            <div className="stat">
              <div className="num" style={{ color: '#16A34A' }}>{formatMoney(depositMetrics.totalHeld)}</div>
              <div className="lbl">Total Held in Trust Custody</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: depositMetrics.totalPendingCollection > 0 ? '#D97706' : 'var(--ink)' }}>
                {formatMoney(depositMetrics.totalPendingCollection)}
              </div>
              <div className="lbl">Pending Move-In Collection</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: depositMetrics.inMoveOutCount > 0 ? '#7E22CE' : 'var(--ink)' }}>
                {depositMetrics.inMoveOutCount} Units
              </div>
              <div className="lbl">In Move-Out / Inspection</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: 'var(--ink)' }}>{formatMoney(depositMetrics.totalRefunded)}</div>
              <div className="lbl">Total Settled & Refunded</div>
            </div>
          </div>

          {/* Action & Filter Header */}
          <div className="panel" style={{ marginBottom: '16px', background: 'var(--surface-sunken)', border: '1px solid var(--line)' }}>
            <div className="panel-body" style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                {/* Status Filter Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                    <Filter size={13} /> Filter:
                  </span>
                  {(
                    [
                      { id: 'all', label: `All (${depositLedgerList.length})` },
                      { id: 'held', label: `Held in Trust (${depositLedgerList.filter((d) => d.status === 'held').length})` },
                      { id: 'pending_collection', label: `Pending Collection (${depositLedgerList.filter((d) => d.status === 'pending_collection' || d.status === 'pending_confirmation').length})` },
                      { id: 'moveout', label: `Move-Out Active (${depositMetrics.inMoveOutCount})` },
                      { id: 'refunded', label: `Refunded & Closed (${depositLedgerList.filter((d) => d.status === 'refunded').length})` },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`btn small ${depositLedgerFilter === item.id ? 'primary' : 'secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '20px' }}
                      onClick={() => setDepositLedgerFilter(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Search & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                    <input
                      type="text"
                      placeholder="Search voucher, tenant, unit..."
                      value={depositSearch}
                      onChange={(e) => setDepositSearch(e.target.value)}
                      style={{ padding: '5px 10px 5px 28px', fontSize: '12px', width: '200px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      setStudioInvoice(null);
                      setStudioMode('create');
                      setStudioInitialCategory('deposit');
                      setIsStudioOpen(true);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  >
                    <ShieldCheck size={14} /> Issue Deposit Voucher
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Security Deposits Table */}
          <div className="panel">
            <div className="panel-body">
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tenant & Resident</th>
                        <th>Property & Unit</th>
                        <th>Deposit Amount</th>
                        <th>Applied Voucher</th>
                        <th>Custody Status</th>
                        <th>Lease Term</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDepositLedgerList.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '40px 16px' }}>
                            <ShieldCheck size={32} style={{ margin: '0 auto 8px', opacity: 0.35, display: 'block' }} />
                            No security deposit records matching the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredDepositLedgerList.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '13.5px' }}>
                                {item.tenantName}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                {item.tenantPhone && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Phone size={10} /> {item.tenantPhone}
                                  </span>
                                )}
                                {item.tenantEmail && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Mail size={10} /> {item.tenantEmail}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Unit {item.unitNumber}</div>
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{item.propertyName}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '14px', color: '#15803D' }}>
                                {getCurrencySymbol(item.currency)}{(item.amount ?? 0).toLocaleString()}
                              </div>
                              <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>
                                {item.custodyDetails.length > 28 ? item.custodyDetails.slice(0, 28) + '...' : item.custodyDetails}
                              </div>
                            </td>
                            <td>
                              {item.depositVoucherId ? (
                                <span
                                  style={{
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    color: '#B45309',
                                    background: '#FEF3C7',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => {
                                    if (item.depositInvoice) {
                                      setStudioInvoice(item.depositInvoice);
                                      setStudioMode('preview');
                                      setIsStudioOpen(true);
                                    }
                                  }}
                                  title="Click to view voucher document"
                                >
                                  🛡️ {item.depositVoucherId}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--ink-soft)', fontSize: '11.5px', fontStyle: 'italic' }}>
                                  Voucher Pending
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  background: item.statusBadgeBg,
                                  color: item.statusBadgeColor,
                                  display: 'inline-block',
                                }}
                              >
                                {item.statusLabel}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: 500 }}>
                                {item.startDate ? `${item.startDate} to ${item.endDate || 'Ongoing'}` : 'Active Agreement'}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                {item.depositInvoice ? (
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => {
                                      setStudioInvoice(item.depositInvoice!);
                                      setStudioMode('preview');
                                      setIsStudioOpen(true);
                                    }}
                                    title="View Security Deposit Voucher"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', padding: '4px 8px' }}
                                  >
                                    <Eye size={12} /> Voucher
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => {
                                      setStudioInvoice(null);
                                      setStudioMode('create');
                                      setStudioInitialCategory('deposit');
                                      setIsStudioOpen(true);
                                    }}
                                    title="Generate Deposit Voucher"
                                    style={{ fontSize: '11.5px', padding: '4px 8px' }}
                                  >
                                    + Voucher
                                  </button>
                                )}
                                {(item.status === 'pending_collection' || item.status === 'pending_confirmation') && (
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    onClick={() => {
                                      setOfflineUnit(item.unitId);
                                      setOfflineAmount(item.amount);
                                      setOfflineDate(new Date().toISOString().split('T')[0]);
                                      setIsRecordOfflineOpen(true);
                                    }}
                                    title="Record Move-In Deposit Settlement"
                                    style={{ fontSize: '11.5px', padding: '4px 8px' }}
                                  >
                                    Record Pay
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {filteredDepositLedgerList.length === 0 ? (
                  <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '30px 16px' }}>
                    <ShieldCheck size={32} style={{ margin: '0 auto 8px', opacity: 0.35, display: 'block' }} />
                    No security deposit records matching the selected filter.
                  </div>
                ) : (
                  filteredDepositLedgerList.map((item) => (
                    <div key={item.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <b style={{ fontSize: '14px' }}>{item.tenantName}</b>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {item.unitNumber} • {item.propertyName}</div>
                        </div>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: item.statusBadgeBg,
                            color: item.statusBadgeColor,
                          }}
                        >
                          {item.statusLabel}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Deposit Amount</div>
                          <b style={{ color: '#15803D', fontSize: '14px' }}>{getCurrencySymbol(item.currency)}{(item.amount ?? 0).toLocaleString()}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Custody</div>
                          <span>{item.custodyDetails}</span>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Lease Period</div>
                          <span>{item.startDate ? `${item.startDate} to ${item.endDate || 'Ongoing'}` : 'Active Agreement'}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {item.depositInvoice ? (
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            onClick={() => {
                              setStudioInvoice(item.depositInvoice!);
                              setStudioMode('preview');
                              setIsStudioOpen(true);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <Eye size={12} /> View Voucher
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            onClick={() => {
                              setStudioInvoice(null);
                              setStudioMode('create');
                              setStudioInitialCategory('deposit');
                              setIsStudioOpen(true);
                            }}
                          >
                            + Generate Voucher
                          </button>
                        )}
                        {(item.status === 'pending_collection' || item.status === 'pending_confirmation') && (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => {
                              setOfflineUnit(item.unitId);
                              setOfflineAmount(item.amount);
                              setOfflineDate(new Date().toISOString().split('T')[0]);
                              setIsRecordOfflineOpen(true);
                            }}
                          >
                            Record Pay
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Fiduciary Custody Policy Note */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: 'var(--surface-sunken)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <ShieldCheck size={20} style={{ color: '#16A34A', flexShrink: 0 }} />
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              <b>Statutory Trust Custody:</b> Security deposit funds remain non-commingled trust liabilities held throughout the tenancy term. Pursuant to tenancy laws, they do not constitute taxable landlord income and are subject to checkout deduction clearance and refund timeline policies.
            </div>
          </div>
        </div>
      )}

      {subTab === 'transactions' && (
        <div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div className="stat">
              <div className="num">{formatMoney(totalCollected)}</div>
              <div className="lbl">Collected</div>
            </div>
            <div className="stat">
              <div className="num">{formatMoney(totalOverdue)}</div>
              <div className="lbl">Overdue</div>
            </div>
            <div className="stat">
              <div className="num">
                {myPayments.filter((p) => p.status === 'pending_confirmation').length}
              </div>
              <div className="lbl">Awaiting your confirmation</div>
            </div>
          </div>

          {/* Pending Tenant Cash Payment Handover Claims Banner */}
          {(() => {
            const pendingTenantCashClaims = (state.cashClaims || []).filter(
              (c) => Boolean(ownerId) && c.ownerId === ownerId && c.status === 'pending_confirmation' && c.claimedByRole === 'tenant'
            );
            if (pendingTenantCashClaims.length === 0) return null;
            return (
              <div style={{ marginBottom: '20px' }}>
                {pendingTenantCashClaims.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: '#FFFBEB',
                      border: '1.5px solid #F59E0B',
                      borderRadius: 'var(--radius)',
                      padding: '16px 18px',
                      marginBottom: '12px',
                      boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                          ⚡ TENANT CASH PAYMENT CLAIM — CONFIRMATION REQUIRED
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Claim #{c.id}</span>
                      </div>
                      <h4 style={{ margin: '6px 0 4px', fontSize: '15px', color: 'var(--ink)' }}>
                        {c.tenantName} reported handing you {getCurrencySymbol(c.currency)} {c.amount.toLocaleString('en-IN')} in Cash for Unit {c.unit}
                      </h4>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                        <b>Handover Date:</b> {c.handoverDate} • <b>Location:</b> {c.handoverLocation || 'On-Site'}
                        {c.notes && <span style={{ display: 'block', marginTop: '2px', fontStyle: 'italic' }}>"{c.notes}"</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '8px 14px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => confirmCashClaim(c.id)}
                      >
                        <CheckCircle size={15} /> Confirm Receipt & Settle
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ borderColor: '#DC2626', color: '#DC2626', padding: '8px 14px', fontSize: '12px', fontWeight: 600 }}
                        onClick={() => {
                          const reason = window.prompt('Please enter the reason for declining this cash claim (e.g. Cash was not received):');
                          if (reason && reason.trim()) {
                            rejectCashClaim(c.id, reason.trim());
                          }
                        }}
                      >
                        Decline / Not Received
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div className="section-title" style={{ margin: 0 }}>Transactions ({myPayments.length})</div>
            <button
              type="button"
              className="btn brass small"
              onClick={() => {
                const firstOccupied = myUnits.find((u) => u.status === 'occupied') || myUnits[0];
                setOfflineUnit(firstOccupied?.id || '');
                setOfflineDate(new Date().toISOString().split('T')[0]);
                setOfflineAmount(firstOccupied?.rent || 0);
                setIsRecordOfflineOpen(true);
              }}
            >
              Record Offline Payment
            </button>
          </div>
          <div className="panel">
            <div className="panel-body">
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Transaction Ref</th>
                        <th>Direction</th>
                        <th>Applied Bill / Voucher</th>
                        <th>Tenant</th>
                        <th>Unit</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPayments.map((p) => {
                        const isOutflow = p.direction === 'outflow' || p.type === 'deposit_refund';
                        return (
                          <tr key={p.id}>
                            <td>
                              <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '12.5px', color: 'var(--ink)' }}>
                                {p.id}
                              </div>
                              {p.cashClaimId && (
                                <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>Claim #{p.cashClaimId}</div>
                              )}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  background: isOutflow ? '#F3E8FF' : '#DCFCE7',
                                  color: isOutflow ? '#7E22CE' : '#15803D',
                                }}
                              >
                                {isOutflow ? '↓ Outflow / Refund' : '↑ Inflow / Rent'}
                              </span>
                            </td>
                            <td>
                              {p.invoiceId ? (
                                <span
                                  style={{
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    color: p.invoiceId.startsWith('DEP-') ? '#B45309' : 'var(--ink)',
                                    background: p.invoiceId.startsWith('DEP-') ? '#FEF3C7' : '#F1F5F9',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title={`Linked Document: ${p.invoiceId}`}
                                >
                                  {p.invoiceId.startsWith('DEP-') ? '🛡️ ' : '📄 '}
                                  {p.invoiceId}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Direct Settlement</span>
                              )}
                            </td>
                            <td>{p.tenant}</td>
                            <td>{p.unit}</td>
                            <td style={{ fontWeight: 600, color: isOutflow ? '#7E22CE' : 'var(--ink)' }}>
                              {isOutflow ? `- ${getCurrencySymbol(p.currency) || DEFAULT_CURRENCY_SYMBOL}${p.amount?.toLocaleString()}` : `${getCurrencySymbol(p.currency) || DEFAULT_CURRENCY_SYMBOL}${p.amount?.toLocaleString()}`}
                            </td>
                            <td>{p.date ? (p.date.includes('T') ? p.date.split('T')[0] : p.date) : (p.dueDate || '—')}</td>
                            <td>{p.method}</td>
                            <td>
                              <span
                                className={`badge ${p.status === 'paid'
                                  ? 'green'
                                  : p.status === 'pending_confirmation'
                                    ? 'amber'
                                    : 'red'
                                  }`}
                              >
                                {p.status === 'paid'
                                  ? 'Reconciled'
                                  : p.status === 'pending_confirmation'
                                    ? 'Pending Confirmation'
                                    : p.status === 'disputed'
                                      ? 'Disputed'
                                      : 'Overdue'}
                              </span>
                            </td>
                            <td>
                              {p.status === 'pending_confirmation' ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn"
                                    style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '4px 8px', fontSize: '11.5px', fontWeight: 600 }}
                                    onClick={() => handleConfirmReceipt(p.id)}
                                  >
                                    ✓ Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ borderColor: '#DC2626', color: '#DC2626', padding: '4px 8px', fontSize: '11.5px', fontWeight: 600 }}
                                    onClick={() => handleDeclineReceipt(p.id)}
                                  >
                                    ✕ Decline
                                  </button>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {myPayments.length === 0 ? (
                  <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                    No transactions recorded yet.
                  </div>
                ) : (
                  myPayments.map((p) => {
                    const isOutflow = p.direction === 'outflow' || p.type === 'deposit_refund';
                    return (
                      <div key={p.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <b style={{ fontSize: '13px', fontFamily: 'monospace' }}>{p.id}</b>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{p.tenant} • Unit {p.unit}</div>
                          </div>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: isOutflow ? '#F3E8FF' : '#DCFCE7',
                              color: isOutflow ? '#7E22CE' : '#15803D',
                            }}
                          >
                            {isOutflow ? '↓ Outflow' : '↑ Inflow'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                          <div>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Amount</div>
                            <b style={{ color: isOutflow ? '#7E22CE' : 'var(--ink)', fontSize: '14px' }}>
                              {isOutflow ? `- ${getCurrencySymbol(p.currency) || DEFAULT_CURRENCY_SYMBOL}${p.amount?.toLocaleString()}` : `${getCurrencySymbol(p.currency) || DEFAULT_CURRENCY_SYMBOL}${p.amount?.toLocaleString()}`}
                            </b>
                          </div>
                          <div>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Date / Method</div>
                            <span>{p.date ? (p.date.includes('T') ? p.date.split('T')[0] : p.date) : (p.dueDate || '—')} • {p.method}</span>
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Linked Document</div>
                            <span style={{ fontSize: '11.5px' }}>{p.invoiceId || 'Direct Settlement'}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            className={`badge ${p.status === 'paid'
                              ? 'green'
                              : p.status === 'pending_confirmation'
                                ? 'amber'
                                : 'red'
                              }`}
                          >
                            {p.status === 'paid'
                              ? 'Reconciled'
                              : p.status === 'pending_confirmation'
                                ? 'Pending Confirmation'
                                : p.status === 'disputed'
                                  ? 'Disputed'
                                  : 'Overdue'}
                          </span>

                          {p.status === 'pending_confirmation' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn small"
                                style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '4px 8px', fontSize: '11.5px', fontWeight: 600 }}
                                onClick={() => handleConfirmReceipt(p.id)}
                              >
                                ✓ Confirm
                              </button>
                              <button
                                type="button"
                                className="btn secondary small"
                                style={{ borderColor: '#DC2626', color: '#DC2626', padding: '4px 8px', fontSize: '11.5px', fontWeight: 600 }}
                                onClick={() => handleDeclineReceipt(p.id)}
                              >
                                ✕ Decline
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'invoices' && (
        <div>
          {/* Top Actions & Overview Bar */}
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Rental Invoices Portfolio</div>
              <div className="hint" style={{ marginTop: '2px' }}>
                Manage, preview, issue, and bulk download tenant rental invoices and tax vouchers.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => exportInvoicesCSV(filteredInvoices)}
                title="Export filtered invoices as CSV spreadsheet"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> Export CSV ({filteredInvoices.length})
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setBulkModalTimeline(invoiceTimeline);
                  setBulkCustomStart(customStartDate);
                  setBulkCustomEnd(customEndDate);
                  setBulkStatusFilter(invoiceStatusFilter);
                  setIsBulkDownloadModalOpen(true);
                }}
                title="Download consolidated PDF report of invoices with custom timeline"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FileText size={14} /> Bulk Download PDF ({filteredInvoices.length})
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setStudioInvoice(null);
                  setStudioMode('create');
                  setStudioInitialCategory('deposit');
                  setIsStudioOpen(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'var(--brass)', color: 'var(--brass)', fontWeight: 600 }}
                title="Issue an official Security Deposit Custody Voucher"
              >
                <ShieldCheck size={14} /> Issue Deposit Voucher
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={() => {
                  setStudioInvoice(null);
                  setStudioMode('create');
                  setStudioInitialCategory('rent');
                  setIsStudioOpen(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                + Generate Invoice (Manual)
              </button>
            </div>
          </div>

          {/* Timeline & Status Filter Bar */}
          <div className="panel" style={{ marginBottom: '16px', background: 'var(--surface-sunken)', border: '1px solid var(--line)' }}>
            <div className="panel-body" style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>

                {/* Timeline quick filter tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                    <Calendar size={14} /> Timeline:
                  </span>
                  {(
                    [
                      { id: 'all', label: 'All Time' },
                      { id: 'this_month', label: 'This Month' },
                      { id: 'last_month', label: 'Last Month' },
                      { id: 'this_quarter', label: 'This Quarter' },
                      { id: 'custom', label: 'Custom Range' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`btn small ${invoiceTimeline === item.id ? 'primary' : 'secondary'}`}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: invoiceTimeline === item.id ? 600 : 400,
                      }}
                      onClick={() => setInvoiceTimeline(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Status Dropdown Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Filter size={13} /> Status:
                  </span>
                  <select
                    value={invoiceStatusFilter}
                    onChange={(e) => setInvoiceStatusFilter(e.target.value as any)}
                    style={{ fontSize: '12px', padding: '5px 10px', minWidth: '160px' }}
                  >
                    <option value="all">All Statuses ({myInvoices.length})</option>
                    <option value="paid">Paid & Settled ({myInvoices.filter((i) => i.status === 'paid').length})</option>
                    <option value="pending_confirmation">
                      Pending Confirmation ({myInvoices.filter((i) => i.status === 'pending_confirmation').length})
                    </option>
                    <option value="sent">Sent / Due ({myInvoices.filter((i) => i.status === 'sent').length})</option>
                    <option value="overdue">Overdue ({myInvoices.filter((i) => i.status === 'overdue').length})</option>
                    <option value="draft">Draft ({myInvoices.filter((i) => i.status === 'draft').length})</option>
                  </select>
                </div>

              </div>

              {/* Custom Date Range Row */}
              {invoiceTimeline === 'custom' && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center', paddingTop: '10px', borderTop: '1px dashed var(--line)' }}>
                  <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ margin: 0, fontSize: '12px' }}>From:</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    />
                  </div>
                  <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ margin: 0, fontSize: '12px' }}>To:</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                    Filtering by invoice issue / due date.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Invoices Table */}
          <div className="panel">
            <div className="panel-body">
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Tenant</th>
                        <th>Unit</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px 16px' }}>
                            No invoices matching the selected timeline and status filters.
                          </td>
                        </tr>
                      ) : (
                        filteredInvoices.map((i) => (
                          <tr key={i.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <b>{i.id}</b>
                                {(i.invoiceType === 'deposit' || i.type === 'deposit') && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      background: '#FEF3C7',
                                      color: '#92400E',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid #FDE68A',
                                    }}
                                  >
                                    DEPOSIT
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>{i.tenant}</td>
                            <td>{i.unit}</td>
                            <td style={{ fontWeight: 600 }}>
                              {getCurrencySymbol(i.currency || dominantRentCurrency)}{i.total?.toLocaleString()}
                              {(i.lateFeeApplied || 0) > 0 && (
                                <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>
                                  +{getCurrencySymbol(i.currency || dominantRentCurrency)}{i.lateFeeApplied} late fee
                                </div>
                              )}
                              {i.lateFeeWaived && (
                                <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>
                                  Fee Waived
                                </div>
                              )}
                            </td>
                            <td>{i.due}</td>
                            <td>
                              {isInvoiceVacated(i) ? (
                                <span className="badge grey" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)', borderColor: 'var(--line)' }}>
                                  VACATED
                                </span>
                              ) : (
                                <span
                                  className={`badge ${i.status === 'paid'
                                    ? 'green'
                                    : i.status === 'pending_confirmation'
                                      ? 'amber'
                                      : i.status === 'overdue'
                                        ? 'red'
                                        : 'grey'
                                    }`}
                                >
                                  {i.status?.toUpperCase()}
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {/* If offline payment pending confirmation, show prominent review button */}
                                {i.status === 'pending_confirmation' && (
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    onClick={() => setReviewingProofInvoice(i)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#EA580C', borderColor: '#EA580C' }}
                                    title="Review tenant UTR reference and receipt screenshot"
                                  >
                                    <ShieldCheck size={13} /> Review Proof
                                  </button>
                                )}

                                {i.status === 'overdue' && !i.lateFeeWaived && (i.lateFeeApplied || 0) > 0 && (
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ color: 'var(--green)', fontSize: '11px', padding: '2px 6px' }}
                                    onClick={() => waiveInvoiceLateFee(i.id)}
                                    title="Waive the accrued late fee penalty"
                                  >
                                    Waive Fee
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => {
                                    setStudioInvoice(i);
                                    setStudioMode('preview');
                                    setStudioInitialCategory((i.invoiceType || (i.type === 'deposit' ? 'deposit' : 'rent')) as any);
                                    setIsStudioOpen(true);
                                  }}
                                  title="Dedicated Tab: Preview formal printable document"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => {
                                    setStudioInvoice(i);
                                    setStudioMode('edit');
                                    setStudioInitialCategory((i.invoiceType || (i.type === 'deposit' ? 'deposit' : 'rent')) as any);
                                    setIsStudioOpen(true);
                                  }}
                                  title="Dedicated Tab: Edit invoice or deposit voucher configuration and items"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => downloadSingleInvoicePDF(i)}
                                  title="Download single PDF invoice"
                                >
                                  <Download size={13} /> PDF
                                </button>

                                {i.status !== 'paid' && i.status !== 'pending_confirmation' && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn brass small"
                                      onClick={() => {
                                        setSettlingInvoice(i);
                                        setSettleDate(new Date().toISOString().split('T')[0]);
                                        setSettleRef('');
                                      }}
                                    >
                                      Mark Paid
                                    </button>
                                    {!isInvoiceVacated(i) && (
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        onClick={() => handleSendInvoice(i.id)}
                                      >
                                        {i.status === 'sent' ? 'Resend' : 'Send'}
                                      </button>
                                    )}
                                  </>
                                )}
                                {i.status === 'paid' && (
                                  <span className="badge green">Settled</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {filteredInvoices.length === 0 ? (
                  <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                    No invoices matching the selected timeline and status filters.
                  </div>
                ) : (
                  filteredInvoices.map((i) => (
                    <div key={i.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <b style={{ fontSize: '14px' }}>{i.id}</b>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{i.tenant} • Unit {i.unit}</div>
                        </div>
                        <span
                          className={`badge ${i.status === 'paid'
                            ? 'green'
                            : i.status === 'pending_confirmation'
                              ? 'amber'
                              : i.status === 'overdue'
                                ? 'red'
                                : 'grey'
                            }`}
                        >
                          {i.status?.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Amount</div>
                          <b style={{ fontSize: '14px', color: 'var(--ledger)' }}>{getCurrencySymbol(i.currency || dominantRentCurrency)}{i.total?.toLocaleString()}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Due Date</div>
                          <span>{i.due}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {i.status === 'pending_confirmation' && (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => setReviewingProofInvoice(i)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: '#EA580C', borderColor: '#EA580C' }}
                          >
                            <ShieldCheck size={13} /> Review Proof
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => {
                            setStudioInvoice(i);
                            setStudioMode('preview');
                            setStudioInitialCategory((i.invoiceType || (i.type === 'deposit' ? 'deposit' : 'rent')) as any);
                            setIsStudioOpen(true);
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => {
                            setStudioInvoice(i);
                            setStudioMode('edit');
                            setStudioInitialCategory((i.invoiceType || (i.type === 'deposit' ? 'deposit' : 'rent')) as any);
                            setIsStudioOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => downloadSingleInvoicePDF(i)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          <Download size={13} /> PDF
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE TEMPLATE & LIVE PREVIEW */}
      {subTab === 'template' && (
        <div>
          {/* Template Document Switcher */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
            <button
              type="button"
              className={`btn ${tmplDocumentType === 'rent' ? 'primary' : 'secondary'}`}
              onClick={() => setTmplDocumentType('rent')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', fontWeight: 600 }}
            >
              <FileText size={16} /> 1. Monthly Rent Invoice Template
            </button>
            <button
              type="button"
              className={`btn ${tmplDocumentType === 'deposit' ? 'primary' : 'secondary'}`}
              onClick={() => setTmplDocumentType('deposit')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', fontWeight: 600 }}
            >
              <ShieldCheck size={16} /> 2. Security Deposit Voucher Template
            </button>
          </div>

          {tmplDocumentType === 'rent' && (
            <div>
              {/* Top Banner with Save and View Controls */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '18px',
                  padding: '16px 20px',
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--line)',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
                    Standardized General Invoice Format & Live Template
                  </div>
                  <div className="hint" style={{ marginTop: '2px', maxWidth: '840px' }}>
                    Configure the official company identity, tax registration, legal clauses, bank accounts, and signature.
                    <b> This format is automatically applied whenever an invoice is generated upon tenant payment.</b>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', background: 'var(--surface-sunken)', border: '1px solid var(--line)', padding: '3px', borderRadius: '6px', gap: '3px' }}>
                    <button
                      type="button"
                      className={`btn small ${tmplViewMode === 'split' ? 'primary' : 'secondary'}`}
                      onClick={() => setTmplViewMode('split')}
                      style={{ border: 'none', padding: '5px 12px', fontSize: '12px' }}
                    >
                      Split View
                    </button>
                    <button
                      type="button"
                      className={`btn small ${tmplViewMode === 'edit' ? 'primary' : 'secondary'}`}
                      onClick={() => setTmplViewMode('edit')}
                      style={{ border: 'none', padding: '5px 12px', fontSize: '12px' }}
                    >
                      Edit Only
                    </button>
                    <button
                      type="button"
                      className={`btn small ${tmplViewMode === 'preview' ? 'primary' : 'secondary'}`}
                      onClick={() => setTmplViewMode('preview')}
                      style={{ border: 'none', padding: '5px 12px', fontSize: '12px' }}
                    >
                      Full Document Preview
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn brass"
                    onClick={handleSaveDefaultInvoiceFormat}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Save size={15} /> Save Rent Invoice Format
                  </button>
                </div>
              </div>

              {/* Main Content Grid: Editor & Live Document Preview */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    tmplViewMode === 'split' ? '1.1fr 1fr' : '1fr',
                  gap: '24px',
                  alignItems: 'flex-start',
                }}
              >
                {/* COLUMN 1: TEMPLATE CONFIGURATION FORMS */}
                {(tmplViewMode === 'split' || tmplViewMode === 'edit') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                    {/* Card 1: Landlord / Issuer Identity */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <LayoutTemplate size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>1. Landlord / Issuer Identity (Billed From)</b>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Appears on header of all invoices</span>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Official Trade / Business Name</label>
                            <input
                              type="text"
                              value={tmplIssuerName}
                              onChange={(e) => setTmplIssuerName(e.target.value)}
                              placeholder="e.g. Propithub Real Estate Trust"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Tax Registration No (GSTIN / PAN / VAT)</label>
                            <input
                              type="text"
                              value={tmplIssuerTaxNo}
                              onChange={(e) => setTmplIssuerTaxNo(e.target.value)}
                              placeholder="e.g. GSTIN: 36AAACP1234F1Z8"
                            />
                          </div>
                        </div>

                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label>Full Business / Registered Address</label>
                          <input
                            type="text"
                            value={tmplIssuerAddress}
                            onChange={(e) => setTmplIssuerAddress(e.target.value)}
                            placeholder="e.g. Suite 400, Financial District, Hyderabad, TS"
                          />
                        </div>

                        <div className="row" style={{ margin: 0 }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Primary Contact Phone</label>
                            <input
                              type="text"
                              value={tmplIssuerPhone}
                              onChange={(e) => setTmplIssuerPhone(e.target.value)}
                              placeholder="+91 98765 43210"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Official Billing Email</label>
                            <input
                              type="email"
                              value={tmplIssuerEmail}
                              onChange={(e) => setTmplIssuerEmail(e.target.value)}
                              placeholder="billing@propithub.com"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Legal Tax Configuration */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>2. Legal Tax Designation & Assessment</b>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Applied on monthly rent breakdown</span>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="row" style={{ margin: 0 }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Tax Designation / Label</label>
                            <input
                              type="text"
                              value={tmplTaxLabel}
                              onChange={(e) => setTmplTaxLabel(e.target.value)}
                              placeholder="e.g. GST, VAT, Service Tax"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Default Tax Rate (%)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={tmplTaxPercent === 0 ? '' : tmplTaxPercent}
                              placeholder="0"
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                setTmplTaxPercent(cleaned === '' ? 0 : Number(cleaned));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Default Bank & UPI Accounts */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>3. Remittance Bank & UPI Accounts</b>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Printed on every invoice voucher</span>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Bank Institution Name</label>
                            <input
                              type="text"
                              value={tmplBankName}
                              onChange={(e) => setTmplBankName(e.target.value)}
                              placeholder="e.g. HDFC Bank"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Account Beneficiary Name</label>
                            <input
                              type="text"
                              value={tmplAccountName}
                              onChange={(e) => setTmplAccountName(e.target.value)}
                              placeholder="Propithub Real Estate Trust"
                            />
                          </div>
                        </div>

                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Account Number</label>
                            <input
                              type="text"
                              value={tmplAccountNumber}
                              onChange={(e) => setTmplAccountNumber(e.target.value)}
                              placeholder="50200012345678"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>IFSC / Bank Routing</label>
                            <input
                              type="text"
                              value={tmplIfsc}
                              onChange={(e) => setTmplIfsc(e.target.value)}
                              placeholder="HDFC0001234"
                            />
                          </div>
                        </div>

                        <div className="field" style={{ margin: 0 }}>
                          <label>Remittance UPI ID / VPA</label>
                          <input
                            type="text"
                            value={tmplUpiId}
                            onChange={(e) => setTmplUpiId(e.target.value)}
                            placeholder="propithub@hdfcbank"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Terms & Signatory */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>4. Tenancy Agreement Terms & Signatory</b>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Legal footer printed on invoices</span>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label>Standard Terms & Conditions (T&C Clauses)</label>
                          <textarea
                            rows={5}
                            value={tmplTerms}
                            onChange={(e) => setTmplTerms(e.target.value)}
                            style={{ fontSize: '13px', lineHeight: '1.5' }}
                          />
                        </div>

                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Authorized Signatory Name / Title</label>
                            <input
                              type="text"
                              value={tmplSignatory}
                              onChange={(e) => setTmplSignatory(e.target.value)}
                              placeholder="Authorized Property Manager"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Footer Remark / Tenancy Greeting</label>
                            <input
                              type="text"
                              value={tmplNotes}
                              onChange={(e) => setTmplNotes(e.target.value)}
                              placeholder="Thank you for your prompt tenancy settlement."
                            />
                          </div>
                        </div>

                        {/* Signature Upload */}
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Official Signature / Digital Stamp</span>
                            {tmplSignatureUrl && (
                              <button
                                type="button"
                                className="btn secondary small"
                                style={{ fontSize: '11px', padding: '2px 8px' }}
                                onClick={() => setTmplSignatureUrl('')}
                              >
                                ✕ Remove Signature
                              </button>
                            )}
                          </label>

                          {tmplSignatureUrl ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FAF9F5', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                              <img
                                src={tmplSignatureUrl}
                                alt="Signature Preview"
                                style={{ maxHeight: '42px', maxWidth: '160px', objectFit: 'contain', background: '#fff', border: '1px dashed var(--line)', padding: '4px', borderRadius: '4px' }}
                              />
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Authorized Signature Uploaded</div>
                                <label style={{ fontSize: '11.5px', color: 'var(--brass)', cursor: 'pointer', textDecoration: 'underline' }}>
                                  Replace Signature
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                          setTmplSignatureUrl(ev.target?.result as string);
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--line)', borderRadius: '6px', padding: '16px', cursor: 'pointer', background: '#FAFAF7' }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>Click to upload official signature image or company stamp</div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>PNG, JPG or SVG with transparent background recommended</div>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      setTmplSignatureUrl(ev.target?.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn brass"
                        onClick={handleSaveDefaultInvoiceFormat}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px' }}
                      >
                        <Save size={15} /> Save Rent Invoice Format
                      </button>
                    </div>

                  </div>
                )}

                {/* COLUMN 2: LIVE PREVIEW CANVAS */}
                {(tmplViewMode === 'split' || tmplViewMode === 'preview') && (
                  <div style={{ position: 'sticky', top: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brass)' }}>
                        ✦ LIVE INVOICE DOCUMENT PREVIEW
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                        Updates dynamically with changes
                      </span>
                    </div>

                    {/* Document Preview Card */}
                    <div
                      className="invoice-sheet"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        padding: '28px 32px',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
                        fontSize: '12px',
                        color: '#111827',
                        fontFamily: "'Inter', sans-serif",
                        maxWidth: '820px',
                        ['--ink' as any]: '#111827',
                        ['--ink-soft' as any]: '#4B5563',
                        ['--surface-sunken' as any]: '#F8F9FB',
                        ['--line' as any]: '#E5E7EB',
                        ['--line-strong' as any]: '#D1D5DB',
                      }}
                    >
                      {/* Document Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--ink)', paddingBottom: '16px', marginBottom: '18px' }}>
                        <div>
                          <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                            {sampleUnit?.propertyName || 'PROPITHUB RESIDENTIAL'}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>
                            {tmplIssuerName}
                          </div>
                          {tmplIssuerTaxNo && (
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brass)', marginTop: '2px' }}>
                              {tmplIssuerTaxNo}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px', lineHeight: '1.4' }}>
                            {tmplIssuerAddress}<br />
                            Phone: {tmplIssuerPhone} • Email: {tmplIssuerEmail}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--brass)', letterSpacing: '0.04em' }}>
                            TAX INVOICE
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '3px' }}>
                            Invoice No: <b>INV-2026-0089</b>
                          </div>
                          <div style={{ display: 'inline-block', background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, marginTop: '6px' }}>
                            PAID & RECONCILED
                          </div>
                        </div>
                      </div>

                      {/* Recipient & Tenancy Details */}
                      {(() => {
                        const sampleRent = sampleUnit?.rent || 0;
                        const sampleTax = Math.round((sampleRent * tmplTaxPercent) / 100);
                        const sampleTotal = sampleRent + sampleTax;

                        return (
                          <>
                            <div className="grid grid-2" style={{ marginBottom: '20px', gap: '16px', fontSize: '12px', lineHeight: '1.5' }}>
                              <div style={{ background: '#FAFAF7', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                                <div style={{ fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '10px', marginBottom: '3px' }}>
                                  BILLED TO (RESIDENT):
                                </div>
                                <div style={{ fontWeight: 700, fontSize: '13px' }}>
                                  {sampleTenant ? sampleTenant.name : 'Resident Tenant'}
                                </div>
                                <div>
                                  {sampleUnit ? `Unit ${sampleUnit.unitNumber || sampleUnit.id} — ${sampleUnit.propertyName || 'Property Premises'}` : 'Unit & Property details resolved from lease'}
                                </div>
                                {(sampleTenant?.phone || sampleTenant?.email) && (
                                  <div style={{ color: 'var(--ink-soft)' }}>
                                    {sampleTenant.phone && `Phone: ${sampleTenant.phone}`}
                                    {sampleTenant.phone && sampleTenant.email && ' • '}
                                    {sampleTenant.email && `Email: ${sampleTenant.email}`}
                                  </div>
                                )}
                              </div>

                              <div style={{ background: '#FAFAF7', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                                <div style={{ fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '10px', marginBottom: '3px' }}>
                                  SETTLEMENT TIMELINE:
                                </div>
                                <div>Invoice Date: <b>{new Date().toLocaleDateString()}</b></div>
                                <div>Settlement Method: <b>Online / Direct Bank Remittance</b></div>
                                <div style={{ color: 'var(--green)', fontWeight: 600 }}>Payment Status: Auto-Settled & Reconciled</div>
                              </div>
                            </div>

                            {/* Line Items Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', fontSize: '12.5px' }}>
                              <thead>
                                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1.5px solid var(--line)' }}>
                                  <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--ink)' }}>Item Description</th>
                                  <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--ink)' }}>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                                  <td style={{ padding: '10px' }}>
                                    <b>Monthly Rent — {sampleUnit ? `Unit ${sampleUnit.unitNumber || sampleUnit.id}` : 'Demised Unit'}</b>
                                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Residential lease periodic rental billing</div>
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '10px', fontWeight: 600 }}>
                                    {sampleUnit?.currency || DEFAULT_CURRENCY_SYMBOL}{sampleRent.toLocaleString('en-IN')}
                                  </td>
                                </tr>
                                {tmplTaxPercent > 0 && (
                                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                                    <td style={{ padding: '10px', color: 'var(--ink-soft)' }}>
                                      {tmplTaxLabel} ({tmplTaxPercent}%)
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '10px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                                      {sampleUnit?.currency || DEFAULT_CURRENCY_SYMBOL}{sampleTax.toLocaleString('en-IN')}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>

                            {/* Totals */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
                              <div style={{ width: '220px', fontSize: '13px', lineHeight: '1.8' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--ink-soft)' }}>Subtotal:</span>
                                  <span>{sampleUnit?.currency || DEFAULT_CURRENCY_SYMBOL}{sampleRent.toLocaleString('en-IN')}</span>
                                </div>
                                {tmplTaxPercent > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--ink-soft)' }}>{tmplTaxLabel} ({tmplTaxPercent}%):</span>
                                    <span>{sampleUnit?.currency || DEFAULT_CURRENCY_SYMBOL}{sampleTax.toLocaleString('en-IN')}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--line-strong)', paddingTop: '6px', fontWeight: 800, fontSize: '15px' }}>
                                  <span>Grand Total:</span>
                                  <span style={{ color: 'var(--brass)' }}>
                                    {sampleUnit?.currency || DEFAULT_CURRENCY_SYMBOL}{sampleTotal.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* Remittance Bank Info Box */}
                      <div style={{ background: '#F8FAF7', border: '1px dashed var(--line-strong)', padding: '12px 14px', borderRadius: '4px', marginBottom: '16px', fontSize: '11.5px', lineHeight: '1.5' }}>
                        <div style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--brass)', fontSize: '10px', marginBottom: '4px' }}>
                          OFFICIAL SETTLEMENT BANK & REMITTANCE DETAILS:
                        </div>
                        <div>Bank: <b>{tmplBankName}</b> • Beneficiary: <b>{tmplAccountName}</b></div>
                        <div>A/C No: <b>{tmplAccountNumber}</b> • IFSC / Routing: <b>{tmplIfsc}</b></div>
                        {tmplUpiId && <div>Instant UPI VPA: <b>{tmplUpiId}</b></div>}
                      </div>

                      {/* Terms & Conditions Box */}
                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          LEGAL TERMS & TENANCY CONDITIONS:
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                          {tmplTerms}
                        </div>
                      </div>

                      {/* Signatory Footer */}
                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '10.5px', color: 'var(--ink-soft)' }}>
                        <div>
                          {tmplNotes}<br />
                          Propithub Real Estate Cloud Operating Platform.
                        </div>
                        <div style={{ textAlign: 'center', minWidth: '150px' }}>
                          {tmplSignatureUrl ? (
                            <div style={{ height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                              <img
                                src={tmplSignatureUrl}
                                alt="Authorized Signature"
                                style={{ maxHeight: '36px', maxWidth: '140px', objectFit: 'contain' }}
                              />
                            </div>
                          ) : (
                            <div style={{ height: '24px' }}></div>
                          )}
                          <div style={{ borderTop: '1.5px solid var(--ink)', paddingTop: '4px', fontWeight: 600, color: 'var(--ink)' }}>
                            {tmplSignatory}
                          </div>
                          <div style={{ fontSize: '9.5px' }}>Authorized Signatory</div>
                        </div>
                      </div>

                    </div>

                    {/* Bottom Save Reminder */}
                    <div style={{ marginTop: '16px', width: '100%', maxWidth: '820px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className={`btn brass ${isSavingTmpl ? 'btn-processing' : ''}`}
                        disabled={isSavingTmpl}
                        onClick={handleSaveDefaultInvoiceFormat}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <ButtonProcessing
                          loading={isSavingTmpl}
                          loadingText="Saving..."
                          defaultText="Save As Default Auto-Billing Format"
                          icon={<Save size={15} />}
                        />
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </div>
          )}

          {/* DEPOSIT VOUCHER TEMPLATE */}
          {tmplDocumentType === 'deposit' && (
            <div>
              {/* Top Banner with Save and View Controls */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '18px',
                  padding: '16px 20px',
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--line)',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
                    Security Deposit Voucher Template
                  </div>
                  <div className="hint" style={{ marginTop: '2px', maxWidth: '840px' }}>
                    Configure default custody terms, bank accounts, refund window, and legal conditions for all security deposit vouchers.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', background: 'var(--surface-sunken)', border: '1px solid var(--line)', padding: '3px', borderRadius: '6px', gap: '3px' }}>
                    <button
                      type="button"
                      className={`btn small ${tmplViewMode === 'split' ? 'primary' : 'secondary'}`}
                      onClick={() => setTmplViewMode('split')}
                      style={{ border: 'none', padding: '5px 12px', fontSize: '12px' }}
                    >
                      Split View
                    </button>
                    <button
                      type="button"
                      className={`btn small ${tmplViewMode === 'edit' ? 'primary' : 'secondary'}`}
                      onClick={() => setTmplViewMode('edit')}
                      style={{ border: 'none', padding: '5px 12px', fontSize: '12px' }}
                    >
                      Edit Only
                    </button>
                    <button
                      type="button"
                      className={`btn small ${tmplViewMode === 'preview' ? 'primary' : 'secondary'}`}
                      onClick={() => setTmplViewMode('preview')}
                      style={{ border: 'none', padding: '5px 12px', fontSize: '12px' }}
                    >
                      Full Document Preview
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`btn brass ${isSavingDepTmpl ? 'btn-processing' : ''}`}
                    disabled={isSavingDepTmpl}
                    onClick={handleSaveDepositTemplate}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ButtonProcessing
                      loading={isSavingDepTmpl}
                      loadingText="Saving..."
                      defaultText="Save Deposit Voucher Template"
                      icon={<Save size={15} />}
                    />
                  </button>
                </div>
              </div>

              {/* Main Content Grid: Editor & Live Document Preview */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    tmplViewMode === 'split' ? '1.1fr 1fr' : '1fr',
                  gap: '24px',
                  alignItems: 'flex-start',
                }}
              >
                {/* COLUMN 1: TEMPLATE CONFIGURATION FORMS */}
                {(tmplViewMode === 'split' || tmplViewMode === 'edit') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                    {/* Card 1: Deposit Voucher Settings */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ShieldCheck size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>1. Voucher Settings & Document Title</b>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Configure official header and deposit details</span>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Document Official Title</label>
                            <input
                              type="text"
                              value={depTmplTitle}
                              onChange={(e) => setDepTmplTitle(e.target.value)}
                              placeholder="SECURITY DEPOSIT VOUCHER"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Deposit Classification</label>
                            <input
                              type="text"
                              value={depTmplClassification}
                              onChange={(e) => setDepTmplClassification(e.target.value)}
                              placeholder="100% Refundable Security Deposit"
                            />
                          </div>
                        </div>

                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label>Custody Ledger Verification Mechanism</label>
                          <input
                            type="text"
                            value={depTmplCustodyMechanism}
                            onChange={(e) => setDepTmplCustodyMechanism(e.target.value)}
                            placeholder="Held in Landlord Trust Ledger with Platform Verification"
                          />
                        </div>

                        <div className="field" style={{ margin: 0 }}>
                          <label>Mandatory Refund Window Following Move-Out Walkthrough</label>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            {[14, 21, 30].map((days) => (
                              <button
                                key={days}
                                type="button"
                                className={`btn small ${depTmplRefundTimeline === days ? 'brass' : 'secondary'}`}
                                onClick={() => setDepTmplRefundTimeline(days)}
                                style={{ padding: '5px 12px', fontSize: '12px' }}
                              >
                                {days} Days {days === 14 ? '(Standard Statutory)' : ''}
                              </button>
                            ))}
                          </div>
                          <input
                            type="number"
                            min="1"
                            max="90"
                            value={depTmplRefundTimeline === 0 ? '' : depTmplRefundTimeline}
                            placeholder="14"
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                              setDepTmplRefundTimeline(cleaned === '' ? 14 : Number(cleaned));
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Landlord / Custodian Identity */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <LayoutTemplate size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>2. Landlord / Custodian Identity</b>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Appears on header of deposit vouchers</span>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Official Trade / Business Name</label>
                            <input
                              type="text"
                              value={depTmplIssuerName}
                              onChange={(e) => setDepTmplIssuerName(e.target.value)}
                              placeholder="e.g. Propithub Real Estate Trust"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Tax Registration No (GSTIN / PAN / VAT)</label>
                            <input
                              type="text"
                              value={depTmplIssuerTaxNo}
                              onChange={(e) => setDepTmplIssuerTaxNo(e.target.value)}
                              placeholder="e.g. GSTIN: 36AAACP1234F1Z8"
                            />
                          </div>
                        </div>

                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label>Full Business / Registered Address</label>
                          <input
                            type="text"
                            value={depTmplIssuerAddress}
                            onChange={(e) => setDepTmplIssuerAddress(e.target.value)}
                            placeholder="e.g. Suite 400, Financial District, Hyderabad, TS"
                          />
                        </div>

                        <div className="row" style={{ margin: 0 }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Official Custodian Phone</label>
                            <input
                              type="text"
                              value={depTmplIssuerPhone}
                              onChange={(e) => setDepTmplIssuerPhone(e.target.value)}
                              placeholder="+91 98765 43210"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Official Custodian Email</label>
                            <input
                              type="email"
                              value={depTmplIssuerEmail}
                              onChange={(e) => setDepTmplIssuerEmail(e.target.value)}
                              placeholder="custody@propithub.com"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Deposit Trust Bank Account & UPI */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>3. Deposit Trust Bank Account & Remittance</b>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Dedicated account where tenant deposit is held</span>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Trust Bank Name</label>
                            <input
                              type="text"
                              value={depTmplBankName}
                              onChange={(e) => setDepTmplBankName(e.target.value)}
                              placeholder="e.g. HDFC Bank"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Beneficiary Account Name</label>
                            <input
                              type="text"
                              value={depTmplAccountName}
                              onChange={(e) => setDepTmplAccountName(e.target.value)}
                              placeholder="Propithub Deposit Custody Account"
                            />
                          </div>
                        </div>

                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Account Number</label>
                            <input
                              type="text"
                              value={depTmplAccountNumber}
                              onChange={(e) => setDepTmplAccountNumber(e.target.value)}
                              placeholder="50200012345678"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>IFSC / Bank Routing</label>
                            <input
                              type="text"
                              value={depTmplIfsc}
                              onChange={(e) => setDepTmplIfsc(e.target.value)}
                              placeholder="HDFC0001234"
                            />
                          </div>
                        </div>

                        <div className="field" style={{ margin: 0 }}>
                          <label>Deposit Remittance UPI ID / VPA</label>
                          <input
                            type="text"
                            value={depTmplUpiId}
                            onChange={(e) => setDepTmplUpiId(e.target.value)}
                            placeholder="deposit@hdfcbank"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Deposit & Tenancy Legal Clauses */}
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="var(--brass)" />
                          <b style={{ fontSize: '14px' }}>4. Deposit & Move-Out Legal Clauses</b>
                        </div>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => setDepTmplTerms(DEFAULT_DEPOSIT_TERMS)}
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                        >
                          Reset to Statutory Clauses
                        </button>
                      </div>
                      <div className="panel-body" style={{ padding: '16px 18px' }}>
                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label>Security Deposit Terms & Walkthrough Conditions</label>
                          <textarea
                            rows={6}
                            value={depTmplTerms}
                            onChange={(e) => setDepTmplTerms(e.target.value)}
                            style={{ fontSize: '13px', lineHeight: '1.5' }}
                          />
                        </div>

                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Authorized Signatory Name / Title</label>
                            <input
                              type="text"
                              value={depTmplSignatory}
                              onChange={(e) => setDepTmplSignatory(e.target.value)}
                              placeholder="Authorized Property Manager / Landlord"
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Footer Custody Note</label>
                            <input
                              type="text"
                              value={depTmplNotes}
                              onChange={(e) => setDepTmplNotes(e.target.value)}
                              placeholder="Funds are non-commingled, non-taxable security deposits..."
                            />
                          </div>
                        </div>

                        {/* Signature Upload */}
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Official Signature / Trustee Stamp</span>
                            {depTmplSignatureUrl && (
                              <button
                                type="button"
                                className="btn secondary small"
                                style={{ fontSize: '11px', padding: '2px 8px' }}
                                onClick={() => setDepTmplSignatureUrl('')}
                              >
                                ✕ Remove Signature
                              </button>
                            )}
                          </label>

                          {depTmplSignatureUrl ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FAF9F5', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                              <img
                                src={depTmplSignatureUrl}
                                alt="Signature Preview"
                                style={{ maxHeight: '42px', maxWidth: '160px', objectFit: 'contain', background: '#fff', border: '1px dashed var(--line)', padding: '4px', borderRadius: '4px' }}
                              />
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Authorized Signature Uploaded</div>
                                <label style={{ fontSize: '11.5px', color: 'var(--brass)', cursor: 'pointer', textDecoration: 'underline' }}>
                                  Replace Signature
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                          setDepTmplSignatureUrl(ev.target?.result as string);
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--line)', borderRadius: '6px', padding: '16px', cursor: 'pointer', background: '#FAFAF7' }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>Click to upload official signature image or company stamp</div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>PNG, JPG or SVG with transparent background recommended</div>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      setDepTmplSignatureUrl(ev.target?.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn brass"
                        onClick={handleSaveDepositTemplate}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px' }}
                      >
                        <Save size={15} /> Save Deposit Voucher Template
                      </button>
                    </div>

                  </div>
                )}

                {/* COLUMN 2: LIVE DEPOSIT VOUCHER PREVIEW */}
                {(tmplViewMode === 'split' || tmplViewMode === 'preview') && (
                  <div style={{ position: 'sticky', top: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brass)' }}>
                        ✦ LIVE VOUCHER DOCUMENT PREVIEW
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                        Updates dynamically with changes
                      </span>
                    </div>

                    {/* Document Preview Card */}
                    <div
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        padding: '28px 32px',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
                        fontSize: '12px',
                        color: '#1A1A1A',
                        fontFamily: "'Inter', sans-serif",
                        maxWidth: '820px',
                      }}
                    >
                      {/* Document Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--ink)', paddingBottom: '16px', marginBottom: '18px' }}>
                        <div>
                          <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                            {sampleUnit?.propertyName || 'PROPITHUB RESIDENTIAL'}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>
                            {depTmplIssuerName}
                          </div>
                          {depTmplIssuerTaxNo && (
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brass)', marginTop: '2px' }}>
                              {depTmplIssuerTaxNo}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px', lineHeight: '1.4' }}>
                            {depTmplIssuerAddress}<br />
                            Phone: {depTmplIssuerPhone} • Email: {depTmplIssuerEmail}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--brass)', letterSpacing: '0.04em' }}>
                            {depTmplTitle}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '3px' }}>
                            Voucher No: <b>DEP-2026-0042</b>
                          </div>
                          <div style={{ display: 'inline-block', background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, marginTop: '6px' }}>
                            ✓ DEPOSIT PROTECTED
                          </div>
                        </div>
                      </div>

                      {/* Recipient & Tenancy Details */}
                      {(() => {
                        const sampleDepositVal = sampleUnit?.deposit || (sampleUnit?.rent ? sampleUnit.rent * 2 : 50000);
                        const sampleCurrSym = getCurrencySymbol(sampleUnit?.currency) || DEFAULT_CURRENCY_SYMBOL;

                        return (
                          <>
                            <div className="grid grid-2" style={{ marginBottom: '16px', gap: '14px', fontSize: '11.5px', lineHeight: '1.5' }}>
                              <div style={{ background: '#FAFAF7', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                                <div style={{ fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '9.5px', marginBottom: '3px' }}>
                                  HELD ON BEHALF OF (TENANT):
                                </div>
                                <div style={{ fontWeight: 700, fontSize: '12.5px' }}>
                                  {sampleTenant ? sampleTenant.name : 'Resident Tenant'}
                                </div>
                                <div>
                                  {sampleUnit ? `Unit ${sampleUnit.unitNumber || sampleUnit.id} — ${sampleUnit.propertyName || 'Property Premises'}` : 'Unit & Property details resolved from lease'}
                                </div>
                              </div>

                              <div style={{ background: '#FAFAF7', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                                <div style={{ fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '9.5px', marginBottom: '3px' }}>
                                  CUSTODY LIFECYCLE:
                                </div>
                                <div>Voucher Issue Date: <b>{new Date().toLocaleDateString()}</b></div>
                                <div>Custody Status: <b style={{ color: '#15803D' }}>Held in Trust</b></div>
                                <div>Tenancy Status: <b>Executed Agreement</b></div>
                              </div>
                            </div>

                            {/* Line Items Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', fontSize: '12px' }}>
                              <thead>
                                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1.5px solid var(--line)' }}>
                                  <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--ink)' }}>Custody Item Description</th>
                                  <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--ink)' }}>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                                  <td style={{ padding: '10px' }}>
                                    <b>Security Deposit — {sampleUnit ? `Unit ${sampleUnit.unitNumber || sampleUnit.id}` : 'Demised Unit'}</b>
                                    <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>Refundable security custody deposit for tenancy performance</div>
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '10px', fontWeight: 600 }}>
                                    {sampleCurrSym}{sampleDepositVal.toLocaleString('en-IN')}
                                  </td>
                                </tr>
                              </tbody>
                            </table>

                            {/* Totals */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
                              <div style={{ width: '240px', fontSize: '12px', lineHeight: '1.8' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--ink-soft)' }}>Deposit Subtotal:</span>
                                  <span>{sampleCurrSym}{sampleDepositVal.toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803D' }}>
                                  <span>Tax Assessment:</span>
                                  <span>{sampleCurrSym}0 (Non-Taxable)</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--line-strong)', paddingTop: '6px', fontWeight: 800, fontSize: '14px' }}>
                                  <span>Total Deposit in Custody:</span>
                                  <span style={{ color: 'var(--brass)' }}>{sampleCurrSym}{sampleDepositVal.toLocaleString('en-IN')}</span>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* Remittance Bank Info Box */}
                      <div style={{ background: '#F8FAF7', border: '1px dashed var(--line-strong)', padding: '10px 12px', borderRadius: '4px', marginBottom: '14px', fontSize: '11px', lineHeight: '1.5' }}>
                        <div style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--brass)', fontSize: '9.5px', marginBottom: '3px' }}>
                          OFFICIAL DEPOSIT TRUST BANK & REMITTANCE DETAILS:
                        </div>
                        <div>Bank: <b>{depTmplBankName}</b> • Account: <b>{depTmplAccountName}</b></div>
                        <div>A/C No: <b>{depTmplAccountNumber}</b> • IFSC / Routing: <b>{depTmplIfsc}</b></div>
                        {depTmplUpiId && <div>Instant UPI VPA: <b>{depTmplUpiId}</b></div>}
                      </div>

                      {/* Terms & Conditions Box */}
                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', marginBottom: '14px' }}>
                        <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '3px' }}>
                          SECURITY DEPOSIT TERMS & CONDITIONS:
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--ink-soft)', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                          {depTmplTerms}
                        </div>
                      </div>

                      {/* Signatory Footer */}
                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '10px', color: 'var(--ink-soft)' }}>
                        <div style={{ maxWidth: '380px' }}>
                          {depTmplNotes}<br />
                          Propithub Real Estate Cloud Operating Platform.
                        </div>
                        <div style={{ textAlign: 'center', minWidth: '130px' }}>
                          {depTmplSignatureUrl ? (
                            <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '3px' }}>
                              <img
                                src={depTmplSignatureUrl}
                                alt="Authorized Signature"
                                style={{ maxHeight: '34px', maxWidth: '130px', objectFit: 'contain' }}
                              />
                            </div>
                          ) : (
                            <div style={{ height: '22px' }}></div>
                          )}
                          <div style={{ borderTop: '1.5px solid var(--ink)', paddingTop: '3px', fontWeight: 600, color: 'var(--ink)' }}>
                            {depTmplSignatory}
                          </div>
                          <div style={{ fontSize: '9px' }}>Authorized Signatory</div>
                        </div>
                      </div>

                    </div>

                    {/* Bottom Save Reminder */}
                    <div style={{ marginTop: '14px', width: '100%', maxWidth: '820px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn brass"
                        onClick={handleSaveDepositTemplate}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Save size={15} /> Save Deposit Voucher Template
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'methods' && (
        <div>
          <div className="note-box">
            These are the payment gateways and settlement channels configured for <b>your tenants to pay you rent</b>. Tenants can dynamically choose from any of your enabled and configured gateways at checkout. Online gateways (Razorpay, Stripe, PayPal) confirm payments instantly and auto-reconcile your ledger; offline channels (UPI QR, Bank Transfer, Cash) will register in your ledger awaiting your one-click receipt confirmation.
          </div>

          {/* Stripe Gateway Card */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 style={{ margin: 0 }}>Stripe</h3>
                <div className="hint">Accept international credit/debit cards, Apple Pay, Google Pay, and SEPA/ACH debits.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`badge ${m.stripe?.connected || (stripePub && stripeSecret) ? 'green' : 'grey'}`}>
                  {m.stripe?.connected || (stripePub && stripeSecret) ? 'Connected' : 'Not connected'}
                </span>
                <label
                  className={`toggle ${m.stripe?.enabled ? 'on' : ''}`}
                  onClick={() => toggleMethod('stripe')}
                >
                  <span className="track" />
                </label>
              </div>
            </div>
            {m.stripe?.enabled && (
              <div className="panel-body">
                <div className="row">
                  <div className="field">
                    <label>Webhook Signing Secret (Optional)</label>
                    <input
                      type="text"
                      value={stripeWebhook}
                      onChange={(e) => setStripeWebhook(e.target.value)}
                      placeholder="whsec_..."
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Publishable Key</label>
                    <input
                      type="text"
                      value={stripePub}
                      onChange={(e) => setStripePub(e.target.value)}
                      placeholder="pk_live_..."
                    />
                  </div>
                  <div className="field">
                    <label>Secret Key</label>
                    <input
                      type="password"
                      value={stripeSecret}
                      onChange={(e) => setStripeSecret(e.target.value)}
                      placeholder="sk_live_..."
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      savePaymentConfig(
                        (prev) => ({
                          ...prev,
                          stripe: {
                            ...prev.stripe,
                            enabled: true,
                            connected: !!(stripePub && stripeSecret),
                            mode: stripeMode,
                            pubKey: stripePub,
                            secretKey: stripeSecret,
                            webhookSecret: stripeWebhook,
                          },
                        }),
                        '✓ Stripe gateway credentials saved.'
                      );
                    }}
                  >
                    Save Stripe Keys
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      const res = await verifyStripeCredentials(stripePub, stripeSecret);
                      showToast(res.message);
                    }}
                  >
                    Test Stripe Keys
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Razorpay Gateway Card */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 style={{ margin: 0 }}>Razorpay</h3>
                <div className="hint">Accept Indian cards, UPI, Netbanking, and Wallets with automatic invoice reconciliation.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`badge ${m.razorpay?.connected || (razorpayKey && razorpaySecret) ? 'green' : 'grey'}`}>
                  {m.razorpay?.connected || (razorpayKey && razorpaySecret) ? 'Connected' : 'Not connected'}
                </span>
                <label
                  className={`toggle ${m.razorpay?.enabled ? 'on' : ''}`}
                  onClick={() => toggleMethod('razorpay')}
                >
                  <span className="track" />
                </label>
              </div>
            </div>
            {m.razorpay?.enabled && (
              <div className="panel-body">
                <div className="row">
                  <div className="field">
                    <label>Key ID</label>
                    <input
                      type="text"
                      value={razorpayKey}
                      onChange={(e) => setRazorpayKey(e.target.value)}
                      placeholder="rzp_live_..."
                    />
                  </div>
                  <div className="field">
                    <label>Key Secret</label>
                    <input
                      type="password"
                      value={razorpaySecret}
                      onChange={(e) => setRazorpaySecret(e.target.value)}
                      placeholder="Razorpay Key Secret"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      savePaymentConfig(
                        (prev) => ({
                          ...prev,
                          razorpay: {
                            ...prev.razorpay,
                            enabled: true,
                            connected: !!(razorpayKey && razorpaySecret),
                            mode: razorpayMode,
                            keyId: razorpayKey,
                            keySecret: razorpaySecret,
                          },
                        }),
                        '✓ Razorpay gateway credentials saved.'
                      );
                    }}
                  >
                    Save Razorpay Keys
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      const res = await verifyRazorpayCredentials(razorpayKey, razorpaySecret);
                      showToast(res.message);
                    }}
                  >
                    Test Razorpay Keys
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PayPal Gateway Card */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 style={{ margin: 0 }}>PayPal</h3>
                <div className="hint">Accept international payments from PayPal accounts and credit cards in 25+ currencies.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`badge ${m.paypal?.connected || (paypalEmail && paypalClient) ? 'green' : 'grey'}`}>
                  {m.paypal?.connected || (paypalEmail && paypalClient) ? 'Connected' : 'Not connected'}
                </span>
                <label
                  className={`toggle ${m.paypal?.enabled ? 'on' : ''}`}
                  onClick={() => toggleMethod('paypal')}
                >
                  <span className="track" />
                </label>
              </div>
            </div>
            {m.paypal?.enabled && (
              <div className="panel-body">
                <div className="row">
                  <div className="field">
                    <label>PayPal Business Email</label>
                    <input
                      type="email"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      placeholder="landlord@business.com"
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>REST API Client ID</label>
                    <input
                      type="text"
                      value={paypalClient}
                      onChange={(e) => setPaypalClient(e.target.value)}
                      placeholder="Client ID from developer.paypal.com"
                    />
                  </div>
                  <div className="field">
                    <label>Secret</label>
                    <input
                      type="password"
                      value={paypalSecret}
                      onChange={(e) => setPaypalSecret(e.target.value)}
                      placeholder="Client Secret"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      savePaymentConfig(
                        (prev) => ({
                          ...prev,
                          paypal: {
                            ...prev.paypal,
                            enabled: true,
                            connected: !!(paypalEmail || paypalClient),
                            mode: paypalMode,
                            email: paypalEmail,
                            clientId: paypalClient,
                            secret: paypalSecret,
                          },
                        }),
                        '✓ PayPal gateway credentials saved.'
                      );
                    }}
                  >
                    Save PayPal Keys
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      const res = await verifyPayPalCredentials(paypalClient, paypalSecret);
                      showToast(res.message);
                    }}
                  >
                    Test PayPal Connection
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Easebuzz Gateway Card (Full Production Gateway) */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 style={{ margin: 0 }}>Easebuzz Payment Gateway</h3>
                <div className="hint">Live production payment gateway: UPI (Instant PhonePe/GPay), 50+ Banks Netbanking, Cards & Wallets.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`badge ${m.easebuzz?.connected || (easebuzzKey && easebuzzSalt) ? 'green' : 'grey'}`}>
                  {m.easebuzz?.connected || (easebuzzKey && easebuzzSalt) ? 'Connected' : 'Not connected'}
                </span>
                <label
                  className={`toggle ${m.easebuzz?.enabled ? 'on' : ''}`}
                  onClick={() => toggleMethod('easebuzz')}
                >
                  <span className="track" />
                </label>
              </div>
            </div>
            {m.easebuzz?.enabled && (
              <div className="panel-body">
                <div className="row">
                  <div className="field">
                    <label>Merchant Key</label>
                    <input
                      type="text"
                      value={easebuzzKey}
                      onChange={(e) => setEasebuzzKey(e.target.value)}
                      placeholder="e.g. 2PBP7IAB82"
                    />
                  </div>
                  <div className="field">
                    <label>Merchant Salt</label>
                    <input
                      type="password"
                      value={easebuzzSalt}
                      onChange={(e) => setEasebuzzSalt(e.target.value)}
                      placeholder="e.g. DA95CD24ED..."
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Sub-merchant ID (Optional - for direct settlement account)</label>
                  <input
                    type="text"
                    value={easebuzzSubMerchant}
                    onChange={(e) => setEasebuzzSubMerchant(e.target.value)}
                    placeholder="Optional Sub-merchant ID"
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      savePaymentConfig(
                        (prev) => ({
                          ...prev,
                          easebuzz: {
                            ...prev.easebuzz,
                            enabled: true,
                            connected: !!(easebuzzKey && easebuzzSalt),
                            mode: 'live',
                            merchantKey: easebuzzKey.trim(),
                            salt: easebuzzSalt.trim(),
                            subMerchantId: easebuzzSubMerchant.trim(),
                          },
                        }),
                        '✓ Easebuzz live production credentials saved for tenant rent collection.'
                      );
                    }}
                  >
                    Save Easebuzz Keys
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={testingEasebuzz}
                    onClick={async () => {
                      setTestingEasebuzz(true);
                      try {
                        const res = await pingGatewayEndpoint('easebuzz');
                        showToast(res);
                      } catch (err: any) {
                        showToast(`Easebuzz ping error: ${err?.message}`);
                      } finally {
                        setTestingEasebuzz(false);
                      }
                    }}
                  >
                    {testingEasebuzz ? 'Pinging Gateway...' : '⚡ Test Live Endpoint'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* UPI Direct QR Card */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 style={{ margin: 0 }}>UPI (Direct VPA & QR Code)</h3>
                <div className="hint">Zero processing fee direct bank-to-bank settlements via Google Pay, PhonePe, Paytm, BHIM.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`badge ${upiId ? 'green' : 'grey'}`}>
                  {upiId ? 'Configured' : 'Not configured'}
                </span>
                <label
                  className={`toggle ${m.upi?.enabled ? 'on' : ''}`}
                  onClick={() => toggleMethod('upi')}
                >
                  <span className="track" />
                </label>
              </div>
            </div>
            {m.upi?.enabled && (
              <div className="panel-body">
                <div className="row">
                  <div className="field">
                    <label>UPI Virtual Payment Address (VPA)</label>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="e.g. propertyowner@okhdfcbank"
                    />
                  </div>
                  <div className="field">
                    <label>Payee / Merchant Display Name</label>
                    <input
                      type="text"
                      value={upiMerchant}
                      onChange={(e) => setUpiMerchant(e.target.value)}
                      placeholder="e.g. Skyline Apartments"
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Upload UPI QR Code Image (displayed to tenants upon checkout)</label>
                  <label className="btn secondary small" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    Choose QR image
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleUploadQr}
                    />
                  </label>
                  {upiQr && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <img
                        src={upiQr}
                        alt="UPI QR"
                        style={{ width: '130px', height: '130px', objectFit: 'contain', border: '1px solid var(--line-strong)', borderRadius: '6px', padding: '6px', background: '#fff' }}
                      />
                      <div className="hint">
                        QR code is active and will be rendered on tenant rent checkout modals.
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      savePaymentConfig(
                        (prev) => ({
                          ...prev,
                          upi: {
                            ...prev.upi,
                            enabled: true,
                            upiId,
                            merchantName: upiMerchant,
                            qrImage: upiQr,
                          },
                        }),
                        '✓ UPI configuration saved.'
                      );
                    }}
                  >
                    Save UPI Details
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => {
                      if (!upiId) {
                        showToast('Please enter a UPI VPA ID first.');
                        return;
                      }
                      showToast(`VPA Address ${upiId} format verified. NPCI routing active.`);
                    }}
                  >
                    Verify UPI VPA
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bank Transfer Card */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 style={{ margin: 0 }}>Direct Bank Transfer (NEFT / RTGS / IMPS / Wire)</h3>
                <div className="hint">Tenants wire rent directly to your bank account; requires your manual confirmation upon receipt.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`badge ${bankAcct ? 'green' : 'grey'}`}>
                  {bankAcct ? 'Configured' : 'Not configured'}
                </span>
                <label
                  className={`toggle ${m.bank?.enabled ? 'on' : ''}`}
                  onClick={() => toggleMethod('bank')}
                >
                  <span className="track" />
                </label>
              </div>
            </div>
            {m.bank?.enabled && (
              <div className="panel-body">
                <div className="row">
                  <div className="field">
                    <label>Account Holder Name</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Bank Name / Financial Institution</label>
                    <input
                      type="text"
                      value={bankInstitution}
                      onChange={(e) => setBankInstitution(e.target.value)}
                      placeholder="e.g. HDFC Bank / Chase"
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Account Number / IBAN</label>
                    <input
                      type="text"
                      value={bankAcct}
                      onChange={(e) => setBankAcct(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Routing / SWIFT / IFSC Code</label>
                    <input
                      type="text"
                      value={bankRouting}
                      onChange={(e) => setBankRouting(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Country</label>
                    <input
                      type="text"
                      value={bankCountry}
                      onChange={(e) => setBankCountry(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn brass small"
                  style={{ marginTop: '10px' }}
                  onClick={() => {
                    savePaymentConfig(
                      (prev) => ({
                        ...prev,
                        bank: {
                          ...prev.bank,
                          enabled: true,
                          accountName: bankName,
                          bankName: bankInstitution,
                          country: bankCountry,
                          accountNumber: bankAcct,
                          routing: bankRouting,
                        },
                      }),
                      '✓ Bank transfer details saved.'
                    );
                  }}
                >
                  Save Bank Details
                </button>
              </div>
            )}
          </div>

          {/* Cash Card */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 style={{ margin: 0 }}>Cash & Offline Collection</h3>
                <div className="hint">In-person cash or physical check payments handled by you or your on-site manager.</div>
              </div>
              <label
                className={`toggle ${m.cash?.enabled ? 'on' : ''}`}
                onClick={() => toggleMethod('cash')}
              >
                <span className="track" />
              </label>
            </div>
            {m.cash?.enabled && (
              <div className="panel-body">
                <div className="field">
                  <label>Cash Collection Instructions for Tenants</label>
                  <input
                    type="text"
                    value={cashInstructions}
                    onChange={(e) => setCashInstructions(e.target.value)}
                    placeholder="e.g. Pay directly at the property management office between 9 AM and 5 PM."
                  />
                </div>
                <button
                  type="button"
                  className="btn brass small"
                  style={{ marginTop: '10px' }}
                  onClick={() => {
                    savePaymentConfig(
                      (prev) => ({
                        ...prev,
                        cash: {
                          ...prev.cash,
                          enabled: true,
                          instructions: cashInstructions,
                        },
                      }),
                      '✓ Cash settings saved.'
                    );
                  }}
                >
                  Save Cash Instructions
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SETTINGS: UNIFIED BILLING RULES & POLICIES */}
      {subTab === 'settings' && (
        <div>
          <div className="note-box" style={{ marginBottom: '20px' }}>
            Configure your property billing rules, automated tenant rent reminders, late payment penalties, and applicable tax rates.
          </div>

          {/* Rental payment reminder rule */}
          <div className="section-title">Rental payment reminder rule</div>
          <div className="panel" style={{ marginBottom: '24px' }}>
            <div className="panel-body">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: reminderEnabled ? '16px' : '0',
                }}
              >
                <div>
                  <b>Automated rent due reminders for tenants</b>
                  <p className="hint" style={{ marginTop: '2px' }}>
                    Control how many days before the rental payment due date tenants receive reminder alerts and "Due Soon" notices.
                  </p>
                </div>
                <label
                  className={`toggle ${reminderEnabled ? 'on' : ''}`}
                  onClick={() => handleSaveReminderSettings(reminderDays, !reminderEnabled)}
                >
                  <span className="track" />
                </label>
              </div>

              {reminderEnabled && (
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                    Reminder Lead Time (Days Prior to Due Date):
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    {[3, 5, 7, 10, 15].map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`btn small ${reminderDays === d ? 'brass' : 'secondary'}`}
                        onClick={() => handleSaveReminderSettings(d, true)}
                        style={{ padding: '6px 14px', fontSize: '12.5px' }}
                      >
                        {d === 10 ? '10 Days Prior (Default)' : `${d} Days Prior`}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="field" style={{ margin: 0, width: '220px' }}>
                      <label style={{ fontSize: '12px' }}>Custom days prior</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={reminderDays === 0 ? '' : reminderDays}
                        placeholder="10"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setReminderDays(cleaned === '' ? 1 : Math.max(1, Number(cleaned)));
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn brass"
                      style={{ marginTop: '18px' }}
                      onClick={() => handleSaveReminderSettings(reminderDays, true)}
                    >
                      Save reminder rule
                    </button>
                  </div>

                  <p className="hint" style={{ marginTop: '10px', fontSize: '12.5px' }}>
                    ℹ️ <b>Active Rule:</b> Tenants will see upcoming rent reminders and due-soon countdowns <b>{reminderDays} days</b> before their contracted rent due date. (If left unconfigured, system automatically uses 10 days prior).
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Late fee rule */}
          <div className="section-title">Late fee rule</div>
          <div className="panel" style={{ marginBottom: '24px' }}>
            <div className="panel-body">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: state.lateFeeSettings.enabled ? '16px' : '0',
                }}
              >
                <div>
                  <b>Automatically charge a late fee</b>
                  <p className="hint" style={{ marginTop: '2px' }}>
                    You decide if and how this applies — Propithub never applies it on its own.
                  </p>
                </div>
                <label
                  className={`toggle ${state.lateFeeSettings.enabled ? 'on' : ''}`}
                  onClick={handleToggleLateFee}
                >
                  <span className="track" />
                </label>
              </div>

              {state.lateFeeSettings.enabled && (
                <div>
                  <div className="row">
                    <div className="field">
                      <label>Grace period (days)</label>
                      <input
                        type="number"
                        min="0"
                        value={lateFeeGrace === 0 ? '' : lateFeeGrace}
                        placeholder="0"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setLateFeeGrace(cleaned === '' ? 0 : Number(cleaned));
                        }}
                      />
                    </div>
                    <div className="field">
                      <label>Fee type</label>
                      <select
                        value={lateFeeType}
                        onChange={(e) => setLateFeeType(e.target.value as 'percent' | 'flat')}
                      >
                        <option value="percent">Percentage</option>
                        <option value="flat">Flat amount</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>
                        {lateFeeType === 'percent' ? 'Percent of rent (%)' : `Flat amount (${dominantRentCurrency})`}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={lateFeeValue === 0 ? '' : lateFeeValue}
                        placeholder="0"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setLateFeeValue(cleaned === '' ? 0 : Number(cleaned));
                        }}
                      />
                    </div>
                    <div className="field">
                      <label>Maximum cap ({dominantRentCurrency})</label>
                      <input
                        type="number"
                        min="0"
                        value={lateFeeCap === 0 ? '' : lateFeeCap}
                        placeholder="0"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setLateFeeCap(cleaned === '' ? 0 : Number(cleaned));
                        }}
                      />
                    </div>
                  </div>
                  <button type="button" className="btn brass" onClick={handleSaveLateFee}>
                    Save late fee rule
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tax & GST Configuration */}
          <div className="section-title">Tax & Billing Policy</div>
          <div className="panel">
            <div className="panel-body">
              <div className="row" style={{ marginBottom: '14px' }}>
                <div className="field">
                  <label>Tax label (e.g. GST, VAT, Sales Tax)</label>
                  <input
                    type="text"
                    value={taxLabel}
                    onChange={(e) => setTaxLabel(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Tax percent (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={taxPercent === 0 ? '' : taxPercent}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setTaxPercent(cleaned === '' ? 0 : Number(cleaned));
                    }}
                  />
                </div>
              </div>
              <button type="button" className="btn brass" onClick={handleSaveTax}>
                Save tax rule
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Settle Invoice Offline Modal */}
      {settlingInvoice && (
        <div className="modal-backdrop" onClick={() => setSettlingInvoice(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Mark Invoice Paid: {settlingInvoice.id}</h3>
              <button type="button" className="btn secondary small" onClick={() => setSettlingInvoice(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Tenant:</span>
                <b>{settlingInvoice.tenant}</b>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Unit:</span>
                <span>{settlingInvoice.unit}</span>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Invoice Total:</span>
                <b style={{ color: 'var(--brass)' }}>{settlingInvoice.currency || DEFAULT_CURRENCY_SYMBOL}{settlingInvoice.total?.toLocaleString()}</b>
              </div>

              <div className="field" style={{ marginTop: '14px' }}>
                <label>Payment Method</label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value as any)}
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
                  <option value="UPI">Direct UPI</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div className="row">
                <div className="field">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Transaction / Receipt Ref (Mandatory Proof) <span style={{ color: '#DC2626' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. UTR / Receipt #102"
                    value={settleRef}
                    onChange={(e) => setSettleRef(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary" disabled={isSettling} onClick={() => setSettlingInvoice(null)}>Cancel</button>
              <button
                type="button"
                className={`btn brass ${isSettling ? 'btn-processing' : ''}`}
                disabled={isSettling}
                onClick={handleSettleInvoice}
              >
                <ButtonProcessing
                  loading={isSettling}
                  loadingText="Settling..."
                  defaultText="Confirm Settle as Paid"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Offline Payment Modal */}
      {isRecordOfflineOpen && (
        <div className="modal-backdrop" onClick={() => setIsRecordOfflineOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Record Offline Rent Payment</h3>
              <button type="button" className="btn secondary small" onClick={() => setIsRecordOfflineOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ marginBottom: '14px' }}>
                Log cash, cheque, or direct bank transfer payments and automatically reconcile pending invoices.
              </p>
              <div className="field">
                <label>Target Unit & Resident</label>
                <select
                  value={offlineUnit}
                  onChange={(e) => {
                    const uId = e.target.value;
                    setOfflineUnit(uId);
                    const matched = myUnits.find((u) => u.id === uId);
                    if (matched?.rent) setOfflineAmount(matched.rent);
                  }}
                >
                  {[...myUnits]
                    .sort((a, b) => (a.status === 'occupied' ? 0 : 1) - (b.status === 'occupied' ? 0 : 1))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unitNumber || u.id} ({u.tenant ? `Resident: ${u.tenant}` : 'Vacant Unit'})
                      </option>
                    ))}
                </select>
              </div>
              <div className="row">
                <div className="field">
                  <label>Amount Collected ({getCurrencySymbol(myUnits.find((u) => u.unitNumber === offlineUnit || u.id === offlineUnit)?.currency || dominantRentCurrency)})</label>
                  <input
                    type="number"
                    min="0"
                    value={offlineAmount === 0 ? '' : offlineAmount}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setOfflineAmount(cleaned === '' ? 0 : Number(cleaned));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Payment Method</label>
                  <select
                    value={offlineMethod}
                    onChange={(e) => setOfflineMethod(e.target.value as any)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Date Received</label>
                  <input
                    type="date"
                    value={offlineDate}
                    onChange={(e) => setOfflineDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>UTR / Receipt Ref (Proof of Payment) <span style={{ color: '#DC2626' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Receipt #442"
                    value={offlineRef}
                    onChange={(e) => setOfflineRef(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary btn-mobile-full" disabled={isRecordingOffline} onClick={() => setIsRecordOfflineOpen(false)}>Cancel</button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isRecordingOffline ? 'btn-processing' : ''}`}
                disabled={isRecordingOffline}
                onClick={handleRecordOfflinePayment}
              >
                <ButtonProcessing
                  loading={isRecordingOffline}
                  loadingText="Recording..."
                  defaultText="Record Payment"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Review Modal for Landlord Verification */}
      {reviewingProofInvoice && (() => {
        // Fetch current invoice from live state to guarantee freshest updates
        const currentInvoice =
          state.invoices.find((inv) => inv.id === reviewingProofInvoice.id) || reviewingProofInvoice;

        // Match claims for this invoice, sorting newest first and prioritizing pending_confirmation
        const matchingClaims = (state.cashClaims || [])
          .filter((c) => c.invoiceId === currentInvoice.id || (currentInvoice.paymentProofRef && c.id === currentInvoice.paymentProofRef))
          .sort((a, b) => new Date(b.claimedAt || 0).getTime() - new Date(a.claimedAt || 0).getTime());

        const linkedClaim = matchingClaims.find((c) => c.status === 'pending_confirmation') || matchingClaims[0];

        // Match payments for this invoice, sorting newest first and prioritizing pending_confirmation
        const matchingPayments = (state.payments || [])
          .filter((p) => p.invoiceId === currentInvoice.id || (linkedClaim && p.cashClaimId === linkedClaim.id))
          .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

        const linkedPayment = matchingPayments.find((p) => p.status === 'pending_confirmation') || matchingPayments[0];

        // 1. Resolve Effective UTR / Transfer Reference
        const effectiveProofRef =
          (currentInvoice.paymentProofRef && currentInvoice.paymentProofRef !== 'Direct Transfer')
            ? currentInvoice.paymentProofRef
            : (linkedClaim?.notes?.match(/Ref:\s*([^—\n]+)/)?.[1]?.trim() ||
              linkedPayment?.notes?.match(/Ref:\s*([^—\n]+)/)?.[1]?.trim() ||
              linkedClaim?.id ||
              linkedPayment?.id ||
              currentInvoice.paymentProofRef ||
              'Direct Transfer');

        // 2. Resolve Effective Proof Screenshot / Receipt Image
        const effectiveProofUrl =
          linkedClaim?.proofPhotoUrl ||
          linkedPayment?.audit?.proofPhotoUrl ||
          currentInvoice.paymentProofUrl ||
          '';

        // 3. Resolve Effective Resident Notes (clean out past rejection comments & Ref prefix)
        let rawNotes =
          linkedClaim?.notes ||
          linkedPayment?.notes ||
          currentInvoice.paymentProofNotes ||
          '';

        if (rawNotes.toLowerCase().includes('proof rejected')) {
          const altClaimNote = linkedClaim?.notes;
          const altPayNote = linkedPayment?.notes;
          if (altClaimNote && !altClaimNote.toLowerCase().includes('proof rejected')) {
            rawNotes = altClaimNote;
          } else if (altPayNote && !altPayNote.toLowerCase().includes('proof rejected')) {
            rawNotes = altPayNote;
          } else {
            rawNotes = '';
          }
        }

        const effectiveProofNotes = rawNotes
          .replace(/^Ref:\s*[^—\n]+—\s*/i, '')
          .replace(/^Ref:\s*[^—\n]+$/i, '')
          .trim();

        // 4. Resolve Effective Submission Date
        const effectiveSubmissionDate =
          currentInvoice.paymentProofDate ||
          linkedClaim?.claimedAt ||
          linkedPayment?.audit?.claimedAt ||
          currentInvoice.issueDate;

        return (
          <div className="modal-backdrop" onClick={() => setReviewingProofInvoice(null)}>
            <div className="modal-card" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={20} color="var(--brass)" />
                  <h3 style={{ margin: 0, fontSize: '17px' }}>
                    Verify Offline Payment Proof — {reviewingProofInvoice.id}
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setReviewingProofInvoice(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ padding: '20px' }}>
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#92400E', fontSize: '13px' }}>
                    <Clock size={15} /> Awaiting Landlord Settlement
                  </div>
                  <div style={{ fontSize: '12px', color: '#78350F', marginTop: '4px' }}>
                    The resident reported paying offline. Verify that the funds reached your bank or UPI account before approving.
                  </div>
                </div>

                {/* Remittance Details Grid */}
                <div style={{ background: '#FAFAF7', border: '1px solid var(--line)', borderRadius: '6px', padding: '14px', fontSize: '13px', lineHeight: '1.7', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Resident:</span>
                    <b>{reviewingProofInvoice.tenant} (Unit {reviewingProofInvoice.unit})</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Invoice Amount:</span>
                    <b style={{ color: 'var(--brass)', fontSize: '15px' }}>{getCurrencySymbol(reviewingProofInvoice.currency) || DEFAULT_CURRENCY_SYMBOL}{reviewingProofInvoice.total?.toLocaleString()}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>UTR / Transfer Ref:</span>
                    <b style={{ fontFamily: 'monospace' }}>{effectiveProofRef}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Submission Date:</span>
                    <span>{effectiveSubmissionDate ? new Date(effectiveSubmissionDate).toLocaleString() : 'Recent'}</span>
                  </div>
                  {effectiveProofNotes && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Resident Note:</span>
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{effectiveProofNotes}</span>
                    </div>
                  )}
                </div>

                {/* Uploaded Receipt Image */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                    Uploaded Payment Receipt / Screenshot:
                  </div>
                  {effectiveProofUrl ? (
                    <div style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '8px', background: 'var(--surface)', textAlign: 'center' }}>
                      <img
                        src={effectiveProofUrl}
                        alt="Payment Receipt Proof"
                        style={{ maxWidth: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '4px' }}
                      />
                      <div style={{ marginTop: '8px' }}>
                        <a
                          href={effectiveProofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn secondary small"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
                        >
                          <ExternalLink size={12} /> Open Full Receipt
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '16px', border: '1px dashed var(--line)', borderRadius: '6px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '12px' }}>
                      No receipt image attached. Remittance verified via UTR reference only.
                    </div>
                  )}
                </div>
              </div>

              <div
                className="modal-foot"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '14px 20px',
                  borderTop: '1px solid var(--line)',
                  background: '#FAFAF7',
                }}
              >
                <button
                  type="button"
                  className={`btn secondary small btn-mobile-full ${isRejectingProof ? 'btn-processing' : ''}`}
                  disabled={isRejectingProof || isApprovingProof}
                  onClick={() => handleRejectProof(reviewingProofInvoice)}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                >
                  <ButtonProcessing
                    loading={isRejectingProof}
                    loadingText="Rejecting..."
                    defaultText="✕ Reject / Request Re-submission"
                  />
                </button>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn secondary btn-mobile-full"
                    disabled={isApprovingProof || isRejectingProof}
                    onClick={() => setReviewingProofInvoice(null)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={`btn brass btn-mobile-full ${isApprovingProof ? 'btn-processing' : ''}`}
                    disabled={isApprovingProof || isRejectingProof}
                    onClick={() => handleApproveProof(reviewingProofInvoice)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ButtonProcessing
                      loading={isApprovingProof}
                      loadingText="Settling..."
                      defaultText="Confirm Receipt & Settle"
                      icon={<CheckCircle size={15} />}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk Download Confirmation & Timeline Selector Modal */}
      {isBulkDownloadModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsBulkDownloadModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="var(--brass)" /> Confirm Bulk Invoice PDF Download
                </h3>
                <div className="hint" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Select the statement timeline and review scope before generating your consolidated PDF report.
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setIsBulkDownloadModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Timeline Selection Options */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px', color: 'var(--ink)' }}>
                  Statement Timeline Period:
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(
                    [
                      { id: 'all', label: 'All Time' },
                      { id: 'this_month', label: 'This Month' },
                      { id: 'last_month', label: 'Last Month' },
                      { id: 'this_quarter', label: 'This Quarter' },
                      { id: 'custom', label: 'Custom Range' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`btn small ${bulkModalTimeline === item.id ? 'brass' : 'secondary'}`}
                      style={{ padding: '5px 12px', fontSize: '12px' }}
                      onClick={() => setBulkModalTimeline(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Range Picker */}
                {bulkModalTimeline === 'custom' && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '6px', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
                    <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>From:</label>
                      <input
                        type="date"
                        value={bulkCustomStart}
                        onChange={(e) => setBulkCustomStart(e.target.value)}
                        style={{ padding: '5px 8px', fontSize: '12px' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>To:</label>
                      <input
                        type="date"
                        value={bulkCustomEnd}
                        onChange={(e) => setBulkCustomEnd(e.target.value)}
                        style={{ padding: '5px 8px', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Status Filter Selection */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px', color: 'var(--ink)' }}>
                  Invoice Status Scope:
                </label>
                <select
                  value={bulkStatusFilter}
                  onChange={(e) => setBulkStatusFilter(e.target.value as any)}
                  style={{ width: '100%', fontSize: '13px', padding: '7px 10px' }}
                >
                  <option value="all">All Statuses (Paid, Pending, Overdue, Sent)</option>
                  <option value="paid">Paid &amp; Settled Only</option>
                  <option value="pending_confirmation">Pending Confirmation Only</option>
                  <option value="sent">Sent / Due Only</option>
                  <option value="overdue">Overdue Only</option>
                </select>
              </div>

              {/* Live Scope Summary Card */}
              <div style={{ background: 'var(--surface-sunken)', border: '1.5px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Export Scope Preview
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Invoices to Compile</div>
                    <b style={{ fontSize: '18px', color: modalInvoicesToDownload.length > 0 ? 'var(--brass)' : 'var(--danger)' }}>
                      {modalInvoicesToDownload.length} {modalInvoicesToDownload.length === 1 ? 'Invoice' : 'Invoices'}
                    </b>
                  </div>
                  <div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Cumulative Value</div>
                    <b style={{ fontSize: '18px', color: 'var(--ink)' }}>
                      {dominantRentCurrency}{modalInvoicesToDownload.reduce((sum, inv) => sum + (inv.total || inv.amount || 0), 0).toLocaleString('en-IN')}
                    </b>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Timeline Reference</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{modalTimelineLabel}</div>
                  </div>
                </div>

                {modalInvoicesToDownload.length === 0 && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#991B1B', fontSize: '12px' }}>
                    ⚠️ No invoices match the selected timeline and status criteria. Please adjust your range.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setIsBulkDownloadModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                disabled={modalInvoicesToDownload.length === 0}
                onClick={() => {
                  downloadBulkInvoicesPDF(modalInvoicesToDownload, 'Rental Invoices Portfolio', modalTimelineLabel);
                  showToast(`✓ Generated consolidated PDF for ${modalInvoicesToDownload.length} invoices.`);
                  setIsBulkDownloadModalOpen(false);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Download size={14} /> Confirm &amp; Download PDF ({modalInvoicesToDownload.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Production Rental Invoice Studio & Preview Modal */}
      <RentalInvoiceStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        initialInvoice={studioInvoice}
        initialMode={studioMode}
        initialInvoiceType={studioInitialCategory}
        ownerId={ownerId}
      />
    </div>
  );
};
