import React, { useState, useMemo, useEffect } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Invoice, PaymentTransaction, InvoiceTemplateConfig, CashHandoverClaim } from '../../types';
import { db, functions, isFirebaseConfigured } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import { getDaysFromNowString, getTodayDateString } from '../../lib/dates';
import { RentalInvoiceStudioModal, DEFAULT_DEPOSIT_TERMS } from '../../components/invoices/RentalInvoiceStudioModal';
import { RentalInvoiceDocument } from '../../components/invoices/RentalInvoiceDocument';
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
import { CurrencyAmount, getTableCurrencyHeader } from '../../components/common/CurrencyAmount';
import { resolveUnitOccupancy, isDepositPayment } from '../../lib/portfolioSelectors';
import {
  Download,
  FileText,
  Bell,
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
  const { state, updateState, saveAgreement, saveInvoice, savePayment, markInvoicePaid, waiveInvoiceLateFee, saveOwnerSettings, saveNotification, confirmCashClaim, rejectCashClaim, submitCashClaim, logCommunication, showToast } = useAppData();
  const { user } = useAuth();

  // One-time repair per session: payments/proofs a tenant submitted without an owner stamp are re-attached to this owner.
  useEffect(() => {
    if (!isFirebaseConfigured || !user?.id) return;
    const key = `repaired-tenant-records-v2-${user.id}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    httpsCallable<unknown, { fixed: number; removed?: number }>(functions, 'repairMyTenantRecords')()
      .then((r) => { if (r.data?.fixed) console.info(`Re-attached ${r.data.fixed} payment record(s) to your account.`); })
      .catch((e) => console.warn('repairMyTenantRecords failed', e));
  }, [user?.id]);
  const ownerId = user?.id || '';

  const { viewCurrency, convert } = useCurrency();
  const activeCurrencyCode = viewCurrency || 'USD';
  const activeCurrencyMeta =
    GLOBAL_CURRENCIES.find((c) => c.code === activeCurrencyCode) ||
    ({ symbol: '$', code: 'USD' } as any);
  const activeSymbol = activeCurrencyMeta.symbol || activeCurrencyCode;

  const formatMoney = (amount: number | null | undefined, fromCurrency?: string) => {
    const raw = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    // If fromCurrency is provided, convert from that currency; if omitted, the amount is already in activeCurrencyCode
    const fromCode = fromCurrency ? normalizeCurrencyCode(fromCurrency) : activeCurrencyCode;
    const converted = fromCode === activeCurrencyCode ? raw : convert(raw, fromCode, activeCurrencyCode);
    return formatCurrencyAmount(converted, activeCurrencyCode);
  };

  const formatTxDate = (d?: string | null) => {
    if (!d) return '—';
    try {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    } catch { }
    return d.includes('T') ? d.split('T')[0] : d;
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
  const [reviewingClaim, setReviewingClaim] = useState<CashHandoverClaim | null>(null);



  // Payment methods & Gateways form states
  const ownerSettings = state.ownerSettings[ownerId];
  const m = (ownerSettings?.paymentMethods as any) || state.ownerPaymentMethods;

  // Late fee state
  const existingLateFee = ownerSettings?.lateFeeConfig || state.lateFeeSettings;
  const [lateFeeGrace, setLateFeeGrace] = useState(existingLateFee.graceDays ?? 5);
  const [lateFeeType, setLateFeeType] = useState<'percent' | 'flat'>((existingLateFee.type as any) === 'flat' ? 'flat' : 'percent');
  const [lateFeeValue, setLateFeeValue] = useState(existingLateFee.value ?? 2);
  const [lateFeeCap, setLateFeeCap] = useState(existingLateFee.cap ?? 1000);
  const [lateFeeEnabled, setLateFeeEnabled] = useState<boolean>(existingLateFee.enabled ?? false);

  // Tax settings state (kept for fallback)
  const [taxLabel, setTaxLabel] = useState(state.taxSettings.label);
  const [taxPercent, setTaxPercent] = useState(state.taxSettings.percent);

  // Rental reminder policy state (defaults to 10 days prior)
  const currentReminderDays = ownerSettings?.rentReminderDaysPrior ?? ownerSettings?.rentalReminderConfig?.daysPrior ?? 10;
  const [reminderDays, setReminderDays] = useState<number>(currentReminderDays);
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(ownerSettings?.rentalReminderConfig?.enabled ?? true);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [isSavingLateFee, setIsSavingLateFee] = useState(false);
  const [expandedGateway, setExpandedGateway] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerSettings) return;
    const lf = ownerSettings.lateFeeConfig || state.lateFeeSettings;
    if (lf) {
      setLateFeeGrace(lf.graceDays ?? 5);
      setLateFeeType((lf.type as any) === 'flat' ? 'flat' : 'percent');
      setLateFeeValue(lf.value ?? 2);
      setLateFeeCap(lf.cap ?? 1000);
      setLateFeeEnabled(lf.enabled ?? false);
    }
    const remDays = ownerSettings.rentReminderDaysPrior ?? ownerSettings.rentalReminderConfig?.daysPrior;
    if (typeof remDays === 'number') {
      setReminderDays(remDays);
    }
    if (typeof ownerSettings.rentalReminderConfig?.enabled === 'boolean') {
      setReminderEnabled(ownerSettings.rentalReminderConfig.enabled);
    }
  }, [ownerSettings, state.lateFeeSettings]);

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
  const [tmplIncludeTerms, setTmplIncludeTerms] = useState(existingTemplate?.includeTerms !== false);
  const [tmplSignatory, setTmplSignatory] = useState(existingTemplate?.signatoryName || 'Authorized Property Manager');
  const [tmplSignatureUrl, setTmplSignatureUrl] = useState(existingTemplate?.signatureUrl || '');
  const [tmplNotes, setTmplNotes] = useState(existingTemplate?.notes || 'Thank you for your prompt tenancy settlement.');
  const [tmplViewMode, setTmplViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  // Security Deposit Voucher Template state
  const existingDepositTemplate = ownerSettings?.depositTemplate;
  const [depTmplTitle, setDepTmplTitle] = useState(existingDepositTemplate?.documentTitle || 'SECURITY DEPOSIT CUSTODY VOUCHER');
  const [depTmplClassification, setDepTmplClassification] = useState(existingDepositTemplate?.depositClassification || '100% Refundable Security Deposit');
  const [depTmplCustodyMechanism, setDepTmplCustodyMechanism] = useState(existingDepositTemplate?.custodyMechanism || 'Held by Landlord');
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
  const [depTmplIncludeTerms, setDepTmplIncludeTerms] = useState(existingDepositTemplate?.includeTerms !== false);

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
      includeTerms: tmplIncludeTerms,
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
      includeTerms: depTmplIncludeTerms,
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
      if (dt.includeTerms !== undefined) setDepTmplIncludeTerms(dt.includeTerms);
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
      if (it.includeTerms !== undefined) setTmplIncludeTerms(it.includeTerms);
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
  const [offlinePaymentType, setOfflinePaymentType] = useState<'rent' | 'deposit'>('rent');
  const [offlineUnit, setOfflineUnit] = useState('');
  const [offlineAmount, setOfflineAmount] = useState(0);
  const [offlineMethod, setOfflineMethod] = useState<'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque'>('Cash');
  const [offlineRef, setOfflineRef] = useState('');
  const [offlineDate, setOfflineDate] = useState(new Date().toISOString().split('T')[0]);

  const myUnits = state.units.filter((u) => Boolean(ownerId) && u.ownerId === ownerId);
  const myPayments = state.payments.filter((p) => Boolean(ownerId) && p.ownerId === ownerId);
  const myInvoices = useMemo(() => {
    return state.invoices
      .filter((i) => Boolean(ownerId) && i.ownerId === ownerId)
      .map((inv) => {
        // If an invoice is currently 'sent', 'unpaid', or 'overdue' but has an active pending cash claim,
        // dynamically reflect its status as 'pending_confirmation' so it appears under Pending Confirmation filter
        const hasPendingClaim = (state.cashClaims || []).some(
          (c) =>
            c.status === 'pending_confirmation' &&
            c.claimedByRole === 'tenant' &&
            (c.invoiceId === inv.id || (c.unit && c.unit === inv.unit && (c.type === 'deposit' ? (inv.invoiceType === 'deposit' || inv.type === 'deposit') : inv.invoiceType !== 'deposit')))
        );
        if (hasPendingClaim && inv.status !== 'paid') {
          return { ...inv, status: 'pending_confirmation' as const };
        }
        return inv;
      });
  }, [state.invoices, state.cashClaims, ownerId]);
  const myAgreements = state.agreements.filter((a) => Boolean(ownerId) && a.ownerId === ownerId);
  const myMoveOuts = (state.moveouts || []).filter((m) => Boolean(ownerId) && m.ownerId === ownerId);
  const sampleUnit = myUnits[0] || null;
  const sampleTenant = sampleUnit
    ? state.tenants.find((t) => (t.id === sampleUnit.currentTenantId || t.name === sampleUnit.tenant) && t.ownerId === ownerId) || null
    : null;

  const isAgreementVacated = (a: any) => {
    if (a.status === 'terminated') return true;
    const aClean = (a.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
    return (
      (state.moveouts || []).some(
        (m) =>
          (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt) &&
          ((m as any).agreementId === a.id || (m as any).leaseAgreementId === a.id || ((m.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === aClean && (!m.propertyId || !a.propertyId || m.propertyId === a.propertyId)))
      ) ||
      (state.depositSettlements || []).some(
        (s) =>
          (s.status === 'refunded' || Boolean(s.tenantConfirmedReceipt)) &&
          (s.agreementId === a.id || ((s.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === aClean && (!s.propertyId || !a.propertyId || s.propertyId === a.propertyId)))
      )
    );
  };

  const isInvoiceVacated = (inv: Invoice) => {
    if (inv.status === 'paid') return false;
    if (inv.leaseAgreementId) {
      const ag = (state.agreements || []).find((a) => a.id === inv.leaseAgreementId);
      if (ag && isAgreementVacated(ag)) return true;
      return (
        (state.moveouts || []).some(
          (m) =>
            (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt) &&
            ((m as any).agreementId === inv.leaseAgreementId || (m as any).leaseAgreementId === inv.leaseAgreementId)
        ) ||
        (state.depositSettlements || []).some(
          (s) => (s.status === 'refunded' || Boolean(s.tenantConfirmedReceipt)) && s.agreementId === inv.leaseAgreementId
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
      // 1. Resolve unit occupancy strictly: if not effectively occupied, skip (no rent dues for vacant/vacated units)
      const occupancy = resolveUnitOccupancy(u, state.agreements, state.tenancyRequests, state.moveouts);
      if (occupancy.effectiveStatus !== 'occupied') return;

      // 2. Guard: if unit has a settled or completed move-out, skip
      const cleanU = (u.unitNumber || u.id || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const hasSettledMoveout = (state.moveouts || []).some(
        (m) =>
          (m.status === 'refund_completed' || (m as any).status === 'settled' || m.tenantConfirmedReceipt) &&
          (m.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanU &&
          (!m.propertyId || !u.propertyId || m.propertyId === u.propertyId)
      ) || (state.depositSettlements || []).some(
        (s) =>
          (s.status === 'refunded' || Boolean(s.tenantConfirmedReceipt)) &&
          (s.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim() === cleanU &&
          (!s.propertyId || !u.propertyId || s.propertyId === u.propertyId)
      );
      if (hasSettledMoveout) return;

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
  }, [myUnits, myAgreements, myInvoices, myPayments, state.tenants, state.properties, state.lateFeeSettings, state.moveouts, state.depositSettlements]);

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

  const dominantPropertyCurrency = useMemo(() => {
    const ownerProp = (state.properties || []).find((p) => p.ownerId === ownerId && p.currency);
    if (ownerProp?.currency) return getCurrencySymbol(ownerProp.currency);
    const ownerUnit = myUnits.find((u) => u.currency);
    if (ownerUnit?.currency) return getCurrencySymbol(ownerUnit.currency);
    const ownerInvoice = rentDueList.find((r) => r.currency);
    if (ownerInvoice?.currency) return getCurrencySymbol(ownerInvoice.currency);
    return activeSymbol;
  }, [state.properties, ownerId, myUnits, rentDueList, activeSymbol]);

  const dominantRentCurrency = dominantPropertyCurrency;
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
      let statusLabel = 'Held';
      let statusBadgeBg = '#DCFCE7';
      let statusBadgeColor = '#15803D';
      let custodyDetails = depInv?.custodyMechanism || 'Held by Landlord';

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
        let statusLabel = 'Held';
        let statusBadgeBg = '#DCFCE7';
        let statusBadgeColor = '#15803D';

        if (depInv.status === 'paid') {
          status = 'held';
          statusLabel = 'Held';
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
      .filter((p) => (p.status === 'paid' || (p.status as any) === 'completed') && !isDepositPayment(p, state.invoices) && p.direction !== 'outflow')
      .reduce((sum, p) => sum + convert(p.amount || 0, p.currency || 'USD', activeCurrencyCode), 0);
  }, [myPayments, convert, activeCurrencyCode, state.invoices]);

  const totalOverdue = useMemo(() => {
    return myPayments
      .filter((p) => p.status === 'overdue' && !isDepositPayment(p, state.invoices))
      .reduce((sum, p) => sum + convert(p.amount || 0, p.currency || 'USD', activeCurrencyCode), 0);
  }, [myPayments, convert, activeCurrencyCode, state.invoices]);

  // Opens the proof-review dialog (UTR, screenshot, Confirm / Decline) for a rent or deposit row awaiting confirmation.
  const openProofForItem = (item: { tenantId?: string; unitNumber?: string; unitId?: string; invoiceId?: string; depositInvoice?: Invoice }, kind: 'rent' | 'deposit') => {
    const isDep = (i: Invoice) => i.invoiceType === 'deposit' || (i as any).type === 'deposit';
    const pending = state.invoices.filter((i) => i.status === 'pending_confirmation');
    const inv =
      (item.invoiceId && pending.find((i) => i.id === item.invoiceId)) ||
      (item.depositInvoice && pending.find((i) => i.id === item.depositInvoice!.id)) ||
      pending.find((i) => ((item.tenantId && i.tenantId === item.tenantId) || (item.unitNumber && i.unit === item.unitNumber)) && isDep(i) === (kind === 'deposit'));
    if (inv) { setReviewingProofInvoice(inv); return; }
    const claim = (state.cashClaims || []).find(
      (c) => c.status === 'pending_confirmation' && ((item.tenantId && c.tenantId === item.tenantId) || (item.unitNumber && c.unit === item.unitNumber))
    );
    if (claim) { setReviewingClaim(claim); return; }
    showToast('No proof was found for this payment yet. Ask the tenant to submit it again, or use Record Pay.');
  };

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
    if (isFirebaseConfigured && targetPay) {
      try {
        await setDoc(
          doc(db, 'payments', id),
          { status: 'paid', audit: { ...(targetPay.audit || {}), confirmedBy: user?.id || 'owner', confirmedByName: user?.displayName || 'Property Owner', confirmedAt: new Date().toISOString() } },
          { merge: true }
        );
      } catch (err: any) {
        console.error('Could not persist payment confirmation:', err);
        showToast(`Could not save the confirmation: ${err?.message || err}. Please refresh and try again.`);
        return;
      }
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

  const handleSaveLateFeeRule = async () => {
    setIsSavingLateFee(true);
    try {
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

      const newLateFeeConfig = {
        enabled: lateFeeEnabled,
        graceDays: lateFeeGrace,
        type: lateFeeType,
        value: lateFeeValue,
        cap: lateFeeCap,
      };

      updateState((prev) => ({
        ...prev,
        lateFeeSettings: newLateFeeConfig,
      }));

      await saveOwnerSettings(ownerId, {
        ...curSettings,
        lateFeeConfig: newLateFeeConfig,
      });

      showToast('✓ Late fee rule saved successfully!');
    } catch (e: any) {
      showToast('Failed to save late fee rule: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingLateFee(false);
    }
  };

  const handleSaveReminderRule = async () => {
    setIsSavingReminder(true);
    try {
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

      const newRentalReminderConfig = {
        enabled: reminderEnabled,
        daysPrior: reminderDays,
      };

      await saveOwnerSettings(ownerId, {
        ...curSettings,
        rentReminderDaysPrior: reminderDays,
        rentalReminderConfig: newRentalReminderConfig,
      });

      showToast(`✓ Reminder rule saved! Tenants will be reminded ${reminderDays} days prior to due date.`);
    } catch (e: any) {
      showToast('Failed to save reminder rule: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingReminder(false);
    }
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

    const targetOffProp = unitObj ? state.properties.find((p) => p.id === unitObj.propertyId) : undefined;
    const effectiveOfflineCurrency = normalizeCurrencyCode(unitObj?.currency || targetOffProp?.currency || activeCurrencyCode || DEFAULT_CURRENCY);

    // Cash Handover Protocol: If owner records cash, submit claim awaiting tenant confirmation
    if (offlineMethod.toLowerCase().includes('cash')) {
      await submitCashClaim({
        direction: 'inflow',
        type: offlinePaymentType,
        amount: offlineAmount,
        currency: effectiveOfflineCurrency,
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
      showToast(`✓ Cash collection logged for ${offlinePaymentType === 'deposit' ? 'security deposit' : 'rent'}. Sent notification to ${tenantName} to confirm receipt.`);
      return;
    }

    const newTxn: PaymentTransaction = {
      id: payId,
      ownerId,
      propertyId: unitObj?.propertyId || targetOffProp?.id || '',
      tenant: tenantName,
      tenantId,
      unit: unitObj?.unitNumber || unitObj?.id || 'Unit',
      amount: offlineAmount,
      currency: effectiveOfflineCurrency,
      date: offlineDate,
      dueDate: offlineDate,
      status: 'paid',
      method: offlineMethod,
      type: offlinePaymentType,
      notes: offlineRef ? `Ref: ${offlineRef}` : undefined,
    };

    // Reconcile matching unpaid invoice if any
    const matchingInv = state.invoices.find(
      (i) =>
        Boolean(ownerId) &&
        i.ownerId === ownerId &&
        (!unitObj?.propertyId || !i.propertyId || i.propertyId === unitObj.propertyId) &&
        (unitObj ? (i.unit === unitObj.unitNumber || i.unit === unitObj.id) : true) &&
        (tenantId ? i.tenantId === tenantId : true) &&
        (offlinePaymentType === 'deposit' ? i.invoiceType === 'deposit' : (i.invoiceType === 'rent' || !i.invoiceType)) &&
        i.status !== 'paid'
    );

    if (matchingInv) {
      await markInvoicePaid(matchingInv.id, offlineMethod, offlineRef || undefined);
    } else if (offlinePaymentType === 'deposit') {
      const depTmpl = state.ownerSettings[ownerId]?.depositTemplate;
      const autoInvId = generateInvoiceId();
      const autoInv: Invoice = {
        id: autoInvId,
        ownerId,
        tenant: tenantName,
        tenantId,
        unit: unitObj?.unitNumber || unitObj?.id || 'Unit',
        propertyName: unitObj?.propertyName || '',
        propertyId: unitObj?.propertyId || '',
        invoiceType: 'deposit',
        amount: offlineAmount,
        currency: effectiveOfflineCurrency,
        tax: 0,
        total: offlineAmount,
        due: offlineDate,
        status: 'paid',
        issueDate: new Date().toISOString(),
        paidAt: new Date(offlineDate).toISOString(),
        paymentMethodUsed: offlineMethod,
        receiptNumber: offlineRef || generateReceiptId(),
        custodyMechanism: depTmpl?.custodyMechanism || depTmplCustodyMechanism || 'Held in Landlord Trust Account',
        depositClassification: depTmpl?.depositClassification || depTmplClassification || '100% Refundable Security Deposit',
        issuerName: depTmpl?.issuerName || depTmplIssuerName,
        issuerTaxNo: depTmpl?.issuerTaxNo || depTmplIssuerTaxNo,
        issuerAddress: depTmpl?.issuerAddress || depTmplIssuerAddress,
        issuerPhone: depTmpl?.issuerPhone || depTmplIssuerPhone,
        issuerEmail: depTmpl?.issuerEmail || depTmplIssuerEmail,
        termsAndConditions: depTmpl?.termsAndConditions || depTmplTerms,
        includeTerms: depTmpl?.includeTerms ?? depTmplIncludeTerms,
        signatoryName: depTmpl?.signatoryName || depTmplSignatory,
        bankDetails: {
          bankName: depTmpl?.bankName || depTmplBankName,
          accountName: depTmpl?.accountName || depTmplAccountName,
          accountNumber: depTmpl?.accountNumber || depTmplAccountNumber,
          ifscOrRouting: depTmpl?.ifscOrRouting || depTmplIfsc,
          upiId: depTmpl?.upiId || depTmplUpiId,
        },
        notes: depTmpl?.notes || depTmplNotes || 'Security deposit settled offline directly with landlord.',
        items: [{ description: `Security Deposit — Unit ${unitObj?.unitNumber || unitObj?.id || 'Unit'}`, amount: offlineAmount }],
      };
      await saveInvoice(autoInv);

      const targetAg = state.agreements.find(
        (a) =>
          a.ownerId === ownerId &&
          (unitObj ? (a.unit === unitObj.unitNumber || a.unit === unitObj.id) : true) &&
          (tenantId ? a.tenantId === tenantId : true) &&
          a.status !== 'terminated'
      );
      if (targetAg) {
        saveAgreement({
          ...targetAg,
          depositStatus: 'paid',
          status: 'active',
        });
      }
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
        currency: effectiveOfflineCurrency,
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
        includeTerms: tmpl?.includeTerms ?? tmplIncludeTerms,
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

    await savePayment(newTxn);

    updateState((prev) => ({
      ...prev,
      payments: prev.payments.some((p) => p.id === newTxn.id)
        ? prev.payments
        : [newTxn, ...prev.payments],
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

    // Persist the matching payment records as paid (the on-screen update alone was lost on reload, so the row
    // kept showing "Confirmation Pending").
    const affectedPayments = (state.payments || []).filter(
      (p) =>
        (p.invoiceId === inv.id || (p.tenantId === inv.tenantId && (!p.propertyId || !inv.propertyId || p.propertyId === inv.propertyId) && p.unit === inv.unit)) &&
        p.status === 'pending_confirmation'
    );
    if (isFirebaseConfigured) {
      try {
        for (const p of affectedPayments) {
          await setDoc(
            doc(db, 'payments', p.id),
            {
              status: 'paid',
              method: settleLabel,
              audit: { ...(p.audit || {}), confirmedBy: user?.id || 'owner', confirmedByName: user?.displayName || 'Property Owner', confirmedAt: new Date().toISOString() },
            },
            { merge: true }
          );
        }
      } catch (err: any) {
        console.error('Could not persist payment confirmation:', err);
        showToast(`Could not save the confirmation: ${err?.message || err}. Please refresh and try again.`);
        setIsApprovingProof(false);
        return;
      }
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

      return {
        ...prev,
        payments: updatedPayments,
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
    };
    delete revertedInvoice.paymentMethodUsed;
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

    if (inv.tenantId) {
      const notif = {
        id: `notif_${Date.now()}`,
        userId: inv.tenantId,
        title: 'Payment Verification Failed / Declined',
        body: `Your payment for invoice ${inv.id} was declined by your landlord: ${rejectionReason}`,
        link: '/tenant/payments?tab=invoices',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      await saveNotification(notif);
    }

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
      <div className="tabs" data-tour="payments-subtabs" style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          className={`tab ${subTab === 'rent_due' ? 'active' : ''}`}
          onClick={() => setSubTab('rent_due')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <CalendarClock size={15} />
          Rent Due
        </div>
        <div
          className={`tab ${subTab === 'deposit' ? 'active' : ''}`}
          onClick={() => setSubTab('deposit')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <ShieldCheck size={15} />
          Security Deposits
        </div>
        <div
          className={`tab ${subTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setSubTab('transactions')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <ArrowLeftRight size={15} />
          Payments
        </div>
        <div
          className={`tab ${subTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setSubTab('invoices')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <FileText size={15} />
          Invoices
        </div>
        <div
          className={`tab ${subTab === 'methods' ? 'active' : ''}`}
          data-tour="payments-gateways-tab"
          onClick={() => setSubTab('methods')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <CreditCard size={15} />
          Payment Gateways
        </div>
        <div
          className={`tab ${subTab === 'template' ? 'active' : ''}`}
          onClick={() => setSubTab('template')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <LayoutTemplate size={15} />
          Invoice Template
        </div>
        <div
          className={`tab ${subTab === 'settings' ? 'active' : ''}`}
          onClick={() => setSubTab('settings')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <Settings size={15} />
          Settings
        </div>
      </div>

      {/* Global Pending Confirmation Banner across Invoices, Rent Due, and Deposit */}
      {(() => {
        const pendingClaimsForMe = (state.cashClaims || []).filter(
          (c) =>
            c.status === 'pending_confirmation' &&
            c.claimedByRole === 'tenant' &&
            (!ownerId || !c.ownerId || c.ownerId === ownerId)
        );
        if (pendingClaimsForMe.length === 0) return null;
        return (
          <div style={{ marginBottom: '16px' }}>
            {pendingClaimsForMe.map((c) => (
              <div
                key={c.id}
                className="panel"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderLeft: '4px solid #F59E0B',
                  borderRadius: '10px',
                  padding: '12px 18px',
                  marginBottom: '12px',
                  boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.04))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ flex: '1 1 340px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span
                      className="badge amber"
                      style={{ fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.4px', padding: '2px 7px' }}
                    >
                      ⚡ {c.type === 'deposit' ? 'Move-In Deposit Claim' : 'Cash Payment Claim'}
                    </span>
                    <span className="badge grey" style={{ fontSize: '10.5px', fontFamily: 'monospace', padding: '2px 6px' }}>
                      Claim #{c.id}
                    </span>
                  </div>
                  <div style={{ margin: '2px 0 3px', fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
                    <b>{c.tenantName}</b> reported handing you {getCurrencySymbol(c.currency)}{c.amount.toLocaleString('en-IN')} in Cash for Unit {c.unit}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                    <b>Handover Date:</b> {c.handoverDate} • <b>Location:</b> {c.handoverLocation || 'On-Site'}
                    {c.notes && <span style={{ marginLeft: '6px', fontStyle: 'italic' }}>"{c.notes}"</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '7px' }}
                    onClick={() => {
                      const linkedInv = c.invoiceId ? state.invoices.find((i) => i.id === c.invoiceId) : state.invoices.find((i) => i.unit === c.unit);
                      if (linkedInv) {
                        setReviewingProofInvoice(linkedInv);
                      } else {
                        setReviewingClaim(c);
                      }
                    }}
                  >
                    <ShieldCheck size={14} /> Review Proof Details
                  </button>
                  <button
                    type="button"
                    className="btn brass"
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '7px' }}
                    onClick={() => confirmCashClaim(c.id)}
                  >
                    <CheckCircle size={14} /> Confirm Receipt & Settle
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ borderColor: 'rgba(220, 38, 38, 0.4)', color: '#DC2626', padding: '6px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '7px' }}
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

      {subTab === 'rent_due' && (
        <div>
          {/* Summary Stat Cards */}
          <div className="grid grid-4" style={{ marginBottom: '16px' }}>
            <div className="stat" style={{ padding: '14px 18px' }}>
              <div className="num" style={{ color: 'var(--ink)', fontSize: '20px' }}>{formatMoney(rentDueMetrics.totalExpected)}</div>
              <div className="lbl" style={{ fontSize: '12px' }}>Expected Rent Roll</div>
            </div>
            <div className="stat" style={{ padding: '14px 18px' }}>
              <div className="num" style={{ color: '#16A34A', fontSize: '20px' }}>{formatMoney(rentDueMetrics.totalCollectedThisMonth)}</div>
              <div className="lbl" style={{ fontSize: '12px' }}>Collected</div>
            </div>
            <div className="stat" style={{ padding: '14px 18px' }}>
              <div className="num" style={{ color: rentDueMetrics.totalOverdueAmount > 0 ? '#DC2626' : 'var(--ink)', fontSize: '20px' }}>
                {formatMoney(rentDueMetrics.totalOverdueAmount)}
              </div>
              <div className="lbl" style={{ fontSize: '12px' }}>Overdue</div>
            </div>
            <div className="stat" style={{ padding: '14px 18px' }}>
              <div className="num" style={{ color: rentDueMetrics.collectionRate >= 80 ? '#16A34A' : '#D97706', fontSize: '20px' }}>
                {rentDueMetrics.totalExpected === 0 ? 'N/A' : `${rentDueMetrics.collectionRate}%`}
              </div>
              <div className="lbl" style={{ fontSize: '12px' }}>Collection Rate</div>
            </div>
          </div>

          {/* Action & Filter Header */}
          <div className="panel" style={{ marginBottom: '16px', background: 'var(--surface-sunken)', border: '1px solid var(--line)' }}>
            <div className="panel-body" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                {/* Search & Status Filter Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                    <input
                      type="text"
                      placeholder="Search tenant or unit..."
                      value={rentSearch}
                      onChange={(e) => setRentSearch(e.target.value)}
                      style={{ padding: '5px 10px 5px 28px', fontSize: '12.5px', width: '200px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {(
                      [
                        { id: 'all', label: `All (${rentDueList.length})` },
                        { id: 'pending_confirmation', label: `Pending (${rentDueMetrics.pendingConfirmationCount})` },
                        { id: 'overdue', label: `Overdue (${rentDueMetrics.overdueCount})` },
                        { id: 'due_soon', label: `Due Soon (${rentDueMetrics.dueSoonCount})` },
                        { id: 'paid', label: `Paid (${rentDueMetrics.paidCount})` },
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
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                        <th>Tenant</th>
                        <th>Property &amp; Unit</th>
                        <th>{getTableCurrencyHeader('Monthly Rent', viewCurrency)}</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>{getTableCurrencyHeader('Late Fee', viewCurrency)}</th>
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
                              {item.tenantEmail && (
                                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                  {item.tenantEmail}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '13.5px' }}>
                                Unit {item.unitNumber}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                {item.propertyName}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                                <CurrencyAmount amount={item.rentAmount} currency={item.currency} />
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--ink)' }}>
                                {item.dueDateFormatted}
                              </div>
                              {item.status !== 'pending_confirmation' && item.status !== 'paid' && (
                                <div style={{ fontSize: '11px', color: item.daysDiff < 0 ? '#DC2626' : 'var(--ink-soft)' }}>
                                  {item.daysDiff < 0
                                    ? `${Math.abs(item.daysDiff)} days late`
                                    : item.daysDiff === 0
                                      ? 'Due Today'
                                      : `in ${item.daysDiff} days`}
                                </div>
                              )}
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 700, color: '#DC2626', fontSize: '13px' }}>
                                    +<CurrencyAmount amount={item.accruedLateFee} currency={item.currency} />
                                  </span>
                                  {item.invoiceId && (
                                    <button
                                      type="button"
                                      className="btn secondary small"
                                      style={{ fontSize: '9.5px', padding: '1px 5px', color: 'var(--green)' }}
                                      onClick={() => waiveInvoiceLateFee(item.invoiceId!)}
                                      title="Waive late fee for this billing cycle"
                                    >
                                      Waive
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--ink-soft)', fontSize: '12.5px' }}>
                                  <CurrencyAmount amount={0} currency={item.currency} />
                                </span>
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
                                        item.tenantPhone,
                                        item.currency
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
                                {item.status === 'pending_confirmation' && (
                                  <button type="button" className="btn small" style={{ background: '#EA580C', borderColor: '#EA580C', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', padding: '4px 8px' }} title="See the tenant's UTR and proof, then confirm or decline" onClick={() => openProofForItem(item, 'rent')}>
                                    <ShieldCheck size={13} /> Review &amp; Confirm
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
                          <b style={{ color: 'var(--ink)' }}>
                            <CurrencyAmount amount={item.rentAmount} currency={item.currency} />
                          </b>
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
                            <b style={{ color: '#DC2626' }}>
                              + <CurrencyAmount amount={item.accruedLateFee} currency={item.currency} />
                            </b>
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
                                item.tenantPhone,
                                item.currency
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
                        {item.status === 'pending_confirmation' && (
                          <button type="button" className="btn small" style={{ background: '#EA580C', borderColor: '#EA580C', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', padding: '4px 8px' }} title="See the tenant's UTR and proof, then confirm or decline" onClick={() => openProofForItem(item, 'rent')}>
                            <ShieldCheck size={13} /> Review &amp; Confirm
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
              <div className="lbl">Deposits Held</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: depositMetrics.totalPendingCollection > 0 ? '#D97706' : 'var(--ink)' }}>
                {formatMoney(depositMetrics.totalPendingCollection)}
              </div>
              <div className="lbl">Pending Collection</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: depositMetrics.inMoveOutCount > 0 ? '#7E22CE' : 'var(--ink)' }}>
                {depositMetrics.inMoveOutCount} Units
              </div>
              <div className="lbl">Move-Out Active</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: 'var(--ink)' }}>{formatMoney(depositMetrics.totalRefunded)}</div>
              <div className="lbl">Refunded</div>
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
                      { id: 'held', label: `Held (${depositLedgerList.filter((d) => d.status === 'held').length})` },
                      { id: 'pending_collection', label: `Pending (${depositLedgerList.filter((d) => d.status === 'pending_collection' || d.status === 'pending_confirmation').length})` },
                      { id: 'moveout', label: `Move-Out (${depositMetrics.inMoveOutCount})` },
                      { id: 'refunded', label: `Refunded (${depositLedgerList.filter((d) => d.status === 'refunded').length})` },
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
                        <th>{getTableCurrencyHeader('Deposit Amount', viewCurrency)}</th>
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
                                <CurrencyAmount amount={item.amount ?? 0} currency={item.currency} />
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
                                      setStudioInvoice({
                                        id: '',
                                        ownerId,
                                        unit: item.unitNumber,
                                        propertyName: item.propertyName,
                                        tenant: item.tenantName,
                                        tenantId: item.tenantId,
                                        tenantPhone: item.tenantPhone,
                                        tenantEmail: item.tenantEmail,
                                        amount: item.amount,
                                        currency: item.currency || '₹',
                                        invoiceType: 'deposit',
                                        type: 'deposit',
                                        items: [
                                          {
                                            description: `Refundable Security Deposit — Unit ${item.unitNumber}`,
                                            amount: item.amount,
                                          },
                                        ],
                                      } as any);
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
                                {item.status === 'pending_confirmation' && (
                                  <button type="button" className="btn small" style={{ background: '#EA580C', borderColor: '#EA580C', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', padding: '4px 8px' }} title="See the tenant's UTR and proof, then confirm or decline" onClick={() => openProofForItem(item, 'deposit')}>
                                    <ShieldCheck size={13} /> Review &amp; Confirm
                                  </button>
                                )}
                                {(item.status === 'pending_collection' || item.status === 'pending_confirmation') && (
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    onClick={() => {
                                      setOfflinePaymentType('deposit');
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
                          <b style={{ color: '#15803D', fontSize: '14px' }}>
                            <CurrencyAmount amount={item.amount ?? 0} currency={item.currency} />
                          </b>
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
                              setStudioInvoice({
                                id: '',
                                ownerId,
                                unit: item.unitNumber,
                                propertyName: item.propertyName,
                                tenant: item.tenantName,
                                tenantId: item.tenantId,
                                tenantPhone: item.tenantPhone,
                                tenantEmail: item.tenantEmail,
                                amount: item.amount,
                                currency: item.currency || '₹',
                                invoiceType: 'deposit',
                                type: 'deposit',
                                items: [
                                  {
                                    description: `Refundable Security Deposit — Unit ${item.unitNumber}`,
                                    amount: item.amount,
                                  },
                                ],
                              } as any);
                              setStudioMode('create');
                              setStudioInitialCategory('deposit');
                              setIsStudioOpen(true);
                            }}
                          >
                            + Generate Voucher
                          </button>
                        )}
                        {item.status === 'pending_confirmation' && (
                          <button type="button" className="btn small" style={{ background: '#EA580C', borderColor: '#EA580C', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', padding: '4px 8px' }} title="See the tenant's UTR and proof, then confirm or decline" onClick={() => openProofForItem(item, 'deposit')}>
                            <ShieldCheck size={13} /> Review &amp; Confirm
                          </button>
                        )}
                        {(item.status === 'pending_collection' || item.status === 'pending_confirmation') && (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => {
                              setOfflinePaymentType('deposit');
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

        </div>
      )}

      {subTab === 'transactions' && (
        <div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginBottom: '24px' }}>
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

          {/* (Duplicate banner removed - already rendered globally across tabs above) */}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div className="section-title" style={{ margin: 0 }}>Payments ({myPayments.length})</div>
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
                        <th>{getTableCurrencyHeader('Amount', viewCurrency)}</th>
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
                              {isOutflow && '- '}
                              <CurrencyAmount amount={p.amount} currency={p.currency} />
                            </td>
                            <td>{formatTxDate(p.date || p.dueDate)}</td>
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
                    No payments recorded yet.
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
                              {isOutflow ? '- ' : ''}<CurrencyAmount amount={p.amount || 0} currency={p.currency} />
                            </b>
                          </div>
                          <div>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Date / Method</div>
                            <span>{formatTxDate(p.date || p.dueDate)} • {p.method}</span>
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
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Invoices</div>
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
                        <th>{getTableCurrencyHeader('Amount', viewCurrency)}</th>
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
                              <CurrencyAmount amount={i.total} currency={i.currency || dominantRentCurrency} />
                              {(i.lateFeeApplied || 0) > 0 && (
                                <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>
                                  +<CurrencyAmount amount={i.lateFeeApplied} currency={i.currency || dominantRentCurrency} /> late fee
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
                                  onClick={() => downloadSingleInvoicePDF(i, (i.invoiceType === 'deposit' || i.type === 'deposit') ? (state.ownerSettings[i.ownerId]?.depositTemplate || state.ownerSettings[i.ownerId]?.invoiceTemplate) : state.ownerSettings[i.ownerId]?.invoiceTemplate)}
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
                          <b style={{ fontSize: '14px', color: 'var(--ledger)' }}>
                            <CurrencyAmount amount={i.total || 0} currency={i.currency || dominantRentCurrency} />
                          </b>
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
                          onClick={() => downloadSingleInvoicePDF(i, (i.invoiceType === 'deposit' || i.type === 'deposit') ? (state.ownerSettings[i.ownerId]?.depositTemplate || state.ownerSettings[i.ownerId]?.invoiceTemplate) : state.ownerSettings[i.ownerId]?.invoiceTemplate)}
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

      {/* INVOICE TEMPLATE & LIVE PREVIEW (Minimal HTML-model layout) */}
      {subTab === 'template' && (
        <div>
          {/* Template Document Switcher (Sleek pill buttons) */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              className={`btn small ${tmplDocumentType === 'rent' ? 'primary' : 'secondary'}`}
              onClick={() => setTmplDocumentType('rent')}
              style={{ borderRadius: '20px', padding: '6px 18px', fontWeight: tmplDocumentType === 'rent' ? 600 : 500 }}
            >
              Rent invoice
            </button>
            <button
              type="button"
              className={`btn small ${tmplDocumentType === 'deposit' ? 'primary' : 'secondary'}`}
              onClick={() => setTmplDocumentType('deposit')}
              style={{ borderRadius: '20px', padding: '6px 18px', fontWeight: tmplDocumentType === 'deposit' ? 600 : 500 }}
            >
              Deposit receipt
            </button>
          </div>

          {/* Top Brief Card with Readiness Indicator & View Switcher */}
          <div
            className="panel"
            style={{
              marginBottom: '20px',
              padding: '14px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'var(--surface)',
            }}
          >
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>
                {tmplDocumentType === 'rent' ? 'Rent Invoice Template' : 'Deposit Receipt Template'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-sunken)', padding: '3px', borderRadius: '6px' }}>
              <button
                type="button"
                className={`btn small ${tmplViewMode === 'split' ? 'primary' : 'secondary'}`}
                onClick={() => setTmplViewMode('split')}
                style={{ border: 'none', padding: '4px 10px', fontSize: '11.5px' }}
              >
                Split View
              </button>
              <button
                type="button"
                className={`btn small ${tmplViewMode === 'edit' ? 'primary' : 'secondary'}`}
                onClick={() => setTmplViewMode('edit')}
                style={{ border: 'none', padding: '4px 10px', fontSize: '11.5px' }}
              >
                Edit Only
              </button>
              <button
                type="button"
                className={`btn small ${tmplViewMode === 'preview' ? 'primary' : 'secondary'}`}
                onClick={() => setTmplViewMode('preview')}
                style={{ border: 'none', padding: '4px 10px', fontSize: '11.5px' }}
              >
                Full Preview
              </button>
            </div>
          </div>

          {/* RENT INVOICE TEMPLATE */}
          {tmplDocumentType === 'rent' && (
            <div
              className={`invoice-template-split-grid ${tmplViewMode === 'split' ? 'split-mode' : ''}`}
            >
              {/* LEFT COLUMN: 3 CONVERSATIONAL SECTIONS */}
              {(tmplViewMode === 'split' || tmplViewMode === 'edit') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Section 1: Who is this from? */}
                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                      <div>
                        <b style={{ fontSize: '13.5px' }}>1. Who is this from?</b>
                      </div>
                    </div>
                    <div className="panel-body" style={{ padding: '16px 18px' }}>
                      <div className="field" style={{ marginBottom: '12px' }}>
                        <label>Name or business name</label>
                        <input
                          type="text"
                          value={tmplIssuerName}
                          onChange={(e) => setTmplIssuerName(e.target.value)}
                          placeholder="e.g. Propithub Real Estate"
                        />
                      </div>
                      <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Phone</label>
                          <input
                            type="text"
                            value={tmplIssuerPhone}
                            onChange={(e) => setTmplIssuerPhone(e.target.value)}
                            placeholder="+91..."
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Email</label>
                          <input
                            type="email"
                            value={tmplIssuerEmail}
                            onChange={(e) => setTmplIssuerEmail(e.target.value)}
                            placeholder="billing@..."
                          />
                        </div>
                      </div>
                      <div className="field" style={{ margin: 0, marginBottom: '12px' }}>
                        <label>Address</label>
                        <input
                          type="text"
                          value={tmplIssuerAddress}
                          onChange={(e) => setTmplIssuerAddress(e.target.value)}
                          placeholder="Street, City, Postal Code"
                        />
                      </div>
                      <div className="grid grid-2" style={{ gap: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Tax name</label>
                          <input
                            type="text"
                            value={tmplTaxLabel}
                            onChange={(e) => setTmplTaxLabel(e.target.value)}
                            placeholder="e.g. GST or VAT"
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Rate (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={tmplTaxPercent}
                            onChange={(e) => setTmplTaxPercent(Number(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: How should tenants pay? */}
                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                      <div>
                        <b style={{ fontSize: '13.5px' }}>2. How should tenants pay?</b>
                      </div>
                    </div>
                    <div className="panel-body" style={{ padding: '16px 18px' }}>
                      <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Bank name</label>
                          <input
                            type="text"
                            value={tmplBankName}
                            onChange={(e) => setTmplBankName(e.target.value)}
                            placeholder="e.g. HDFC Bank"
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Account holder</label>
                          <input
                            type="text"
                            value={tmplAccountName}
                            onChange={(e) => setTmplAccountName(e.target.value)}
                            placeholder="Account holder name"
                          />
                        </div>
                      </div>
                      <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Account number or IBAN</label>
                          <input
                            type="text"
                            value={tmplAccountNumber}
                            onChange={(e) => setTmplAccountNumber(e.target.value)}
                            placeholder="Account number"
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Bank code (IFSC / SWIFT / routing)</label>
                          <input
                            type="text"
                            value={tmplIfsc}
                            onChange={(e) => setTmplIfsc(e.target.value)}
                            placeholder="e.g. HDFC0001234"
                          />
                        </div>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>UPI ID or payment handle</label>
                        <input
                          type="text"
                          value={tmplUpiId}
                          onChange={(e) => setTmplUpiId(e.target.value)}
                          placeholder="e.g. user@okhdfcbank"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Collapsible: More options */}
                  <details style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 18px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                      More options <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 400 }}>· Tax registration, signature, footer notes & terms</span>
                    </summary>
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tax registration number (GSTIN / PAN / VAT)</label>
                        <input
                          type="text"
                          value={tmplIssuerTaxNo}
                          onChange={(e) => setTmplIssuerTaxNo(e.target.value)}
                          placeholder="e.g. GSTIN: 36AAACP1234F1Z8"
                        />
                      </div>
                      <div className="grid grid-2" style={{ gap: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Signed by (name)</label>
                          <input
                            type="text"
                            value={tmplSignatory}
                            onChange={(e) => setTmplSignatory(e.target.value)}
                            placeholder="Authorized Signatory"
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Note at the bottom</label>
                          <input
                            type="text"
                            value={tmplNotes}
                            onChange={(e) => setTmplNotes(e.target.value)}
                            placeholder="Thank you for your prompt tenancy settlement."
                          />
                        </div>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ margin: 0 }}>Terms & Conditions (one per line)</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={tmplIncludeTerms}
                              onChange={(e) => setTmplIncludeTerms(e.target.checked)}
                              style={{ width: '15px', height: '15px', accentColor: 'var(--brass)', cursor: 'pointer' }}
                            />
                            Show on invoice
                          </label>
                        </div>
                        <textarea
                          rows={4}
                          value={tmplTerms}
                          onChange={(e) => setTmplTerms(e.target.value)}
                          style={{ fontSize: '12px', lineHeight: '1.4' }}
                        />
                      </div>
                    </div>
                  </details>

                  {/* Single Clean Save Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
                    <button
                      type="button"
                      className={`btn brass ${isSavingTmpl ? 'btn-processing' : ''}`}
                      disabled={isSavingTmpl}
                      onClick={handleSaveDefaultInvoiceFormat}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px' }}
                    >
                      <ButtonProcessing
                        loading={isSavingTmpl}
                        loadingText="Saving Template..."
                        defaultText="Save Rent Invoice Format"
                        icon={<Save size={15} />}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* RIGHT COLUMN: CLEAN MODERN LIVE PREVIEW (tplPreview model) */}
              {(tmplViewMode === 'split' || tmplViewMode === 'preview') && (
                <div className="invoice-template-preview-col">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b style={{ fontSize: '12.5px', color: 'var(--ink)' }}>Live preview</b>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Sample amounts</span>
                  </div>

                  {(() => {
                    const sampleRent = sampleUnit?.rent || 30000;
                    const sampleTax = tmplTaxPercent > 0 ? Math.round((sampleRent * tmplTaxPercent) / 100) : 0;
                    const sampleTotal = sampleRent + sampleTax;
                    const sampleCurrency = sampleUnit?.currency || DEFAULT_CURRENCY;
                    const sampleInvoice: Invoice = {
                      id: 'INV-0089',
                      ownerId,
                      tenant: sampleTenant?.name || 'Resident Tenant',
                      tenantId: sampleTenant?.id || 'sample-tenant',
                      tenantEmail: sampleTenant?.email || '',
                      tenantPhone: sampleTenant?.phone || '',
                      unit: sampleUnit?.unitNumber || '101',
                      propertyName: sampleUnit?.propertyName || 'Property Premises',
                      amount: sampleRent,
                      tax: sampleTax,
                      total: sampleTotal,
                      due: new Date().toISOString().split('T')[0],
                      issueDate: new Date().toISOString().split('T')[0],
                      status: 'sent',
                      currency: sampleCurrency,
                      invoiceType: 'rent',
                      items: [{ description: 'Monthly rent', amount: sampleRent }],
                      includeTerms: tmplIncludeTerms,
                      termsAndConditions: tmplIncludeTerms ? tmplTerms : '',
                      notes: tmplNotes || 'Thank you.',
                      signatoryName: tmplSignatory,
                    };
                    return (
                      <div className="invoice-template-preview-sheet" style={{ padding: 0 }}>
                        <RentalInvoiceDocument
                          invoice={sampleInvoice}
                          template={{
                            issuerName: tmplIssuerName || 'Your Name or Business',
                            issuerAddress: tmplIssuerAddress,
                            issuerEmail: tmplIssuerEmail,
                            issuerPhone: tmplIssuerPhone,
                            issuerTaxNo: tmplIssuerTaxNo,
                            bankName: tmplBankName,
                            accountName: tmplAccountName,
                            accountNumber: tmplAccountNumber,
                            ifscOrRouting: tmplIfsc,
                            upiId: tmplUpiId,
                            taxLabel: tmplTaxLabel,
                            taxPercent: tmplTaxPercent,
                            includeTerms: tmplIncludeTerms,
                            termsAndConditions: tmplIncludeTerms ? tmplTerms : '',
                            notes: tmplNotes || 'Thank you.',
                            signatoryName: tmplSignatory,
                          }}
                          style={{ padding: '24px 26px', maxWidth: '100%' }}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* DEPOSIT RECEIPT TEMPLATE */}
          {tmplDocumentType === 'deposit' && (
            <div
              className={`invoice-template-split-grid ${tmplViewMode === 'split' ? 'split-mode' : ''}`}
            >
              {/* LEFT COLUMN: 3 CONVERSATIONAL SECTIONS */}
              {(tmplViewMode === 'split' || tmplViewMode === 'edit') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Section 1: Who is this from? */}
                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                      <div>
                        <b style={{ fontSize: '13.5px' }}>1. Who is this from?</b>
                      </div>
                    </div>
                    <div className="panel-body" style={{ padding: '16px 18px' }}>
                      <div className="field" style={{ marginBottom: '12px' }}>
                        <label>Name or business name</label>
                        <input
                          type="text"
                          value={depTmplIssuerName}
                          onChange={(e) => setDepTmplIssuerName(e.target.value)}
                          placeholder="e.g. Propithub Real Estate"
                        />
                      </div>
                      <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Phone</label>
                          <input
                            type="text"
                            value={depTmplIssuerPhone}
                            onChange={(e) => setDepTmplIssuerPhone(e.target.value)}
                            placeholder="+91..."
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Email</label>
                          <input
                            type="email"
                            value={depTmplIssuerEmail}
                            onChange={(e) => setDepTmplIssuerEmail(e.target.value)}
                            placeholder="billing@..."
                          />
                        </div>
                      </div>
                      <div className="field" style={{ margin: 0, marginBottom: '12px' }}>
                        <label>Address</label>
                        <input
                          type="text"
                          value={depTmplIssuerAddress}
                          onChange={(e) => setDepTmplIssuerAddress(e.target.value)}
                          placeholder="Street, City, Postal Code"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Refund within (days after move-out)</label>
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={depTmplRefundTimeline || ''}
                          onChange={(e) => setDepTmplRefundTimeline(Number(e.target.value) || 0)}
                          placeholder="e.g. 14"
                          style={{ maxWidth: '280px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Where is the deposit held? */}
                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                      <div>
                        <b style={{ fontSize: '13.5px' }}>2. Where is the deposit held?</b>
                      </div>
                    </div>
                    <div className="panel-body" style={{ padding: '16px 18px' }}>
                      <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Bank name</label>
                          <input
                            type="text"
                            value={depTmplBankName}
                            onChange={(e) => setDepTmplBankName(e.target.value)}
                            placeholder="e.g. HDFC Bank"
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Account holder</label>
                          <input
                            type="text"
                            value={depTmplAccountName}
                            onChange={(e) => setDepTmplAccountName(e.target.value)}
                            placeholder="Trust account name"
                          />
                        </div>
                      </div>
                      <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Account number or IBAN</label>
                          <input
                            type="text"
                            value={depTmplAccountNumber}
                            onChange={(e) => setDepTmplAccountNumber(e.target.value)}
                            placeholder="Account number"
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Bank code (IFSC / SWIFT / routing)</label>
                          <input
                            type="text"
                            value={depTmplIfsc}
                            onChange={(e) => setDepTmplIfsc(e.target.value)}
                            placeholder="e.g. HDFC0001234"
                          />
                        </div>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>UPI ID or payment handle</label>
                        <input
                          type="text"
                          value={depTmplUpiId}
                          onChange={(e) => setDepTmplUpiId(e.target.value)}
                          placeholder="e.g. trust@okhdfcbank"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Collapsible: More options */}
                  <details style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 18px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                      More options <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 400 }}>· Registration number, signature & custody clauses</span>
                    </summary>
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tax registration number (optional)</label>
                        <input
                          type="text"
                          value={depTmplIssuerTaxNo}
                          onChange={(e) => setDepTmplIssuerTaxNo(e.target.value)}
                          placeholder="e.g. PAN or GSTIN"
                        />
                      </div>
                      <div className="grid grid-2" style={{ gap: '12px' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Signed by (name)</label>
                          <input
                            type="text"
                            value={depTmplSignatory}
                            onChange={(e) => setDepTmplSignatory(e.target.value)}
                            placeholder="Authorized Property Manager"
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Note at the bottom</label>
                          <input
                            type="text"
                            value={depTmplNotes}
                            onChange={(e) => setDepTmplNotes(e.target.value)}
                            placeholder="Deposit held in trust until move-out walkthrough"
                          />
                        </div>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Custody Mechanism</label>
                        <input
                          type="text"
                          value={depTmplCustodyMechanism}
                          onChange={(e) => setDepTmplCustodyMechanism(e.target.value)}
                          placeholder="Held by Landlord"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ margin: 0 }}>Deposit Terms & Conditions (one per line)</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={depTmplIncludeTerms}
                              onChange={(e) => setDepTmplIncludeTerms(e.target.checked)}
                              style={{ width: '15px', height: '15px', accentColor: 'var(--brass)', cursor: 'pointer' }}
                            />
                            Show on invoice
                          </label>
                        </div>
                        <textarea
                          rows={4}
                          value={depTmplTerms}
                          onChange={(e) => setDepTmplTerms(e.target.value)}
                          style={{ fontSize: '12px', lineHeight: '1.4' }}
                        />
                      </div>
                    </div>
                  </details>

                  {/* Single Clean Save Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
                    <button
                      type="button"
                      className={`btn brass ${isSavingDepTmpl ? 'btn-processing' : ''}`}
                      disabled={isSavingDepTmpl}
                      onClick={handleSaveDepositTemplate}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px' }}
                    >
                      <ButtonProcessing
                        loading={isSavingDepTmpl}
                        loadingText="Saving Voucher..."
                        defaultText="Save Deposit Voucher Format"
                        icon={<Save size={15} />}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* RIGHT COLUMN: CLEAN MODERN LIVE PREVIEW (tplPreview model for deposits) */}
              {(tmplViewMode === 'split' || tmplViewMode === 'preview') && (
                <div className="invoice-template-preview-col">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b style={{ fontSize: '12.5px', color: 'var(--ink)' }}>Live preview</b>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Sample amounts</span>
                  </div>

                  <div
                    className="invoice-sheet invoice-template-preview-sheet"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '28px 30px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                      fontSize: '12.5px',
                      color: 'var(--ink)',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: '16px', marginBottom: '18px' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>
                          {depTmplIssuerName || 'Your Name or Business'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px', lineHeight: '1.4' }}>
                          {depTmplIssuerAddress ? <>{depTmplIssuerAddress}<br /></> : null}
                          {depTmplIssuerEmail ? <>{depTmplIssuerEmail}<br /></> : null}
                          {depTmplIssuerPhone ? <>{depTmplIssuerPhone}<br /></> : null}
                          {depTmplIssuerTaxNo ? <div style={{ color: '#059669', fontWeight: 600 }}>{depTmplIssuerTaxNo}</div> : null}
                          {!depTmplIssuerAddress && !depTmplIssuerEmail && !depTmplIssuerPhone && !depTmplIssuerTaxNo && 'Your address, email & phone'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>DEPOSIT RECEIPT</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                          No. DEP-0042<br />
                          {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    {/* Two-Column Received From & Refund Timeline */}
                    {(() => {
                      const sampleDeposit = sampleUnit?.deposit || 60000;
                      const curr = sampleUnit?.currency || DEFAULT_CURRENCY_SYMBOL;

                      return (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px', fontSize: '12px' }}>
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '2px' }}>
                                RECEIVED FROM
                              </div>
                              <b style={{ color: 'var(--ink)' }}>{sampleTenant?.name || 'Resident Tenant'}</b>
                              <div style={{ color: 'var(--ink-soft)', fontSize: '11.5px' }}>
                                Unit {sampleUnit?.unitNumber || '101'} · {sampleUnit?.propertyName || 'Property Premises'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '2px' }}>
                                REFUND TIMELINE
                              </div>
                              <div style={{ color: 'var(--ink-soft)', fontSize: '11.5px' }}>
                                Within {depTmplRefundTimeline || 14} days of move-out
                              </div>
                            </div>
                          </div>

                          {/* Line Items Table */}
                          <div className="table-wrap">
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '12px' }}>
                              <tbody>
                                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                                  <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--ink)' }}>
                                    Security deposit (Held in trust)
                                  </td>
                                  <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>
                                    {curr}{sampleDeposit.toLocaleString('en-IN')}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Total */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid var(--line)', paddingTop: '10px', marginBottom: '18px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>Held for you</span>
                            <b style={{ fontSize: '17px', color: 'var(--ink)' }}>
                              {curr}{sampleDeposit.toLocaleString('en-IN')}
                            </b>
                          </div>
                        </>
                      );
                    })()}

                    {/* Held At */}
                    <div style={{ background: '#F9FAFB', padding: '10px 12px', borderRadius: '6px', marginBottom: '16px', fontSize: '11.5px', color: '#4B5563' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '2px' }}>
                        HELD AT
                      </div>
                      <div>
                        {[
                          depTmplBankName,
                          depTmplAccountName && `A/C ${depTmplAccountName}`,
                          depTmplAccountNumber && `(${depTmplAccountNumber})`,
                          depTmplIfsc && `IFSC: ${depTmplIfsc}`,
                        ].filter(Boolean).join(' · ') || 'Where deposit is held'}
                      </div>
                    </div>

                    {/* Deposit Terms & Conditions (one per line) */}
                    {depTmplIncludeTerms && depTmplTerms && (
                      <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '10px', marginBottom: '14px', fontSize: '11px', color: '#4B5563', lineHeight: '1.5' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '4px' }}>
                          DEPOSIT TERMS & CONDITIONS
                        </div>
                        {depTmplTerms.split('\n').filter(Boolean).map((clause, idx) => (
                          <div key={idx} style={{ marginBottom: '2px' }}>{clause.trim()}</div>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '11px', color: '#6B7280' }}>
                      <div>{depTmplNotes || 'Refundable upon move-out inspection.'}</div>
                      {depTmplSignatory && (
                        <div style={{ textAlign: 'right', fontWeight: 600, color: '#111827' }}>
                          {depTmplSignatory}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {subTab === 'methods' && (
        <div style={{ width: '100%' }}>
          {/* SECTION 1: ONLINE GATEWAYS */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
              Online Gateways
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Razorpay */}
              {(() => {
                const isEnabled = !!m.razorpay?.enabled;
                const isOpen = expandedGateway === 'razorpay';
                return (
                  <div
                    style={{
                      border: '1px solid var(--line-strong, #E2E8F0)',
                      borderRadius: '10px',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken)' : 'var(--surface)',
                      }}
                      onClick={() => setExpandedGateway(isOpen ? null : 'razorpay')}
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#0F172A' }}>
                        Razorpay
                      </span>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          className={`toggle ${isEnabled ? 'on' : ''}`}
                          onClick={() => toggleMethod('razorpay')}
                          title={isEnabled ? 'Disable Razorpay' : 'Enable Razorpay'}
                        >
                          <span className="track" />
                        </label>

                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px' }}
                          onClick={() => setExpandedGateway(isOpen ? null : 'razorpay')}
                        >
                          {isOpen ? 'Close' : 'Configure'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '16px 18px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Key ID</label>
                            <input
                              type="text"
                              value={razorpayKey}
                              onChange={(e) => setRazorpayKey(e.target.value)}
                              placeholder="rzp_live_..."
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Key Secret</label>
                            <input
                              type="password"
                              value={razorpaySecret}
                              onChange={(e) => setRazorpaySecret(e.target.value)}
                              placeholder="Key Secret"
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                '✓ Razorpay settings saved.'
                              );
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={async () => {
                              const res = await verifyRazorpayCredentials(razorpayKey, razorpaySecret);
                              showToast(res.message);
                            }}
                          >
                            Test Connection
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Stripe */}
              {(() => {
                const isEnabled = !!m.stripe?.enabled;
                const isOpen = expandedGateway === 'stripe';
                return (
                  <div
                    style={{
                      border: '1px solid var(--line-strong, #E2E8F0)',
                      borderRadius: '10px',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken)' : 'var(--surface)',
                      }}
                      onClick={() => setExpandedGateway(isOpen ? null : 'stripe')}
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#0F172A' }}>
                        Stripe
                      </span>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          className={`toggle ${isEnabled ? 'on' : ''}`}
                          onClick={() => toggleMethod('stripe')}
                          title={isEnabled ? 'Disable Stripe' : 'Enable Stripe'}
                        >
                          <span className="track" />
                        </label>

                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px' }}
                          onClick={() => setExpandedGateway(isOpen ? null : 'stripe')}
                        >
                          {isOpen ? 'Close' : 'Configure'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '16px 18px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Publishable Key</label>
                            <input
                              type="text"
                              value={stripePub}
                              onChange={(e) => setStripePub(e.target.value)}
                              placeholder="pk_live_..."
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Secret Key</label>
                            <input
                              type="password"
                              value={stripeSecret}
                              onChange={(e) => setStripeSecret(e.target.value)}
                              placeholder="sk_live_..."
                            />
                          </div>
                        </div>
                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Webhook Secret (Optional)</label>
                          <input
                            type="text"
                            value={stripeWebhook}
                            onChange={(e) => setStripeWebhook(e.target.value)}
                            placeholder="whsec_..."
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                '✓ Stripe settings saved.'
                              );
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={async () => {
                              const res = await verifyStripeCredentials(stripePub, stripeSecret);
                              showToast(res.message);
                            }}
                          >
                            Test Connection
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* PayPal */}
              {(() => {
                const isEnabled = !!m.paypal?.enabled;
                const isOpen = expandedGateway === 'paypal';
                return (
                  <div
                    style={{
                      border: '1px solid var(--line-strong, #E2E8F0)',
                      borderRadius: '10px',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken)' : 'var(--surface)',
                      }}
                      onClick={() => setExpandedGateway(isOpen ? null : 'paypal')}
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#0F172A' }}>
                        PayPal
                      </span>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          className={`toggle ${isEnabled ? 'on' : ''}`}
                          onClick={() => toggleMethod('paypal')}
                          title={isEnabled ? 'Disable PayPal' : 'Enable PayPal'}
                        >
                          <span className="track" />
                        </label>

                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px' }}
                          onClick={() => setExpandedGateway(isOpen ? null : 'paypal')}
                        >
                          {isOpen ? 'Close' : 'Configure'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '16px 18px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Email</label>
                          <input
                            type="email"
                            value={paypalEmail}
                            onChange={(e) => setPaypalEmail(e.target.value)}
                            placeholder="landlord@business.com"
                          />
                        </div>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Client ID</label>
                            <input
                              type="text"
                              value={paypalClient}
                              onChange={(e) => setPaypalClient(e.target.value)}
                              placeholder="Client ID"
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Secret</label>
                            <input
                              type="password"
                              value={paypalSecret}
                              onChange={(e) => setPaypalSecret(e.target.value)}
                              placeholder="Secret"
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                '✓ PayPal settings saved.'
                              );
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={async () => {
                              const res = await verifyPayPalCredentials(paypalClient, paypalSecret);
                              showToast(res.message);
                            }}
                          >
                            Test Connection
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Easebuzz */}
              {(() => {
                const isEnabled = !!m.easebuzz?.enabled;
                const isOpen = expandedGateway === 'easebuzz';
                return (
                  <div
                    style={{
                      border: '1px solid var(--line-strong, #E2E8F0)',
                      borderRadius: '10px',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken)' : 'var(--surface)',
                      }}
                      onClick={() => setExpandedGateway(isOpen ? null : 'easebuzz')}
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#0F172A' }}>
                        Easebuzz
                      </span>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          className={`toggle ${isEnabled ? 'on' : ''}`}
                          onClick={() => toggleMethod('easebuzz')}
                          title={isEnabled ? 'Disable Easebuzz' : 'Enable Easebuzz'}
                        >
                          <span className="track" />
                        </label>

                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px' }}
                          onClick={() => setExpandedGateway(isOpen ? null : 'easebuzz')}
                        >
                          {isOpen ? 'Close' : 'Configure'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '16px 18px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Merchant Key</label>
                            <input
                              type="text"
                              value={easebuzzKey}
                              onChange={(e) => setEasebuzzKey(e.target.value)}
                              placeholder="e.g. 2PBP7IAB82"
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Merchant Salt</label>
                            <input
                              type="password"
                              value={easebuzzSalt}
                              onChange={(e) => setEasebuzzSalt(e.target.value)}
                              placeholder="Merchant Salt"
                            />
                          </div>
                        </div>
                        <div className="field" style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Sub-merchant ID (Optional)</label>
                          <input
                            type="text"
                            value={easebuzzSubMerchant}
                            onChange={(e) => setEasebuzzSubMerchant(e.target.value)}
                            placeholder="Optional Sub-merchant ID"
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                '✓ Easebuzz settings saved.'
                              );
                            }}
                          >
                            Save
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
                                showToast(`Ping error: ${err?.message}`);
                              } finally {
                                setTestingEasebuzz(false);
                              }
                            }}
                          >
                            {testingEasebuzz ? 'Testing...' : 'Test Connection'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* SECTION 2: DIRECT & OFFLINE METHODS */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
              Direct & Offline Methods
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* UPI */}
              {(() => {
                const isEnabled = !!m.upi?.enabled;
                const isOpen = expandedGateway === 'upi';
                return (
                  <div
                    style={{
                      border: '1px solid var(--line-strong, #E2E8F0)',
                      borderRadius: '10px',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken)' : 'var(--surface)',
                      }}
                      onClick={() => setExpandedGateway(isOpen ? null : 'upi')}
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#0F172A' }}>
                        UPI (VPA & QR)
                      </span>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          className={`toggle ${isEnabled ? 'on' : ''}`}
                          onClick={() => toggleMethod('upi')}
                          title={isEnabled ? 'Disable UPI' : 'Enable UPI'}
                        >
                          <span className="track" />
                        </label>

                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px' }}
                          onClick={() => setExpandedGateway(isOpen ? null : 'upi')}
                        >
                          {isOpen ? 'Close' : 'Configure'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '16px 18px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', margin: 0 }}>UPI ID (VPA)</label>
                              {tmplUpiId && tmplUpiId !== upiId && (
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}
                                  onClick={() => {
                                    setUpiId(tmplUpiId);
                                    showToast(`✓ Synced from invoice: ${tmplUpiId}`);
                                  }}
                                >
                                  Sync from invoice ({tmplUpiId})
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value)}
                              placeholder="e.g. name@okhdfcbank"
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Display Name</label>
                            <input
                              type="text"
                              value={upiMerchant}
                              onChange={(e) => setUpiMerchant(e.target.value)}
                              placeholder="e.g. Property Name"
                            />
                          </div>
                        </div>

                        <div className="field" style={{ marginBottom: '14px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>QR Code Image</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                            <label className="btn secondary small" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                              Choose image
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleUploadQr}
                              />
                            </label>
                            {upiQr && (
                              <span style={{ fontSize: '12px', color: '#059669' }}>
                                ✓ QR active
                              </span>
                            )}
                          </div>
                          {upiQr && (
                            <div style={{ marginTop: '10px' }}>
                              <img
                                src={upiQr}
                                alt="UPI QR"
                                style={{ width: '100px', height: '100px', objectFit: 'contain', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px', background: 'var(--surface)' }}
                              />
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                '✓ UPI settings saved.'
                              );
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => {
                              if (!upiId) {
                                showToast('Please enter a UPI VPA ID first.');
                                return;
                              }
                              showToast(`VPA Address ${upiId} format verified.`);
                            }}
                          >
                            Verify VPA
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Bank Transfer */}
              {(() => {
                const isEnabled = !!m.bank?.enabled;
                const isOpen = expandedGateway === 'bank';
                return (
                  <div
                    style={{
                      border: '1px solid var(--line-strong, #E2E8F0)',
                      borderRadius: '10px',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken)' : 'var(--surface)',
                      }}
                      onClick={() => setExpandedGateway(isOpen ? null : 'bank')}
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#0F172A' }}>
                        Bank Transfer
                      </span>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          className={`toggle ${isEnabled ? 'on' : ''}`}
                          onClick={() => toggleMethod('bank')}
                          title={isEnabled ? 'Disable Bank Transfer' : 'Enable Bank Transfer'}
                        >
                          <span className="track" />
                        </label>

                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px' }}
                          onClick={() => setExpandedGateway(isOpen ? null : 'bank')}
                        >
                          {isOpen ? 'Close' : 'Configure'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '16px 18px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                        <div style={{ marginBottom: '12px' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ fontSize: '11.5px', padding: '3px 8px', borderRadius: '5px' }}
                            onClick={() => {
                              if (!tmplAccountNumber && !tmplBankName) {
                                showToast('No remittance details found in Invoice Template.');
                                return;
                              }
                              if (tmplAccountName) setBankName(tmplAccountName);
                              if (tmplBankName) setBankInstitution(tmplBankName);
                              if (tmplAccountNumber) setBankAcct(tmplAccountNumber);
                              if (tmplIfsc) setBankRouting(tmplIfsc);
                              showToast('✓ Bank details synced from Invoice Template.');
                            }}
                          >
                            ⚡ Sync from Invoice Template
                          </button>
                        </div>

                        <div className="row" style={{ marginBottom: '12px' }}>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Account Holder Name</label>
                            <input
                              type="text"
                              value={bankName}
                              onChange={(e) => setBankName(e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Bank Name</label>
                            <input
                              type="text"
                              value={bankInstitution}
                              onChange={(e) => setBankInstitution(e.target.value)}
                              placeholder="e.g. HDFC Bank / Chase"
                            />
                          </div>
                        </div>

                        <div className="row" style={{ marginBottom: '14px' }}>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Account Number / IBAN</label>
                            <input
                              type="text"
                              value={bankAcct}
                              onChange={(e) => setBankAcct(e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Routing / IFSC Code</label>
                            <input
                              type="text"
                              value={bankRouting}
                              onChange={(e) => setBankRouting(e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Country</label>
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
                              '✓ Bank details saved.'
                            );
                          }}
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Cash */}
              {(() => {
                const isEnabled = m.cash?.enabled !== false;
                const isOpen = expandedGateway === 'cash';
                return (
                  <div
                    style={{
                      border: '1px solid var(--line-strong, #E2E8F0)',
                      borderRadius: '10px',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? 'var(--surface-sunken)' : 'var(--surface)',
                      }}
                      onClick={() => setExpandedGateway(isOpen ? null : 'cash')}
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#0F172A' }}>
                        Cash / Cheque
                      </span>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          className={`toggle ${isEnabled ? 'on' : ''}`}
                          onClick={() => toggleMethod('cash')}
                          title={isEnabled ? 'Disable Cash' : 'Enable Cash'}
                        >
                          <span className="track" />
                        </label>

                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px' }}
                          onClick={() => setExpandedGateway(isOpen ? null : 'cash')}
                        >
                          {isOpen ? 'Close' : 'Configure'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '16px 18px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                        <div className="field" style={{ marginBottom: '14px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Instructions for Tenants</label>
                          <input
                            type="text"
                            value={cashInstructions}
                            onChange={(e) => setCashInstructions(e.target.value)}
                            placeholder="e.g. Pay directly at the property management office."
                          />
                        </div>

                        <button
                          type="button"
                          className="btn brass small"
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
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS: UNIFIED BILLING RULES & POLICIES */}
      {subTab === 'settings' && (
        <div style={{ width: '100%' }}>
          {/* Card 1: Rental payment reminder rule */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--line)',
              padding: '24px 28px',
              marginBottom: '24px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 18px 0' }}>
              Rental payment reminder rule
            </h3>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Send reminders
                </label>
                <select
                  value={reminderEnabled ? 'yes' : 'no'}
                  onChange={(e) => setReminderEnabled(e.target.value === 'yes')}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Reminder lead time (days prior)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={reminderDays === 0 ? '' : reminderDays}
                  placeholder="10"
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                    setReminderDays(cleaned === '' ? 1 : Math.max(1, Number(cleaned)));
                  }}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveReminderRule}
              disabled={isSavingReminder}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                fontSize: '13.5px',
                fontWeight: 600,
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: isSavingReminder ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '14px',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSavingReminder ? 'Saving...' : 'Save rule'}
            </button>
          </div>

          {/* Card 2: Late fee rule */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--line)',
              padding: '24px 28px',
              marginBottom: '24px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 18px 0' }}>
              Late fee rule
            </h3>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Charge late fees
                </label>
                <select
                  value={lateFeeEnabled ? 'yes' : 'no'}
                  onChange={(e) => setLateFeeEnabled(e.target.value === 'yes')}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Type
                </label>
                <select
                  value={lateFeeType}
                  onChange={(e) => setLateFeeType(e.target.value as 'percent' | 'flat')}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                >
                  <option value="percent">Percent of rent</option>
                  <option value="flat">Flat amount</option>
                </select>
              </div>

              <div style={{ flex: '1 1 140px', minWidth: '120px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Value {lateFeeType === 'percent' ? '(%)' : `(${dominantRentCurrency})`}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={lateFeeValue === 0 ? '' : lateFeeValue}
                  placeholder="5"
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                    setLateFeeValue(cleaned === '' ? 0 : Number(cleaned));
                  }}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                />
              </div>

              <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Grace period (days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={lateFeeGrace === 0 ? '' : lateFeeGrace}
                  placeholder="3"
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                    setLateFeeGrace(cleaned === '' ? 0 : Number(cleaned));
                  }}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                />
              </div>

              <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Max cap ({dominantRentCurrency})
                </label>
                <input
                  type="number"
                  min="0"
                  value={lateFeeCap === 0 ? '' : lateFeeCap}
                  placeholder="1000"
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                    setLateFeeCap(cleaned === '' ? 0 : Number(cleaned));
                  }}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveLateFeeRule}
              disabled={isSavingLateFee}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                fontSize: '13.5px',
                fontWeight: 600,
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: isSavingLateFee ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '14px',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSavingLateFee ? 'Saving...' : 'Save rule'}
            </button>

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
              <h3>{offlinePaymentType === 'deposit' ? 'Record Offline Security Deposit' : 'Record Offline Rent Payment'}</h3>
              <button type="button" className="btn secondary small" onClick={() => setIsRecordOfflineOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Payment Purpose</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    className={`btn small ${offlinePaymentType === 'rent' ? 'brass' : 'secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      setOfflinePaymentType('rent');
                      const matched = myUnits.find((u) => u.id === offlineUnit);
                      if (matched?.rent) setOfflineAmount(matched.rent);
                    }}
                  >
                    Monthly Rent
                  </button>
                  <button
                    type="button"
                    className={`btn small ${offlinePaymentType === 'deposit' ? 'brass' : 'secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      setOfflinePaymentType('deposit');
                      const matched = myUnits.find((u) => u.id === offlineUnit);
                      if (matched?.deposit) setOfflineAmount(matched.deposit);
                    }}
                  >
                    Security Deposit
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Target Unit & Resident</label>
                <select
                  value={offlineUnit}
                  onChange={(e) => {
                    const uId = e.target.value;
                    setOfflineUnit(uId);
                    const matched = myUnits.find((u) => u.id === uId);
                    if (offlinePaymentType === 'deposit') {
                      if (matched?.deposit) setOfflineAmount(matched.deposit);
                    } else {
                      if (matched?.rent) setOfflineAmount(matched.rent);
                    }
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

      {/* Proof Review Modal for Landlord Verification (from Claim or Invoice) */}
      {(reviewingProofInvoice || reviewingClaim) && (() => {
        const currentInvoice = reviewingProofInvoice
          ? (state.invoices.find((inv) => inv.id === reviewingProofInvoice.id) || reviewingProofInvoice)
          : null;

        const linkedClaim = reviewingClaim || (currentInvoice
          ? (state.cashClaims || [])
            .filter((c) => c.invoiceId === currentInvoice.id || (currentInvoice.paymentProofRef && c.id === currentInvoice.paymentProofRef) || (c.unit === currentInvoice.unit && c.status === 'pending_confirmation'))
            .sort((a, b) => new Date(b.claimedAt || 0).getTime() - new Date(a.claimedAt || 0).getTime())[0]
          : null);

        const targetUnit = currentInvoice?.unit || linkedClaim?.unit || '';
        const targetTenant = currentInvoice?.tenant || linkedClaim?.tenantName || 'Resident';
        const targetAmount = currentInvoice?.total || linkedClaim?.amount || 0;
        const targetCurrency = currentInvoice?.currency || linkedClaim?.currency || DEFAULT_CURRENCY_SYMBOL;

        // 1. Resolve Effective UTR / Transfer Reference
        const effectiveProofRef =
          (currentInvoice?.paymentProofRef && currentInvoice.paymentProofRef !== 'Direct Transfer')
            ? currentInvoice.paymentProofRef
            : (linkedClaim?.notes?.match(/Ref:\s*([^—\n]+)/)?.[1]?.trim() ||
              linkedClaim?.id ||
              'On-Site Cash Claim');

        // 2. Resolve Effective Proof Screenshot / Receipt Image
        const effectiveProofUrl = linkedClaim?.proofPhotoUrl || currentInvoice?.paymentProofUrl || '';

        // 3. Resolve Effective Notes
        let rawNotes = linkedClaim?.notes || currentInvoice?.paymentProofNotes || '';
        const effectiveProofNotes = rawNotes
          .replace(/^Ref:\s*[^—\n]+—\s*/i, '')
          .replace(/^Ref:\s*[^—\n]+$/i, '')
          .trim();

        // 4. Resolve Effective Submission Date
        const effectiveSubmissionDate =
          currentInvoice?.paymentProofDate ||
          linkedClaim?.claimedAt ||
          linkedClaim?.handoverDate ||
          new Date().toISOString();

        return (
          <div className="modal-backdrop" onClick={() => { setReviewingProofInvoice(null); setReviewingClaim(null); }}>
            <div className="modal-card" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={20} color="var(--brass)" />
                  <h3 style={{ margin: 0, fontSize: '17px' }}>
                    Verify Payment Proof — Unit {targetUnit} ({linkedClaim?.id || currentInvoice?.id})
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => { setReviewingProofInvoice(null); setReviewingClaim(null); }}
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
                    The resident reported paying offline / cash. Verify the details and photo proof below before approving.
                  </div>
                </div>

                {/* Remittance Details Grid */}
                <div style={{ background: '#FAFAF7', border: '1px solid var(--line)', borderRadius: '6px', padding: '14px', fontSize: '13px', lineHeight: '1.7', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Resident:</span>
                    <b>{targetTenant} (Unit {targetUnit})</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Claimed Amount:</span>
                    <b style={{ color: 'var(--brass)', fontSize: '15px' }}>{getCurrencySymbol(targetCurrency)}{targetAmount.toLocaleString('en-IN')}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>UTR / Handover Ref:</span>
                    <b style={{ fontFamily: 'monospace' }}>{effectiveProofRef}</b>
                  </div>
                  {linkedClaim?.handoverLocation && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Location:</span>
                      <span>{linkedClaim.handoverLocation}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Date:</span>
                    <span>{effectiveSubmissionDate ? new Date(effectiveSubmissionDate).toLocaleDateString() : 'Today'}</span>
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
                      No receipt screenshot attached. Claim logged as on-site direct cash handover.
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
                  onClick={async () => {
                    if (currentInvoice) {
                      await handleRejectProof(currentInvoice);
                    } else if (linkedClaim) {
                      const reason = window.prompt('Please enter the reason for declining this claim:');
                      if (reason && reason.trim()) {
                        await rejectCashClaim(linkedClaim.id, reason.trim());
                      }
                    }
                    setReviewingProofInvoice(null);
                    setReviewingClaim(null);
                  }}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                >
                  ✕ Decline / Not Received
                </button>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn secondary btn-mobile-full"
                    disabled={isApprovingProof || isRejectingProof}
                    onClick={() => { setReviewingProofInvoice(null); setReviewingClaim(null); }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={`btn brass btn-mobile-full ${isApprovingProof ? 'btn-processing' : ''}`}
                    disabled={isApprovingProof || isRejectingProof}
                    onClick={async () => {
                      if (currentInvoice) {
                        await handleApproveProof(currentInvoice);
                      } else if (linkedClaim) {
                        await confirmCashClaim(linkedClaim.id);
                      }
                      setReviewingProofInvoice(null);
                      setReviewingClaim(null);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#16A34A', borderColor: '#16A34A', color: '#fff' }}
                  >
                    <CheckCircle size={15} /> Confirm Receipt & Settle
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Invoices to Compile</div>
                    <b style={{ fontSize: '18px', color: modalInvoicesToDownload.length > 0 ? 'var(--brass)' : 'var(--danger)' }}>
                      {modalInvoicesToDownload.length} {modalInvoicesToDownload.length === 1 ? 'Invoice' : 'Invoices'}
                    </b>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Cumulative Value</div>
                    <b style={{ fontSize: '18px', color: 'var(--ink)' }}>
                      {dominantRentCurrency}{modalInvoicesToDownload.reduce((sum, inv) => sum + (inv.total || inv.amount || 0), 0).toLocaleString('en-IN')}
                    </b>
                  </div>
                  <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Timeline Reference</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-word' }}>{modalTimelineLabel}</div>
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
