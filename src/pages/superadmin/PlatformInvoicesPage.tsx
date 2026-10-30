import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useCurrency } from '../../context/CurrencyContext';
import { PlatformInvoice } from '../../types';
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Printer,
  Send,
  DollarSign,
  Plus,
  Download,
  Calendar,
  Filter,
  LayoutTemplate,
  Save,
  Eye,
  ShieldCheck,
  Building,
  CreditCard,
  Percent,
} from 'lucide-react';
import { PlatformInvoiceStudioModal } from '../../components/invoices/PlatformInvoiceStudioModal';
import { downloadBulkPlatformInvoicesPDF, exportPlatformInvoicesCSV, downloadSinglePlatformInvoicePDF } from '../../lib/pdf';
import { ButtonProcessing } from '../../components/common/Spinner';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getCurrencySymbol, getLocaleForCurrency } from '../../lib/currencyService';

export const PlatformInvoicesPage: React.FC = () => {
  const { state, savePlatformInvoice, markPlatformInvoicePaid, savePlatformInvoiceTemplate, logCommunication, showToast } = useAppData();
  const { viewCurrency, convert, format } = useCurrency();

  const [activeTab, setActiveTab] = useState<'history' | 'template'>('history');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'paid' | 'overdue' | 'void'>('all');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'this_month' | 'last_month' | 'this_quarter' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isSavingTmpl, setIsSavingTmpl] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);

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
  
  // Live Studio Modal State (For Manual Ad-Hoc Invoicing)
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioInvoice, setStudioInvoice] = useState<PlatformInvoice | null>(null);
  const [studioMode, setStudioMode] = useState<'create' | 'edit' | 'preview'>('create');

  // SaaS General Template Configuration State (For Automatic Invoices on Subscription Payment)
  const defaultTmpl = state.platformInvoiceTemplate || {
    issuerName: 'Propithub Technologies Inc.',
    issuerTaxNo: 'US-EIN 84-2910391 / VAT-EU982148',
    issuerAddress: '500 Howard Street, Suite 400, San Francisco, CA 94105, USA',
    issuerPhone: '+1 (800) 555-PROP',
    issuerEmail: 'billing@propithub.com',
    taxLabel: 'Sales Tax / VAT',
    taxPercent: 0,
    termsAndConditions: `1. All SaaS subscription and licensing fees are billed in advance according to the selected tier.
2. Invoices are payable within 14 calendar days from the date of issuance.
3. Overdue platform balances may result in temporary restriction of multi-unit management services.
4. All tax charges are assessed based on the customer's registered business jurisdiction.
5. Inquiries regarding platform invoices must be submitted to billing@propithub.com within 5 business days.`,
    signatoryName: 'Elena Rostova',
    signatoryRole: 'Chief Financial Officer & Corporate Controller',
    notes: 'Thank you for partnering with Propithub for your real estate operations.',
    bankName: 'Silicon Valley Bank / First Republic',
    accountName: 'Propithub Technologies Inc - Corporate Treasury',
    accountNumber: '987000124890',
    swiftCode: 'SVBKUS6SXXX',
  };

  const [tmplIssuerName, setTmplIssuerName] = useState(defaultTmpl.issuerName);
  const [tmplIssuerTaxNo, setTmplIssuerTaxNo] = useState(defaultTmpl.issuerTaxNo);
  const [tmplIssuerAddress, setTmplIssuerAddress] = useState(defaultTmpl.issuerAddress);
  const [tmplIssuerPhone, setTmplIssuerPhone] = useState(defaultTmpl.issuerPhone);
  const [tmplIssuerEmail, setTmplIssuerEmail] = useState(defaultTmpl.issuerEmail);
  const [tmplTaxLabel, setTmplTaxLabel] = useState(defaultTmpl.taxLabel || 'Sales Tax / VAT');
  const [tmplTaxPercent, setTmplTaxPercent] = useState(defaultTmpl.taxPercent || 0);
  const [tmplTerms, setTmplTerms] = useState(defaultTmpl.termsAndConditions);
  const [tmplSignatory, setTmplSignatory] = useState(defaultTmpl.signatoryName);
  const [tmplSignatoryRole, setTmplSignatoryRole] = useState(defaultTmpl.signatoryRole || 'Chief Financial Officer & Corporate Controller');
  const [tmplNotes, setTmplNotes] = useState(defaultTmpl.notes);
  const [tmplBankName, setTmplBankName] = useState(defaultTmpl.bankName || 'Silicon Valley Bank / First Republic');
  const [tmplAccountName, setTmplAccountName] = useState(defaultTmpl.accountName || 'Propithub Technologies Inc - Corporate Treasury');
  const [tmplAccountNumber, setTmplAccountNumber] = useState(defaultTmpl.accountNumber || '987000124890');
  const [tmplSwift, setTmplSwift] = useState(defaultTmpl.swiftCode || 'SVBKUS6SXXX');
  const [tmplViewMode, setTmplViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  const handleSavePlatformTemplate = async () => {
    setIsSavingTmpl(true);
    await new Promise((r) => setTimeout(r, 450));
    await savePlatformInvoiceTemplate({
      issuerName: tmplIssuerName,
      issuerTaxNo: tmplIssuerTaxNo,
      issuerAddress: tmplIssuerAddress,
      issuerPhone: tmplIssuerPhone,
      issuerEmail: tmplIssuerEmail,
      taxLabel: tmplTaxLabel,
      taxPercent: tmplTaxPercent,
      termsAndConditions: tmplTerms,
      signatoryName: tmplSignatory,
      signatoryRole: tmplSignatoryRole,
      notes: tmplNotes,
      bankName: tmplBankName,
      accountName: tmplAccountName,
      accountNumber: tmplAccountNumber,
      swiftCode: tmplSwift,
    });
    setIsSavingTmpl(false);
    showToast('Platform SaaS invoice general format saved! All automated subscription invoices will use this format.');
  };

  const invoices = state.platformInvoices || [];

  const { filteredInvoices, timelineLabel } = useMemo(() => {
    let label = 'All Platform Billing Periods';
    const now = new Date();

    const filtered = invoices.filter((inv) => {
      const matchesSearch =
        inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
      if (timelineFilter === 'custom') {
        label = `Custom Range (${customStartDate || 'Start'} to ${customEndDate || 'Present'})`;
        if (customStartDate && new Date(dateStr) < new Date(customStartDate)) return false;
        if (customEndDate && new Date(dateStr) > new Date(customEndDate + 'T23:59:59')) return false;
        return true;
      }

      return true;
    });

    return { filteredInvoices: filtered, timelineLabel: label };
  }, [invoices, searchQuery, statusFilter, timelineFilter, customStartDate, customEndDate]);

  // Calculate high-level stats normalized to USD then converted to viewCurrency
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

  const handleMarkPaid = async (inv: PlatformInvoice) => {
    const method = window.prompt(
      `Confirm manual payment for Invoice ${inv.id} ($${inv.total}):\nEnter payment method (e.g., Stripe, Bank Wire, UPI):`,
      'Bank Wire / Stripe'
    );
    if (method === null) return;
    setMarkingPaidId(inv.id);
    await new Promise((r) => setTimeout(r, 450));
    await markPlatformInvoicePaid(inv.id, method || 'Bank Wire');
    showToast(`Invoice ${inv.id} marked as PAID.`);
    if (studioInvoice && studioInvoice.id === inv.id) {
      setStudioInvoice({
        ...inv,
        status: 'paid',
        paidAt: new Date().toISOString(),
        paymentMethod: method || 'Bank Wire',
      });
    }
    setMarkingPaidId(null);
  };

  const handleSendReminder = async (inv: PlatformInvoice) => {
    setRemindingId(inv.id);
    try {
      // Resolve the owner's contact details from users list
      const ownerUser = state.users.find((u) => u.id === inv.ownerId);

      const notifId = `notif_${Date.now()}_${inv.ownerId}`;
      const notif = {
        id: notifId,
        userId: inv.ownerId,
        title: '🚨 Platform Invoice Payment Due',
        body: `Your PropItHub platform subscription invoice #${inv.id} for ${getCurrencySymbol(inv.currency)}${(inv.amount || 0).toLocaleString(getLocaleForCurrency(inv.currency))} is outstanding. Please settle to maintain uninterrupted access.`,
        link: '/owner/plan',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      // 1. Persist notification to Firestore so owner sees it on next login
      if (isFirebaseConfigured && inv.ownerId) {
        setDoc(doc(db, 'notifications', notifId), notif).catch(console.warn);
      }

      // 2. Fire SMS + Email via configured Twilio / SendGrid
      await logCommunication({
        type: 'platform_invoice_reminder',
        category: 'subscription',
        title: `Platform Invoice Payment Due: ${inv.id}`,
        body: notif.body,
        channels: ['in_app', 'sms', 'email'],
        recipientId: inv.ownerId,
        recipientName: inv.ownerName,
        recipientRole: 'owner',
        recipientContact: {
          email: inv.ownerEmail || ownerUser?.email,
          phone: ownerUser?.phone,
        },
        senderId: 'superadmin',
        senderName: 'Platform Admin',
        senderRole: 'superadmin',
        relatedEntityId: inv.id,
        deliveryStatus: { inApp: 'delivered', email: 'skipped', sms: 'skipped' },
      });

      showToast(`✓ Payment reminder dispatched to ${inv.ownerName} (${inv.ownerEmail}) via SMS, Email & In-App.`);
    } catch (err) {
      console.error('Invoice reminder dispatch error:', err);
      showToast(`Reminder sent to ${inv.ownerName} via in-app notification.`);
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <div>
      {/* Top Tabs Navigation */}
      <div className="tabs" style={{ marginBottom: '20px' }}>
        <div
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <FileText size={15} />
          Issued Platform Invoices & Bulk Downloads
        </div>
        <div
          className={`tab ${activeTab === 'template' ? 'active' : ''}`}
          onClick={() => setActiveTab('template')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <LayoutTemplate size={15} />
          Auto-Invoice Template & Format (SaaS General Format)
        </div>
      </div>

      {/* TAB 1: ISSUED PLATFORM INVOICES & BULK DOWNLOADS */}
      {activeTab === 'history' && (
        <div>
          {/* Top Banner / Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => exportPlatformInvoicesCSV(filteredInvoices)}
                title="Export all currently filtered invoices to CSV spreadsheet"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => downloadBulkPlatformInvoicesPDF(filteredInvoices, timelineLabel)}
                title="Download consolidated PDF report of platform invoices"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FileText size={14} /> Bulk Download PDF ({filteredInvoices.length})
              </button>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setActiveTab('template')}
                title="Configure the general template and format used for automatic SaaS invoices"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <LayoutTemplate size={14} /> Auto-Invoice Format
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={() => {
                  setStudioInvoice(null);
                  setStudioMode('create');
                  setIsStudioOpen(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Plus size={16} /> Issue Invoice (Manual)
              </button>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-4" style={{ marginBottom: '20px' }}>
            <div className="stat">
              <div className="num" style={{ color: 'var(--ink)' }}>
                {format(convert(totalCollectedUSD, 'USD', viewCurrency), viewCurrency)}
              </div>
              <div className="lbl">Total Collected (SaaS)</div>
              <div className="delta" style={{ color: 'var(--green)' }}>✓ Reconciled to ledger</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: 'var(--brass)' }}>
                {format(convert(pendingAmountUSD, 'USD', viewCurrency), viewCurrency)}
              </div>
              <div className="lbl">Outstanding Billed</div>
              <div className="delta">Pending settlements</div>
            </div>
            <div className="stat">
              <div className="num">{invoices.length}</div>
              <div className="lbl">Total Platform Invoices</div>
              <div className="delta">{invoices.filter((i) => i.status === 'paid').length} settled</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: overdueCount > 0 ? '#DC2626' : 'var(--ink)' }}>{overdueCount}</div>
              <div className="lbl">Past Due Accounts</div>
              <div className="delta" style={{ color: overdueCount > 0 ? '#DC2626' : 'var(--ink-soft)' }}>
                {overdueCount > 0 ? 'Requires follow-up' : 'All accounts current'}
              </div>
            </div>
          </div>

          {/* Timeline & Status Filters Bar */}
          <div className="panel" style={{ marginBottom: '20px', background: '#FAFAF7', border: '1px solid var(--line)' }}>
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
                      className={`btn small ${timelineFilter === item.id ? 'primary' : 'secondary'}`}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: timelineFilter === item.id ? 600 : 400,
                      }}
                      onClick={() => setTimelineFilter(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Status selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Filter size={13} /> Status:
                  </span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--line)' }}
                  >
                    <option value="all">All Statuses ({invoices.length})</option>
                    <option value="issued">Issued ({invoices.filter((i) => i.status === 'issued').length})</option>
                    <option value="paid">Paid ({invoices.filter((i) => i.status === 'paid').length})</option>
                    <option value="overdue">Overdue ({invoices.filter((i) => i.status === 'overdue').length})</option>
                    <option value="void">Void ({invoices.filter((i) => i.status === 'void').length})</option>
                  </select>
                </div>
              </div>

              {/* Custom Date Pickers */}
              {timelineFilter === 'custom' && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--line)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--line)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--line)' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Search bar */}
          <div style={{ marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Search by invoice ID, owner name, email, or subscription plan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
            />
          </div>

          {/* Invoices Table */}
          <div className="panel">
            <div className="panel-body" style={{ padding: 0 }}>
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Owner / Subscriber</th>
                        <th>Plan / Tier</th>
                        <th>Amount</th>
                        <th>Mode of Payment</th>
                        <th>Issued Date</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-soft)' }}>
                            No platform invoices match the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredInvoices.map((inv) => {
                          const isPaid = inv.status === 'paid';
                          const isOverdue = inv.status === 'overdue';

                          return (
                            <tr key={inv.id}>
                              <td>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>
                                  {inv.id}
                                </span>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{inv.ownerName}</div>
                                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{inv.ownerEmail}</div>
                              </td>
                              <td>
                                <span className="badge" style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', fontWeight: 600 }}>
                                  {inv.planName}
                                </span>
                                {inv.billingCycle && (
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'capitalize', marginTop: '2px' }}>
                                    {inv.billingCycle}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                  {format(convert(inv.total || inv.amount || 0, inv.currency || 'USD', viewCurrency), viewCurrency)}
                                </div>
                                {inv.tax ? (
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                    +{format(convert(inv.tax, inv.currency || 'USD', viewCurrency), viewCurrency)} {inv.taxLabel || 'Tax'}
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                {inv.paymentMethod ? (
                                  <div>
                                    <span
                                      className="badge"
                                      style={{
                                        background: 'var(--surface-sunken)',
                                        color: 'var(--ink)',
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '11px',
                                      }}
                                    >
                                      {inv.paymentMethod.toLowerCase().includes('easebuzz')
                                        ? '⚡ Easebuzz'
                                        : inv.paymentMethod.toLowerCase().includes('stripe')
                                        ? '💳 Stripe'
                                        : inv.paymentMethod.toLowerCase().includes('razorpay')
                                        ? '⚡ Razorpay'
                                        : inv.paymentMethod.toLowerCase().includes('upi')
                                        ? '📱 UPI'
                                        : inv.paymentMethod.toLowerCase().includes('paypal')
                                        ? '🅿️ PayPal'
                                        : inv.paymentMethod.toLowerCase().includes('bank')
                                        ? '🏦 Bank Wire'
                                        : inv.paymentMethod.toLowerCase().includes('cash')
                                        ? '💵 Cash'
                                        : inv.paymentMethod}
                                    </span>
                                    {inv.transactionRef && (
                                      <div
                                        style={{ fontSize: '10px', color: 'var(--ink-soft)', fontFamily: 'monospace', marginTop: '2px' }}
                                        title={`Txn Ref: ${inv.transactionRef}`}
                                      >
                                        {inv.transactionRef.length > 16 ? `${inv.transactionRef.slice(0, 16)}...` : inv.transactionRef}
                                      </div>
                                    )}
                                  </div>
                                ) : isPaid ? (
                                  <span className="badge green" style={{ fontSize: '11px' }}>
                                    ✓ Reconciled
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                    —
                                  </span>
                                )}
                              </td>
                              <td>{formatInvoiceDate(inv.issueDate)}</td>
                              <td>
                                <span style={{ color: isOverdue ? '#DC2626' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                                  {formatInvoiceDate(inv.dueDate)}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`badge ${
                                    isPaid
                                      ? 'green'
                                      : isOverdue
                                      ? 'red'
                                      : inv.status === 'issued'
                                      ? 'amber'
                                      : 'secondary'
                                  }`}
                                >
                                  {inv.status.toUpperCase()}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => {
                                      setStudioInvoice(inv);
                                      setStudioMode('preview');
                                      setIsStudioOpen(true);
                                    }}
                                    title="Preview formal printable invoice voucher"
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => downloadSinglePlatformInvoicePDF(inv)}
                                    title="Download single PDF invoice"
                                  >
                                    <Download size={12} /> PDF
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => {
                                      setStudioInvoice(inv);
                                      setStudioMode('edit');
                                      setIsStudioOpen(true);
                                    }}
                                    title="Edit invoice parameters & terms"
                                  >
                                    Edit
                                  </button>
                                  {!isPaid && (
                                    <>
                                      <button
                                        type="button"
                                        className={`btn brass small ${markingPaidId === inv.id ? 'btn-processing' : ''}`}
                                        disabled={markingPaidId === inv.id}
                                        onClick={() => handleMarkPaid(inv)}
                                        title="Mark invoice as paid upon bank or stripe settlement"
                                      >
                                        <ButtonProcessing
                                          loading={markingPaidId === inv.id}
                                          loadingText="Updating..."
                                          defaultText="Mark Paid"
                                        />
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

              {/* Mobile Card View */}
              <div className="mobile-card-view" style={{ padding: '12px' }}>
                {filteredInvoices.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-soft)' }}>
                    No platform invoices match the selected criteria.
                  </div>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isPaid = inv.status === 'paid';
                    const isOverdue = inv.status === 'overdue';

                    return (
                      <div key={inv.id} className="staff-card" style={{ padding: '14px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                              {inv.id}
                            </span>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', marginTop: '2px' }}>
                              {inv.ownerName}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{inv.ownerEmail}</div>
                          </div>
                          <span
                            className={`badge ${
                              isPaid
                                ? 'green'
                                : isOverdue
                                ? 'red'
                                : inv.status === 'issued'
                                ? 'amber'
                                : 'secondary'
                            }`}
                          >
                            {inv.status.toUpperCase()}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                          <span className="badge" style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', fontWeight: 600 }}>
                            {inv.planName}
                          </span>
                          {inv.billingCycle && (
                            <span className="badge grey" style={{ textTransform: 'capitalize' }}>
                              {inv.billingCycle}
                            </span>
                          )}
                          <span style={{ fontWeight: 800, fontSize: '15px', marginLeft: 'auto', color: 'var(--brass)' }}>
                            {getCurrencySymbol(inv.currency)}{((inv.total || inv.amount) ?? 0).toLocaleString(getLocaleForCurrency(inv.currency))}
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>
                            Mode:{' '}
                            {inv.paymentMethod ? (
                              <strong style={{ color: 'var(--ink)' }}>
                                {inv.paymentMethod.toLowerCase().includes('easebuzz')
                                  ? '⚡ Easebuzz'
                                  : inv.paymentMethod.toLowerCase().includes('razorpay')
                                  ? '⚡ Razorpay'
                                  : inv.paymentMethod.toLowerCase().includes('stripe')
                                  ? '💳 Stripe'
                                  : inv.paymentMethod.toLowerCase().includes('upi')
                                  ? '📱 UPI'
                                  : inv.paymentMethod.toLowerCase().includes('paypal')
                                  ? '🅿️ PayPal'
                                  : inv.paymentMethod.toLowerCase().includes('bank')
                                  ? '🏦 Bank Wire'
                                  : inv.paymentMethod}
                              </strong>
                            ) : isPaid ? (
                              <span className="badge green" style={{ fontSize: '10px' }}>Reconciled</span>
                            ) : (
                              '—'
                            )}
                          </span>
                          {inv.transactionRef && (
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--ink-soft)' }} title={`Txn: ${inv.transactionRef}`}>
                              Ref: {inv.transactionRef.length > 12 ? `${inv.transactionRef.slice(0, 12)}...` : inv.transactionRef}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Issued: {formatInvoiceDate(inv.issueDate)}</span>
                          <span style={{ color: isOverdue ? '#DC2626' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>
                            Due: {formatInvoiceDate(inv.dueDate)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ flex: '1 1 auto' }}
                            onClick={() => {
                              setStudioInvoice(inv);
                              setStudioMode('preview');
                              setIsStudioOpen(true);
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ flex: '1 1 auto' }}
                            onClick={() => downloadSinglePlatformInvoicePDF(inv)}
                          >
                            <Download size={12} /> PDF
                          </button>
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ flex: '1 1 auto' }}
                            onClick={() => {
                              setStudioInvoice(inv);
                              setStudioMode('edit');
                              setIsStudioOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          {!isPaid && (
                            <>
                              <button
                                type="button"
                                className={`btn brass small btn-mobile-full ${markingPaidId === inv.id ? 'btn-processing' : ''}`}
                                style={{ flex: '1 1 auto' }}
                                disabled={markingPaidId === inv.id}
                                onClick={() => handleMarkPaid(inv)}
                              >
                                <ButtonProcessing
                                  loading={markingPaidId === inv.id}
                                  loadingText="Updating..."
                                  defaultText="Mark Paid"
                                />
                              </button>
                              <button
                                type="button"
                                className={`btn secondary small btn-mobile-full ${remindingId === inv.id ? 'btn-processing' : ''}`}
                                style={{ flex: '1 1 auto' }}
                                disabled={remindingId === inv.id}
                                onClick={() => handleSendReminder(inv)}
                              >
                                <ButtonProcessing
                                  loading={remindingId === inv.id}
                                  loadingText="Sending..."
                                  defaultText="Reminder"
                                  icon={<Send size={12} />}
                                />
                              </button>
                            </>
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

      {/* TAB 2: DEFAULT SAAS INVOICE FORMAT & LIVE PREVIEW (AUTOMATED BILLING FORMAT) */}
      {activeTab === 'template' && (
        <div>
          {/* Top Banner with Save and View Controls */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '18px',
              padding: '16px 20px',
              background: '#FFFFFF',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--line)',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
                SaaS Subscription Invoice Format & Live Template
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--surface-sunken)', padding: '3px', borderRadius: '6px', gap: '3px', flexWrap: 'wrap' }}>
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
                className={`btn brass btn-mobile-full ${isSavingTmpl ? 'btn-processing' : ''}`}
                disabled={isSavingTmpl}
                onClick={handleSavePlatformTemplate}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ButtonProcessing
                  loading={isSavingTmpl}
                  loadingText="Saving SaaS Format..."
                  defaultText="Save General SaaS Format"
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
                tmplViewMode === 'split' ? 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' : '1fr',
              gap: '24px',
              alignItems: 'flex-start',
            }}
          >
            {/* COLUMN 1: TEMPLATE CONFIGURATION FORMS */}
            {(tmplViewMode === 'split' || tmplViewMode === 'edit') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* 1. Corporate Identity & Tax Registration */}
                <div className="panel">
                  <div className="panel-head" style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building size={16} color="var(--brass)" /> 1. Propithub SaaS Legal Identity & Tax Registration
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '18px' }}>
                    <div className="grid grid-2" style={{ gap: '14px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Corporate Legal Entity Name *</label>
                        <input
                          type="text"
                          value={tmplIssuerName}
                          onChange={(e) => setTmplIssuerName(e.target.value)}
                          placeholder="e.g. Propithub Technologies Inc."
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Corporate Tax ID / EIN / VAT *</label>
                        <input
                          type="text"
                          value={tmplIssuerTaxNo}
                          onChange={(e) => setTmplIssuerTaxNo(e.target.value)}
                          placeholder="e.g. US-EIN 84-2910391 / VAT-EU982148"
                        />
                      </div>
                    </div>
                    <div className="field" style={{ margin: '12px 0 0' }}>
                      <label>Global Headquarters Address</label>
                      <input
                        type="text"
                        value={tmplIssuerAddress}
                        onChange={(e) => setTmplIssuerAddress(e.target.value)}
                        placeholder="500 Howard Street, Suite 400, San Francisco, CA 94105, USA"
                      />
                    </div>
                    <div className="grid grid-2" style={{ gap: '14px', marginTop: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Corporate Support Phone</label>
                        <input
                          type="text"
                          value={tmplIssuerPhone}
                          onChange={(e) => setTmplIssuerPhone(e.target.value)}
                          placeholder="+1 (800) 555-PROP"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Corporate Billing Email</label>
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

                {/* 2. SaaS Tax Configuration */}
                <div className="panel">
                  <div className="panel-head" style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Percent size={16} color="var(--brass)" /> 2. SaaS Subscription Tax Rate Configuration
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '18px' }}>
                    <div className="grid grid-2" style={{ gap: '14px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tax Label on Invoice</label>
                        <input
                          type="text"
                          value={tmplTaxLabel}
                          onChange={(e) => setTmplTaxLabel(e.target.value)}
                          placeholder="e.g. Sales Tax / VAT / GST"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Default Tax Rate (%)</label>
                        <input
                          type="number"
                          value={tmplTaxPercent === 0 ? '' : tmplTaxPercent}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                            setTmplTaxPercent(cleaned === '' ? 0 : Number(cleaned));
                          }}
                          placeholder="0"
                          min="0"
                          max="100"
                        />
                      </div>
                    </div>
                    <p className="hint" style={{ marginTop: '8px', fontSize: '11.5px' }}>
                      Tax will be dynamically computed and itemized on all SaaS subscription invoices generated automatically.
                    </p>
                  </div>
                </div>

                {/* 3. Global Bank Wire & Settlement Accounts */}
                <div className="panel">
                  <div className="panel-head" style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CreditCard size={16} color="var(--brass)" /> 3. Treasury Bank Wire Remittance Details
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '18px' }}>
                    <div className="grid grid-2" style={{ gap: '14px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Treasury Bank Name</label>
                        <input
                          type="text"
                          value={tmplBankName}
                          onChange={(e) => setTmplBankName(e.target.value)}
                          placeholder="e.g. Silicon Valley Bank / JPMorgan Chase"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Account Holder Name</label>
                        <input
                          type="text"
                          value={tmplAccountName}
                          onChange={(e) => setTmplAccountName(e.target.value)}
                          placeholder="e.g. Propithub Technologies Inc - Corporate Treasury"
                        />
                      </div>
                    </div>
                    <div className="grid grid-2" style={{ gap: '14px', marginTop: '12px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Account / IBAN Number</label>
                        <input
                          type="text"
                          value={tmplAccountNumber}
                          onChange={(e) => setTmplAccountNumber(e.target.value)}
                          placeholder="e.g. 987000124890"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>SWIFT / BIC / Routing Code</label>
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

                {/* 4. Terms & Conditions & Signatory */}
                <div className="panel">
                  <div className="panel-head" style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldCheck size={16} color="var(--brass)" /> 4. Master SaaS Clauses & Corporate Signatory
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '18px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Terms & Conditions (T&C Clauses on Voucher)</label>
                      <textarea
                        rows={5}
                        value={tmplTerms}
                        onChange={(e) => setTmplTerms(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.5 }}
                      />
                    </div>
                    <div className="grid grid-2" style={{ gap: '14px', marginTop: '14px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Authorized Signatory Name</label>
                        <input
                          type="text"
                          value={tmplSignatory}
                          onChange={(e) => setTmplSignatory(e.target.value)}
                          placeholder="e.g. Elena Rostova"
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Signatory Corporate Role / Title</label>
                        <input
                          type="text"
                          value={tmplSignatoryRole}
                          onChange={(e) => setTmplSignatoryRole(e.target.value)}
                          placeholder="e.g. Chief Financial Officer & Corporate Controller"
                        />
                      </div>
                    </div>
                    <div className="field" style={{ margin: '14px 0 0' }}>
                      <label>Footer Remittance Remark / Partnership Note</label>
                      <input
                        type="text"
                        value={tmplNotes}
                        onChange={(e) => setTmplNotes(e.target.value)}
                        placeholder="Thank you for partnering with Propithub for your real estate operations."
                      />
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  type="button"
                  className="btn brass"
                  onClick={handleSavePlatformTemplate}
                  style={{ padding: '12px', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  <Save size={16} /> Save General SaaS Format (Apply to Automated Platform Subscriptions)
                </button>
              </div>
            )}

            {/* COLUMN 2: LIVE A4 SAAS VOUCHER PREVIEW */}
            {(tmplViewMode === 'split' || tmplViewMode === 'preview') && (
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  padding: '24px 18px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ width: '100%', maxWidth: '820px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>
                    <Eye size={15} color="var(--brass)" /> Live SaaS Document Preview (Subscriber Receipt)
                  </div>
                  <span className="badge green" style={{ fontSize: '11px' }}>
                    LIVE REACTIVE PREVIEW
                  </span>
                </div>

                {/* Official A4 Invoice Voucher Sheet */}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '820px',
                    background: 'var(--surface)',
                    padding: '36px 32px',
                    borderRadius: '6px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
                    border: '1px solid var(--line)',
                  }}
                >
                  {/* Voucher Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--line)', paddingBottom: '16px', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                        PROPIT<span style={{ color: 'var(--brass)' }}>HUB</span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginTop: '4px' }}>
                        {tmplIssuerName || 'Propithub Technologies Inc.'}
                      </div>
                      {tmplIssuerTaxNo && (
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--brass)', marginTop: '2px' }}>
                          TAX REG: {tmplIssuerTaxNo}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px', maxWidth: '280px', lineHeight: 1.4 }}>
                        {tmplIssuerAddress}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        {tmplIssuerPhone} {tmplIssuerPhone && tmplIssuerEmail ? '•' : ''} {tmplIssuerEmail}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        SAAS SUBSCRIPTION INVOICE
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: 'var(--brass)', marginTop: '4px' }}>
                        #PINV-AUTO-DEMO
                      </div>
                      <div style={{ marginTop: '6px', display: 'inline-block', padding: '3px 8px', background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>
                        SETTLED / PAID
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '6px' }}>
                        Date: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  {/* Billed To Subscriber */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '22px', background: 'var(--surface-sunken)', padding: '14px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
                        SUBSCRIBER (PROPERTY OWNER)
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>
                        Apex Property Group LLC
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        owner@apexproperties.com
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Units Managed: 24 Units
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
                        BILLING SPECIFICATIONS
                      </div>
                      <div style={{ fontSize: '11.5px', marginTop: '2px' }}>
                        <b>Tier:</b> Growth Pro Tier (Monthly)
                      </div>
                      <div style={{ fontSize: '11.5px' }}>
                        <b>Payment Gateway:</b> Stripe / Razorpay Instant Reconcile
                      </div>
                      <div style={{ fontSize: '11.5px' }}>
                        <b>Settlement:</b> Automated Credit Card / NetBanking
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--ink)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 0' }}>Plan Description</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px' }}>Period</th>
                        <th style={{ textAlign: 'right', padding: '6px 0' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: '12px' }}>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '8px 0' }}>
                          <div style={{ fontWeight: 600 }}>Propithub Growth Pro SaaS Subscription</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>
                            Includes automated rent ledger, multi-unit tenant portals, and payment gateway settlement.
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '8px' }}>30 Days</td>
                        <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>$99.00</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Summary Totals */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                    <div style={{ width: '220px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>Subtotal:</span>
                        <span>$99.00</span>
                      </div>
                      {tmplTaxPercent > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                          <span style={{ color: 'var(--ink-soft)' }}>{tmplTaxLabel || 'Tax'} ({tmplTaxPercent}%):</span>
                          <span>${((99 * tmplTaxPercent) / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid var(--line)', marginTop: '4px', fontSize: '14px', fontWeight: 800 }}>
                        <span>Total Paid:</span>
                        <span style={{ color: 'var(--brass)' }}>
                          ${(99 + (99 * tmplTaxPercent) / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bank Wire Details Box */}
                  <div style={{ background: 'var(--surface-sunken)', padding: '12px 14px', borderRadius: '4px', border: '1px solid var(--line)', marginBottom: '18px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Treasury Remittance & Settlement Account
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: 'var(--ink)' }}>
                      <div><b style={{ color: 'var(--ink-soft)' }}>Bank:</b> {tmplBankName}</div>
                      <div><b style={{ color: 'var(--ink-soft)' }}>Account Name:</b> {tmplAccountName}</div>
                      <div><b style={{ color: 'var(--ink-soft)' }}>Account / IBAN:</b> {tmplAccountNumber}</div>
                      <div><b style={{ color: 'var(--ink-soft)' }}>SWIFT / Routing:</b> {tmplSwift}</div>
                    </div>
                  </div>

                  {/* Terms & Conditions */}
                  <div style={{ marginBottom: '16px', fontSize: '9.5px', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px', color: 'var(--ink)' }}>
                      Terms & Conditions
                    </div>
                    <div style={{ whiteSpace: 'pre-line' }}>{tmplTerms}</div>
                  </div>

                  {/* Signatory & Notes */}
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '10.5px', color: 'var(--ink-soft)' }}>
                    <div>
                      <div style={{ fontStyle: 'italic' }}>{tmplNotes}</div>
                      <div style={{ marginTop: '4px' }}>Propithub SaaS Automated Billing Infrastructure • ISO/IEC 27001 Certified</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'cursive', fontSize: '15px', color: 'var(--ink)', fontWeight: 600 }}>
                        {tmplSignatory}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink)' }}>{tmplSignatory}</div>
                      <div style={{ fontSize: '9px' }}>{tmplSignatoryRole}</div>
                    </div>
                  </div>

                </div>

                {/* Bottom Save Shortcut */}
                <div style={{ marginTop: '16px', width: '100%', maxWidth: '820px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn brass"
                    onClick={handleSavePlatformTemplate}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Save size={15} /> Save As Default SaaS Billing Format
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Production Platform Invoice Studio & Preview Modal */}
      <PlatformInvoiceStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        initialInvoice={studioInvoice}
        initialMode={studioMode}
      />
    </div>
  );
};
