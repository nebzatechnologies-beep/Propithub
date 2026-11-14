import React, { useState, useEffect } from 'react';
import { PlatformInvoice } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { PlatformInvoiceDocument } from './PlatformInvoiceDocument';
import {
  Printer,
  Eye,
  Edit3,
  CheckCircle,
  Building,
  User,
  CreditCard,
  FileText,
  ShieldCheck,
  X,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Download,
} from 'lucide-react';
import { getTodayDateString } from '../../lib/dates';
import { ButtonProcessing } from '../common/Spinner';
import { downloadSinglePlatformInvoicePDF } from '../../lib/pdf';
import { getCurrencySymbol } from '../../lib/currencyService';

interface PlatformInvoiceStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialInvoice?: PlatformInvoice | null;
  initialMode?: 'create' | 'edit' | 'preview';
}

export const PlatformInvoiceStudioModal: React.FC<PlatformInvoiceStudioModalProps> = ({
  isOpen,
  onClose,
  initialInvoice,
  initialMode = 'create',
}) => {
  const { state, savePlatformInvoice, markPlatformInvoicePaid, showToast } = useAppData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  const ownerUsers = state.users.filter((u) => u.role === 'owner');

  // Active Tab: 'edit' or 'preview'
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>(
    initialMode === 'preview' ? 'preview' : 'edit'
  );

  // 1. Invoice Identifiers
  const [invoiceId, setInvoiceId] = useState('');
  const [status, setStatus] = useState<'issued' | 'paid' | 'overdue' | 'void'>('issued');
  const [selectedPlanId, setSelectedPlanId] = useState('growth');
  const [planName, setPlanName] = useState('Growth Plan');
  const [issueDate, setIssueDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });

  // 2. Issuer (Propithub Platform HQ)
  const [issuerTaxNo, setIssuerTaxNo] = useState('US-EIN: 84-2918472 • VAT: EU372008492');
  const [issuerAddress, setIssuerAddress] = useState('Propithub SaaS Technologies Inc., 100 Montgomery St, Suite 1800, San Francisco, CA');
  const [issuerPhone, setIssuerPhone] = useState('+1 (800) 555-PROP');
  const [issuerEmail, setIssuerEmail] = useState('billing@propithub.com');

  // 3. Recipient (Property Owner)
  const [targetOwnerId, setTargetOwnerId] = useState(ownerUsers[0]?.id || '');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerTaxNo, setOwnerTaxNo] = useState('');

  // 4. Financials
  const [amount, setAmount] = useState<number>(79);
  const [tax, setTax] = useState<number>(0);
  const [currency, setCurrency] = useState<'USD' | 'INR'>('USD');

  // 5. Terms & Conditions (T&C) & Signatory
  const defaultTerms = `1. Propithub SaaS Cloud platform subscription is billed in advance on a recurring schedule.
2. Failure to settle this invoice by the due date may result in automated API rate-limiting or temporary suspension of tenant portal dispatches.
3. Tax is billed in accordance with the jurisdiction of the corporate entity.
4. All software licenses are governed by the Propithub Master Software License Agreement (MSLA).
5. For corporate accounting reconciliations, wire confirmation must reference the Invoice ID above.`;
  const [termsAndConditions, setTermsAndConditions] = useState(defaultTerms);
  const [includeTerms, setIncludeTerms] = useState(true);
  const [notes, setNotes] = useState('Monthly SaaS Subscription & Platform Cloud License');
  const [signatoryName, setSignatoryName] = useState('Platform Chief Financial Controller');
  const [signatoryRole, setSignatoryRole] = useState('Authorized Officer');

  useEffect(() => {
    if (!isOpen) return;

    if (initialInvoice) {
      setInvoiceId(initialInvoice.id);
      setStatus(initialInvoice.status);
      setTargetOwnerId(initialInvoice.ownerId);
      setOwnerName(initialInvoice.ownerName);
      setOwnerEmail(initialInvoice.ownerEmail);
      setSelectedPlanId(initialInvoice.planId);
      setPlanName(initialInvoice.planName);
      setAmount(initialInvoice.amount);
      setTax(initialInvoice.tax || 0);
      setCurrency((initialInvoice.currency as any) || 'USD');
      setIssueDate(initialInvoice.issueDate ? initialInvoice.issueDate.split('T')[0] : getTodayDateString());
      setDueDate(initialInvoice.dueDate ? initialInvoice.dueDate.split('T')[0] : getTodayDateString());
      setPeriodStart(initialInvoice.periodStart ? initialInvoice.periodStart.split('T')[0] : '');
      setPeriodEnd(initialInvoice.periodEnd ? initialInvoice.periodEnd.split('T')[0] : '');
      setNotes(initialInvoice.notes || 'Monthly SaaS Subscription & Platform Cloud License');
      setIssuerTaxNo(initialInvoice.issuerTaxNo || 'US-EIN: 84-2918472 • VAT: EU372008492');
      setOwnerTaxNo(initialInvoice.ownerTaxNo || '');
      setTermsAndConditions(initialInvoice.termsAndConditions || defaultTerms);
      setIncludeTerms(initialInvoice.includeTerms !== false && state.platformInvoiceTemplate?.includeTerms !== false);
      setSignatoryName(initialInvoice.signatoryName || state.platformInvoiceTemplate?.signatoryName || 'Platform Chief Financial Controller');
      setSignatoryRole(initialInvoice.signatoryRole || state.platformInvoiceTemplate?.signatoryRole || 'Authorized Officer');
      setActiveTab(initialMode === 'edit' ? 'edit' : 'preview');
    } else {
      const newId = `PINV-${Date.now().toString().slice(-6)}`;
      setInvoiceId(newId);
      setStatus('issued');
      const defaultOwner = ownerUsers[0];
      if (defaultOwner) {
        setTargetOwnerId(defaultOwner.id);
        setOwnerName(defaultOwner.displayName || defaultOwner.email.split('@')[0]);
        setOwnerEmail(defaultOwner.email);
      }
      setSelectedPlanId('growth');
      setPlanName('Growth');
      setAmount(79);
      setTax(0);
      setCurrency('USD');
      setIssueDate(getTodayDateString());
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setDueDate(d.toISOString().split('T')[0]);
      setNotes('Monthly SaaS Subscription & Platform Cloud License');
      setIssuerTaxNo('US-EIN: 84-2918472 • VAT: EU372008492');
      setOwnerTaxNo('');
      setTermsAndConditions(state.platformInvoiceTemplate?.termsAndConditions || defaultTerms);
      setIncludeTerms(state.platformInvoiceTemplate?.includeTerms !== false);
      setSignatoryName(state.platformInvoiceTemplate?.signatoryName || 'Platform Chief Financial Controller');
      setSignatoryRole(state.platformInvoiceTemplate?.signatoryRole || 'Authorized Officer');
      setActiveTab('edit');
    }
  }, [isOpen, initialInvoice, initialMode]);

  if (!isOpen) return null;

  const handleOwnerChange = (ownerId: string) => {
    setTargetOwnerId(ownerId);
    const owner = ownerUsers.find((u) => u.id === ownerId);
    if (owner) {
      setOwnerName(owner.displayName || owner.email.split('@')[0]);
      setOwnerEmail(owner.email);
    }
  };

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    const planObj = state.plans.find((p) => p.id === planId);
    if (planObj) {
      setPlanName(planObj.name);
      setAmount(planObj.price);
    }
  };

  const total = Number(amount) + Number(tax);
  const currencySymbol = getCurrencySymbol(currency);

  const safeIsoDate = (val?: string, fallbackIso?: string): string => {
    if (!val || !val.trim()) return fallbackIso || new Date().toISOString();
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? (fallbackIso || new Date().toISOString()) : parsed.toISOString();
  };

  const builtInvoice: PlatformInvoice = {
    id: invoiceId || initialInvoice?.id || 'PINV-PREVIEW',
    ownerId: targetOwnerId || 'unknown',
    ownerName: ownerName || 'Property Owner',
    ownerEmail: ownerEmail || '',
    planId: selectedPlanId,
    planName,
    periodStart: safeIsoDate(periodStart),
    periodEnd: safeIsoDate(periodEnd),
    amount: Number(amount) || 0,
    tax: Number(tax) || 0,
    total,
    currency,
    status,
    issueDate: safeIsoDate(issueDate),
    dueDate: safeIsoDate(dueDate),
    notes,
    issuerName: initialInvoice?.issuerName || state.platformInvoiceTemplate?.issuerName,
    issuerAddress: initialInvoice?.issuerAddress || state.platformInvoiceTemplate?.issuerAddress,
    issuerEmail: initialInvoice?.issuerEmail || state.platformInvoiceTemplate?.issuerEmail,
    issuerPhone: initialInvoice?.issuerPhone || state.platformInvoiceTemplate?.issuerPhone,
    issuerTaxNo,
    ownerTaxNo,
    termsAndConditions,
    includeTerms,
    signatoryName,
    signatoryRole,
    paidAt: initialInvoice?.paidAt,
    paymentMethod: initialInvoice?.paymentMethod || (status === 'paid' ? 'Bank Wire / Reconciled' : undefined),
    transactionRef: initialInvoice?.transactionRef,
  };

  const handleSaveInvoice = async (targetStatus?: 'issued' | 'paid' | 'overdue' | 'void') => {
    if (!targetOwnerId) {
      showToast('Please select a valid property owner.');
      return;
    }

    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 450));

    const finalStatus = targetStatus || status;

    const invoiceToSave: PlatformInvoice = {
      id: invoiceId,
      ownerId: targetOwnerId,
      ownerName: ownerName || 'Property Owner',
      ownerEmail: ownerEmail || '',
      planId: selectedPlanId,
      planName,
      periodStart: safeIsoDate(periodStart),
      periodEnd: safeIsoDate(periodEnd),
      amount: Number(amount),
      tax: Number(tax),
      total,
      currency,
      status: finalStatus,
      issueDate: safeIsoDate(issueDate),
      dueDate: safeIsoDate(dueDate),
      notes,
      issuerTaxNo,
      ownerTaxNo,
      termsAndConditions,
      signatoryName,
      ...(finalStatus === 'paid' && !initialInvoice?.paidAt
        ? {
            paidAt: new Date().toISOString(),
            paymentMethod: 'Bank Wire / Admin Reconciled',
            transactionRef: `TXN-${Date.now().toString().slice(-6)}`,
          }
        : initialInvoice?.paidAt
        ? {
            paidAt: initialInvoice.paidAt,
            paymentMethod: initialInvoice.paymentMethod,
            transactionRef: initialInvoice.transactionRef,
          }
        : {}),
    };

    await savePlatformInvoice(invoiceToSave);
    setIsSubmitting(false);
    showToast(`Platform Invoice ${invoiceId} saved and synced.`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="invoice-studio-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Platform Invoice Studio"
        style={{ width: '96vw', maxWidth: '1180px', height: '92vh', maxHeight: '920px' }}
      >
        {/* Modal Top Header & Dedicated Tabs */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 24px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--surface)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Title & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
              {activeTab === 'preview'
                ? (initialInvoice ? `Platform Invoice ${invoiceId}` : 'Platform Invoice Preview')
                : (initialInvoice ? `Edit Platform Invoice ${invoiceId}` : 'Issue Platform Invoice')}
            </span>
            <span
              className={`invoice-stamp ${
                status === 'paid' ? 'paid' : status === 'issued' ? 'issued' : status === 'overdue' ? 'overdue' : 'draft'
              }`}
            >
              {status.toUpperCase()}
            </span>
          </div>

          {/* Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {activeTab === 'preview' ? (
              <>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => downloadSinglePlatformInvoicePDF(builtInvoice, state.platformInvoiceTemplate)}
                  title="Download official PDF invoice directly"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => window.print()}
                  title="Print official invoice voucher"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={14} /> Print
                </button>
                {initialInvoice && status !== 'paid' && (
                  <button
                    type="button"
                    className={`btn brass small ${isMarkingPaid ? 'btn-processing' : ''}`}
                    disabled={isMarkingPaid || isSubmitting}
                    onClick={async () => {
                      setIsMarkingPaid(true);
                      await new Promise((r) => setTimeout(r, 450));
                      await markPlatformInvoicePaid(initialInvoice.id, 'Bank Wire / Admin Reconciled');
                      setStatus('paid');
                      setIsMarkingPaid(false);
                      showToast(`Invoice ${initialInvoice.id} marked as PAID.`);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle size={14} /> Mark as Paid
                  </button>
                )}
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setActiveTab('edit')}
                  title="Edit invoice parameters"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit3 size={14} /> Edit
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setActiveTab('preview')}
                  title="View document"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Eye size={14} /> View Document
                </button>
              </>
            )}
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Close"
              style={{ marginLeft: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* TAB 1: EDIT CONTROLS TAB */}
        {activeTab === 'edit' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#FAFAF7' }}>
            <div style={{ maxWidth: '1060px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              {/* SECTION 1: INVOICE IDENTIFIERS & TIMELINE */}
              <div className="panel" style={{ margin: 0 }}>
                <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} color="var(--brass)" />
                    <b style={{ fontSize: '14px' }}>1. SaaS Invoice Identifiers & Schedule</b>
                  </div>
                </div>
                <div className="panel-body" style={{ padding: '16px 18px' }}>
                  <div className="grid grid-4" style={{ gap: '14px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Invoice Number / ID</label>
                      <input
                        type="text"
                        value={invoiceId}
                        onChange={(e) => setInvoiceId(e.target.value)}
                        placeholder="e.g. PINV-829101"
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Status</label>
                      <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                        <option value="issued">Issued / Due</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="void">Void</option>
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Issue Date</label>
                      <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Payment Due Date</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-2" style={{ gap: '14px', marginTop: '12px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Subscription Period Start</label>
                      <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Subscription Period End</label>
                      <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: ISSUER & BILLED TO */}
              <div className="grid grid-2" style={{ gap: '16px' }}>
                {/* Platform Issuer Info */}
                <div className="panel" style={{ margin: 0 }}>
                  <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building size={16} color="var(--brass)" />
                      <b style={{ fontSize: '14px' }}>2. Platform Issuer (Propithub HQ)</b>
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '16px 18px' }}>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label style={{ color: 'var(--brass)', fontWeight: 600 }}>Platform Tax Registration / EIN No.</label>
                      <input
                        type="text"
                        value={issuerTaxNo}
                        onChange={(e) => setIssuerTaxNo(e.target.value)}
                        placeholder="e.g. US-EIN: 84-2918472"
                      />
                    </div>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label>Registered Corporate Office Address</label>
                      <input
                        type="text"
                        value={issuerAddress}
                        onChange={(e) => setIssuerAddress(e.target.value)}
                      />
                    </div>
                    <div className="row">
                      <div className="field" style={{ margin: 0 }}>
                        <label>Support Phone</label>
                        <input type="text" value={issuerPhone} onChange={(e) => setIssuerPhone(e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Billing Email</label>
                        <input type="email" value={issuerEmail} onChange={(e) => setIssuerEmail(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billed To Owner */}
                <div className="panel" style={{ margin: 0 }}>
                  <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={16} color="var(--brass)" />
                      <b style={{ fontSize: '14px' }}>3. Billed To (Property Owner Account)</b>
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '16px 18px' }}>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label>Select Registered Owner</label>
                      <select value={targetOwnerId} onChange={(e) => handleOwnerChange(e.target.value)}>
                        {ownerUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName || u.email} ({u.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="row" style={{ marginBottom: '10px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Owner Name</label>
                        <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Owner Email</label>
                        <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
                      </div>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Owner GSTIN / Tax Identification No. (Optional)</label>
                      <input
                        type="text"
                        value={ownerTaxNo}
                        onChange={(e) => setOwnerTaxNo(e.target.value)}
                        placeholder="e.g. GSTIN / Tax ID of owner business"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: SUBSCRIPTION PLAN & CHARGES */}
              <div className="panel" style={{ margin: 0 }}>
                <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DollarSign size={16} color="var(--brass)" />
                    <b style={{ fontSize: '14px' }}>4. Subscription Tier & Financial Charges</b>
                  </div>
                </div>
                <div className="panel-body" style={{ padding: '16px 18px' }}>
                  <div className="grid grid-3" style={{ gap: '14px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Subscription Tier</label>
                      <select value={selectedPlanId} onChange={(e) => handlePlanChange(e.target.value)}>
                        {state.plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {getCurrencySymbol((p as any).currency || currency)}{p.price}/mo
                          </option>
                        ))}
                        <option value="custom">Custom Billing Agreement</option>
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Subscription License Fee ({currencySymbol})</label>
                      <input
                        type="number"
                        min="0"
                        value={amount === 0 ? '' : amount}
                        placeholder="0"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setAmount(cleaned === '' ? 0 : Number(cleaned));
                        }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Cloud Infrastructure Tax ({currencySymbol})</label>
                      <input
                        type="number"
                        min="0"
                        value={tax === 0 ? '' : tax}
                        placeholder="0"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setTax(cleaned === '' ? 0 : Number(cleaned));
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ background: '#F4F6F4', padding: '14px 18px', borderRadius: '4px', marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b>Total Billed:</b> {currencySymbol}{amount} + {currencySymbol}{tax} Tax
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>
                      Total Due: <span style={{ color: 'var(--brass)' }}>{currencySymbol}{total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: TERMS & CONDITIONS (T&C) & LEGAL */}
              <div className="panel" style={{ margin: 0 }}>
                <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={16} color="var(--brass)" />
                    <b style={{ fontSize: '14px' }}>5. Master SaaS Terms & Conditions (T&C)</b>
                  </div>
                </div>
                <div className="panel-body" style={{ padding: '16px 18px' }}>
                  <div className="field" style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontWeight: 600, margin: 0 }}>SaaS License Terms & Conditions (T&C Clauses on Voucher)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={includeTerms}
                          onChange={(e) => setIncludeTerms(e.target.checked)}
                          style={{ width: '15px', height: '15px', accentColor: 'var(--brass)', cursor: 'pointer' }}
                        />
                        Show on invoice
                      </label>
                    </div>
                    <textarea
                      rows={5}
                      value={termsAndConditions}
                      onChange={(e) => setTermsAndConditions(e.target.value)}
                      style={{ fontSize: '13px', lineHeight: '1.5', resize: 'vertical' }}
                    />
                  </div>

                  <div className="grid grid-2" style={{ gap: '14px', marginBottom: '14px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Platform Authorized Signatory</label>
                      <input
                        type="text"
                        value={signatoryName}
                        onChange={(e) => setSignatoryName(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Signatory role / title</label>
                      <input
                        type="text"
                        value={signatoryRole}
                        onChange={(e) => setSignatoryRole(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>License Notes & Remarks</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Transition to Preview Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setActiveTab('preview')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Eye size={16} /> View Document Preview <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="btn brass"
                  onClick={() => handleSaveInvoice()}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <CheckCircle size={16} /> {initialInvoice ? 'Save Changes' : 'Issue Platform Invoice'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: OFFICIAL DOCUMENT PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '32px 20px',
              background: '#EEF0EC',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {/* Official Printable A4 Platform Invoice Sheet */}
            <div
              className="invoice-sheet"
              id="printable-platform-invoice"
              style={{
                width: '100%',
                maxWidth: '780px',
                background: 'var(--surface)',
                color: '#111827',
                padding: '44px 40px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                ['--ink' as any]: '#111827',
                ['--ink-soft' as any]: '#4B5563',
                ['--surface-sunken' as any]: '#F8F9FB',
                ['--line' as any]: '#E5E7EB',
                ['--line-strong' as any]: '#D1D5DB',
              }}
            >
              <PlatformInvoiceDocument invoice={builtInvoice} />
            </div>
          </div>
        )}

        {/* Bottom Bar: Shown only during Edit mode */}
        {activeTab === 'edit' && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              padding: '12px 24px',
              background: 'var(--surface)',
              borderTop: '1px solid var(--line)',
              gap: '10px',
            }}
          >
            <button
              type="button"
              className="btn secondary"
              disabled={isSubmitting || isMarkingPaid}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn brass ${isSubmitting ? 'btn-processing' : ''}`}
              disabled={isSubmitting || isMarkingPaid}
              onClick={() => handleSaveInvoice()}
            >
              <ButtonProcessing
                loading={isSubmitting}
                loadingText={initialInvoice ? 'Saving Changes...' : 'Issuing Invoice...'}
                defaultText={initialInvoice ? 'Save Changes' : 'Issue Platform Invoice'}
                icon={<CheckCircle size={15} style={{ marginRight: '4px' }} />}
              />
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
