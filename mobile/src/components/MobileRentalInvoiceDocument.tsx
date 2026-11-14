import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MobileInvoice } from '../types';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';

interface MobileRentalInvoiceDocumentProps {
  visible: boolean;
  onClose: () => void;
  invoice: MobileInvoice | null;
  onPayNow?: (invoice: MobileInvoice) => void;
}

export const MobileRentalInvoiceDocument: React.FC<MobileRentalInvoiceDocumentProps> = ({
  visible,
  onClose,
  invoice,
  onPayNow,
}) => {
  const { state } = useMobileAppData();
  const { format, viewCurrency } = useMobileCurrency();

  if (!invoice) return null;

  // Resolve landlord/owner metadata from invoice or state.ownerSettings
  const ownerSettings = invoice.ownerId ? state.ownerSettings[invoice.ownerId] : undefined;
  const ownerBank = (ownerSettings?.paymentMethods as any)?.bank || (state as any).paymentMethods?.bank;
  const ownerUpi = (ownerSettings?.paymentMethods as any)?.upi || (state as any).paymentMethods?.upi;

  const currency = invoice.currency || viewCurrency || 'INR';
  const isDeposit = invoice.invoiceType === 'deposit' || invoice.type === 'deposit';
  const effectiveTemplate = isDeposit
    ? (ownerSettings?.depositTemplate || ownerSettings?.invoiceTemplate)
    : ownerSettings?.invoiceTemplate;

  const issuerName = effectiveTemplate?.issuerName || (invoice as any).issuerName || (invoice.propertyName ? `${invoice.propertyName} Management` : 'Property Management');
  const issuerTaxNo = effectiveTemplate?.issuerTaxNo || (invoice as any).issuerTaxNo || '';
  const issuerAddress = effectiveTemplate?.issuerAddress || (invoice as any).issuerAddress || '';
  const issuerPhone = effectiveTemplate?.issuerPhone || (invoice as any).issuerPhone || '';
  const issuerEmail = effectiveTemplate?.issuerEmail || (invoice as any).issuerEmail || '';

  const matchingTenant = (state.tenants || []).find((t) => {
    if (invoice.tenantId && (t.id === invoice.tenantId || (t as any).userId === invoice.tenantId)) return true;
    if (invoice.tenantEmail && t.email && t.email.toLowerCase() === invoice.tenantEmail.toLowerCase()) return true;
    if (invoice.tenant && t.name && t.name.toLowerCase() === invoice.tenant.toLowerCase()) {
      if (invoice.unit && (t.unit === invoice.unit || (t as any).unitNumber === invoice.unit)) return true;
    }
    if (invoice.unit && (t.unit === invoice.unit || (t as any).unitNumber === invoice.unit)) return true;
    return false;
  });

  const tenantName = invoice.tenant || matchingTenant?.name || 'Resident';
  const unitNumber = invoice.unit || matchingTenant?.unit || 'Unit N/A';
  const propertyName = invoice.propertyName || matchingTenant?.propertyName || 'Property Premises';
  const tenantTaxNo = (invoice as any).tenantTaxNo || (matchingTenant as any)?.taxId || (matchingTenant as any)?.panNo || '';
  const tenantPhone = (invoice as any).tenantPhone || matchingTenant?.phone || '';
  const tenantEmail = invoice.tenantEmail || matchingTenant?.email || '';

  const issueDate = invoice.issueDate ? invoice.issueDate.split('T')[0] : (invoice.due || 'N/A');
  const dueDate = invoice.due || 'N/A';

  // Billing cycle calculation
  const billingPeriodStart = (invoice as any).billingPeriodStart
    ? (invoice as any).billingPeriodStart.split('T')[0]
    : (() => {
      try {
        const d = invoice.due ? new Date(invoice.due) : new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      } catch {
        return 'N/A';
      }
    })();

  const billingPeriodEnd = (invoice as any).billingPeriodEnd
    ? (invoice as any).billingPeriodEnd.split('T')[0]
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
        id: '1',
        description: isDeposit
          ? `Security Deposit — Unit ${unitNumber}`
          : invoice.type === 'utility'
            ? `Utility Charges — Unit ${unitNumber}`
            : invoice.type === 'maintenance'
              ? `Maintenance & Repairs — Unit ${unitNumber}`
              : invoice.type === 'late_fee'
                ? `Late Fee Surcharge — Unit ${unitNumber}`
                : `Monthly Rent — Unit ${unitNumber}`,
        amount: invoice.amount || 0,
      },
    ];

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const taxAmount = invoice.tax || 0;
  const discount = (invoice as any).discount || 0;
  const lateFeeApplied = invoice.lateFeeApplied || 0;
  const isLateFeeWaived = Boolean(invoice.lateFeeWaived);
  const effectiveLateFee = isLateFeeWaived ? 0 : lateFeeApplied;
  const totalAmount = invoice.total || (subtotal + taxAmount + effectiveLateFee - discount);

  // Bank & Remittance
  const bankName = (invoice as any).bankDetails?.bankName || effectiveTemplate?.bankName || ownerBank?.bankName || '';
  const accountName = (invoice as any).bankDetails?.accountName || effectiveTemplate?.accountName || ownerBank?.accountName || '';
  const accountNumber = (invoice as any).bankDetails?.accountNumber || effectiveTemplate?.accountNumber || ownerBank?.accountNumber || '';
  const ifscOrRouting = (invoice as any).bankDetails?.ifscOrRouting || effectiveTemplate?.ifscOrRouting || ownerBank?.routing || '';
  const upiId = (invoice as any).bankDetails?.upiId || effectiveTemplate?.upiId || ownerUpi?.upiId || '';

  // Terms & Conditions
  const defaultTerms = `1. Payment is due strictly on or before the due date specified on this invoice.
2. Online NEFT / RTGS / UPI / Card transfers are subject to successful bank clearance.
3. Late payments will incur a recurring late fee penalty as specified in the lease agreement.
4. Any billing discrepancies must be reported to the landlord office within 3 days.
5. This is an official tax invoice issued pursuant to the executed tenancy agreement.`;

  const defaultDepositTerms = `1. Security Deposit Classification: 100% Refundable Security Deposit held in fiduciary trust custody by Landlord for the duration of the tenancy.
2. Custody & Non-Income Status: Security deposit funds remain non-commingled trust assets and do not constitute taxable rental income or property revenue.
3. Move-Out Inspection & Deductions: Following lease expiration and key surrender, a joint walkthrough inspection shall be conducted. Deductions are strictly limited to verified unpaid rent arrears, utility charges, or damage repair exceeding standard wear and tear.
4. Refund Disbursement: Net refundable balance shall be remitted to tenant within 14 business days of checkout clearance.
5. Official Deposit Receipt: Digitally generated and cryptographically tracked pursuant to Tenancy Regulations.`;

  const termsAndConditions = (invoice as any).termsAndConditions || effectiveTemplate?.termsAndConditions || (isDeposit ? defaultDepositTerms : defaultTerms);
  const notes = invoice.notes || effectiveTemplate?.notes || (isDeposit ? 'Funds are non-commingled, non-taxable security deposits held until lease conclusion and checkout verification.' : 'Thank you for your prompt tenancy settlement.');
  const signatoryName = (invoice as any).signatoryName || effectiveTemplate?.signatoryName || 'Authorized Property Manager';
  const signatureUrl = (invoice as any).signatureUrl || (invoice as any).signatorySignature || effectiveTemplate?.signatureUrl;

  const status = invoice.status || 'sent';
  const isPaid = status === 'paid';
  const isPending = status === 'pending_confirmation';
  const isOverdue = status === 'overdue';

  const documentTitle = (invoice as any).documentTitle || effectiveTemplate?.documentTitle || (isDeposit ? 'DEPOSIT RECEIPT' : 'INVOICE');

  const handleDownload = async () => {
    const esc = (v: unknown) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const includeTerms = (invoice as any).includeTerms !== false && effectiveTemplate?.includeTerms !== false;
    const payToParts = [
      bankName,
      accountName && `A/C ${accountName}`,
      accountNumber && `(${accountNumber})`,
      ifscOrRouting && `IFSC: ${ifscOrRouting}`,
      upiId && `UPI: ${upiId}`,
    ].filter(Boolean);
    const payToStr = payToParts.join(' · ') || (isDeposit ? 'Where deposit is held' : 'Bank or UPI details');
    const itemRows = items
      .map(
        (item: any) =>
          `<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:8px 0;font-weight:600;color:#111827;">${esc(item.description || (isDeposit ? 'Security deposit (Held in trust)' : 'Rental Charge'))}</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${esc(format(Number(item.amount) || 0, currency))}</td></tr>`
      )
      .join('');
    const html = `
      <html>
        <head><meta charset="utf-8" /><style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 26px; color: #111827; background: #FFFFFF; font-size: 12.5px; }
          .sheet { border: 1px solid #E5E7EB; border-radius: 8px; padding: 28px 30px; }
          .head { display: flex; justify-content: space-between; border-bottom: 1px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 18px; }
          .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px; }
          .total { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #E5E7EB; padding-top: 10px; margin-bottom: 18px; }
          .payto { background: #F9FAFB; padding: 10px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 11.5px; color: #4B5563; }
          .terms { border-top: 1px solid #E5E7EB; padding-top: 10px; margin-bottom: 14px; font-size: 11px; color: #4B5563; line-height: 1.5; white-space: pre-line; }
          .foot { border-top: 1px solid #E5E7EB; padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #6B7280; }
        </style></head>
        <body>
          <div class="sheet">
            <div class="head">
              <div>
                <div style="font-size:18px;font-weight:800;color:#111827;">${esc(issuerName)}</div>
                <div style="font-size:11.5px;color:#6B7280;margin-top:2px;line-height:1.4;">
                  ${issuerEmail ? `${esc(issuerEmail)}<br/>` : ''}
                  ${issuerPhone ? `${esc(issuerPhone)}<br/>` : ''}
                  ${issuerAddress ? `${esc(issuerAddress)}<br/>` : ''}
                  ${issuerTaxNo ? `<span style="color:#059669;font-weight:600;">${esc(issuerTaxNo)}</span>` : ''}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:16px;font-weight:800;color:#111827;">${esc(documentTitle)}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:2px;">No. ${esc(invoice.id)}<br/>${esc(issueDate)}</div>
              </div>
            </div>
            <div class="grid2">
              <div>
                <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px;">${isDeposit ? 'RECEIVED FROM' : 'BILL TO'}</div>
                <b>${esc(tenantName)}</b>
                <div style="color:#6B7280;font-size:11.5px;">Unit ${esc(unitNumber)} · ${esc(propertyName || 'Property Premises')}</div>
                ${tenantEmail || tenantPhone ? `<div style="color:#6B7280;font-size:11px;">${esc(tenantEmail)}${tenantPhone ? ` • ${esc(tenantPhone)}` : ''}</div>` : ''}
              </div>
              <div style="text-align:right;">
                <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px;">${isDeposit ? 'REFUND TIMELINE' : 'PAYMENT DUE'}</div>
                <div style="font-weight:600;">${isDeposit ? 'Within 14 days of move-out' : esc(dueDate)}</div>
                ${!isDeposit ? `<div style="color:#6B7280;font-size:11px;">Billing Cycle: ${esc(billingPeriodStart)} to ${esc(billingPeriodEnd)}</div>` : ''}
                ${isPaid ? `<div style="color:#059669;font-weight:600;font-size:11px;">✓ Payment Settled & Cleared</div>` : ''}
              </div>
            </div>
            <table><tbody>${itemRows}
              ${taxAmount > 0 ? `<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:8px 0;color:#6B7280;">Tax</td><td style="padding:8px 0;text-align:right;color:#6B7280;">${esc(format(taxAmount, currency))}</td></tr>` : ''}
              ${discount > 0 ? `<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:8px 0;color:#DC2626;">Discount</td><td style="padding:8px 0;text-align:right;color:#DC2626;">-${esc(format(discount, currency))}</td></tr>` : ''}
              ${effectiveLateFee > 0 ? `<tr style="border-bottom:1px solid #F3F4F6;"><td style="padding:8px 0;color:#DC2626;">Late Fee Penalty</td><td style="padding:8px 0;text-align:right;color:#DC2626;font-weight:600;">+${esc(format(effectiveLateFee, currency))}</td></tr>` : ''}
            </tbody></table>
            <div class="total">
              <span style="font-size:12px;font-weight:600;color:#6B7280;">${isDeposit ? 'Held for you' : isPaid ? 'Total Paid' : 'Total to pay'}</span>
              <b style="font-size:18px;color:#111827;">${esc(format(totalAmount, currency))}</b>
            </div>
            <div class="payto">
              <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px;">${isDeposit ? 'HELD AT' : 'PAY TO'}</div>
              <div>${esc(payToStr)}</div>
            </div>
            ${includeTerms && termsAndConditions ? `<div class="terms"><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;">${isDeposit ? 'DEPOSIT TERMS & CONDITIONS' : 'TERMS & CONDITIONS'}</div>${esc(termsAndConditions)}</div>` : ''}
            <div class="foot">
              <div>${esc(notes)}</div>
              <div style="text-align:right;font-weight:600;color:#111827;">${esc(signatoryName)}</div>
            </div>
          </div>
        </body>
      </html>
    `;
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${documentTitle} #${invoice.id}` });
      } else {
        Alert.alert('PDF Ready', `Saved to: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert('Download Error', e?.message || 'Unable to generate PDF.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View>
              <Text style={styles.topBarTitle}>Official Document</Text>
              <Text style={styles.topBarSub}>Ref #{invoice.id}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Scrollable Paper Sheet */}
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.paperSheet}>
              {/* Document Header */}
              <View style={styles.docHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.propertyName}>{propertyName.toUpperCase()}</Text>
                  <Text style={styles.issuerName}>{issuerName}</Text>
                  {issuerAddress ? <Text style={styles.issuerAddress}>{issuerAddress}</Text> : null}
                  {issuerEmail ? <Text style={styles.issuerAddress}>{issuerEmail}</Text> : null}
                  {issuerPhone ? <Text style={styles.issuerAddress}>{issuerPhone}</Text> : null}
                  {issuerTaxNo ? <Text style={[styles.issuerTax, { color: '#059669' }]}>{issuerTaxNo}</Text> : null}
                </View>

                <View style={styles.docTitleBox}>
                  <Text style={[styles.docTitleText, isDeposit && { color: '#B45309' }]}>
                    {documentTitle}
                  </Text>
                  <Text style={styles.docSubtitleText}>
                    {isDeposit ? 'Official Deposit Voucher' : 'Rental Billing & Tax Receipt'}
                  </Text>
                  <Text style={styles.invoiceIdText}>#{invoice.id}</Text>

                  {/* Stamp */}
                  <View
                    style={[
                      styles.stampBadge,
                      isPaid
                        ? styles.stampPaid
                        : isPending
                          ? styles.stampPending
                          : isOverdue
                            ? styles.stampOverdue
                            : styles.stampSent,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stampText,
                        isPaid
                          ? styles.stampTextPaid
                          : isPending
                            ? styles.stampTextPending
                            : isOverdue
                              ? styles.stampTextOverdue
                              : styles.stampTextSent,
                      ]}
                    >
                      {isPaid ? 'PAID & CLEARED' : isPending ? 'PENDING CONFIRMATION' : status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Billed To & Schedule (Stacked Cards) */}
              <View style={styles.metaCardsContainer}>
                {/* Billed To */}
                <View style={styles.metaCard}>
                  <Text style={styles.metaCardLabel}>BILLED TO (RESIDENT / TENANT)</Text>
                  <Text style={styles.tenantNameText}>{tenantName}</Text>
                  <Text style={styles.metaCardText}>
                    Unit: <Text style={styles.boldText}>{unitNumber}</Text> • {propertyName}
                  </Text>
                  {tenantTaxNo ? (
                    <Text style={styles.metaCardSubText}>Tax ID / PAN: {tenantTaxNo}</Text>
                  ) : null}
                  <Text style={styles.metaCardSubText}>
                    Phone: {tenantPhone || 'N/A'} • Email: {tenantEmail || 'N/A'}
                  </Text>
                </View>

                {/* Schedule & Timeline */}
                <View style={styles.metaCard}>
                  <Text style={styles.metaCardLabel}>INVOICE SCHEDULE & TIMELINE</Text>
                  <Text style={styles.metaCardText}>
                    Issue Date: <Text style={styles.boldText}>{issueDate}</Text>
                  </Text>
                  <Text style={[styles.metaCardText, isOverdue && { color: '#DC2626' }]}>
                    Payment Due Date: <Text style={styles.boldText}>{dueDate}</Text>
                  </Text>
                  <Text style={styles.metaCardSubText}>
                    Billing Cycle: {billingPeriodStart} to {billingPeriodEnd}
                  </Text>
                  {isPaid ? (
                    <View style={styles.settledRow}>
                      <Feather name="check-circle" size={13} color="#059669" style={{ marginRight: 4 }} />
                      <Text style={styles.settledText}>
                        Settled & Cleared
                        {invoice.paidAt ? ` on ${invoice.paidAt.split('T')[0]}` : ''}
                        {invoice.paymentMethodUsed ? ` via ${invoice.paymentMethodUsed}` : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Line Items Table */}
              <View style={styles.tableBox}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableColHeader, { flex: 1 }]}>Description / Item Details</Text>
                  <Text style={[styles.tableColHeader, { textAlign: 'right', minWidth: 90 }]}>Amount</Text>
                </View>

                {items.map((item, idx) => (
                  <View key={item.id || idx} style={styles.tableDataRow}>
                    <Text style={[styles.tableDescText, { flex: 1 }]}>
                      {item.description || 'Rental Charge'}
                    </Text>
                    <Text style={[styles.tableAmtText, { textAlign: 'right', minWidth: 90 }]}>
                      {format(Number(item.amount) || 0, currency)}
                    </Text>
                  </View>
                ))}

                {taxAmount > 0 ? (
                  <View style={styles.tableDataRow}>
                    <Text style={[styles.tableDescSubText, { flex: 1 }]}>
                      Applicable Tax / GST
                    </Text>
                    <Text style={[styles.tableAmtSubText, { textAlign: 'right', minWidth: 90 }]}>
                      {format(taxAmount, currency)}
                    </Text>
                  </View>
                ) : null}

                {discount > 0 ? (
                  <View style={styles.tableDataRow}>
                    <Text style={[styles.tableDescSubText, { flex: 1, color: '#DC2626' }]}>
                      Discount / Concession Deducted
                    </Text>
                    <Text style={[styles.tableAmtSubText, { textAlign: 'right', minWidth: 90, color: '#DC2626' }]}>
                      -{format(discount, currency)}
                    </Text>
                  </View>
                ) : null}

                {effectiveLateFee > 0 ? (
                  <View style={styles.tableDataRow}>
                    <Text style={[styles.tableDescSubText, { flex: 1, color: '#DC2626' }]}>
                      Late Fee Penalty {invoice.lateFeeCalculation ? `(${invoice.lateFeeCalculation})` : '• Surcharge'}
                    </Text>
                    <Text style={[styles.tableAmtSubText, { textAlign: 'right', minWidth: 90, color: '#DC2626', fontWeight: '700' }]}>
                      +{format(effectiveLateFee, currency)}
                    </Text>
                  </View>
                ) : null}

                {isLateFeeWaived && lateFeeApplied > 0 ? (
                  <View style={styles.tableDataRow}>
                    <Text style={[styles.tableDescSubText, { flex: 1, color: '#059669' }]}>
                      Late Fee Penalty (Waived by Landlord)
                    </Text>
                    <Text style={[styles.tableAmtSubText, { textAlign: 'right', minWidth: 90, color: '#059669', fontWeight: '700' }]}>
                      Waived (0)
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Financial Totals Summary */}
              <View style={styles.totalsContainer}>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Subtotal:</Text>
                  <Text style={styles.totalsVal}>{format(subtotal, currency)}</Text>
                </View>
                {taxAmount > 0 ? (
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Tax:</Text>
                    <Text style={styles.totalsVal}>{format(taxAmount, currency)}</Text>
                  </View>
                ) : null}
                {discount > 0 ? (
                  <View style={styles.totalsRow}>
                    <Text style={[styles.totalsLabel, { color: '#DC2626' }]}>Discount:</Text>
                    <Text style={[styles.totalsVal, { color: '#DC2626' }]}>-{format(discount, currency)}</Text>
                  </View>
                ) : null}
                {effectiveLateFee > 0 ? (
                  <View style={styles.totalsRow}>
                    <Text style={[styles.totalsLabel, { color: '#DC2626' }]}>Late Fee:</Text>
                    <Text style={[styles.totalsVal, { color: '#DC2626' }]}>+{format(effectiveLateFee, currency)}</Text>
                  </View>
                ) : null}

                <View style={styles.netDueRow}>
                  <Text style={styles.netDueLabel}>
                    {isDeposit ? 'Held for you:' : isPaid ? 'Total Paid:' : 'Total to pay:'}
                  </Text>
                  <Text style={[styles.netDueVal, isPaid && { color: '#059669' }]}>
                    {format(totalAmount, currency)}
                  </Text>
                </View>
              </View>

              {/* Pay To / Held At */}
              <View style={styles.remittanceBox}>
                <Text style={styles.sectionHeader}>{isDeposit ? 'HELD AT' : 'PAY TO'}</Text>
                {bankName || accountNumber ? (
                  <View style={{ marginTop: 4 }}>
                    <Text style={styles.remittanceText}>
                      Bank: <Text style={styles.boldText}>{bankName || 'Direct Deposit'}</Text> • A/C Name: <Text style={styles.boldText}>{accountName || '—'}</Text>
                    </Text>
                    <Text style={styles.remittanceText}>
                      A/C No: <Text style={styles.monoText}>{accountNumber || '—'}</Text>
                      {ifscOrRouting ? (
                        <> • IFSC: <Text style={styles.monoText}>{ifscOrRouting}</Text></>
                      ) : null}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.remittanceMuted}>Bank transfer details not provided.</Text>
                )}

                {upiId ? (
                  <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <Text style={styles.remittanceText}>
                      UPI ID / VPA: <Text style={[styles.monoText, { color: '#2563EB', fontWeight: '700' }]}>{upiId}</Text>
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Terms & Conditions */}
              {((invoice as any).includeTerms !== false && effectiveTemplate?.includeTerms !== false && termsAndConditions) ? (
                <View style={styles.termsBox}>
                  <Text style={styles.sectionHeader}>{isDeposit ? 'DEPOSIT TERMS & CONDITIONS' : 'TERMS & CONDITIONS'}</Text>
                  {termsAndConditions.split('\n').filter(Boolean).map((clause, idx) => (
                    <Text key={idx} style={[styles.termsText, { marginBottom: 3 }]}>{clause.trim()}</Text>
                  ))}
                  {notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>
                        <Text style={{ fontWeight: '700' }}>Note: </Text>
                        {notes}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Official Signatory Line */}
              <View style={styles.signatoryRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.platformLegal}>
                    Propithub Real Estate Cloud Operating Platform.
                    {'\n'}Electronic voucher legally generated under Tenancy Regulations.
                  </Text>
                </View>
                <View style={styles.signatoryBox}>
                  {signatureUrl ? (
                    <Image
                      source={{ uri: signatureUrl }}
                      style={styles.signatureImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={{ height: 26 }} />
                  )}
                  <View style={styles.signatoryLine} />
                  <Text style={styles.signatoryName}>{signatoryName}</Text>
                  <Text style={styles.signatoryTitle}>Authorized Signatory</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Actions */}
          <View style={styles.bottomActionsRow}>
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={handleDownload}
              activeOpacity={0.85}
            >
              <Feather name="download" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.downloadBtnText}>Download</Text>
            </TouchableOpacity>

            {!isPaid && onPayNow ? (
              <TouchableOpacity
                style={styles.payNowBtn}
                onPress={() => {
                  onClose();
                  onPayNow(invoice);
                }}
                activeOpacity={0.85}
              >
                <Feather name="zap" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.payNowBtnText}>Pay Now</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.closeActionBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeActionBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '94%',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  topBarSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  paperSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
  },
  docHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#0F172A',
    paddingBottom: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  propertyName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  issuerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 2,
  },
  issuerTax: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
  },
  issuerAddress: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 14,
  },
  docTitleBox: {
    alignItems: 'flex-end',
  },
  docTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  docSubtitleText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  invoiceIdText: {
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 12,
    color: '#2563EB',
    marginTop: 2,
  },
  stampBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  stampPaid: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  stampPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  stampOverdue: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  stampSent: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  stampText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stampTextPaid: {
    color: '#15803D',
  },
  stampTextPending: {
    color: '#B45309',
  },
  stampTextOverdue: {
    color: '#DC2626',
  },
  stampTextSent: {
    color: '#1D4ED8',
  },
  metaCardsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  metaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  metaCardLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  tenantNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaCardText: {
    fontSize: 12,
    color: '#1E293B',
    marginTop: 2,
  },
  metaCardSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  boldText: {
    fontWeight: '700',
  },
  monoText: {
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  settledText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  tableBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableDescText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  tableAmtText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  tableDescSubText: {
    fontSize: 11,
    color: '#64748B',
  },
  tableAmtSubText: {
    fontSize: 11,
    color: '#64748B',
  },
  totalsContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    marginBottom: 3,
  },
  totalsLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  totalsVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  netDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    borderTopWidth: 2,
    borderTopColor: '#0F172A',
    paddingTop: 6,
    marginTop: 4,
  },
  netDueLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  netDueVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2563EB',
  },
  remittanceBox: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  remittanceText: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16,
  },
  remittanceMuted: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 2,
  },
  termsBox: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    marginBottom: 16,
  },
  termsText: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 4,
  },
  notesBox: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  notesText: {
    fontSize: 11,
    color: '#1E293B',
    fontStyle: 'italic',
  },
  signatoryRow: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: '#CBD5E1',
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  platformLegal: {
    fontSize: 9.5,
    color: '#94A3B8',
    lineHeight: 13,
  },
  signatoryBox: {
    alignItems: 'center',
    minWidth: 130,
  },
  signatureImg: {
    height: 32,
    width: 110,
    marginBottom: 2,
  },
  signatoryLine: {
    width: 120,
    borderTopWidth: 1.5,
    borderTopColor: '#0F172A',
    marginBottom: 3,
  },
  signatoryName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  signatoryTitle: {
    fontSize: 9,
    color: '#64748B',
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingVertical: 11,
  },
  downloadBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  payNowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 11,
  },
  payNowBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  closeActionBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
});
