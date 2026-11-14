import React, { useState, useMemo, useEffect } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyAmount, getTableCurrencyHeader } from '../../components/common/CurrencyAmount';
import { PlatformInvoice, PlatformInvoiceTemplateConfig } from '../../types';
import {
  FileText,
  CheckCircle,
  Download,
  Eye,
  Plus,
  Send,
  Building,
  LayoutTemplate,
  Save,
  CreditCard,
  Percent,
} from 'lucide-react';
import { PlatformInvoiceStudioModal } from '../../components/invoices/PlatformInvoiceStudioModal';
import { PlatformInvoiceDocument } from '../../components/invoices/PlatformInvoiceDocument';
import { downloadBulkPlatformInvoicesPDF, exportPlatformInvoicesCSV, downloadSinglePlatformInvoicePDF } from '../../lib/pdf';
import { ButtonProcessing } from '../../components/common/Spinner';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getCurrencySymbol, getLocaleForCurrency } from '../../lib/currencyService';
import { getTodayDateString, getDaysFromNowString } from '../../lib/dates';

export const PlatformInvoicesPage: React.FC = () => {
  const {
    state,
    savePlatformInvoice,
    markPlatformInvoicePaid,
    savePlatformInvoiceTemplate,
    logCommunication,
    showToast,
  } = useAppData();
  const { viewCurrency, convert, format } = useCurrency();

  // Top subtab switcher: 'history' (Invoices & Studio) vs 'template' (Invoice Template & Live Preview)
  const [activeTab, setActiveTab] = useState<'history' | 'template'>('history');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'paid' | 'overdue' | 'void'>('all');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'this_month' | 'last_month' | 'this_quarter'>('all');
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // Modal State for viewing formatted invoice
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioInvoice, setStudioInvoice] = useState<PlatformInvoice | null>(null);
  const [studioMode, setStudioMode] = useState<'create' | 'edit' | 'preview'>('preview');

  // Inline "Invoice Studio" form state (quick invoice issuance)
  const owners = useMemo(() => state.users.filter((u) => u.role === 'owner'), [state.users]);
  const activePlans = useMemo(() => state.plans.filter((p) => !p.isArchived), [state.plans]);

  const [formOwnerId, setFormOwnerId] = useState('');
  const [formPlanId, setFormPlanId] = useState(activePlans[0]?.id || 'p1');
  const [formAmountOverride, setFormAmountOverride] = useState('');
  const [formTaxPercent, setFormTaxPercent] = useState<number>(0);
  const [formPeriodStart, setFormPeriodStart] = useState(getTodayDateString());
  const [formPeriodEnd, setFormPeriodEnd] = useState(getDaysFromNowString(30));
  const [formDueDate, setFormDueDate] = useState(getDaysFromNowString(7));
  const [formNotes, setFormNotes] = useState('');
  const [isIssuing, setIsIssuing] = useState(false);

  // Platform Invoice Template & Live Preview state
  const defaultTmpl: PlatformInvoiceTemplateConfig = state.platformInvoiceTemplate || {
    issuerName: 'Propithub SaaS Technologies Inc.',
    issuerTaxNo: 'US-EIN: 84-2918472',
    issuerAddress: '100 Montgomery St, Suite 1800, San Francisco, CA 94104',
    issuerPhone: '+1 (800) 555-PROP',
    issuerEmail: 'billing@propithub.com',
    taxLabel: 'Sales Tax / VAT',
    taxPercent: 0,
    termsAndConditions: `1. Propithub SaaS Cloud platform subscription is billed in advance on a recurring schedule.
2. Failure to settle this invoice by the due date may result in automated API rate-limiting or temporary suspension of tenant portal dispatches.
3. Tax is billed in accordance with the jurisdiction of the corporate entity.
4. All software licenses are governed by the Propithub Master Software License Agreement (MSLA).
5. For corporate accounting reconciliations, wire confirmation must reference the Invoice ID above.`,
    includeTerms: true,
    signatoryName: 'Platform Chief Financial Controller',
    signatoryRole: 'Authorized Financial Signatory',
    notes: 'Thank you for choosing Propithub for your real estate portfolio operations.',
    bankName: 'Silicon Valley Bank / JPMorgan Chase',
    accountName: 'Propithub Technologies Inc. — Operating Treasury',
    accountNumber: '987000124890',
    swiftCode: 'SVBKUS6SXXX',
  };

  const [tmplIssuerName, setTmplIssuerName] = useState(defaultTmpl.issuerName);
  const [tmplIssuerTaxNo, setTmplIssuerTaxNo] = useState(defaultTmpl.issuerTaxNo);
  const [tmplIssuerAddress, setTmplIssuerAddress] = useState(defaultTmpl.issuerAddress);
  const [tmplIssuerPhone, setTmplIssuerPhone] = useState(defaultTmpl.issuerPhone);
  const [tmplIssuerEmail, setTmplIssuerEmail] = useState(defaultTmpl.issuerEmail);
  const [tmplTaxLabel, setTmplTaxLabel] = useState(defaultTmpl.taxLabel || 'Sales Tax / VAT');
  const [tmplTaxPercent, setTmplTaxPercent] = useState<number>(defaultTmpl.taxPercent || 0);
  const [tmplTerms, setTmplTerms] = useState(defaultTmpl.termsAndConditions);
  const [tmplIncludeTerms, setTmplIncludeTerms] = useState(defaultTmpl.includeTerms !== false);
  const [tmplSignatory, setTmplSignatory] = useState(defaultTmpl.signatoryName);
  const [tmplSignatoryRole, setTmplSignatoryRole] = useState(defaultTmpl.signatoryRole || 'Authorized Financial Signatory');
  const [tmplNotes, setTmplNotes] = useState(defaultTmpl.notes);
  const [tmplBankName, setTmplBankName] = useState(defaultTmpl.bankName || 'Silicon Valley Bank / JPMorgan Chase');
  const [tmplAccountName, setTmplAccountName] = useState(defaultTmpl.accountName || 'Propithub Technologies Inc. — Operating Treasury');
  const [tmplAccountNumber, setTmplAccountNumber] = useState(defaultTmpl.accountNumber || '987000124890');
  const [tmplSwift, setTmplSwift] = useState(defaultTmpl.swiftCode || 'SVBKUS6SXXX');
  const [tmplViewMode, setTmplViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [isSavingTmpl, setIsSavingTmpl] = useState(false);

  // Sync state if template updates in Firestore
  useEffect(() => {
    if (state.platformInvoiceTemplate) {
      const pt = state.platformInvoiceTemplate;
      if (pt.issuerName) setTmplIssuerName(pt.issuerName);
      if (pt.issuerTaxNo !== undefined) setTmplIssuerTaxNo(pt.issuerTaxNo);
      if (pt.issuerAddress) setTmplIssuerAddress(pt.issuerAddress);
      if (pt.issuerPhone) setTmplIssuerPhone(pt.issuerPhone);
      if (pt.issuerEmail) setTmplIssuerEmail(pt.issuerEmail);
      if (pt.taxLabel) setTmplTaxLabel(pt.taxLabel);
      if (pt.taxPercent !== undefined) setTmplTaxPercent(pt.taxPercent);
      if (pt.termsAndConditions) setTmplTerms(pt.termsAndConditions);
      if (pt.includeTerms !== undefined) setTmplIncludeTerms(pt.includeTerms);
      if (pt.signatoryName) setTmplSignatory(pt.signatoryName);
      if (pt.signatoryRole) setTmplSignatoryRole(pt.signatoryRole);
      if (pt.notes) setTmplNotes(pt.notes);
      if (pt.bankName) setTmplBankName(pt.bankName);
      if (pt.accountName) setTmplAccountName(pt.accountName);
      if (pt.accountNumber) setTmplAccountNumber(pt.accountNumber);
      if (pt.swiftCode) setTmplSwift(pt.swiftCode);
    }
  }, [state.platformInvoiceTemplate]);

  const handleSavePlatformTemplate = async () => {
    setIsSavingTmpl(true);
    await new Promise((r) => setTimeout(r, 400));
    await savePlatformInvoiceTemplate({
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
      signatoryRole: tmplSignatoryRole,
      notes: tmplNotes,
      bankName: tmplBankName,
      accountName: tmplAccountName,
      accountNumber: tmplAccountNumber,
      swiftCode: tmplSwift,
    });
    setIsSavingTmpl(false);
    showToast('Platform invoice template saved! All issued platform invoices will use this format.');
  };

  const invoices = state.platformInvoices || [];

  const resolveOwnerDisplayName = (inv: PlatformInvoice): string => {
    if (inv.ownerName && inv.ownerName !== 'Property Owner' && inv.ownerName !== 'Owner') {
      return inv.ownerName;
    }
    const resolvedUser = state.users.find(
      (u) =>
        u.id === inv.ownerId ||
        (u.email && inv.ownerEmail && u.email.toLowerCase() === inv.ownerEmail.toLowerCase())
    );
    return (
      resolvedUser?.displayName?.trim() ||
      resolvedUser?.email?.split('@')[0] ||
      inv.ownerEmail?.split('@')[0] ||
      inv.ownerName ||
      'Owner'
    );
  };

  const formatInvoiceDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const { filteredInvoices, timelineLabel } = useMemo(() => {
    let label = 'All Platform Billing Periods';
    const now = new Date();

    const filtered = invoices.filter((inv) => {
      const ownerDisplayName = resolveOwnerDisplayName(inv);
      const matchesSearch =
        inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ownerDisplayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.ownerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.planName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      if (!matchesSearch || !matchesStatus) return false;

      if (timelineFilter === 'all') return true;

      const dateStr = inv.issueDate || inv.dueDate;
      if (!dateStr) return true;
      const invDate = new Date(dateStr);

      if (timelineFilter === 'this_month') {
        label = `Current Month (${now.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
        return (
          invDate.getFullYear() === now.getFullYear() &&
          invDate.getMonth() === now.getMonth()
        );
      }
      if (timelineFilter === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        label = `Last Month (${lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
        return (
          invDate.getFullYear() === lastMonth.getFullYear() &&
          invDate.getMonth() === lastMonth.getMonth()
        );
      }
      if (timelineFilter === 'this_quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
        label = `Q${currentQuarter} ${now.getFullYear()}`;
        const invQuarter = Math.floor(invDate.getMonth() / 3) + 1;
        return (
          invDate.getFullYear() === now.getFullYear() &&
          invQuarter === currentQuarter
        );
      }

      return true;
    });

    return { filteredInvoices: filtered, timelineLabel: label };
  }, [invoices, searchQuery, statusFilter, timelineFilter]);

  // High-level KPI Stats
  const totalCollectedUSD = useMemo(() => {
    return invoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + convert(i.total || i.amount || 0, i.currency || 'USD', 'USD'), 0);
  }, [invoices, convert]);

  const pendingAmountUSD = useMemo(() => {
    return invoices
      .filter((i) => i.status === 'issued' || i.status === 'overdue')
      .reduce((sum, i) => sum + convert(i.total || i.amount || 0, i.currency || 'USD', 'USD'), 0);
  }, [invoices, convert]);

  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  // Issue Invoice via inline Invoice Studio
  const handleIssueInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOwnerId) {
      showToast('Please select a property owner');
      return;
    }
    const targetOwner = state.users.find((u) => u.id === formOwnerId);
    const targetPlan = activePlans.find((p) => p.id === formPlanId) || activePlans[0];
    const baseAmount = formAmountOverride ? Number(formAmountOverride) : (targetPlan?.price || 0);
    const taxAmt = formTaxPercent > 0 ? (baseAmount * formTaxPercent) / 100 : 0;
    const total = baseAmount + taxAmt;
    const invId = `PI-${Date.now().toString().slice(-4)}`;

    setIsIssuing(true);
    await new Promise((r) => setTimeout(r, 350));

    const targetOwnerName =
      targetOwner?.displayName?.trim() ||
      (targetOwner as any)?.name?.trim() ||
      targetOwner?.email?.split('@')[0] ||
      'Owner';

    const newInv: PlatformInvoice = {
      id: invId,
      ownerId: formOwnerId,
      ownerName: targetOwnerName,
      ownerEmail: targetOwner?.email || '',
      planId: targetPlan?.id || 'p1',
      planName: targetPlan?.name || 'Subscription Plan',
      periodStart: formPeriodStart,
      periodEnd: formPeriodEnd,
      amount: baseAmount,
      tax: taxAmt,
      total,
      currency: 'USD',
      status: 'issued',
      issueDate: getTodayDateString(),
      dueDate: formDueDate,
      notes: formNotes || 'Platform SaaS subscription',
      issuerName: tmplIssuerName || state.platformInvoiceTemplate?.issuerName,
      issuerAddress: tmplIssuerAddress || state.platformInvoiceTemplate?.issuerAddress,
      issuerEmail: tmplIssuerEmail || state.platformInvoiceTemplate?.issuerEmail,
      issuerPhone: tmplIssuerPhone || state.platformInvoiceTemplate?.issuerPhone,
      issuerTaxNo: tmplIssuerTaxNo || state.platformInvoiceTemplate?.issuerTaxNo,
      termsAndConditions: tmplTerms || state.platformInvoiceTemplate?.termsAndConditions || 'Standard platform subscription terms apply.',
      includeTerms: tmplIncludeTerms,
      signatoryName: tmplSignatory || state.platformInvoiceTemplate?.signatoryName || 'Platform Administrator',
      signatoryRole: tmplSignatoryRole || state.platformInvoiceTemplate?.signatoryRole || 'Authorized Officer',
    };

    await savePlatformInvoice(newInv);
    setIsIssuing(false);
    showToast(`Invoice ${invId} issued to ${targetOwnerName}.`);
    setFormAmountOverride('');
    setFormNotes('');
  };

  // Preview draft from Invoice Studio
  const handlePreviewDraft = () => {
    if (!formOwnerId) {
      showToast('Please select a property owner to preview draft');
      return;
    }
    const targetOwner = state.users.find((u) => u.id === formOwnerId);
    const targetPlan = activePlans.find((p) => p.id === formPlanId) || activePlans[0];
    const baseAmount = formAmountOverride ? Number(formAmountOverride) : (targetPlan?.price || 0);
    const taxAmt = formTaxPercent > 0 ? (baseAmount * formTaxPercent) / 100 : 0;
    const draftInv: PlatformInvoice = {
      id: `PI-DRAFT-${Date.now().toString().slice(-4)}`,
      ownerId: formOwnerId,
      ownerName:
        targetOwner?.displayName?.trim() ||
        (targetOwner as any)?.name?.trim() ||
        targetOwner?.email?.split('@')[0] ||
        'Owner',
      ownerEmail: targetOwner?.email || '',
      planId: targetPlan?.id || 'p1',
      planName: targetPlan?.name || 'Subscription Plan',
      periodStart: formPeriodStart,
      periodEnd: formPeriodEnd,
      amount: baseAmount,
      tax: taxAmt,
      total: baseAmount + taxAmt,
      currency: 'USD',
      status: 'issued',
      issueDate: getTodayDateString(),
      dueDate: formDueDate,
      notes: formNotes || 'Platform SaaS subscription',
      issuerName: tmplIssuerName || state.platformInvoiceTemplate?.issuerName,
      issuerAddress: tmplIssuerAddress || state.platformInvoiceTemplate?.issuerAddress,
      issuerEmail: tmplIssuerEmail || state.platformInvoiceTemplate?.issuerEmail,
      issuerPhone: tmplIssuerPhone || state.platformInvoiceTemplate?.issuerPhone,
      issuerTaxNo: tmplIssuerTaxNo || state.platformInvoiceTemplate?.issuerTaxNo,
      termsAndConditions: tmplTerms || state.platformInvoiceTemplate?.termsAndConditions || 'Standard platform subscription terms apply.',
      includeTerms: tmplIncludeTerms,
      signatoryName: tmplSignatory || state.platformInvoiceTemplate?.signatoryName || 'Platform Administrator',
      signatoryRole: tmplSignatoryRole || state.platformInvoiceTemplate?.signatoryRole || 'Authorized Officer',
    };
    setStudioInvoice(draftInv);
    setStudioMode('preview');
    setIsStudioOpen(true);
  };

  // Mark Paid action
  const handleMarkPaid = async (inv: PlatformInvoice) => {
    setMarkingPaidId(inv.id);
    await new Promise((r) => setTimeout(r, 350));
    await markPlatformInvoicePaid(inv.id, 'Admin Reconciled / Paid');
    showToast(`Invoice ${inv.id} marked as PAID. Owner plan updated.`);
    setMarkingPaidId(null);
  };

  // Void action
  const handleVoidInvoice = async (inv: PlatformInvoice) => {
    if (!window.confirm(`Are you sure you want to void invoice ${inv.id}?`)) return;
    setVoidingId(inv.id);
    await new Promise((r) => setTimeout(r, 300));
    await savePlatformInvoice({ ...inv, status: 'void' });
    showToast(`Invoice ${inv.id} marked as VOID.`);
    setVoidingId(null);
  };

  // Send reminder notice
  const handleSendReminder = async (inv: PlatformInvoice) => {
    setRemindingId(inv.id);
    try {
      const notifId = `notif_${Date.now()}_${inv.ownerId}`;
      const notif = {
        id: notifId,
        userId: inv.ownerId,
        title: '🚨 Platform Invoice Payment Due',
        body: `Your Propithub platform subscription invoice #${inv.id} for ${getCurrencySymbol(inv.currency)}${(inv.amount || 0).toLocaleString(getLocaleForCurrency(inv.currency))} is outstanding. Please settle to maintain uninterrupted access.`,
        link: '/owner/plan',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured && inv.ownerId) {
        setDoc(doc(db, 'notifications', notifId), notif).catch(console.warn);
      }

      await logCommunication({
        type: 'platform_invoice_reminder',
        category: 'subscription',
        title: `Platform Invoice Payment Due: ${inv.id}`,
        body: notif.body,
        channels: ['in_app', 'sms', 'email'],
        recipientId: inv.ownerId,
        recipientName: resolveOwnerDisplayName(inv),
        recipientRole: 'owner',
        recipientContact: { email: inv.ownerEmail },
        senderId: 'superadmin',
        senderName: 'Platform Administrator',
        senderRole: 'superadmin',
        deliveryStatus: { inApp: 'delivered', email: 'skipped', sms: 'skipped' },
      });

      showToast(`Reminder sent to owner for Invoice ${inv.id}.`);
    } catch {
      showToast(`Reminder logged for Invoice ${inv.id}.`);
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Primary Sub-Tabs Navigation */}
      <div className="tabs" style={{ marginBottom: '20px' }}>
        <button
          type="button"
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <FileText size={15} />
          Invoices
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'template' ? 'active' : ''}`}
          onClick={() => setActiveTab('template')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <LayoutTemplate size={15} />
          Invoice Template
        </button>
      </div>

      {/* TAB 1: ALL INVOICES & STUDIO */}
      {activeTab === 'history' && (
        <div>
          {/* KPI Stats Row */}
          <div className="grid grid-4" style={{ marginBottom: '22px' }}>
            <div className="stat">
              <div className="num" style={{ color: 'var(--ink)' }}>
                {format(convert(totalCollectedUSD, 'USD', viewCurrency), viewCurrency)}
              </div>
              <div className="lbl">Total Collected</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: 'var(--brass)' }}>
                {format(convert(pendingAmountUSD, 'USD', viewCurrency), viewCurrency)}
              </div>
              <div className="lbl">Outstanding Billed</div>
            </div>
            <div className="stat">
              <div className="num">{invoices.length}</div>
              <div className="lbl">Total Platform Invoices</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: overdueCount > 0 ? '#DC2626' : 'var(--ink)' }}>{overdueCount}</div>
              <div className="lbl">Past Due Accounts</div>
            </div>
          </div>

          {/* CARD 1: INVOICE STUDIO (Streamlined creation matching HTML simulator) */}
          <div className="panel" style={{ marginBottom: '24px' }}>
            <div className="panel-head" style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>Invoice Studio</div>
              </div>
            </div>
            <div className="panel-body" style={{ padding: '20px' }}>
              <form onSubmit={handleIssueInvoice}>
                <div className="grid grid-4" style={{ gap: '14px', marginBottom: '14px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Property Owner *</label>
                    <select
                      value={formOwnerId}
                      onChange={(e) => setFormOwnerId(e.target.value)}
                      required
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    >
                      <option value="">Choose owner...</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.displayName || (o as any).name || o.email} ({o.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Subscription Tier</label>
                    <select
                      value={formPlanId}
                      onChange={(e) => setFormPlanId(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    >
                      {activePlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (USD {p.price}/mo)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Amount Override (blank = plan price)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formAmountOverride}
                      onChange={(e) => setFormAmountOverride(e.target.value)}
                      placeholder="e.g. 79"
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Tax %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formTaxPercent}
                      onChange={(e) => setFormTaxPercent(Number(e.target.value) || 0)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div className="grid grid-4" style={{ gap: '14px', marginBottom: '16px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Period Start</label>
                    <input
                      type="date"
                      value={formPeriodStart}
                      onChange={(e) => setFormPeriodStart(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Period End</label>
                    <input
                      type="date"
                      value={formPeriodEnd}
                      onChange={(e) => setFormPeriodEnd(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Due Date</label>
                    <input
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Notes</label>
                    <input
                      type="text"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="e.g. Multi-property cloud plan"
                      style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handlePreviewDraft}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Eye size={14} /> Preview Draft
                  </button>
                  <button
                    type="submit"
                    className={`btn brass ${isIssuing ? 'btn-processing' : ''}`}
                    disabled={isIssuing}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ButtonProcessing
                      loading={isIssuing}
                      loadingText="Issuing Invoice..."
                      defaultText="Issue Invoice"
                      icon={<Plus size={15} />}
                    />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* CARD 2: ALL INVOICES (Minimal table matching HTML simulator) */}
          <div className="panel">
            <div className="panel-head" style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>All Invoices</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      {filteredInvoices.length} {filteredInvoices.length === 1 ? 'record' : 'records'} found
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => exportPlatformInvoicesCSV(filteredInvoices)}
                      title="Export all currently filtered invoices to CSV spreadsheet"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', fontSize: '11.5px' }}
                    >
                      <Download size={13} /> Export CSV
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => downloadBulkPlatformInvoicesPDF(filteredInvoices, timelineLabel)}
                      title="Download consolidated PDF report of platform invoices"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', fontSize: '11.5px' }}
                    >
                      <FileText size={13} /> Bulk Download PDF ({filteredInvoices.length})
                    </button>
                  </div>
                </div>

                {/* Quick Filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search owner or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '5px 10px', fontSize: '12px', width: '180px' }}
                  />

                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['all', 'issued', 'paid', 'overdue', 'void'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`btn small ${statusFilter === st ? 'primary' : 'secondary'}`}
                        style={{ padding: '4px 10px', fontSize: '11.5px', textTransform: 'capitalize' }}
                        onClick={() => setStatusFilter(st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  <select
                    value={timelineFilter}
                    onChange={(e) => setTimelineFilter(e.target.value as any)}
                    style={{ padding: '5px 8px', fontSize: '12px' }}
                  >
                    <option value="all">All Time</option>
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_quarter">This Quarter</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="panel-body" style={{ padding: 0 }}>
              <div className="desktop-table-container">
                <div className="table-wrap">
                  <table className="table" style={{ margin: 0, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '110px' }}>Invoice</th>
                      <th>Owner</th>
                      <th>Plan</th>
                      <th>Period</th>
                      <th style={{ textAlign: 'right' }}>{getTableCurrencyHeader('Amount', viewCurrency)}</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th style={{ textAlign: 'right', width: '220px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-soft)' }}>
                          No platform invoices found.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map((inv) => {
                        const isPaid = inv.status === 'paid';
                        const isDue = inv.status === 'issued' || inv.status === 'overdue';

                        return (
                          <tr key={inv.id}>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12.5px' }}>
                                {inv.id}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{resolveOwnerDisplayName(inv)}</div>
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{inv.ownerEmail}</div>
                            </td>
                            <td>
                              <span className="badge" style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', fontWeight: 600 }}>
                                {inv.planName}
                              </span>
                            </td>
                            <td style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                              {formatInvoiceDate(inv.periodStart)} to {formatInvoiceDate(inv.periodEnd)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>
                              <CurrencyAmount amount={inv.total || inv.amount || 0} currency={inv.currency || 'USD'} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className={`badge ${
                                  isPaid ? 'green' : inv.status === 'overdue' ? 'red' : inv.status === 'issued' ? 'amber' : 'grey'
                                }`}
                                style={{ textTransform: 'capitalize' }}
                              >
                                {inv.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => {
                                    setStudioInvoice(inv);
                                    setStudioMode('preview');
                                    setIsStudioOpen(true);
                                  }}
                                  title="View official document"
                                >
                                  <Eye size={12} style={{ marginRight: '3px' }} /> View
                                </button>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => downloadSinglePlatformInvoicePDF(inv)}
                                  title="Download PDF"
                                >
                                  <Download size={12} />
                                </button>
                                {isDue && (
                                  <>
                                    <button
                                      type="button"
                                      className={`btn brass small ${markingPaidId === inv.id ? 'btn-processing' : ''}`}
                                      disabled={markingPaidId === inv.id}
                                      onClick={() => handleMarkPaid(inv)}
                                      title="Mark invoice paid"
                                    >
                                      <ButtonProcessing
                                        loading={markingPaidId === inv.id}
                                        loadingText="..."
                                        defaultText="Mark paid"
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn secondary small ${voidingId === inv.id ? 'btn-processing' : ''}`}
                                      disabled={voidingId === inv.id}
                                      onClick={() => handleVoidInvoice(inv)}
                                      title="Void invoice"
                                      style={{ color: '#DC2626' }}
                                    >
                                      Void
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn secondary small ${remindingId === inv.id ? 'btn-processing' : ''}`}
                                      disabled={remindingId === inv.id}
                                      onClick={() => handleSendReminder(inv)}
                                      title="Send reminder notice"
                                    >
                                      <ButtonProcessing
                                        loading={remindingId === inv.id}
                                        loadingText="..."
                                        defaultText=""
                                        icon={<Send size={12} />}
                                      />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INVOICE TEMPLATE & LIVE PREVIEW (Matching minimal HTML-model layout) */}
      {activeTab === 'template' && (
        <div>
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
              <div style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
                The official invoice a property owner receives for platform subscriptions. Fill in the sections below and watch it update live.
              </div>
              <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle size={13} /> Ready to use · Platform plan, owner details, amounts and dates fill in automatically.
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

          <div
            className={`invoice-template-split-grid ${tmplViewMode === 'split' ? 'split-mode' : ''}`}
          >
            {/* LEFT COLUMN: 3 CONVERSATIONAL SECTIONS (EDIT MODE) */}
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
                      <label>Platform legal entity name</label>
                      <input
                        type="text"
                        value={tmplIssuerName}
                        onChange={(e) => setTmplIssuerName(e.target.value)}
                        placeholder="e.g. Propithub SaaS Technologies Inc."
                      />
                    </div>
                    <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Support phone</label>
                        <input
                          type="text"
                          value={tmplIssuerPhone}
                          onChange={(e) => setTmplIssuerPhone(e.target.value)}
                          placeholder="+1 (800) 555-PROP"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Billing email</label>
                        <input
                          type="email"
                          value={tmplIssuerEmail}
                          onChange={(e) => setTmplIssuerEmail(e.target.value)}
                          placeholder="billing@propithub.com"
                        />
                      </div>
                    </div>
                    <div className="field" style={{ margin: 0, marginBottom: '12px' }}>
                      <label>Corporate headquarters address</label>
                      <input
                        type="text"
                        value={tmplIssuerAddress}
                        onChange={(e) => setTmplIssuerAddress(e.target.value)}
                        placeholder="100 Montgomery St, Suite 1800, San Francisco, CA"
                      />
                    </div>
                    <div className="grid grid-2" style={{ gap: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tax name</label>
                        <input
                          type="text"
                          value={tmplTaxLabel}
                          onChange={(e) => setTmplTaxLabel(e.target.value)}
                          placeholder="e.g. Sales Tax / VAT / GST"
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

                {/* Section 2: How should owners pay? */}
                <div className="panel" style={{ margin: 0 }}>
                  <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                    <div>
                      <b style={{ fontSize: '13.5px' }}>2. How should owners pay?</b>
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '16px 18px' }}>
                    <div className="grid grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Treasury bank name</label>
                        <input
                          type="text"
                          value={tmplBankName}
                          onChange={(e) => setTmplBankName(e.target.value)}
                          placeholder="e.g. Silicon Valley Bank / JPMorgan Chase"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Account holder name</label>
                        <input
                          type="text"
                          value={tmplAccountName}
                          onChange={(e) => setTmplAccountName(e.target.value)}
                          placeholder="Propithub Technologies Inc. — Operating Treasury"
                        />
                      </div>
                    </div>
                    <div className="grid grid-2" style={{ gap: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Account number or IBAN</label>
                        <input
                          type="text"
                          value={tmplAccountNumber}
                          onChange={(e) => setTmplAccountNumber(e.target.value)}
                          placeholder="e.g. 987000124890"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>SWIFT / BIC / Routing code</label>
                        <input
                          type="text"
                          value={tmplSwift}
                          onChange={(e) => setTmplSwift(e.target.value)}
                          placeholder="e.g. SVBKUS6SXXX"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible: More options */}
                <details style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 18px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                    More options <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 400 }}>· Tax ID / EIN, signatory, footer notes & terms</span>
                  </summary>
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Tax registration number (GSTIN / PAN / VAT / EIN)</label>
                      <input
                        type="text"
                        value={tmplIssuerTaxNo}
                        onChange={(e) => setTmplIssuerTaxNo(e.target.value)}
                        placeholder="e.g. US-EIN: 84-2918472"
                      />
                    </div>
                    <div className="grid grid-2" style={{ gap: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Signed by (name)</label>
                        <input
                          type="text"
                          value={tmplSignatory}
                          onChange={(e) => setTmplSignatory(e.target.value)}
                          placeholder="Platform Chief Financial Controller"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Signatory role / title</label>
                        <input
                          type="text"
                          value={tmplSignatoryRole}
                          onChange={(e) => setTmplSignatoryRole(e.target.value)}
                          placeholder="Authorized Financial Signatory"
                        />
                      </div>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Note at the bottom</label>
                      <input
                        type="text"
                        value={tmplNotes}
                        onChange={(e) => setTmplNotes(e.target.value)}
                        placeholder="Thank you for choosing Propithub for your real estate portfolio operations."
                      />
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
                    onClick={handleSavePlatformTemplate}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px' }}
                  >
                    <ButtonProcessing
                      loading={isSavingTmpl}
                      loadingText="Saving Template..."
                      defaultText="Save Platform Invoice Format"
                      icon={<Save size={15} />}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* RIGHT COLUMN: CLEAN MODERN LIVE PREVIEW (MATCHING OWNER & HTML MODEL) */}
            {(tmplViewMode === 'split' || tmplViewMode === 'preview') && (
              <div className="invoice-template-preview-col">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <b style={{ fontSize: '12.5px', color: 'var(--ink)' }}>Live preview</b>
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Sample subscription billing</span>
                </div>

                <div className="invoice-sheet invoice-template-preview-sheet">
                  <PlatformInvoiceDocument
                    invoice={{
                      id: 'PI-2026-0042',
                      ownerName: 'Apex Estates Ltd · Owner Account',
                      ownerEmail: 'owner@apexestates.com',
                      ownerId: 'usr-owner-sample',
                      planName: 'Growth',
                      amount: 79,
                      tax: tmplTaxPercent > 0 ? Math.round((79 * tmplTaxPercent) / 100) : 0,
                      total: 79 + (tmplTaxPercent > 0 ? Math.round((79 * tmplTaxPercent) / 100) : 0),
                      currency: 'USD',
                      status: 'paid',
                      issueDate: new Date().toISOString().split('T')[0],
                      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                      notes: 'Growth Plan Cloud License — Monthly SaaS subscription',
                    }}
                    template={{
                      issuerName: tmplIssuerName || 'Propithub SaaS Technologies Inc.',
                      issuerAddress: tmplIssuerAddress,
                      issuerEmail: tmplIssuerEmail,
                      issuerPhone: tmplIssuerPhone,
                      issuerTaxNo: tmplIssuerTaxNo,
                      taxLabel: tmplTaxLabel,
                      taxPercent: tmplTaxPercent,
                      includeTerms: tmplIncludeTerms,
                      termsAndConditions: tmplIncludeTerms ? tmplTerms : '',
                      notes: tmplNotes,
                      signatoryName: tmplSignatory,
                      signatoryRole: tmplSignatoryRole,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pure Document View Modal */}
      <PlatformInvoiceStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        initialInvoice={studioInvoice}
        initialMode={studioMode}
      />
    </div>
  );
};
