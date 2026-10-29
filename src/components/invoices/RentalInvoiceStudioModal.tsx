import React, { useState, useEffect } from 'react';
import { Invoice } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { generateInvoiceId, generateDepositVoucherId, generateReceiptId } from '../../lib/idGenerators';
import { RentalInvoiceDocument } from './RentalInvoiceDocument';
import {
  Plus,
  Trash2,
  Printer,
  Download,
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
  Percent,
} from 'lucide-react';
import { getDaysFromNowString, getTodayDateString } from '../../lib/dates';
import { ButtonProcessing } from '../common/Spinner';
import { DEFAULT_CURRENCY , DEFAULT_CURRENCY_SYMBOL } from '../../lib/currencyService';
import { downloadSingleInvoicePDF } from '../../lib/pdf';

interface RentalInvoiceStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialInvoice?: Invoice | null;
  initialMode?: 'create' | 'edit' | 'preview';
  initialInvoiceType?: 'rent' | 'deposit' | 'utility' | 'maintenance' | 'late_fee';
  ownerId: string;
}

export const DEFAULT_RENT_TERMS = `1. Payment is due strictly on or before the due date specified on this invoice.
2. Cheques / online NEFT / RTGS / UPI transfers are subject to successful bank clearance.
3. Late payments will incur a recurring late fee penalty as specified in the lease agreement.
4. Any billing discrepancies must be reported to the landlord office or property manager within 3 days.
5. This is an official tax invoice issued pursuant to the executed residential/commercial lease agreement.`;

export const DEFAULT_DEPOSIT_TERMS = `1. Security Deposit Classification: 100% Refundable Security Deposit held in fiduciary trust custody by Landlord for the duration of the tenancy agreement.
2. Custody & Non-Income Status: Security deposit funds remain non-commingled trust assets and do not constitute taxable rental income or property revenue.
3. Move-Out Inspection & Deductions: Following lease expiration and key surrender, a joint walkthrough inspection shall be conducted. Deductions are strictly limited to verified unpaid rent arrears, utility charges, or damage repair exceeding standard wear and tear.
4. Refund Disbursement: Net refundable balance shall be remitted to tenant within 14 business days of checkout clearance.
5. Official Deposit Receipt: Digitally generated and cryptographically tracked pursuant to State Tenancy Regulations.`;

export const RentalInvoiceStudioModal: React.FC<RentalInvoiceStudioModalProps> = ({
  isOpen,
  onClose,
  initialInvoice,
  initialMode = 'create',
  initialInvoiceType,
  ownerId,
}) => {
  const { state, updateState, saveInvoice, markInvoicePaid, showToast } = useAppData();
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  const myUnits = state.units.filter((u) => u.ownerId === ownerId || !u.ownerId);
  const ownerSettings = state.ownerSettings[ownerId];
  const ownerBank = (ownerSettings?.paymentMethods as any)?.bank || state.ownerPaymentMethods.bank;
  const ownerUpi = (ownerSettings?.paymentMethods as any)?.upi || state.ownerPaymentMethods.upi;

  // Active Tab: 'edit' or 'preview'
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>(
    initialMode === 'preview' ? 'preview' : 'edit'
  );

  // 1. Invoice Identification & Dates
  const [invoiceId, setInvoiceId] = useState('');
  const [status, setStatus] = useState<Invoice['status']>('sent');
  const [invoiceType, setInvoiceType] = useState<'rent' | 'deposit' | 'utility' | 'maintenance' | 'late_fee'>('rent');
  const [documentTitle, setDocumentTitle] = useState('TAX INVOICE');
  const [custodyMechanism, setCustodyMechanism] = useState('Held in Landlord Trust Ledger with Platform Verification');
  const [depositClassification, setDepositClassification] = useState('100% Refundable Security Deposit');
  const [refundTimelineDays, setRefundTimelineDays] = useState(14);
  const [issueDate, setIssueDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState(getDaysFromNowString(5));
  const [billingPeriodStart, setBillingPeriodStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [billingPeriodEnd, setBillingPeriodEnd] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });

  const defaultTmpl = initialInvoiceType === 'deposit'
    ? (ownerSettings?.depositTemplate || ownerSettings?.invoiceTemplate)
    : ownerSettings?.invoiceTemplate;

  // 2. Issuer (Landlord / Billed From)
  const [issuerName, setIssuerName] = useState(defaultTmpl?.issuerName || 'Property Management');
  const [issuerTaxNo, setIssuerTaxNo] = useState(defaultTmpl?.issuerTaxNo || '');
  const [issuerAddress, setIssuerAddress] = useState(defaultTmpl?.issuerAddress || '');
  const [issuerPhone, setIssuerPhone] = useState(defaultTmpl?.issuerPhone || '');
  const [issuerEmail, setIssuerEmail] = useState(defaultTmpl?.issuerEmail || '');

  // 3. Recipient (Resident / Billed To)
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [tenantTaxNo, setTenantTaxNo] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');

  // 4. Line Items
  const [items, setItems] = useState<Array<{ description: string; amount: number }>>([
    { description: 'Monthly Rent', amount: 25000 },
  ]);

  // 5. Taxes & Discounts
  const [enableTax, setEnableTax] = useState(false);
  const [taxPercent, setTaxPercent] = useState(state.taxSettings.percent || 18);
  const [taxLabel, setTaxLabel] = useState(state.taxSettings.label || 'GST');
  const [discount, setDiscount] = useState<number>(0);
  const [lateFeeApplied, setLateFeeApplied] = useState<number>(0);

  // 6. Bank & Remittance Details
  const [bankName, setBankName] = useState(ownerBank?.bankName || '');
  const [accountName, setAccountName] = useState(ownerBank?.accountName || '');
  const [accountNumber, setAccountNumber] = useState(ownerBank?.accountNumber || '');
  const [ifscOrRouting, setIfscOrRouting] = useState(ownerBank?.routing || '');
  const [upiId, setUpiId] = useState(ownerUpi?.upiId || '');

  // 7. Terms & Conditions (T&C) & Signatory
  const [termsAndConditions, setTermsAndConditions] = useState(DEFAULT_RENT_TERMS);
  const [notes, setNotes] = useState('Thank you for your prompt tenancy settlement.');
  const [signatoryName, setSignatoryName] = useState('Authorized Property Manager');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialInvoice) {
      setInvoiceId(initialInvoice.id);
      setStatus(initialInvoice.status);
      const isDep = initialInvoice.invoiceType === 'deposit' || initialInvoice.type === 'deposit';
      setInvoiceType(initialInvoice.invoiceType || (isDep ? 'deposit' : 'rent'));
      setDocumentTitle(
        initialInvoice.documentTitle || (isDep ? 'SECURITY DEPOSIT CUSTODY VOUCHER' : 'TAX INVOICE')
      );
      setCustodyMechanism(
        initialInvoice.custodyMechanism || 'Held in Landlord Trust Ledger with Platform Verification'
      );
      setDepositClassification(
        initialInvoice.depositClassification || '100% Refundable Security Deposit'
      );
      setRefundTimelineDays(initialInvoice.refundTimelineDays || 14);

      setIssueDate(initialInvoice.issueDate ? initialInvoice.issueDate.split('T')[0] : getTodayDateString());
      setDueDate(initialInvoice.due || getDaysFromNowString(5));
      setBillingPeriodStart(initialInvoice.billingPeriodStart ? initialInvoice.billingPeriodStart.split('T')[0] : billingPeriodStart);
      setBillingPeriodEnd(initialInvoice.billingPeriodEnd ? initialInvoice.billingPeriodEnd.split('T')[0] : billingPeriodEnd);

      setIssuerName(initialInvoice.issuerName || defaultTmpl?.issuerName || 'Property Management');
      setIssuerTaxNo(initialInvoice.issuerTaxNo || defaultTmpl?.issuerTaxNo || '');
      setIssuerAddress(initialInvoice.issuerAddress || defaultTmpl?.issuerAddress || '');
      setIssuerPhone(initialInvoice.issuerPhone || defaultTmpl?.issuerPhone || '');
      setIssuerEmail(initialInvoice.issuerEmail || defaultTmpl?.issuerEmail || '');

      setTenantName(initialInvoice.tenant || 'Resident');
      setTenantId(initialInvoice.tenantId || '');
      setUnitNumber(initialInvoice.unit || '');
      setPropertyName(initialInvoice.propertyName || '');
      setSelectedUnitId(initialInvoice.unit || '');
      setTenantTaxNo(initialInvoice.tenantTaxNo || '');
      setTenantPhone(initialInvoice.tenantPhone || '');
      setTenantEmail(initialInvoice.tenantEmail || '');

      if (initialInvoice.items && initialInvoice.items.length > 0) {
        setItems(initialInvoice.items);
      } else {
        setItems([{ description: isDep ? `Refundable Security Deposit — Unit ${initialInvoice.unit || 'Premises'}` : `${initialInvoice.invoiceType || 'Rental'} Charge`, amount: initialInvoice.amount }]);
      }

      setEnableTax((initialInvoice.tax || 0) > 0);
      if (initialInvoice.tax > 0 && initialInvoice.amount > 0) {
        const calculatedPercent = Math.round((initialInvoice.tax / initialInvoice.amount) * 100);
        setTaxPercent(calculatedPercent || 18);
      }
      setDiscount(initialInvoice.discount || 0);
      setLateFeeApplied(initialInvoice.lateFeeApplied || 0);

      if (initialInvoice.bankDetails) {
        setBankName(initialInvoice.bankDetails.bankName || bankName);
        setAccountName(initialInvoice.bankDetails.accountName || accountName);
        setAccountNumber(initialInvoice.bankDetails.accountNumber || accountNumber);
        setIfscOrRouting(initialInvoice.bankDetails.ifscOrRouting || ifscOrRouting);
        setUpiId(initialInvoice.bankDetails.upiId || upiId);
      }

      setCurrency(initialInvoice.currency || DEFAULT_CURRENCY_SYMBOL);
      setTermsAndConditions(initialInvoice.termsAndConditions || (isDep ? DEFAULT_DEPOSIT_TERMS : DEFAULT_RENT_TERMS));
      setNotes(initialInvoice.notes || 'Thank you for your prompt tenancy settlement.');
      setSignatoryName(initialInvoice.signatoryName || 'Authorized Property Manager');
      setSignatureUrl(initialInvoice.signatureUrl || ownerSettings?.invoiceTemplate?.signatureUrl || '');

      setActiveTab(initialMode === 'edit' ? 'edit' : 'preview');
    } else {
      const initType = initialInvoiceType || 'rent';
      const isDep = initType === 'deposit';

      const newId = isDep ? generateDepositVoucherId() : generateInvoiceId();
      setInvoiceId(newId);
      setStatus('sent');
      setInvoiceType(initType);
      const effTemplate = isDep ? (ownerSettings?.depositTemplate || ownerSettings?.invoiceTemplate) : ownerSettings?.invoiceTemplate;

      setDocumentTitle(
        effTemplate?.documentTitle || (isDep ? 'SECURITY DEPOSIT VOUCHER' : 'TAX INVOICE')
      );
      setCustodyMechanism(
        effTemplate?.custodyMechanism || 'Held in Landlord Trust Ledger with Platform Verification'
      );
      setDepositClassification(
        effTemplate?.depositClassification || '100% Refundable Security Deposit'
      );
      setRefundTimelineDays(
        effTemplate?.refundTimelineDays || 14
      );
      const matchingUnit = myUnits.find((u) => u.id === selectedUnitId || u.unitNumber === selectedUnitId);
      if (matchingUnit?.currency) setCurrency(matchingUnit.currency);
      if (effTemplate?.issuerName) setIssuerName(effTemplate.issuerName);
      if (effTemplate?.issuerTaxNo) setIssuerTaxNo(effTemplate.issuerTaxNo);
      if (effTemplate?.issuerAddress) setIssuerAddress(effTemplate.issuerAddress);
      if (effTemplate?.issuerPhone) setIssuerPhone(effTemplate.issuerPhone);
      if (effTemplate?.issuerEmail) setIssuerEmail(effTemplate.issuerEmail);
      if (effTemplate?.bankName) setBankName(effTemplate.bankName);
      if (effTemplate?.accountName) setAccountName(effTemplate.accountName);
      if (effTemplate?.accountNumber) setAccountNumber(effTemplate.accountNumber);
      if (effTemplate?.ifscOrRouting) setIfscOrRouting(effTemplate.ifscOrRouting);
      if (effTemplate?.upiId) setUpiId(effTemplate.upiId);

      setIssueDate(getTodayDateString());
      setDueDate(getDaysFromNowString(5));

      const defaultUnit = myUnits.find((u) => u.tenant) || myUnits[0];
      if (defaultUnit) {
        setSelectedUnitId(defaultUnit.id);
        const tName = defaultUnit.tenant || 'Resident';
        setTenantName(tName);
        setTenantId(defaultUnit.currentTenantId || '');
        setUnitNumber(defaultUnit.unitNumber || defaultUnit.id);
        setPropertyName(defaultUnit.propertyName || '');

        const matchedTenant = state.tenants.find((t) => t.id === defaultUnit.currentTenantId || t.name === tName);
        if (matchedTenant) {
          setTenantPhone(matchedTenant.phone || '');
          setTenantEmail(matchedTenant.email || '');
        }

        setItems([
          {
            description: isDep
              ? `Refundable Security Deposit — Unit ${defaultUnit.unitNumber || defaultUnit.id}`
              : `Monthly Rent — Unit ${defaultUnit.unitNumber || defaultUnit.id}`,
            amount: isDep
              ? (defaultUnit.deposit || (defaultUnit.rent ? defaultUnit.rent * 2 : 0))
              : (defaultUnit.rent || 0),
          },
        ]);
      } else {
        setSelectedUnitId('');
        setTenantName('');
        setTenantId('');
        setUnitNumber('');
        setPropertyName('');
        setItems([
          {
            description: isDep ? 'Refundable Security Deposit' : 'Monthly Rent',
            amount: 0,
          },
        ]);
      }

      setEnableTax(isDep ? false : (state.taxSettings.percent > 0));
      setTaxPercent(state.taxSettings.percent || 18);
      setTaxLabel(state.taxSettings.label || 'GST');
      setDiscount(0);
      setLateFeeApplied(0);
      setTermsAndConditions(
        effTemplate?.termsAndConditions || (isDep ? DEFAULT_DEPOSIT_TERMS : DEFAULT_RENT_TERMS)
      );
      setNotes(
        effTemplate?.notes || (isDep ? 'Funds are non-commingled, non-taxable security deposits held until lease conclusion and damage walkthrough verification.' : 'Thank you for your prompt tenancy settlement.')
      );
      setSignatoryName(effTemplate?.signatoryName || ownerSettings?.invoiceTemplate?.signatoryName || 'Authorized Property Manager');
      setSignatureUrl(effTemplate?.signatureUrl || ownerSettings?.invoiceTemplate?.signatureUrl || '');
      setActiveTab('edit');
    }
  }, [isOpen, initialInvoice, initialMode, initialInvoiceType, ownerSettings]);

  if (!isOpen) return null;

  // Handle unit selection change in editor
  const handleUnitChange = (unitId: string) => {
    setSelectedUnitId(unitId);
    const unitObj = myUnits.find((u) => u.id === unitId);
    if (unitObj) {
      const tName = unitObj.tenant || 'Resident';
      setTenantName(tName);
      setTenantId(unitObj.currentTenantId || '');
      setUnitNumber(unitObj.unitNumber || unitObj.id);
      setPropertyName(unitObj.propertyName || '');

      const matchedTenant = state.tenants.find((t) => t.id === unitObj.currentTenantId || t.name === tName);
      if (matchedTenant) {
        setTenantPhone(matchedTenant.phone || '');
        setTenantEmail(matchedTenant.email || '');
      }

      if (items.length === 1 && (items[0].description.includes('Monthly Rent') || items[0].description === 'Monthly Rent')) {
        setItems([
          {
            description: `Monthly Rent — Unit ${unitObj.unitNumber || unitObj.id}`,
            amount: unitObj.rent || items[0].amount || 0,
          },
        ]);
      }
    }
  };

  // Handle Category Change (Rent vs Deposit vs Utilities)
  const handleCategoryChange = (cat: 'rent' | 'deposit' | 'utility' | 'maintenance' | 'late_fee') => {
    setInvoiceType(cat);
    if (cat === 'deposit') {
      setDocumentTitle('SECURITY DEPOSIT CUSTODY VOUCHER');
      if (termsAndConditions === DEFAULT_RENT_TERMS || !termsAndConditions.trim()) {
        setTermsAndConditions(DEFAULT_DEPOSIT_TERMS);
      }
      setEnableTax(false);
      if (items.length === 1 && (items[0].description.includes('Monthly Rent') || items[0].description === 'Monthly Rent')) {
        const selectedUnitObj = myUnits.find((u) => u.id === selectedUnitId);
        setItems([
          {
            description: `Refundable Security Deposit — Unit ${unitNumber || selectedUnitId || 'Premises'}`,
            amount: selectedUnitObj?.deposit || (items[0].amount ? items[0].amount * 2 : 0),
          },
        ]);
      }
      if (invoiceId.startsWith('INV-')) {
        setInvoiceId(invoiceId.replace('INV-', 'DEP-'));
      }
    } else if (cat === 'rent') {
      setDocumentTitle('TAX INVOICE');
      if (termsAndConditions === DEFAULT_DEPOSIT_TERMS || !termsAndConditions.trim()) {
        setTermsAndConditions(ownerSettings?.invoiceTemplate?.termsAndConditions || DEFAULT_RENT_TERMS);
      }
      if (items.length === 1 && items[0].description.includes('Security Deposit')) {
        const selectedUnitObj = myUnits.find((u) => u.id === selectedUnitId);
        setItems([
          {
            description: `Monthly Rent — Unit ${unitNumber || selectedUnitId || 'Premises'}`,
            amount: selectedUnitObj?.rent || (items[0].amount ? Math.round(items[0].amount / 2) : 0),
          },
        ]);
      }
      if (invoiceId.startsWith('DEP-')) {
        setInvoiceId(invoiceId.replace('DEP-', 'INV-'));
      }
    } else if (cat === 'utility') {
      setDocumentTitle('UTILITY CHARGES INVOICE');
    } else if (cat === 'maintenance') {
      setDocumentTitle('MAINTENANCE & REPAIR VOUCHER');
    } else if (cat === 'late_fee') {
      setDocumentTitle('LATE FEE NOTICE & INVOICE');
    }
  };

  // Line Items Manipulation
  const handleAddItem = () => {
    setItems((prev) => [...prev, { description: 'Utility / Service Fee', amount: 1000 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      showToast('An invoice must have at least one line item.');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'description' | 'amount', value: any) => {
    const parsedVal = field === 'amount' ? (value === '' ? 0 : Number(String(value).replace(/^0+(?=\d)/, ''))) : value;
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: parsedVal } : item))
    );
  };

  // Calculations
  const subtotal = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const taxAmount = enableTax ? Math.round(subtotal * (taxPercent / 100)) : 0;
  const grandTotal = Math.max(0, subtotal + taxAmount + (Number(lateFeeApplied) || 0) - (Number(discount) || 0));

  // Save invoice action
  const handleSaveInvoice = async (targetStatus?: 'draft' | 'sent' | 'paid') => {
    const finalStatus = targetStatus || status;
    const cleanTenant = tenantName.trim();

    if (!cleanTenant || cleanTenant.toLowerCase() === 'resident') {
      showToast('Please enter the recipient tenant’s full verified name.');
      return;
    }
    if (finalStatus !== 'draft') {
      if (!issuerName.trim()) {
        showToast('Please specify the landlord / property manager billing name.');
        return;
      }
      if (!issuerEmail.trim() || !issuerEmail.includes('@')) {
        showToast('Please specify a valid landlord contact email address.');
        return;
      }
    }
    if (items.length === 0 || subtotal <= 0) {
      showToast('Please enter valid line items and amounts.');
      return;
    }

    setIsSavingInvoice(true);
    await new Promise((r) => setTimeout(r, 450));

    const invoiceToSave: Invoice = {
      id: invoiceId,
      ownerId,
      tenant: tenantName,
      tenantId: tenantId || '',
      unit: unitNumber || selectedUnitId || 'Unit',
      propertyName: propertyName || '',
      propertyId: myUnits.find((u) => u.id === selectedUnitId)?.propertyId || '',
      invoiceType,
      currency: currency || DEFAULT_CURRENCY,
      documentTitle,
      custodyMechanism: invoiceType === 'deposit' ? custodyMechanism : undefined,
      depositClassification: invoiceType === 'deposit' ? depositClassification : undefined,
      refundTimelineDays: invoiceType === 'deposit' ? Number(refundTimelineDays) || 14 : undefined,
      amount: subtotal,
      tax: taxAmount,
      total: grandTotal,
      due: dueDate,
      status: finalStatus,
      issueDate: new Date(issueDate).toISOString(),
      items,
      notes,
      issuerName,
      issuerTaxNo,
      issuerAddress,
      issuerPhone,
      issuerEmail,
      tenantTaxNo,
      tenantPhone,
      tenantEmail,
      billingPeriodStart: new Date(billingPeriodStart).toISOString(),
      billingPeriodEnd: new Date(billingPeriodEnd).toISOString(),
      termsAndConditions,
      bankDetails: {
        bankName,
        accountName,
        accountNumber,
        ifscOrRouting,
        upiId,
      },
      signatoryName,
      signatureUrl: signatureUrl || undefined,
      discount,
      lateFeeApplied: Number(lateFeeApplied) || 0,
      ...(initialInvoice?.lateFeeWaived !== undefined ? { lateFeeWaived: initialInvoice.lateFeeWaived } : {}),
      ...(initialInvoice?.lateFeeWaivedReason ? { lateFeeWaivedReason: initialInvoice.lateFeeWaivedReason } : {}),
      ...(initialInvoice?.lateFeeCalculation ? { lateFeeCalculation: initialInvoice.lateFeeCalculation } : {}),
      ...(finalStatus === 'paid' && !initialInvoice?.paidAt
        ? {
            paidAt: new Date().toISOString(),
            paymentMethodUsed: 'Direct Settlement / Reconciled',
            receiptNumber: generateReceiptId(),
          }
        : initialInvoice?.paidAt
        ? {
            paidAt: initialInvoice.paidAt,
            paymentMethodUsed: initialInvoice.paymentMethodUsed,
            receiptNumber: initialInvoice.receiptNumber,
          }
        : {}),
    };

    await saveInvoice(invoiceToSave);

    if (finalStatus !== 'draft' && tenantId) {
      const notif = {
        id: `notif_${Date.now()}`,
        userId: tenantId,
        title: `New ${invoiceType === 'deposit' ? 'Security Deposit' : invoiceType === 'rent' ? 'Rent' : 'Rental'} Invoice Issued`,
        body: `Invoice ${invoiceId} for ${currency || DEFAULT_CURRENCY_SYMBOL}${grandTotal.toLocaleString('en-IN')} has been issued for Unit ${unitNumber || selectedUnitId || 'Unit'}. Due on ${dueDate}.`,
        link: '/tenant/payments',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      updateState((prev) => ({
        ...prev,
        notifications: [...(prev.notifications || []), notif],
      }));
    }

    setIsSavingInvoice(false);
    showToast(`Invoice ${invoiceId} successfully saved & synced.`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="invoice-studio-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Rental Invoice Studio"
        style={{ width: '96vw', maxWidth: '1180px', height: '92vh', maxHeight: '920px' }}
      >
        {/* Modal Top Header & Dedicated Tabs */}
        <div
          className="no-print"
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
              {initialInvoice ? `Invoice ${invoiceId}` : 'Generate Invoice'}
            </span>
            <span
              className={`invoice-stamp ${
                status === 'paid' ? 'paid' : status === 'sent' ? 'sent' : status === 'pending_confirmation' ? 'pending' : status === 'overdue' ? 'overdue' : 'draft'
              }`}
            >
              {status === 'pending_confirmation' ? 'PENDING CONFIRMATION' : status.toUpperCase()}
            </span>
          </div>

          {/* DEDICATED PRIMARY TABS: [Edit Controls] vs [Document Preview] */}
          <div style={{ display: 'flex', background: 'var(--surface-sunken)', padding: '4px', borderRadius: '6px', gap: '4px' }}>
            <button
              type="button"
              className={`btn small ${activeTab === 'edit' ? 'primary' : 'secondary'}`}
              style={{ border: 'none', padding: '7px 16px', fontWeight: activeTab === 'edit' ? 600 : 500 }}
              onClick={() => setActiveTab('edit')}
            >
              <Edit3 size={15} style={{ marginRight: '6px' }} /> 1. Edit & Configure Details
            </button>
            <button
              type="button"
              className={`btn small ${activeTab === 'preview' ? 'primary' : 'secondary'}`}
              style={{ border: 'none', padding: '7px 16px', fontWeight: activeTab === 'preview' ? 600 : 500 }}
              onClick={() => setActiveTab('preview')}
            >
              <Eye size={15} style={{ marginRight: '6px' }} /> 2. Official Document Preview & Voucher
            </button>
          </div>

          {/* Quick Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => window.print()}
              title="Print official invoice voucher"
            >
              <Printer size={15} style={{ marginRight: '4px' }} /> Print / PDF
            </button>
            <button
              type="button"
              className="btn brass small"
              onClick={() => handleSaveInvoice()}
            >
              <CheckCircle size={15} style={{ marginRight: '4px' }} />
              {initialInvoice ? 'Save Changes' : 'Save & Dispatch'}
            </button>
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
                    <b style={{ fontSize: '14px' }}>1. Invoice Identifiers & Schedule</b>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Configure invoice tracking and billing cycle</span>
                </div>
                <div className="panel-body" style={{ padding: '16px 18px' }}>
                  <div className="grid grid-4" style={{ gap: '14px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Invoice Number / Voucher ID</label>
                      <input
                        type="text"
                        value={invoiceId}
                        onChange={(e) => setInvoiceId(e.target.value)}
                        placeholder="e.g. INV-2026-001 or DEP-2026-001"
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Document Category</label>
                      <select value={invoiceType} onChange={(e) => handleCategoryChange(e.target.value as any)}>
                        <option value="rent">Monthly Rent</option>
                        <option value="deposit">🛡️ Security Deposit</option>
                        <option value="utility">Electricity / Water Utilities</option>
                        <option value="maintenance">Maintenance & Repairs</option>
                        <option value="late_fee">Late Fee Penalty</option>
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Status</label>
                      <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                        <option value="draft">Draft (Unsent)</option>
                        <option value="sent">Sent / Due</option>
                        {initialInvoice && (
                          <>
                            <option value="pending_confirmation">Pending Confirmation (Offline Proof)</option>
                            <option value="overdue">Overdue</option>
                            <option value="cancelled">Cancelled</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Issue Date</label>
                      <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-2" style={{ gap: '14px', marginTop: '12px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label>Document Header Title</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ fontSize: '10px', padding: '1px 6px' }}
                            onClick={() => setDocumentTitle('TAX INVOICE')}
                          >
                            Tax Invoice
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ fontSize: '10px', padding: '1px 6px' }}
                            onClick={() => setDocumentTitle('SECURITY DEPOSIT CUSTODY VOUCHER')}
                          >
                            Deposit Voucher
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ fontSize: '10px', padding: '1px 6px' }}
                            onClick={() => setDocumentTitle('RENTAL RECEIPT')}
                          >
                            Receipt
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={documentTitle}
                        onChange={(e) => setDocumentTitle(e.target.value)}
                        placeholder="e.g. TAX INVOICE, SECURITY DEPOSIT CUSTODY VOUCHER"
                      />
                    </div>

                    <div className="field" style={{ margin: 0 }}>
                      <label>Payment Due Date</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-2" style={{ gap: '14px', marginTop: '12px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Billing Period Start</label>
                      <input type="date" value={billingPeriodStart} onChange={(e) => setBillingPeriodStart(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Billing Period End</label>
                      <input type="date" value={billingPeriodEnd} onChange={(e) => setBillingPeriodEnd(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>


              {/* SECTION 2: BILLED FROM (LANDLORD / TAX NO) & BILLED TO (TENANT) */}
              <div className="grid grid-2" style={{ gap: '16px' }}>
                {/* Billed From (Landlord) */}
                <div className="panel" style={{ margin: 0 }}>
                  <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building size={16} color="var(--brass)" />
                      <b style={{ fontSize: '14px' }}>2. Billed From (Landlord / Issuer)</b>
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '16px 18px' }}>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label>Landlord / Business Legal Name</label>
                      <input
                        type="text"
                        value={issuerName}
                        onChange={(e) => setIssuerName(e.target.value)}
                        placeholder="e.g. Skyline Real Estate Management"
                      />
                    </div>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label style={{ color: 'var(--brass)', fontWeight: 600 }}>Tax ID / GSTIN Registration No.</label>
                      <input
                        type="text"
                        value={issuerTaxNo}
                        onChange={(e) => setIssuerTaxNo(e.target.value)}
                        placeholder="e.g. GSTIN: 36AAAAA0000A1Z5 or Tax ID"
                      />
                    </div>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label>Registered Office Address</label>
                      <input
                        type="text"
                        value={issuerAddress}
                        onChange={(e) => setIssuerAddress(e.target.value)}
                        placeholder="e.g. Level 4, Financial Tower, City"
                      />
                    </div>
                    <div className="row">
                      <div className="field" style={{ margin: 0 }}>
                        <label>Contact Phone</label>
                        <input type="text" value={issuerPhone} onChange={(e) => setIssuerPhone(e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Contact Email</label>
                        <input type="email" value={issuerEmail} onChange={(e) => setIssuerEmail(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billed To (Tenant) */}
                <div className="panel" style={{ margin: 0 }}>
                  <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={16} color="var(--brass)" />
                      <b style={{ fontSize: '14px' }}>3. Billed To (Resident / Tenant)</b>
                    </div>
                  </div>
                  <div className="panel-body" style={{ padding: '16px 18px' }}>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label>Auto-Select From Managed Properties / Units</label>
                      <select value={selectedUnitId} onChange={(e) => handleUnitChange(e.target.value)}>
                        {myUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.unitNumber || u.id} — {u.propertyName || 'Property'} ({u.tenant || 'Vacant'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="row" style={{ marginBottom: '10px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tenant Full Name</label>
                        <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Unit / Suite No.</label>
                        <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
                      </div>
                    </div>
                    <div className="row" style={{ marginBottom: '10px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Property Name / Building</label>
                        <input type="text" value={propertyName} onChange={(e) => setPropertyName(e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tenant Tax ID / PAN (Optional)</label>
                        <input
                          type="text"
                          value={tenantTaxNo}
                          onChange={(e) => setTenantTaxNo(e.target.value)}
                          placeholder="e.g. ABCDE1234F"
                        />
                      </div>
                    </div>
                    <div className="row">
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tenant Phone</label>
                        <input type="text" value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Tenant Email</label>
                        <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: ITEMIZED CHARGES & FINANCIALS */}
              <div className="panel" style={{ margin: 0 }}>
                <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Percent size={16} color="var(--brass)" />
                    <b style={{ fontSize: '14px' }}>4. Itemized Charges, Taxes & Discounts</b>
                  </div>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={handleAddItem}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Plus size={14} /> Add Line Item
                  </button>
                </div>
                <div className="panel-body" style={{ padding: '16px 18px' }}>
                  {/* Line Items List */}
                  <div style={{ marginBottom: '16px' }}>
                    {items.map((item, index) => (
                      <div key={index} className="invoice-line-item-row" style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ flex: 4 }}>
                          <input
                            type="text"
                            placeholder="Item description (e.g., Monthly Rent - Oct 2026, Water Submeter Bill)"
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          />
                        </div>
                        <div style={{ flex: 1.5, position: 'relative' }}>
                          <span
                            style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: 'var(--ink-soft)',
                            }}
                          >
                            {currency || DEFAULT_CURRENCY_SYMBOL}
                          </span>
                          <input
                            type="number"
                            placeholder="0"
                            value={item.amount === 0 ? '' : item.amount}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                            style={{ paddingLeft: '24px' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: '6px 8px',
                          }}
                          title="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Taxes, Discounts, & Calculations Grid */}
                  <div className="grid grid-3" style={{ gap: '14px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                    <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={enableTax}
                          onChange={(e) => setEnableTax(e.target.checked)}
                        />
                        Apply Tax / GST
                      </label>
                      {enableTax && (
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={taxLabel}
                            onChange={(e) => setTaxLabel(e.target.value)}
                            placeholder="Label (GST)"
                            style={{ flex: 1 }}
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={taxPercent === 0 ? '' : taxPercent}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                              setTaxPercent(cleaned === '' ? 0 : Number(cleaned));
                            }}
                            placeholder="0"
                            style={{ width: '70px' }}
                          />
                          <span style={{ fontSize: '12px' }}>%</span>
                        </div>
                      )}
                    </div>

                    <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                      <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                        Discount / Concession ({currency || DEFAULT_CURRENCY_SYMBOL})
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={discount === 0 ? '' : discount}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setDiscount(cleaned === '' ? 0 : Number(cleaned));
                        }}
                        placeholder="0"
                      />
                    </div>

                    <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                      <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                        Late Fee Penalty / Surcharge ({currency || DEFAULT_CURRENCY_SYMBOL})
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={lateFeeApplied === 0 ? '' : lateFeeApplied}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          setLateFeeApplied(cleaned === '' ? 0 : Number(cleaned));
                        }}
                        placeholder="0"
                      />
                    </div>

                    <div style={{ background: '#F4F6F4', padding: '14px', borderRadius: '4px', border: '1px solid var(--line-strong)' }}>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                        Subtotal: {currency || DEFAULT_CURRENCY_SYMBOL}{subtotal.toLocaleString()}
                      </div>
                      {enableTax && (
                        <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                          Tax ({taxPercent}%): {currency || DEFAULT_CURRENCY_SYMBOL}{taxAmount.toLocaleString()}
                        </div>
                      )}
                      {discount > 0 && (
                        <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginBottom: '4px' }}>
                          Discount: -{currency || DEFAULT_CURRENCY_SYMBOL}{discount.toLocaleString()}
                        </div>
                      )}
                      {lateFeeApplied > 0 && (
                        <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginBottom: '4px' }}>
                          Late Fee Penalty: +{currency || DEFAULT_CURRENCY_SYMBOL}{lateFeeApplied.toLocaleString()}
                        </div>
                      )}
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', borderTop: '1px solid var(--line)', paddingTop: '6px' }}>
                        Total Due: <span style={{ color: 'var(--brass)' }}>{currency || DEFAULT_CURRENCY_SYMBOL}{grandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: PAYMENT REMITTANCE & BANK DETAILS */}
              <div className="panel" style={{ margin: 0 }}>
                <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={16} color="var(--brass)" />
                    <b style={{ fontSize: '14px' }}>5. Payment Remittance & Bank Settlement Details</b>
                  </div>
                </div>
                <div className="panel-body" style={{ padding: '16px 18px' }}>
                  <div className="grid grid-3" style={{ gap: '14px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Bank Institution</label>
                      <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Account Beneficiary Name</label>
                      <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Bank Account Number / IBAN</label>
                      <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-2" style={{ gap: '14px', marginTop: '12px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>IFSC Code / Routing / SWIFT</label>
                      <input type="text" value={ifscOrRouting} onChange={(e) => setIfscOrRouting(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>UPI ID / VPA (Instant Transfer)</label>
                      <input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 5: TERMS & CONDITIONS (T&C) & LEGAL NOTES */}
              <div className="panel" style={{ margin: 0 }}>
                <div className="panel-head" style={{ padding: '12px 18px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={16} color="var(--brass)" />
                    <b style={{ fontSize: '14px' }}>6. Terms & Conditions (T&C) & Legal Remittance</b>
                  </div>
                </div>
                <div className="panel-body" style={{ padding: '16px 18px' }}>
                  <div className="field" style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontWeight: 600, margin: 0 }}>Terms & Conditions (T&C Clauses on Document)</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          onClick={() => {
                            setTermsAndConditions(ownerSettings?.invoiceTemplate?.termsAndConditions || DEFAULT_RENT_TERMS);
                            showToast('Standard rent terms loaded.');
                          }}
                        >
                          📄 Load Rent Terms
                        </button>
                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          onClick={() => {
                            setTermsAndConditions(DEFAULT_DEPOSIT_TERMS);
                            showToast('Security deposit terms loaded.');
                          }}
                        >
                          🛡️ Load Deposit Terms
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={5}
                      value={termsAndConditions}
                      onChange={(e) => setTermsAndConditions(e.target.value)}
                      placeholder="Specify formal lease terms and payment conditions..."
                      style={{ fontSize: '13px', lineHeight: '1.5', resize: 'vertical' }}
                    />
                  </div>

                  <div className="grid grid-2" style={{ gap: '14px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Authorized Signatory Name & Designation</label>
                      <input
                        type="text"
                        value={signatoryName}
                        onChange={(e) => setSignatoryName(e.target.value)}
                        placeholder="e.g. Authorized Landlord / Estate Manager"
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Additional Notes / Remittance Remark</label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Thank you for your tenancy."
                      />
                    </div>
                  </div>

                  {/* Signature Upload */}
                  <div className="field" style={{ marginTop: '14px', marginBottom: 0 }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Official Signature / Digital Stamp</span>
                      {signatureUrl && (
                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          onClick={() => setSignatureUrl('')}
                        >
                          ✕ Remove Signature
                        </button>
                      )}
                    </label>

                    {signatureUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#FAF9F5', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                        <img
                          src={signatureUrl}
                          alt="Signature Preview"
                          style={{ maxHeight: '44px', maxWidth: '160px', objectFit: 'contain', background: '#fff', border: '1px dashed var(--line)', padding: '4px', borderRadius: '4px' }}
                        />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Authorized Signature Attached</div>
                          <label style={{ fontSize: '11.5px', color: 'var(--brass)', cursor: 'pointer', textDecoration: 'underline' }}>
                            Change Signature
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    setSignatureUrl(ev.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '14px',
                          border: '1.5px dashed var(--line-strong)',
                          borderRadius: '6px',
                          background: '#FAF9F5',
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          color: 'var(--ink-soft)',
                        }}
                      >
                        <span>✍️ Click to upload signature image (PNG, JPG, SVG)</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setSignatureUrl(ev.target?.result as string);
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
                  <CheckCircle size={16} /> {initialInvoice ? 'Save Changes' : 'Save & Issue Invoice'}
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
              padding: '32px 20px 64px',
              background: '#EEF0EC',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
            }}
          >
            {/* Document Controls Bar */}
            <div
              className="no-print"
              style={{
                width: '100%',
                maxWidth: '780px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setActiveTab('edit')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowLeft size={14} /> Back to Edit Details
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() =>
                    downloadSingleInvoicePDF({
                      id: invoiceId || 'INV-PREVIEW',
                      ownerId,
                      tenant: tenantName || 'Resident',
                      tenantId,
                      unit: unitNumber || 'Premises',
                      amount: subtotal,
                      tax: enableTax ? taxAmount : 0,
                      total: grandTotal,
                      due: dueDate,
                      status,
                      invoiceType,
                      issueDate,
                      propertyName,
                      tenantTaxNo,
                      tenantPhone,
                      tenantEmail,
                      billingPeriodStart,
                      billingPeriodEnd,
                      items,
                      discount,
                      lateFeeApplied: Number(lateFeeApplied) || 0,
                      lateFeeWaived: initialInvoice?.lateFeeWaived,
                      lateFeeCalculation: initialInvoice?.lateFeeCalculation,
                      issuerName,
                      issuerTaxNo,
                      issuerAddress,
                      issuerPhone,
                      issuerEmail,
                      bankDetails: {
                        bankName,
                        accountName,
                        accountNumber,
                        ifscOrRouting,
                        upiId,
                      },
                      documentTitle,
                      custodyMechanism: invoiceType === 'deposit' ? custodyMechanism : undefined,
                      depositClassification: invoiceType === 'deposit' ? depositClassification : undefined,
                      refundTimelineDays: invoiceType === 'deposit' ? Number(refundTimelineDays) || 14 : undefined,
                      termsAndConditions,
                      notes,
                      signatoryName,
                      signatureUrl: signatureUrl || undefined,
                    })
                  }
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button
                  type="button"
                  className="btn brass small"
                  onClick={() => handleSaveInvoice()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle size={14} /> Save & Issue
                </button>
              </div>
            </div>

            {/* Official Printable A4 Invoice Sheet */}
            <RentalInvoiceDocument
              invoice={{
                id: invoiceId || 'INV-PREVIEW',
                ownerId,
                tenant: tenantName,
                tenantId,
                unit: unitNumber,
                amount: subtotal,
                tax: enableTax ? taxAmount : 0,
                total: grandTotal,
                due: dueDate,
                status,
                invoiceType,
                issueDate,
                propertyName,
                tenantTaxNo,
                tenantPhone,
                tenantEmail,
                billingPeriodStart,
                billingPeriodEnd,
                items,
                discount,
                lateFeeApplied: Number(lateFeeApplied) || 0,
                lateFeeWaived: initialInvoice?.lateFeeWaived,
                lateFeeCalculation: initialInvoice?.lateFeeCalculation,
                issuerName,
                issuerTaxNo,
                issuerAddress,
                issuerPhone,
                issuerEmail,
                bankDetails: {
                  bankName,
                  accountName,
                  accountNumber,
                  ifscOrRouting,
                  upiId,
                },
                documentTitle,
                custodyMechanism: invoiceType === 'deposit' ? custodyMechanism : undefined,
                depositClassification: invoiceType === 'deposit' ? depositClassification : undefined,
                refundTimelineDays: invoiceType === 'deposit' ? Number(refundTimelineDays) || 14 : undefined,
                termsAndConditions,
                notes,
                signatoryName,
                signatureUrl: signatureUrl || undefined,
              }}
            />
          </div>

        )}

        {/* Modal Bottom Bar */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 24px',
            background: 'var(--surface)',
            borderTop: '1px solid var(--line)',
          }}
        >
          <div>
            {initialInvoice && status !== 'paid' && (
              <button
                type="button"
                className={`btn secondary small ${isMarkingPaid ? 'btn-processing' : ''}`}
                disabled={isMarkingPaid || isSavingInvoice}
                onClick={async () => {
                  setIsMarkingPaid(true);
                  await new Promise((r) => setTimeout(r, 450));
                  await markInvoicePaid(initialInvoice.id, 'Cash / Manual Reconcile');
                  setStatus('paid');
                  setIsMarkingPaid(false);
                  showToast(`Invoice ${initialInvoice.id} marked as PAID.`);
                }}
              >
                <ButtonProcessing
                  loading={isMarkingPaid}
                  loadingText="Marking Settled..."
                  defaultText="Mark Settled as Paid"
                  icon={<CheckCircle size={14} style={{ marginRight: '4px', color: 'var(--ledger)' }} />}
                />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn secondary"
              disabled={isSavingInvoice || isMarkingPaid}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn brass ${isSavingInvoice ? 'btn-processing' : ''}`}
              disabled={isSavingInvoice || isMarkingPaid}
              onClick={() => handleSaveInvoice()}
            >
              <ButtonProcessing
                loading={isSavingInvoice}
                loadingText={initialInvoice ? 'Saving Changes...' : 'Issuing Invoice...'}
                defaultText={initialInvoice ? 'Save Changes' : 'Save & Issue Invoice'}
                icon={<CheckCircle size={15} style={{ marginRight: '4px' }} />}
              />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
