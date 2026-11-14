import React from 'react';
import { useAppData } from '../../context/AppDataContext';
import { PlatformInvoice, PlatformInvoiceTemplateConfig } from '../../types';
import { getCurrencySymbol } from '../../lib/currencyService';

interface PlatformInvoiceDocumentProps {
  invoice: Partial<PlatformInvoice> & {
    id: string;
    ownerName: string;
    planName: string;
    amount: number;
    total: number;
    status: string;
    issueDate: string;
    dueDate: string;
  };
  template?: Partial<PlatformInvoiceTemplateConfig>;
}

const formatDisplayDate = (val?: string): string => {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val).split('T')[0];
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const PlatformInvoiceDocument: React.FC<PlatformInvoiceDocumentProps> = ({
  invoice,
  template,
}) => {
  const { state } = useAppData();
  const tmpl = { ...(state.platformInvoiceTemplate || {}), ...(template || {}) };

  const issuerName = invoice.issuerName || tmpl.issuerName || 'Propithub Technologies Inc.';
  const issuerAddress = invoice.issuerAddress || tmpl.issuerAddress || '100 Montgomery St, Suite 1800, San Francisco, CA';
  const issuerEmail = invoice.issuerEmail || tmpl.issuerEmail || 'billing@propithub.com';
  const issuerPhone = invoice.issuerPhone || tmpl.issuerPhone || '+1 (800) 555-PROP';
  const issuerTaxNo = invoice.issuerTaxNo || tmpl.issuerTaxNo || '';

  const currency = invoice.currency || 'USD';
  const currencySymbol = getCurrencySymbol(currency) || '$';
  const amount = Number(invoice.amount) || 0;
  const tax = Number(invoice.tax) || 0;
  const total = Number(invoice.total != null ? invoice.total : amount + tax) || 0;
  const status = String(invoice.status || 'issued').toLowerCase();

  const periodStart = invoice.periodStart ? String(invoice.periodStart).split('T')[0] : String(invoice.issueDate).split('T')[0];
  const periodEnd = invoice.periodEnd ? String(invoice.periodEnd).split('T')[0] : String(invoice.dueDate).split('T')[0];

  const includeTerms = invoice.includeTerms !== false && tmpl.includeTerms !== false;
  const terms =
    invoice.termsAndConditions ||
    tmpl.termsAndConditions ||
    `1. All SaaS subscription and licensing fees are billed in advance according to the selected tier.\n2. Invoices are payable within 14 calendar days from the date of issuance.\n3. Overdue platform balances may result in temporary restriction of multi-unit management services.\n4. All tax charges are assessed based on the customer's registered business jurisdiction.\n5. Inquiries regarding platform invoices must be submitted to ${issuerEmail} within 5 business days.`;

  const signatory = invoice.signatoryName || tmpl.signatoryName || 'Authorized Signatory';
  const signatoryRole = invoice.signatoryRole || tmpl.signatoryRole || 'Authorized Officer';

  return (
    <div
      style={{
        background: '#FFFFFF',
        color: '#111827',
        padding: '22px 24px',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '2px solid #E5E7EB',
          paddingBottom: '18px',
          marginBottom: '22px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: '200px', flex: 1 }}>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.4px', color: '#111827' }}>
            PROPIT<span style={{ color: '#B4823E' }}>HUB</span>
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827', marginTop: '3px' }}>
            {issuerName}
          </div>
          <div style={{ fontSize: '11.5px', color: '#6B7280', marginTop: '3px', lineHeight: 1.5 }}>
            {issuerAddress && <div>{issuerAddress}</div>}
            {issuerEmail && <div>{issuerEmail}</div>}
            {issuerPhone && <div>{issuerPhone}</div>}
            {issuerTaxNo && (
              <div style={{ color: '#059669', fontWeight: 700, marginTop: '2px' }}>{issuerTaxNo}</div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827', letterSpacing: '0.03em' }}>
            TAX INVOICE
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', marginTop: '2px' }}>
            PLATFORM SUBSCRIPTION RECEIPT
          </div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13.5px', color: '#059669', marginTop: '4px' }}>
            {invoice.id}
          </div>
          <div style={{ marginTop: '6px' }}>
            <span
              className={`badge ${status === 'paid' ? 'green' : status === 'overdue' ? 'red' : status === 'draft' ? 'grey' : 'brass'}`}
              style={{ fontSize: '10.5px', textTransform: 'uppercase' }}
            >
              {status === 'paid' ? 'PAID & RECONCILED' : status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Recipient & Timeline */}
      <div
        className="grid grid-2"
        style={{
          gap: '12px',
          marginBottom: '20px',
          fontSize: '11.5px',
          lineHeight: 1.55,
        }}
      >
        <div style={{ background: '#F9FAFB', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E5E7EB', minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
            BILLED TO (SUBSCRIBER)
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827' }}>
            {invoice.ownerName || 'Property Owner'}
          </div>
          {invoice.ownerEmail && <div style={{ color: '#4B5563', wordBreak: 'break-word' }}>{invoice.ownerEmail}</div>}
          {invoice.ownerId && (
            <div style={{ color: '#6B7280', fontSize: '11px' }}>Account ID: {invoice.ownerId}</div>
          )}
          {invoice.ownerTaxNo && (
            <div style={{ color: '#6B7280', fontSize: '11px' }}>Tax ID: <b>{invoice.ownerTaxNo}</b></div>
          )}
        </div>

        <div style={{ background: '#F9FAFB', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E5E7EB', textAlign: 'right', minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
            SUBSCRIPTION TIMELINE
          </div>
          <div style={{ color: '#374151' }}>
            Billing Period:{' '}
            <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{periodStart}</span>
            {' '}to{' '}
            <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{periodEnd}</span>
          </div>
          <div style={{ color: '#374151' }}>
            Issue Date: <b style={{ whiteSpace: 'nowrap' }}>{formatDisplayDate(invoice.issueDate)}</b>
          </div>
          <div style={{ color: status === 'overdue' ? '#DC2626' : '#374151' }}>
            Payment Due Date: <b style={{ whiteSpace: 'nowrap' }}>{formatDisplayDate(invoice.dueDate)}</b>
          </div>
          {status === 'paid' && (
            <div style={{ color: '#059669', fontWeight: 700, marginTop: '3px', fontSize: '11.5px' }}>
              ✓ Paid{invoice.paymentMethod ? ` via ${invoice.paymentMethod}` : ''}
              {invoice.paidAt ? ` (${formatDisplayDate(invoice.paidAt)})` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <div style={{ marginBottom: '18px', width: '100%' }}>
        <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'normal' }}>
          <thead>
            <tr style={{ background: '#F3F4F6', borderBottom: '2px solid #D1D5DB', color: '#4B5563', fontSize: '10px', textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '8px', fontWeight: 700, whiteSpace: 'normal' }}>Subscription Service Description</th>
              <th style={{ textAlign: 'center', padding: '8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Period</th>
              <th style={{ textAlign: 'right', padding: '8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Amount ({currency})</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              <td style={{ padding: '10px 8px', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                <div style={{ fontWeight: 700, color: '#111827' }}>
                  Propithub {invoice.planName} SaaS License
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                  {invoice.notes || 'Monthly SaaS subscription & cloud property management platform'}
                </div>
              </td>
              <td style={{ textAlign: 'center', padding: '10px 8px', color: '#4B5563', fontSize: '11px', whiteSpace: 'nowrap' }}>
                {periodStart} – {periodEnd}
              </td>
              <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 700, fontSize: '13.5px', color: '#111827', whiteSpace: 'nowrap' }}>
                {currencySymbol}{amount.toFixed(2)}
              </td>
            </tr>
            {tax > 0 && (
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td colSpan={2} style={{ padding: '9px 12px', color: '#6B7280' }}>
                  {invoice.taxLabel || tmpl.taxLabel || 'Tax / VAT'}
                  {tmpl.taxPercent ? ` (${tmpl.taxPercent}%)` : ''}
                </td>
                <td style={{ textAlign: 'right', padding: '9px 12px', color: '#6B7280' }}>
                  {currencySymbol}{tax.toFixed(2)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <div style={{ width: '250px', fontSize: '13px', lineHeight: 1.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6B7280' }}>
            <span>Subtotal:</span>
            <span>{currencySymbol}{amount.toFixed(2)}</span>
          </div>
          {tax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6B7280' }}>
              <span>{invoice.taxLabel || tmpl.taxLabel || 'Tax'}:</span>
              <span>{currencySymbol}{tax.toFixed(2)}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '2px solid #111827',
              paddingTop: '7px',
              marginTop: '5px',
              fontWeight: 800,
              fontSize: '15.5px',
              color: '#111827',
            }}
          >
            <span>{status === 'paid' ? 'Total Paid:' : 'Total Due:'}</span>
            <span style={{ color: '#B4823E' }}>
              {currencySymbol}{total.toFixed(2)} {currency}
            </span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      {includeTerms && terms.trim() && (
        <div
          style={{
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '18px',
            fontSize: '11px',
            color: '#6B7280',
            lineHeight: 1.55,
            whiteSpace: 'pre-line',
          }}
        >
          <div style={{ fontWeight: 700, color: '#111827', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
            SUBSCRIPTION TERMS & CONDITIONS
          </div>
          {terms}
        </div>
      )}

      {/* Footer & Signatory */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderTop: '1px dashed #D1D5DB',
          paddingTop: '14px',
          fontSize: '11px',
          color: '#6B7280',
          gap: '16px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#374151' }}>{issuerName}</div>
          {tmpl.notes && <div style={{ color: '#4B5563', marginTop: '2px' }}>{tmpl.notes}</div>}
          <div style={{ marginTop: '2px' }}>Electronic presentation valid without physical stamp.</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: '150px', flexShrink: 0 }}>
          <div style={{ borderTop: '1.5px solid #111827', paddingTop: '5px', fontWeight: 700, color: '#111827', fontSize: '12px' }}>
            {signatory}
          </div>
          <div style={{ fontSize: '10px', color: '#6B7280' }}>{signatoryRole}</div>
        </div>
      </div>
    </div>
  );
};

