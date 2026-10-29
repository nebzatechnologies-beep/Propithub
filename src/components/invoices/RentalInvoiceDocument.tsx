import React from 'react';
import { Invoice } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { DEFAULT_CURRENCY } from '../../lib/currencyService';

interface RentalInvoiceDocumentProps {
  invoice: Invoice;
  id?: string;
  style?: React.CSSProperties;
}

export const RentalInvoiceDocument: React.FC<RentalInvoiceDocumentProps> = ({
  invoice,
  id = 'printable-rental-invoice',
  style,
}) => {
  const { state } = useAppData();

  // Resolve landlord/owner metadata from invoice or fallback to matching owner settings in state
  const ownerSettings = invoice.ownerId ? state.ownerSettings[invoice.ownerId] : undefined;
  const ownerBank = (ownerSettings?.paymentMethods as any)?.bank || state.ownerPaymentMethods.bank;
  const ownerUpi = (ownerSettings?.paymentMethods as any)?.upi || state.ownerPaymentMethods.upi;

  const currency = invoice.currency || state.units.find((u) => u.unitNumber === invoice.unit || u.id === invoice.unit)?.currency || DEFAULT_CURRENCY;
  const isDeposit = invoice.invoiceType === 'deposit' || invoice.type === 'deposit';
  const effectiveTemplate = isDeposit ? (ownerSettings?.depositTemplate || ownerSettings?.invoiceTemplate) : ownerSettings?.invoiceTemplate;

  const tenantName = invoice.tenant || 'Resident';
  const unitNumber = invoice.unit || 'Unit N/A';
  const propertyName = invoice.propertyName || '';
  const tenantTaxNo = invoice.tenantTaxNo || '';
  const tenantPhone = invoice.tenantPhone || '';
  const tenantEmail = invoice.tenantEmail || '';

  const issuerName = invoice.issuerName || effectiveTemplate?.issuerName || (propertyName ? `${propertyName} Management` : 'Property Management');
  const issuerTaxNo = invoice.issuerTaxNo || effectiveTemplate?.issuerTaxNo || '';
  const issuerAddress = invoice.issuerAddress || effectiveTemplate?.issuerAddress || '';
  const issuerPhone = invoice.issuerPhone || effectiveTemplate?.issuerPhone || '';
  const issuerEmail = invoice.issuerEmail || effectiveTemplate?.issuerEmail || '';

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

  const documentTitle = invoice.documentTitle || effectiveTemplate?.documentTitle || (isDeposit ? 'SECURITY DEPOSIT VOUCHER' : 'TAX INVOICE');
  const custodyMechanism = invoice.custodyMechanism || effectiveTemplate?.custodyMechanism || 'Held in Landlord Trust Ledger with Platform Verification';
  const depositClassification = invoice.depositClassification || effectiveTemplate?.depositClassification || '100% Refundable Security Deposit';
  const refundTimelineDays = invoice.refundTimelineDays || effectiveTemplate?.refundTimelineDays || 14;

  return (
    <div
      id={id}
      className="rental-invoice-document invoice-sheet"
      style={{
        background: '#FFFFFF',
        color: '#12201B',
        padding: '36px 40px',
        borderRadius: '6px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        border: '1px solid #E5E7EB',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: '820px',
        margin: '0 auto',
        ['--ink' as any]: '#111827',
        ['--ink-soft' as any]: '#4B5563',
        ['--surface-sunken' as any]: '#F8F9FB',
        ['--line' as any]: '#E5E7EB',
        ['--line-strong' as any]: '#D1D5DB',
        ...style,
      }}
    >
      {/* Header with Issuer Info & Doc Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--ink)', paddingBottom: '20px', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            {propertyName || 'PROPITHUB RESIDENTIAL'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '4px' }}>
            {issuerName}
          </div>
          {issuerTaxNo && (
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ledger)', marginTop: '2px' }}>
              {issuerTaxNo}
            </div>
          )}
          {(issuerAddress || issuerPhone || issuerEmail) && (
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px', lineHeight: '1.4' }}>
              {issuerAddress && <>{issuerAddress}<br /></>}
              {[issuerPhone ? `Phone: ${issuerPhone}` : '', issuerEmail ? `Email: ${issuerEmail}` : ''].filter(Boolean).join(' • ')}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: isDeposit ? '18px' : '22px', fontWeight: 800, color: isDeposit ? 'var(--ledger)' : 'var(--ink)', letterSpacing: '0.03em', lineHeight: 1.2 }}>
            {documentTitle}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
            {isDeposit ? 'Official Security Deposit Voucher' : 'Rental Billing & Tax Receipt'}
          </div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '15px', color: 'var(--ledger)', marginTop: '4px' }}>
            {invoice.id}
          </div>
          <div style={{ marginTop: '8px' }}>
            <span
              className={`invoice-stamp ${
                status === 'paid' ? 'paid' : status === 'sent' ? 'sent' : status === 'pending_confirmation' ? 'pending' : status === 'overdue' ? 'overdue' : 'draft'
              }`}
            >
              {status === 'pending_confirmation' ? 'PENDING CONFIRMATION' : status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Billed To & Schedule Grid */}
      <div className="grid grid-2" style={{ marginBottom: '24px', gap: '20px', fontSize: '13px', lineHeight: '1.6' }}>
        <div style={{ background: '#FAFAF7', padding: '14px 16px', borderRadius: '4px', border: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '11px', marginBottom: '4px' }}>
            BILLED TO (RESIDENT / TENANT):
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{tenantName}</div>
          <div>Unit: <b>{unitNumber}</b> • {propertyName || 'Property'}</div>
          {tenantTaxNo && <div style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Tax ID / PAN: <b>{tenantTaxNo}</b></div>}
          <div style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Phone: {tenantPhone || 'N/A'} • Email: {tenantEmail || 'N/A'}</div>
        </div>

        <div style={{ background: '#FAFAF7', padding: '14px 16px', borderRadius: '4px', border: '1px solid var(--line)', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', fontSize: '11px', marginBottom: '4px' }}>
            INVOICE SCHEDULE & TIMELINE:
          </div>
          <div>Issue Date: <b>{issueDate}</b></div>
          <div style={{ color: status === 'overdue' ? 'var(--danger)' : 'inherit' }}>
            Payment Due Date: <b>{dueDate}</b>
          </div>
          <div style={{ color: 'var(--ink-soft)', fontSize: '12px', marginTop: '2px' }}>
            Billing Cycle: <b>{billingPeriodStart}</b> to <b>{billingPeriodEnd}</b>
          </div>
          {status === 'paid' && (
            <div style={{ color: 'var(--ledger)', fontWeight: 700, marginTop: '4px' }}>
              ✓ Payment Settled & Cleared
              {invoice.paidAt && <span> on {new Date(invoice.paidAt).toLocaleDateString()}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <table style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse', fontSize: '13.5px' }}>
        <thead>
          <tr style={{ background: 'var(--surface-sunken)', borderBottom: '2px solid var(--line-strong)' }}>
            <th style={{ textAlign: 'left', padding: '11px 14px' }}>Description / Item Details</th>
            <th style={{ textAlign: 'right', padding: '11px 14px' }}>Amount ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={{ padding: '12px 14px' }}>
                <span style={{ fontWeight: 600 }}>{item.description || 'Rental Charge'}</span>
              </td>
              <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 600 }}>
                {currency}{(Number(item.amount) || 0).toLocaleString()}
              </td>
            </tr>
          ))}
          {taxAmount > 0 && (
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={{ padding: '9px 14px', color: 'var(--ink-soft)' }}>
                Applicable Tax / GST — Tax ID: {issuerTaxNo}
              </td>
              <td style={{ textAlign: 'right', padding: '9px 14px', color: 'var(--ink-soft)' }}>
                {currency}{taxAmount.toLocaleString()}
              </td>
            </tr>
          )}
          {discount > 0 && (
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={{ padding: '9px 14px', color: 'var(--danger)' }}>
                Discount / Concession Deducted
              </td>
              <td style={{ textAlign: 'right', padding: '9px 14px', color: 'var(--danger)' }}>
                -{currency}{discount.toLocaleString()}
              </td>
            </tr>
          )}
          {effectiveLateFee > 0 && (
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={{ padding: '9px 14px', color: 'var(--danger)' }}>
                Late Fee Penalty {invoice.lateFeeCalculation ? `(${invoice.lateFeeCalculation})` : '• Overdue Surcharge'}
              </td>
              <td style={{ textAlign: 'right', padding: '9px 14px', color: 'var(--danger)', fontWeight: 600 }}>
                +{currency}{effectiveLateFee.toLocaleString()}
              </td>
            </tr>
          )}
          {isLateFeeWaived && lateFeeApplied > 0 && (
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={{ padding: '9px 14px', color: 'var(--ledger)' }}>
                Late Fee Penalty (Waived by Landlord)
              </td>
              <td style={{ textAlign: 'right', padding: '9px 14px', color: 'var(--ledger)', fontWeight: 600 }}>
                {currency}0 (WAIVED)
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Financial Totals Summary */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <div style={{ width: '260px', fontSize: '14px', lineHeight: '1.8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
            <span>Subtotal:</span>
            <span>{currency}{subtotal.toLocaleString()}</span>
          </div>
          {taxAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
              <span>Tax:</span>
              <span>{currency}{taxAmount.toLocaleString()}</span>
            </div>
          )}
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
              <span>Discount:</span>
              <span>-{currency}{discount.toLocaleString()}</span>
            </div>
          )}
          {effectiveLateFee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
              <span>Late Fee Penalty:</span>
              <span>+{currency}{effectiveLateFee.toLocaleString()}</span>
            </div>
          )}
          {isLateFeeWaived && lateFeeApplied > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ledger)' }}>
              <span>Late Fee (Waived):</span>
              <span>{currency}0</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '2px solid var(--ink)',
              paddingTop: '8px',
              marginTop: '6px',
              fontWeight: 800,
              fontSize: '18px',
              color: 'var(--ink)',
            }}
          >
            <span>Net Amount Due:</span>
            <span style={{ color: 'var(--ledger)' }}>{currency}{totalAmount.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Payment Remittance Details */}
      <div
        style={{
          borderTop: '1px solid var(--line)',
          paddingTop: '16px',
          marginBottom: '20px',
          fontSize: '12.5px',
          lineHeight: '1.6',
        }}
      >
        <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
          BANK REMITTANCE & PAYMENT DETAILS:
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            {bankName || accountNumber ? (
              <>
                Bank: <b>{bankName || 'Direct Deposit'}</b> • A/C Name: <b>{accountName || '—'}</b><br />
                A/C No: <b style={{ fontFamily: 'monospace' }}>{accountNumber || '—'}</b>{ifscOrRouting ? <> • IFSC: <b style={{ fontFamily: 'monospace' }}>{ifscOrRouting}</b></> : null}
              </>
            ) : (
              <span style={{ color: 'var(--ink-soft)' }}>Bank transfer details not provided.</span>
            )}
          </div>
          {upiId && (
            <div style={{ textAlign: 'right' }}>
              UPI ID / VPA:<br />
              <b style={{ color: 'var(--ledger)', fontFamily: 'monospace' }}>{upiId}</b>
            </div>
          )}
        </div>
      </div>

      {/* Terms & Conditions (T&C) */}
      {termsAndConditions && (
        <div
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: '16px',
            marginBottom: '24px',
            fontSize: '11.5px',
            lineHeight: '1.5',
            color: 'var(--ink-soft)',
          }}
        >
          <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '10.5px', color: 'var(--ink)', marginBottom: '4px' }}>
            TERMS & CONDITIONS (T&C):
          </div>
          <div style={{ whiteSpace: 'pre-line' }}>{termsAndConditions}</div>
          {notes && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--line)', color: 'var(--ink)' }}>
              <b>Note:</b> {notes}
            </div>
          )}
        </div>
      )}

      {/* Official Signatory Line */}
      <div
        style={{
          borderTop: '1px dashed var(--line-strong)',
          paddingTop: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          fontSize: '11px',
          color: 'var(--ink-soft)',
        }}
      >
        <div>
          Propithub Real Estate Cloud Operating Platform.<br />
          Electronic voucher legally generated under the Tenancy Acts.
        </div>
        <div style={{ textAlign: 'center', minWidth: '170px' }}>
          {signatureUrl ? (
            <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
              <img
                src={signatureUrl}
                alt="Authorized Signature"
                style={{ maxHeight: '44px', maxWidth: '160px', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div style={{ height: '32px' }}></div>
          )}
          <div style={{ borderTop: '1.5px solid var(--ink)', paddingTop: '4px', fontWeight: 600, color: 'var(--ink)' }}>
            {signatoryName}
          </div>
          <div style={{ fontSize: '10px' }}>Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
};
