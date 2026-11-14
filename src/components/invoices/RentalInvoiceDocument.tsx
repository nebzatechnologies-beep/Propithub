import React from 'react';
import { Invoice, InvoiceTemplateConfig } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { DEFAULT_CURRENCY, getCurrencySymbol, normalizeCurrencyCode } from '../../lib/currencyService';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyAmount } from '../common/CurrencyAmount';

interface RentalInvoiceDocumentProps {
  invoice: Invoice;
  template?: Partial<InvoiceTemplateConfig>;
  id?: string;
  style?: React.CSSProperties;
}

export const RentalInvoiceDocument: React.FC<RentalInvoiceDocumentProps> = ({
  invoice,
  template,
  id = 'printable-rental-invoice',
  style,
}) => {
  const { state } = useAppData();
  const { viewCurrency, convert, format } = useCurrency();

  // Resolve landlord/owner metadata from invoice or fallback to matching owner settings in state
  const ownerSettings = invoice.ownerId ? state.ownerSettings[invoice.ownerId] : undefined;
  const ownerBank = (ownerSettings?.paymentMethods as any)?.bank || state.ownerPaymentMethods.bank;
  const ownerUpi = (ownerSettings?.paymentMethods as any)?.upi || state.ownerPaymentMethods.upi;

  const rawInvoiceCurrency = invoice.currency || state.units.find((u) => u.unitNumber === invoice.unit || u.id === invoice.unit)?.currency || DEFAULT_CURRENCY;
  const currency = getCurrencySymbol(rawInvoiceCurrency);
  const isDeposit = invoice.invoiceType === 'deposit' || invoice.type === 'deposit';
  const baseTemplate = isDeposit ? (ownerSettings?.depositTemplate || ownerSettings?.invoiceTemplate) : ownerSettings?.invoiceTemplate;
  const effectiveTemplate = template ? { ...(baseTemplate || {}), ...template } : baseTemplate;

  // Resolve matching tenant profile from state or user records to ensure contact details are never N/A when on file
  const matchingTenant = (state.tenants || []).find((t) => {
    if (invoice.tenantId && (t.id === invoice.tenantId || (t as any).userId === invoice.tenantId)) return true;
    if (invoice.tenantEmail && t.email && t.email.toLowerCase() === invoice.tenantEmail.toLowerCase()) return true;
    if (invoice.tenant && t.name && t.name.toLowerCase() === invoice.tenant.toLowerCase()) {
      if (invoice.unit && (t.unit === invoice.unit || (t as any).unitNumber === invoice.unit)) return true;
    }
    if (invoice.unit && (t.unit === invoice.unit || (t as any).unitNumber === invoice.unit)) return true;
    return false;
  });

  const matchingUser = (state.users || []).find((u) => {
    if (invoice.tenantId && u.id === invoice.tenantId) return true;
    if (invoice.tenantEmail && u.email && u.email.toLowerCase() === invoice.tenantEmail.toLowerCase()) return true;
    if (matchingTenant?.id && (u.id === matchingTenant.id || (matchingTenant as any).userId === u.id)) return true;
    return false;
  });

  const tenantName = invoice.tenant || matchingTenant?.name || matchingUser?.displayName || (matchingUser as any)?.name || 'Resident';
  const unitNumber = invoice.unit || matchingTenant?.unit || 'Unit N/A';
  const propertyName = invoice.propertyName || (matchingTenant as any)?.propertyName || '';
  const tenantTaxNo = invoice.tenantTaxNo || (matchingTenant as any)?.taxId || (matchingTenant as any)?.panNo || '';
  const tenantPhone = invoice.tenantPhone || matchingTenant?.phone || matchingUser?.phone || '';
  const tenantEmail = invoice.tenantEmail || matchingTenant?.email || matchingUser?.email || '';

  const issuerName = effectiveTemplate?.issuerName || invoice.issuerName || (propertyName ? `${propertyName} Management` : 'Property Management');
  const issuerTaxNo = effectiveTemplate?.issuerTaxNo || invoice.issuerTaxNo || '';
  const issuerAddress = effectiveTemplate?.issuerAddress || invoice.issuerAddress || '';
  const issuerPhone = effectiveTemplate?.issuerPhone || invoice.issuerPhone || '';
  const issuerEmail = effectiveTemplate?.issuerEmail || invoice.issuerEmail || '';

  const issueDate = invoice.issueDate ? invoice.issueDate.split('T')[0] : (invoice.due || 'N/A');
  const dueDate = invoice.due || 'N/A';
  
  // Billing cycle fallback
  const billingPeriodStart = invoice.billingPeriodStart 
    ? invoice.billingPeriodStart.split('T')[0] 
    : (() => {
        try {
          const d = invoice.due ? new Date(invoice.due) : new Date();
          return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
        } catch {
          return 'N/A';
        }
      })();

  const billingPeriodEnd = invoice.billingPeriodEnd 
    ? invoice.billingPeriodEnd.split('T')[0] 
    : (() => {
        try {
          const d = invoice.due ? new Date(invoice.due) : new Date();
          return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        } catch {
          return 'N/A';
        }
      })();

  // Items
  const items = invoice.items && invoice.items.length > 0 
    ? invoice.items 
    : [
        {
          description: invoice.invoiceType === 'deposit'
            ? `Security Deposit — Unit ${unitNumber}`
            : invoice.invoiceType === 'utility'
            ? `Utility Charges — Unit ${unitNumber}`
            : invoice.invoiceType === 'maintenance'
            ? `Maintenance & Repairs — Unit ${unitNumber}`
            : invoice.invoiceType === 'late_fee'
            ? `Late Fee Surcharge — Unit ${unitNumber}`
            : `Monthly Rent — Unit ${unitNumber}`,
          amount: invoice.amount || 0,
        },
      ];

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const taxAmount = invoice.tax || 0;
  const discount = invoice.discount || 0;
  const lateFeeApplied = invoice.lateFeeApplied || 0;
  const isLateFeeWaived = !!invoice.lateFeeWaived;
  const effectiveLateFee = isLateFeeWaived ? 0 : lateFeeApplied;
  const totalAmount = invoice.total || (subtotal + taxAmount + effectiveLateFee - discount);

  // Bank & Remittance
  const bankName = invoice.bankDetails?.bankName || effectiveTemplate?.bankName || ownerBank?.bankName || '';
  const accountName = invoice.bankDetails?.accountName || effectiveTemplate?.accountName || ownerBank?.accountName || '';
  const accountNumber = invoice.bankDetails?.accountNumber || effectiveTemplate?.accountNumber || ownerBank?.accountNumber || '';
  const ifscOrRouting = invoice.bankDetails?.ifscOrRouting || effectiveTemplate?.ifscOrRouting || ownerBank?.routing || '';
  const upiId = invoice.bankDetails?.upiId || effectiveTemplate?.upiId || ownerUpi?.upiId || '';

  // Terms & Conditions
  const defaultTerms = `1. Payment is due strictly on or before the due date specified on this invoice.
2. Cheques / online NEFT / RTGS / UPI transfers are subject to successful bank clearance.
3. Late payments will incur a recurring late fee penalty as specified in the lease agreement.
4. Any billing discrepancies must be reported to the landlord office or property manager within 3 days.
5. This is an official tax invoice issued pursuant to the executed residential/commercial lease agreement.`;
  const defaultDepositTerms = `1. Security Deposit Classification: 100% Refundable Security Deposit held in fiduciary trust custody by Landlord for the duration of the tenancy agreement.
2. Custody & Non-Income Status: Security deposit funds remain non-commingled trust assets and do not constitute taxable rental income or property revenue.
3. Move-Out Inspection & Deductions: Following lease expiration and key surrender, a joint walkthrough inspection shall be conducted. Deductions are strictly limited to verified unpaid rent arrears, utility charges, or damage repair exceeding standard wear and tear.
4. Refund Disbursement: Net refundable balance shall be remitted to tenant within 14 business days of checkout clearance.
5. Official Deposit Receipt: Digitally generated and cryptographically tracked pursuant to State Tenancy Regulations.`;

  const termsAndConditions = invoice.termsAndConditions || effectiveTemplate?.termsAndConditions || (isDeposit ? defaultDepositTerms : defaultTerms);
  const notes = invoice.notes || effectiveTemplate?.notes || (isDeposit ? 'Funds are non-commingled, non-taxable security deposits held until lease conclusion and damage walkthrough verification.' : 'Thank you for your prompt tenancy settlement.');
  const signatoryName = invoice.signatoryName || effectiveTemplate?.signatoryName || 'Authorized Property Manager';
  const signatureUrl = invoice.signatureUrl || (invoice as any).signatorySignature || effectiveTemplate?.signatureUrl;

  const status = invoice.status || 'sent';

  const documentTitle = invoice.documentTitle || effectiveTemplate?.documentTitle || (isDeposit ? 'DEPOSIT RECEIPT' : 'INVOICE');
  const custodyMechanism = invoice.custodyMechanism || effectiveTemplate?.custodyMechanism || 'Held in Landlord Trust Ledger with Platform Verification';
  const refundTimelineDays = invoice.refundTimelineDays || effectiveTemplate?.refundTimelineDays || 14;

  const formattedIssueDate = issueDate !== 'N/A'
    ? (() => {
        try {
          return new Date(issueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
          return issueDate;
        }
      })()
    : 'N/A';

  return (
    <div
      id={id}
      className="rental-invoice-document invoice-sheet"
      style={{
        background: '#FFFFFF',
        color: '#111827',
        padding: '30px 34px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
        border: '1px solid #E5E7EB',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: '820px',
        margin: '0 auto',
        fontSize: '12.5px',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #E5E7EB', paddingBottom: '16px', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827' }}>
            {issuerName}
          </div>
          <div style={{ fontSize: '11.5px', color: '#6B7280', marginTop: '2px', lineHeight: '1.4' }}>
            {issuerEmail ? <>{issuerEmail}<br /></> : null}
            {issuerPhone ? <>{issuerPhone}<br /></> : null}
            {issuerAddress ? <>{issuerAddress}<br /></> : null}
            {issuerTaxNo ? <div style={{ color: '#059669', fontWeight: 600 }}>{issuerTaxNo}</div> : null}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#111827', letterSpacing: '-0.01em' }}>
            {documentTitle}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            No. {invoice.id}<br />
            {formattedIssueDate}
          </div>
          {status && (
            <div style={{ marginTop: '6px' }}>
              <span
                className={`invoice-stamp ${
                  status === 'paid' ? 'paid' : status === 'sent' ? 'sent' : status === 'pending_confirmation' ? 'pending' : status === 'overdue' ? 'overdue' : 'draft'
                }`}
                style={{ fontSize: '10px', padding: '2px 8px' }}
              >
                {status === 'pending_confirmation' ? 'PENDING CONFIRMATION' : status.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Two-Column Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px', fontSize: '12px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '2px' }}>
            {isDeposit ? 'RECEIVED FROM' : 'BILL TO'}
          </div>
          <b style={{ color: '#111827', fontSize: '13px' }}>{tenantName}</b>
          <div style={{ color: '#6B7280', fontSize: '11.5px', marginTop: '1px' }}>
            Unit {unitNumber} · {propertyName || 'Property Premises'}
          </div>
          {(tenantEmail || tenantPhone) && (
            <div style={{ color: '#6B7280', fontSize: '11px', marginTop: '1px' }}>
              {tenantEmail} {tenantPhone && `• ${tenantPhone}`}
            </div>
          )}
          {tenantTaxNo && (
            <div style={{ color: '#6B7280', fontSize: '11px' }}>
              Tax ID / PAN: <b>{tenantTaxNo}</b>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '2px' }}>
            {isDeposit ? 'REFUND TIMELINE' : 'PAYMENT DUE'}
          </div>
          <div style={{ color: !isDeposit && status === 'overdue' ? '#DC2626' : '#111827', fontWeight: 600, fontSize: '12px' }}>
            {isDeposit ? `Within ${refundTimelineDays || 14} days of move-out` : dueDate}
          </div>
          {!isDeposit && (
            <div style={{ color: '#6B7280', fontSize: '11px', marginTop: '2px' }}>
              Billing Cycle: {billingPeriodStart} to {billingPeriodEnd}
            </div>
          )}
          {status === 'paid' && (
            <div style={{ color: '#059669', fontWeight: 600, fontSize: '11px', marginTop: '4px' }}>
              ✓ Payment Settled & Cleared
              {invoice.paidAt && <span> on {new Date(invoice.paidAt).toLocaleDateString()}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <div style={{ marginBottom: '14px', width: '100%' }}>
        <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'normal' }}>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '8px 8px 8px 0', fontWeight: 600, color: '#111827', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {item.description || (isDeposit ? 'Security deposit (Held in trust)' : 'Rental Charge')}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                  {currency}{(Number(item.amount) || 0).toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
            {taxAmount > 0 && (
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '8px 0', color: '#6B7280' }}>
                  Tax {effectiveTemplate?.taxLabel || 'GST'}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#6B7280' }}>
                  {currency}{taxAmount.toLocaleString('en-IN')}
                </td>
              </tr>
            )}
            {discount > 0 && (
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '8px 0', color: '#DC2626' }}>
                  Discount / Concession Deducted
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#DC2626' }}>
                  -{currency}{discount.toLocaleString('en-IN')}
                </td>
              </tr>
            )}
            {effectiveLateFee > 0 && (
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '8px 0', color: '#DC2626' }}>
                  Late Fee Penalty {invoice.lateFeeCalculation ? `(${invoice.lateFeeCalculation})` : ''}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                  +{currency}{effectiveLateFee.toLocaleString('en-IN')}
                </td>
              </tr>
            )}
            {isLateFeeWaived && lateFeeApplied > 0 && (
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '8px 0', color: '#059669' }}>
                  Late Fee Penalty (Waived)
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                  {currency}0 (WAIVED)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #E5E7EB', paddingTop: '10px', marginBottom: '18px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>
          {isDeposit ? 'Held for you' : status === 'paid' ? 'Total Paid' : 'Total to pay'}
        </span>
        <div style={{ textAlign: 'right' }}>
          <b style={{ fontSize: '18px', color: '#111827' }}>
            <CurrencyAmount amount={totalAmount} currency={rawInvoiceCurrency} />
          </b>
        </div>
      </div>

      {/* Held At / Pay To */}
      <div style={{ background: '#F9FAFB', padding: '10px 12px', borderRadius: '6px', marginBottom: '16px', fontSize: '11.5px', color: '#4B5563' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '2px' }}>
          {isDeposit ? 'HELD AT' : 'PAY TO'}
        </div>
        <div>
          {[
            bankName,
            accountName && `A/C ${accountName}`,
            accountNumber && `(${accountNumber})`,
            ifscOrRouting && `IFSC: ${ifscOrRouting}`,
            upiId && `UPI: ${upiId}`,
          ].filter(Boolean).join(' · ') || (isDeposit ? 'Where deposit is held' : 'Bank or UPI details')}
        </div>
      </div>

      {/* Terms & Conditions (one per line) */}
      {(invoice as any).includeTerms !== false && effectiveTemplate?.includeTerms !== false && termsAndConditions && (
        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '10px', marginBottom: '14px', fontSize: '11px', color: '#4B5563', lineHeight: '1.5' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '4px' }}>
            {isDeposit ? 'DEPOSIT TERMS & CONDITIONS' : 'TERMS & CONDITIONS'}
          </div>
          {termsAndConditions.split('\n').filter(Boolean).map((clause, idx) => (
            <div key={idx} style={{ marginBottom: '2px' }}>{clause.trim()}</div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '11px', color: '#6B7280' }}>
        <div>{notes || (isDeposit ? 'Refundable upon move-out inspection.' : 'Thank you for your tenancy.')}</div>
        {signatoryName && (
          <div style={{ textAlign: 'right', fontWeight: 600, color: '#111827' }}>
            {signatureUrl && (
              <img src={signatureUrl} alt="Signature" style={{ maxHeight: '36px', display: 'block', marginLeft: 'auto', marginBottom: '2px' }} />
            )}
            {signatoryName}
          </div>
        )}
      </div>
    </div>
  );
};
