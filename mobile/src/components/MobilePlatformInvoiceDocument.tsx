import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MobilePlatformInvoice, MobilePlatformInvoiceTemplateConfig } from '../types';

interface MobilePlatformInvoiceDocumentProps {
  invoice: MobilePlatformInvoice;
  template?: Partial<MobilePlatformInvoiceTemplateConfig>;
}

const formatDisplayDate = (val?: string): string => {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val).split('T')[0];
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getCurrencySym = (currency?: string): string => {
  const c = String(currency || 'USD').toUpperCase();
  if (c === 'INR') return '₹';
  if (c === 'EUR') return '€';
  if (c === 'GBP') return '£';
  return '$';
};

const resolveFields = (
  invoice: MobilePlatformInvoice,
  template?: Partial<MobilePlatformInvoiceTemplateConfig>
) => {
  const tmpl = template || {};
  const issuerName = invoice.issuerName || tmpl.issuerName || 'Propithub Technologies Inc.';
  const issuerAddress =
    invoice.issuerAddress || tmpl.issuerAddress || '100 Montgomery St, Suite 1800, San Francisco, CA';
  const issuerEmail = invoice.issuerEmail || tmpl.issuerEmail || 'billing@propithub.com';
  const issuerPhone = invoice.issuerPhone || tmpl.issuerPhone || '+1 (800) 555-PROP';
  const issuerTaxNo = invoice.issuerTaxNo || tmpl.issuerTaxNo || '';

  const currency = invoice.currency || 'USD';
  const currencySymbol = getCurrencySym(currency);
  const amount = Number(invoice.amount) || 0;
  const tax = Number(invoice.tax) || 0;
  const total = Number(invoice.total != null ? invoice.total : amount + tax) || 0;
  const status = String(invoice.status || 'issued').toLowerCase();

  const periodStart = invoice.periodStart
    ? String(invoice.periodStart).split('T')[0]
    : String(invoice.issueDate).split('T')[0];
  const periodEnd = invoice.periodEnd
    ? String(invoice.periodEnd).split('T')[0]
    : String(invoice.dueDate).split('T')[0];

  const includeTerms = invoice.includeTerms !== false && tmpl.includeTerms !== false;
  const terms =
    invoice.termsAndConditions ||
    tmpl.termsAndConditions ||
    `1. All SaaS subscription and licensing fees are billed in advance according to the selected tier.\n2. Invoices are payable within 14 calendar days from the date of issuance.\n3. Overdue platform balances may result in temporary restriction of multi-unit management services.\n4. All tax charges are assessed based on the customer's registered business jurisdiction.\n5. Inquiries regarding platform invoices must be submitted to ${issuerEmail} within 5 business days.`;

  const signatory = invoice.signatoryName || tmpl.signatoryName || 'Authorized Signatory';
  const signatoryRole = invoice.signatoryRole || tmpl.signatoryRole || 'Authorized Officer';
  const footerNote = tmpl.notes || '';

  return {
    tmpl,
    issuerName,
    issuerAddress,
    issuerEmail,
    issuerPhone,
    issuerTaxNo,
    currency,
    currencySymbol,
    amount,
    tax,
    total,
    status,
    periodStart,
    periodEnd,
    includeTerms,
    terms,
    signatory,
    signatoryRole,
    footerNote,
  };
};

const escapeHtml = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildPlatformInvoiceHtml = (
  invoice: MobilePlatformInvoice,
  template?: Partial<MobilePlatformInvoiceTemplateConfig>
): string => {
  const f = resolveFields(invoice, template);
  const statusBg = f.status === 'paid' ? '#D1FAE5' : f.status === 'overdue' ? '#FEE2E2' : '#FEF3C7';
  const statusColor = f.status === 'paid' ? '#059669' : f.status === 'overdue' ? '#DC2626' : '#D97706';
  const statusLabel = f.status === 'paid' ? 'PAID & RECONCILED' : f.status.toUpperCase();

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 26px; color: #111827; background: #FFFFFF; }
          .sheet { border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 18px; }
          .brand { font-size: 20px; font-weight: 900; letter-spacing: -0.02em; margin-bottom: 6px; }
          .issuer { font-weight: 700; font-size: 13px; color: #111827; }
          .muted { font-size: 11px; color: #6B7280; line-height: 1.5; }
          .tax { color: #059669; font-weight: 700; font-size: 11px; margin-top: 2px; }
          .title { font-size: 19px; font-weight: 800; color: #111827; }
          .subtitle { font-size: 11px; font-weight: 600; color: #6B7280; margin-top: 2px; }
          .inv-id { font-family: monospace; font-weight: 700; color: #059669; font-size: 12px; margin-top: 4px; }
          .badge { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 700; background: ${statusBg}; color: ${statusColor}; }
          .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; font-size: 11.5px; }
          .card { background: #F9FAFB; padding: 10px 12px; border-radius: 6px; border: 1px solid #E5E7EB; }
          .card-label { font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
          th { background: #F3F4F6; border-bottom: 2px solid #D1D5DB; color: #4B5563; font-size: 10px; text-transform: uppercase; padding: 8px; }
          td { padding: 10px 8px; border-bottom: 1px solid #E5E7EB; }
          .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 18px; }
          .totals { width: 250px; font-size: 12px; }
          .t-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .t-final { display: flex; justify-content: space-between; border-top: 2px solid #111827; padding-top: 7px; margin-top: 5px; font-weight: 800; font-size: 15px; }
          .terms { border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; font-size: 11px; color: #6B7280; line-height: 1.55; white-space: pre-line; }
          .footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px dashed #D1D5DB; padding-top: 14px; font-size: 11px; color: #6B7280; }
          .sig { text-align: center; min-width: 150px; }
          .sig-line { border-top: 1.5px solid #111827; padding-top: 5px; font-weight: 700; color: #111827; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header">
            <div>
              <div class="brand"><span style="color:#111827">PROPIT</span><span style="color:#B4823E">HUB</span></div>
              <div class="issuer">${escapeHtml(f.issuerName)}</div>
              ${f.issuerAddress ? `<div class="muted">${escapeHtml(f.issuerAddress)}</div>` : ''}
              ${f.issuerEmail ? `<div class="muted">${escapeHtml(f.issuerEmail)}</div>` : ''}
              ${f.issuerPhone ? `<div class="muted">${escapeHtml(f.issuerPhone)}</div>` : ''}
              ${f.issuerTaxNo ? `<div class="tax">${escapeHtml(f.issuerTaxNo)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div class="title">TAX INVOICE</div>
              <div class="subtitle">PLATFORM SUBSCRIPTION RECEIPT</div>
              <div class="inv-id">${escapeHtml(invoice.id)}</div>
              <div><span class="badge">${escapeHtml(statusLabel)}</span></div>
            </div>
          </div>
          <div class="grid2">
            <div class="card">
              <div class="card-label">BILLED TO (SUBSCRIBER)</div>
              <div style="font-size:13.5px;font-weight:700;color:#111827;">${escapeHtml(invoice.ownerName || 'Property Owner')}</div>
              ${invoice.ownerEmail ? `<div style="color:#4B5563;">${escapeHtml(invoice.ownerEmail)}</div>` : ''}
              ${invoice.ownerId ? `<div class="muted">Account ID: ${escapeHtml(invoice.ownerId)}</div>` : ''}
              ${invoice.ownerTaxNo ? `<div class="muted">Tax ID: <b>${escapeHtml(invoice.ownerTaxNo)}</b></div>` : ''}
            </div>
            <div class="card" style="text-align:right;">
              <div class="card-label">SUBSCRIPTION TIMELINE</div>
              <div>Billing Period: <b>${escapeHtml(f.periodStart)}</b> to <b>${escapeHtml(f.periodEnd)}</b></div>
              <div>Issue Date: <b>${escapeHtml(formatDisplayDate(invoice.issueDate))}</b></div>
              <div style="color:${f.status === 'overdue' ? '#DC2626' : '#374151'};">Payment Due Date: <b>${escapeHtml(formatDisplayDate(invoice.dueDate))}</b></div>
              ${f.status === 'paid' ? `<div style="color:#059669;font-weight:700;margin-top:3px;">✓ Paid${invoice.paymentMethod ? ` via ${escapeHtml(invoice.paymentMethod)}` : ''}${invoice.paidAt ? ` (${escapeHtml(formatDisplayDate(invoice.paidAt))})` : ''}</div>` : ''}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Subscription Service Description</th>
                <th style="text-align:center;">Period</th>
                <th style="text-align:right;">Amount (${escapeHtml(f.currency)})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style="font-weight:700;color:#111827;">Propithub ${escapeHtml(invoice.planName)} SaaS License</div>
                  <div class="muted">${escapeHtml(invoice.notes || 'Monthly SaaS subscription & cloud property management platform')}</div>
                </td>
                <td style="text-align:center;color:#4B5563;">${escapeHtml(f.periodStart)} – ${escapeHtml(f.periodEnd)}</td>
                <td style="text-align:right;font-weight:700;font-size:13.5px;">${escapeHtml(f.currencySymbol)}${f.amount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div class="totals-wrap">
            <div class="totals">
              <div class="t-row"><span style="color:#4B5563;">Subtotal:</span><b>${escapeHtml(f.currencySymbol)}${f.amount.toFixed(2)}</b></div>
              ${f.tax > 0 ? `<div class="t-row"><span style="color:#4B5563;">${escapeHtml(f.tmpl.taxLabel || 'Tax')}:</span><b>${escapeHtml(f.currencySymbol)}${f.tax.toFixed(2)}</b></div>` : ''}
              <div class="t-final"><span>${f.status === 'paid' ? 'Total Paid:' : 'Total Due:'}</span><span style="color:#B4823E;">${escapeHtml(f.currencySymbol)}${f.total.toFixed(2)} ${escapeHtml(f.currency)}</span></div>
            </div>
          </div>
          ${f.includeTerms && f.terms.trim() ? `
            <div class="terms">
              <div style="font-weight:700;color:#111827;font-size:10px;text-transform:uppercase;margin-bottom:4px;">SUBSCRIPTION TERMS & CONDITIONS</div>
              ${escapeHtml(f.terms)}
            </div>
          ` : ''}
          <div class="footer">
            <div>
              <div style="font-weight:600;color:#374151;">${escapeHtml(f.issuerName)}</div>
              ${f.footerNote ? `<div style="color:#4B5563;margin-top:2px;">${escapeHtml(f.footerNote)}</div>` : ''}
              <div style="margin-top:2px;">Electronic presentation valid without physical stamp.</div>
            </div>
            <div class="sig">
              <div class="sig-line">${escapeHtml(f.signatory)}</div>
              <div style="font-size:10px;color:#6B7280;">${escapeHtml(f.signatoryRole)}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

export const MobilePlatformInvoiceDocument: React.FC<MobilePlatformInvoiceDocumentProps> = ({
  invoice,
  template,
}) => {
  const f = resolveFields(invoice, template);
  const statusBg = f.status === 'paid' ? '#D1FAE5' : f.status === 'overdue' ? '#FEE2E2' : '#FEF3C7';
  const statusColor = f.status === 'paid' ? '#059669' : f.status === 'overdue' ? '#DC2626' : '#D97706';

  return (
    <View style={styles.sheet}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.brand}>
            <Text style={{ color: '#111827' }}>PROPIT</Text>
            <Text style={{ color: '#B4823E' }}>HUB</Text>
          </Text>
          <Text style={styles.issuerName}>{f.issuerName}</Text>
          {f.issuerAddress ? <Text style={styles.muted}>{f.issuerAddress}</Text> : null}
          {f.issuerEmail ? <Text style={styles.muted}>{f.issuerEmail}</Text> : null}
          {f.issuerPhone ? <Text style={styles.muted}>{f.issuerPhone}</Text> : null}
          {f.issuerTaxNo ? <Text style={styles.taxText}>{f.issuerTaxNo}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.docTitle}>TAX INVOICE</Text>
          <Text style={styles.docSubtitle}>PLATFORM SUBSCRIPTION RECEIPT</Text>
          <Text style={styles.invId}>{invoice.id}</Text>
          <View style={[styles.badge, { backgroundColor: statusBg }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {f.status === 'paid' ? 'PAID & RECONCILED' : f.status.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Subscriber & Timeline */}
      <View style={styles.gridRow}>
        <View style={styles.infoCard}>
          <Text style={styles.cardLabel}>BILLED TO (SUBSCRIBER)</Text>
          <Text style={styles.ownerName}>{invoice.ownerName || 'Property Owner'}</Text>
          {invoice.ownerEmail ? <Text style={styles.cardText}>{invoice.ownerEmail}</Text> : null}
          {invoice.ownerId ? <Text style={styles.cardMuted}>Account ID: {invoice.ownerId}</Text> : null}
          {invoice.ownerTaxNo ? (
            <Text style={styles.cardMuted}>
              Tax ID: <Text style={{ fontWeight: '700', color: '#111827' }}>{invoice.ownerTaxNo}</Text>
            </Text>
          ) : null}
        </View>

        <View style={[styles.infoCard, { alignItems: 'flex-end' }]}>
          <Text style={styles.cardLabel}>SUBSCRIPTION TIMELINE</Text>
          <Text style={[styles.cardText, { textAlign: 'right' }]}>
            Billing Period: <Text style={{ fontWeight: '700' }}>{f.periodStart}</Text> to{' '}
            <Text style={{ fontWeight: '700' }}>{f.periodEnd}</Text>
          </Text>
          <Text style={[styles.cardText, { textAlign: 'right' }]}>
            Issue Date: <Text style={{ fontWeight: '700' }}>{formatDisplayDate(invoice.issueDate)}</Text>
          </Text>
          <Text style={[styles.cardText, { textAlign: 'right', color: f.status === 'overdue' ? '#DC2626' : '#374151' }]}>
            Payment Due Date: <Text style={{ fontWeight: '700' }}>{formatDisplayDate(invoice.dueDate)}</Text>
          </Text>
          {f.status === 'paid' ? (
            <Text style={{ color: '#059669', fontWeight: '700', fontSize: 11, marginTop: 3, textAlign: 'right' }}>
              ✓ Paid{invoice.paymentMethod ? ` via ${invoice.paymentMethod}` : ''}
              {invoice.paidAt ? ` (${formatDisplayDate(invoice.paidAt)})` : ''}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Line Items Table */}
      <View style={styles.tableBox}>
        <View style={styles.tableHead}>
          <Text style={[styles.th, { flex: 1.5 }]}>SUBSCRIPTION SERVICE DESCRIPTION</Text>
          <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>PERIOD</Text>
          <Text style={[styles.th, { width: 72, textAlign: 'right' }]}>AMOUNT ({f.currency})</Text>
        </View>
        <View style={styles.tableRow}>
          <View style={{ flex: 1.5, paddingRight: 6 }}>
            <Text style={{ fontWeight: '700', color: '#111827', fontSize: 12 }}>
              Propithub {invoice.planName} SaaS License
            </Text>
            <Text style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>
              {invoice.notes || 'Monthly SaaS subscription & cloud property management platform'}
            </Text>
          </View>
          <Text style={{ flex: 1, textAlign: 'center', color: '#4B5563', fontSize: 10.5 }}>
            {f.periodStart} – {f.periodEnd}
          </Text>
          <Text style={{ width: 72, textAlign: 'right', fontWeight: '700', fontSize: 13, color: '#111827' }}>
            {f.currencySymbol}{f.amount.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Totals */}
      <View style={styles.totalsWrap}>
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={{ color: '#4B5563', fontSize: 11.5 }}>Subtotal:</Text>
            <Text style={{ fontWeight: '600', color: '#111827', fontSize: 11.5 }}>
              {f.currencySymbol}{f.amount.toFixed(2)}
            </Text>
          </View>
          {f.tax > 0 ? (
            <View style={styles.totalRow}>
              <Text style={{ color: '#4B5563', fontSize: 11.5 }}>{f.tmpl.taxLabel || 'Tax'}:</Text>
              <Text style={{ fontWeight: '600', color: '#111827', fontSize: 11.5 }}>
                {f.currencySymbol}{f.tax.toFixed(2)}
              </Text>
            </View>
          ) : null}
          <View style={styles.finalTotalRow}>
            <Text style={{ fontWeight: '800', fontSize: 14, color: '#111827' }}>
              {f.status === 'paid' ? 'Total Paid:' : 'Total Due:'}
            </Text>
            <Text style={{ fontWeight: '800', fontSize: 14, color: '#B4823E' }}>
              {f.currencySymbol}{f.total.toFixed(2)} {f.currency}
            </Text>
          </View>
        </View>
      </View>

      {/* Terms & Conditions */}
      {f.includeTerms && f.terms.trim() ? (
        <View style={styles.termsBox}>
          <Text style={styles.termsTitle}>SUBSCRIPTION TERMS & CONDITIONS</Text>
          <Text style={styles.termsBody}>{f.terms}</Text>
        </View>
      ) : null}

      {/* Footer & Signatory */}
      <View style={styles.footer}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontWeight: '600', color: '#374151', fontSize: 11 }}>{f.issuerName}</Text>
          {f.footerNote ? <Text style={{ color: '#4B5563', fontSize: 10.5, marginTop: 2 }}>{f.footerNote}</Text> : null}
          <Text style={{ color: '#6B7280', fontSize: 10.5, marginTop: 2 }}>
            Electronic presentation valid without physical stamp.
          </Text>
        </View>
        <View style={styles.signatoryBox}>
          <View style={styles.signatoryLine}>
            <Text style={{ fontWeight: '700', color: '#111827', fontSize: 11.5, textAlign: 'center' }}>
              {f.signatory}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 2 }}>
            {f.signatoryRole}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 12,
    marginBottom: 14,
  },
  brand: { fontSize: 18, fontWeight: '900', marginBottom: 4 },
  issuerName: { fontWeight: '700', fontSize: 12.5, color: '#111827' },
  muted: { fontSize: 10.5, color: '#6B7280', lineHeight: 15 },
  taxText: { color: '#059669', fontWeight: '700', fontSize: 10.5, marginTop: 2 },
  docTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  docSubtitle: { fontSize: 9.5, fontWeight: '600', color: '#6B7280', marginTop: 2 },
  invId: { fontFamily: 'monospace', fontWeight: '700', color: '#059669', fontSize: 11, marginTop: 4 },
  badge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 9.5, fontWeight: '700' },
  gridRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  infoCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardLabel: { fontSize: 9.5, fontWeight: '700', color: '#6B7280', marginBottom: 4 },
  ownerName: { fontSize: 12.5, fontWeight: '700', color: '#111827' },
  cardText: { fontSize: 10.5, color: '#374151', lineHeight: 15 },
  cardMuted: { fontSize: 10, color: '#6B7280', lineHeight: 14 },
  tableBox: { marginBottom: 14 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 2,
    borderBottomColor: '#D1D5DB',
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  th: { fontSize: 9, fontWeight: '700', color: '#4B5563' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  totalsWrap: { alignItems: 'flex-end', marginBottom: 14 },
  totalsBox: { width: 210 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  finalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: '#111827',
    paddingTop: 6,
    marginTop: 4,
  },
  termsBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
  },
  termsTitle: { fontWeight: '700', color: '#111827', fontSize: 9.5, marginBottom: 4 },
  termsBody: { fontSize: 10, color: '#6B7280', lineHeight: 15 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB',
    borderStyle: 'dashed',
    paddingTop: 12,
  },
  signatoryBox: { minWidth: 130, alignItems: 'center' },
  signatoryLine: {
    borderTopWidth: 1.5,
    borderTopColor: '#111827',
    paddingTop: 4,
    width: '100%',
  },
});

