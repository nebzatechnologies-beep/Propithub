import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Share,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MobileInvoice, MobilePaymentTransaction } from '../types';

interface RentalInvoiceDocumentProps {
  invoice?: MobileInvoice | null;
  transaction?: MobilePaymentTransaction | null;
  ownerName?: string;
  onClose?: () => void;
}

export const RentalInvoiceDocument: React.FC<RentalInvoiceDocumentProps> = ({
  invoice,
  transaction,
  ownerName = 'Propithub Real Estate Management',
  onClose,
}) => {
  // Determine if deposit or standard rent invoice
  const isDeposit =
    invoice?.invoiceType === 'deposit' ||
    invoice?.type === 'deposit' ||
    transaction?.type === 'deposit' ||
    transaction?.type === 'deposit_refund';

  const docId = invoice?.id || transaction?.id || 'INV-000000';
  const currency = invoice?.currency || transaction?.currency || 'USD';
  const symbol =
    currency === 'INR' || currency === '₹'
      ? '₹'
      : currency === 'EUR'
        ? '€'
        : currency === 'GBP'
          ? '£'
          : '$';

  const tenantName = invoice?.tenant || transaction?.tenant || 'Resident / Tenant';
  const unitNumber = invoice?.unit || transaction?.unit || 'N/A';
  const propertyName = invoice?.propertyName || transaction?.propertyName || 'PROPITHUB RESIDENTIAL';

  const issuerName = ownerName || (invoice as any)?.issuerName || (propertyName ? `${propertyName} Management` : 'Property Management');
  const issuerTaxNo = (invoice as any)?.issuerTaxNo || '';
  const issuerAddress = (invoice as any)?.issuerAddress || '';
  const issuerPhone = (invoice as any)?.issuerPhone || '';
  const issuerEmail = (invoice as any)?.issuerEmail || '';

  const issueDate = invoice?.issueDate || transaction?.date || new Date().toISOString().split('T')[0];
  const dueDate = invoice?.due || transaction?.dueDate || issueDate;
  const status = (invoice?.status || transaction?.status || 'paid').toUpperCase();
  const paymentMethod = invoice?.paymentMethodUsed || transaction?.method || 'SANDBOX DEMO';

  // Billing period calculation fallback matching web
  const billingPeriodStart = issueDate;
  const billingPeriodEnd = dueDate;

  const documentTitle = isDeposit ? 'SECURITY DEPOSIT VOUCHER' : 'TAX INVOICE';
  const documentSubtitle = isDeposit
    ? 'Official Security Deposit Voucher'
    : 'Rental Billing & Tax Receipt';

  const items =
    invoice?.items && invoice.items.length > 0
      ? invoice.items
      : [
        {
          description: isDeposit
            ? `Security Deposit Clearance — Unit ${unitNumber}`
            : (transaction?.type as string) === 'utility'
              ? `Utility Charges — Unit ${unitNumber}`
              : (transaction?.type as string) === 'maintenance' || transaction?.type === 'task_fee'
                ? `Maintenance & Repairs — Unit ${unitNumber}`
                : transaction?.type === 'late_fee'
                  ? `Late Fee Surcharge — Unit ${unitNumber}`
                  : `Monthly Rent — Unit ${unitNumber}`,
          amount: invoice?.amount || transaction?.amount || 0,
        },
      ];

  const subtotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const taxAmount = invoice?.tax || 0;
  const totalAmount = invoice?.total || transaction?.amount || subtotal + taxAmount;
  const refNo = invoice?.receiptNumber || transaction?.referenceNo || transaction?.id || docId;

  const defaultDepositTerms = `1. Security Deposit Classification: 100% Refundable Security Deposit held in fiduciary trust custody by Landlord for the duration of the tenancy agreement.\n2. Custody & Non-Income Status: Security deposit funds remain non-commingled trust assets and do not constitute taxable rental income or property revenue.\n3. Move-Out Inspection & Deductions: Deductions are strictly limited to verified unpaid rent arrears, utility charges, or damage repair exceeding standard wear and tear.\n4. Refund Disbursement: Net refundable balance shall be remitted to tenant within 14 business days of checkout clearance.`;

  const defaultRentTerms = `1. Payment is due strictly on or before the due date specified on this invoice.\n2. Cheques / online NEFT / RTGS / UPI transfers are subject to successful bank clearance.\n3. Late payments will incur a recurring late fee penalty as specified in the lease agreement.\n4. Any billing discrepancies must be reported to the landlord office within 3 days.`;

  const termsText = isDeposit ? defaultDepositTerms : defaultRentTerms;
  const notesText = invoice?.notes || transaction?.notes || (isDeposit ? 'Funds are non-commingled, non-taxable security deposits held until lease conclusion.' : 'Thank you for your prompt tenancy settlement.');

  // HTML Generator matching Web document layout pixel-for-pixel using Propithub Emerald Green (#059669)
  const generateHTML = () => {
    const itemsHtml = items
      .map(
        (item) => `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 12px 14px; font-size: 13.5px; color: #12201B; font-weight: 600;">${item.description}</td>
          <td style="padding: 12px 14px; font-size: 13.5px; color: #12201B; font-weight: 700; text-align: right;">${symbol}${Number(item.amount).toLocaleString()}</td>
        </tr>`
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #12201B; margin: 0; padding: 40px; background: #FFF; }
            .paper { max-width: 800px; margin: 0 auto; background: #FFF; border: 1px solid #E2E8F0; border-radius: 6px; padding: 36px 40px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0F172A; padding-bottom: 20px; margin-bottom: 24px; }
            .brand { font-size: 20px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: -0.02em; }
            .issuer-name { font-size: 13px; font-weight: 600; color: #0F172A; margin-top: 4px; }
            .issuer-tax { font-size: 12px; font-weight: 700; color: #059669; margin-top: 2px; }
            .issuer-meta { font-size: 12px; color: #64748B; margin-top: 2px; line-height: 1.4; }
            .doc-title { font-size: ${isDeposit ? '18px' : '22px'}; font-weight: 800; color: ${isDeposit ? '#059669' : '#0F172A'}; text-align: right; text-transform: uppercase; letter-spacing: 0.03em; }
            .doc-sub { font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; text-align: right; margin-top: 2px; }
            .doc-id { font-family: monospace; font-size: 15px; font-weight: 700; color: #059669; margin-top: 4px; text-align: right; }
            .stamp { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 800; font-size: 11px; text-transform: uppercase; background: #DEF7EC; color: #03543F; float: right; margin-top: 8px; }
            .grid { display: flex; gap: 20px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; }
            .grid-col { flex: 1; background: #FAFAF7; padding: 14px 16px; border-radius: 4px; border: 1px solid #E2E8F0; }
            .grid-title { font-weight: 700; color: #64748B; text-transform: uppercase; font-size: 11px; margin-bottom: 4px; }
            .tenant-name { font-size: 15px; font-weight: 700; color: #0F172A; }
            table { width: 100%; margin-bottom: 20px; border-collapse: collapse; font-size: 13.5px; }
            th { background: #F8FAFC; text-align: left; padding: 11px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 2px solid #CBD5E1; }
            .summary-block { display: flex; justify-content: flex-end; margin-bottom: 24px; }
            .summary-table { width: 260px; font-size: 14px; line-height: 1.8; }
            .summary-row { display: flex; justify-content: space-between; color: #64748B; }
            .summary-total { display: flex; justify-content: space-between; border-top: 2px solid #0F172A; padding-top: 8px; margin-top: 6px; font-weight: 800; font-size: 18px; color: #0F172A; }
            .bank-sec { border-top: 1px solid #E2E8F0; padding-top: 16px; margin-bottom: 20px; font-size: 12.5px; line-height: 1.6; }
            .terms-sec { border-top: 1px solid #E2E8F0; padding-top: 16px; margin-bottom: 24px; font-size: 11.5px; color: #64748B; line-height: 1.5; white-space: pre-line; }
            .sign-sec { border-top: 1px dashed #CBD5E1; padding-top: 16px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #64748B; }
          </style>
        </head>
        <body>
          <div class="paper">
            <div class="header">
              <div>
                <div class="brand">${propertyName}</div>
                <div class="issuer-name">${issuerName}</div>
                ${issuerTaxNo ? `<div class="issuer-tax">${issuerTaxNo}</div>` : ''}
                ${(issuerAddress || issuerPhone || issuerEmail) ? `<div class="issuer-meta">
                  ${issuerAddress ? `${issuerAddress}<br />` : ''}
                  ${[issuerPhone ? `Phone: ${issuerPhone}` : '', issuerEmail ? `Email: ${issuerEmail}` : ''].filter(Boolean).join(' • ')}
                </div>` : ''}
              </div>
              <div>
                <div class="doc-title">${documentTitle}</div>
                <div class="doc-sub">${documentSubtitle}</div>
                <div class="doc-id">#${docId}</div>
                <div><span class="stamp">${status}</span></div>
              </div>
            </div>

            <div class="grid">
              <div class="grid-col">
                <div class="grid-title">BILLED TO (RESIDENT / TENANT):</div>
                <div class="tenant-name">${tenantName}</div>
                <div>Unit: <b>${unitNumber}</b> • ${propertyName}</div>
                <div style="color: #64748B; font-size: 12px;">Payment Method: <b>${paymentMethod}</b></div>
                <div style="color: #64748B; font-size: 12px;">Ref / UTR: <b style="font-family: monospace;">${refNo}</b></div>
              </div>
              <div class="grid-col" style="text-align: right;">
                <div class="grid-title">INVOICE SCHEDULE & TIMELINE:</div>
                <div>Issue Date: <b>${issueDate}</b></div>
                <div>Payment Due Date: <b>${dueDate}</b></div>
                <div style="color: #64748B; font-size: 12px;">Billing Cycle: <b>${billingPeriodStart}</b> to <b>${billingPeriodEnd}</b></div>
                <div style="color: #059669; font-weight: 700; margin-top: 4px;">✓ Payment Settled & Cleared</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="text-align: left;">Description / Item Details</th>
                  <th style="text-align: right;">Amount (${currency})</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                ${taxAmount > 0
        ? `<tr style="border-bottom: 1px solid #E2E8F0;">
                        <td style="padding: 12px 14px; font-size: 12px; color: #64748B;">Applicable Tax / GST</td>
                        <td style="padding: 12px 14px; font-size: 12px; color: #64748B; text-align: right;">${symbol}${taxAmount.toLocaleString()}</td>
                      </tr>`
        : ''
      }
              </tbody>
            </table>

            <div class="summary-block">
              <div class="summary-table">
                <div class="summary-row">
                  <span>Subtotal:</span>
                  <span>${symbol}${subtotal.toLocaleString()}</span>
                </div>
                ${taxAmount > 0
        ? `<div class="summary-row"><span>Tax:</span><span>${symbol}${taxAmount.toLocaleString()}</span></div>`
        : ''
      }
                <div class="summary-total">
                  <span>Net Amount Settled:</span>
                  <span style="color: #059669;">${symbol}${totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div class="bank-sec">
              <div style="font-weight: 700; text-transform: uppercase; font-size: 11px; color: #64748B; margin-bottom: 4px;">BANK REMITTANCE & PAYMENT DETAILS:</div>
              <div>Bank: <b>HDFC Bank (Direct Deposit)</b> • A/C Name: <b>Propithub Fiduciary Trust</b></div>
              <div>A/C No: <b style="font-family: monospace;">50200012345678</b> • IFSC: <b style="font-family: monospace;">HDFC0001234</b> • UPI ID: <b style="color: #059669; font-family: monospace;">propithub@hdfcbank</b></div>
            </div>

            <div class="terms-sec">
              <div style="font-weight: 700; text-transform: uppercase; font-size: 10.5px; color: #0F172A; margin-bottom: 4px;">TERMS & CONDITIONS (T&C):</div>
              <div>${termsText}</div>
              <div style="margin-top: 8px; font-weight: 600; color: #0F172A;">Note: ${notesText}</div>
            </div>

            <div class="sign-sec">
              <div>
                Propithub Real Estate Cloud Operating Platform.<br />
                Electronic voucher legally generated under the Tenancy Acts.
              </div>
              <div style="text-align: center; min-width: 170px;">
                <div style="height: 24px;"></div>
                <div style="border-top: 1.5px solid #0F172A; padding-top: 4px; font-weight: 700; color: #0F172A;">Authorized Property Manager</div>
                <div style="font-size: 10px; color: #64748B;">Authorized Signatory</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handleDownloadPDF = async () => {
    try {
      const html = generateHTML();
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Download Invoice ${docId}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Generated', `Invoice saved to: ${uri}`);
      }
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      Alert.alert('Error', 'Unable to generate PDF document.');
    }
  };

  const handleShareReceipt = async () => {
    try {
      const html = generateHTML();
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Invoice ${docId}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Share.share({
          message: `Official Invoice ${docId} for ${tenantName} - Unit ${unitNumber}. Settled Amount: ${symbol}${totalAmount}`,
        });
      }
    } catch (err) {
      console.error('Failed to share receipt:', err);
      Alert.alert('Error', 'Unable to share receipt.');
    }
  };

  return (
    <View style={styles.outerWrapper}>
      {Platform.OS === 'web' && (
        <style>{`
          @media print {
            [data-print="hidden"] {
              display: none !important;
            }
          }
        `}</style>
      )}
      {/* Top Modal Navigation Bar (Hidden during Print) */}
      <View style={styles.topModalNav} {...({ dataSet: { print: 'hidden' } } as any)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topNavTitle}>{documentTitle}</Text>
          <Text style={styles.topNavSub}>Official Record • #{docId}</Text>
        </View>
        {onClose && (
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* WEB PAPER DOCUMENT CONTAINER */}
      <View style={styles.paperContainer}>
        {/* Header with Issuer & Title */}
        <View style={styles.paperHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>{propertyName}</Text>
            <Text style={styles.issuerName}>{issuerName}</Text>
            {issuerTaxNo ? <Text style={styles.issuerTax}>{issuerTaxNo}</Text> : null}
            {issuerAddress ? <Text style={styles.issuerMeta}>{issuerAddress}</Text> : null}
            {(issuerPhone || issuerEmail) ? (
              <Text style={styles.issuerMeta}>
                {[issuerPhone ? `Phone: ${issuerPhone}` : '', issuerEmail ? `Email: ${issuerEmail}` : ''].filter(Boolean).join(' • ')}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.docTypeTitle, isDeposit && { color: '#059669' }]}>
              {documentTitle}
            </Text>
            <Text style={styles.docTypeSub}>{documentSubtitle}</Text>
            <Text style={styles.docIdText}>#{docId}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{status}</Text>
            </View>
          </View>
        </View>

        {/* 2-Column Schedule & Tenant Grid */}
        <View style={styles.gridRow}>
          <View style={styles.gridCard}>
            <Text style={styles.gridHeadLabel}>BILLED TO (RESIDENT / TENANT):</Text>
            <Text style={styles.tenantNameText}>{tenantName}</Text>
            <Text style={styles.gridMetaText}>
              Unit: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{unitNumber}</Text> • {propertyName}
            </Text>
            <Text style={styles.gridMetaSub}>Method: <Text style={{ fontWeight: '600', color: '#0F172A' }}>{paymentMethod}</Text></Text>
            <Text style={styles.gridMetaSub}>Ref / UTR: <Text style={styles.monoRef}>{refNo}</Text></Text>
          </View>

          <View style={[styles.gridCard, { alignItems: 'flex-end' }]}>
            <Text style={styles.gridHeadLabel}>INVOICE SCHEDULE & TIMELINE:</Text>
            <Text style={styles.gridMetaText}>Issue Date: <Text style={{ fontWeight: '700' }}>{issueDate}</Text></Text>
            <Text style={styles.gridMetaText}>Payment Due: <Text style={{ fontWeight: '700' }}>{dueDate}</Text></Text>
            <Text style={styles.gridMetaSub}>Billing Cycle: <Text style={{ fontWeight: '600' }}>{billingPeriodStart}</Text> to <Text style={{ fontWeight: '600' }}>{billingPeriodEnd}</Text></Text>
            <Text style={styles.settledCheckText}>✓ Payment Settled & Cleared</Text>
          </View>
        </View>

        {/* Itemized Table */}
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeadCol, { flex: 2 }]}>Description / Item Details</Text>
          <Text style={[styles.tableHeadCol, { flex: 1, textAlign: 'right' }]}>Amount ({currency})</Text>
        </View>

        {items.map((item, idx) => (
          <View key={idx} style={styles.tableBodyRow}>
            <Text style={[styles.itemDescText, { flex: 2 }]}>{item.description}</Text>
            <Text style={[styles.itemAmtText, { flex: 1 }]}>
              {symbol}{Number(item.amount).toLocaleString()}
            </Text>
          </View>
        ))}

        {taxAmount > 0 && (
          <View style={styles.tableBodyRow}>
            <Text style={[styles.itemDescText, { flex: 2, color: '#64748B' }]}>Applicable Tax / GST</Text>
            <Text style={[styles.itemAmtText, { flex: 1, color: '#64748B' }]}>
              {symbol}{taxAmount.toLocaleString()}
            </Text>
          </View>
        )}

        {/* Right Aligned Financial Totals Block */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal:</Text>
              <Text style={styles.totalsVal}>{symbol}{subtotal.toLocaleString()}</Text>
            </View>
            {taxAmount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax:</Text>
                <Text style={styles.totalsVal}>{symbol}{taxAmount.toLocaleString()}</Text>
              </View>
            )}
            <View style={styles.totalsNetRow}>
              <Text style={styles.totalsNetLabel}>Net Amount Settled:</Text>
              <Text style={styles.totalsNetVal}>{symbol}{totalAmount.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Bank Details Section */}
        <View style={styles.bankSection}>
          <Text style={styles.sectionHeadLabel}>BANK REMITTANCE & PAYMENT DETAILS:</Text>
          <Text style={styles.bankText}>
            Bank: <Text style={{ fontWeight: '700' }}>HDFC Bank (Direct Deposit)</Text> • A/C Name: <Text style={{ fontWeight: '700' }}>Propithub Fiduciary Trust</Text>
          </Text>
          <Text style={styles.bankText}>
            A/C No: <Text style={styles.monoRef}>50200012345678</Text> • IFSC: <Text style={styles.monoRef}>HDFC0001234</Text> • UPI ID: <Text style={[styles.monoRef, { color: '#059669' }]}>propithub@hdfcbank</Text>
          </Text>
        </View>

        {/* Terms & Conditions Section */}
        <View style={styles.termsSection}>
          <Text style={styles.sectionHeadLabel}>TERMS & CONDITIONS (T&C):</Text>
          <Text style={styles.termsBodyText}>{termsText}</Text>
          {notesText ? (
            <Text style={styles.notesText}><Text style={{ fontWeight: '700', color: '#0F172A' }}>Note: </Text>{notesText}</Text>
          ) : null}
        </View>

        {/* Signatory Footer */}
        <View style={styles.signSection}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.signLegalText}>Propithub Real Estate Cloud Operating Platform.</Text>
            <Text style={styles.signLegalText}>Electronic voucher legally generated under the Tenancy Acts.</Text>
          </View>

          <View style={{ alignItems: 'center', minWidth: 160 }}>
            <View style={{ height: 20 }} />
            <View style={styles.signLine} />
            <Text style={styles.signNameText}>Authorized Property Manager</Text>
            <Text style={styles.signRoleText}>Authorized Signatory</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons Row (Hidden during Print) */}
      <View style={styles.actionRow} {...({ dataSet: { print: 'hidden' } } as any)}>
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={handleDownloadPDF}
          activeOpacity={0.85}
        >
          <Feather name="download" size={16} color="#475569" style={{ marginRight: 6 }} />
          <Text style={styles.downloadBtnText}>Download PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShareReceipt}
          activeOpacity={0.85}
        >
          <Feather name="share-2" size={16} color="#0F172A" style={{ marginRight: 6 }} />
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    padding: 2,
    backgroundColor: '#FFFFFF',
  },
  topModalNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topNavTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  topNavSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  paperContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
  },
  paperHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: '#0F172A',
    paddingBottom: 14,
    marginBottom: 16,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.3,
  },
  issuerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 2,
  },
  issuerTax: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  issuerMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  docTypeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  docTypeSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  docIdText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#059669',
    marginTop: 3,
  },
  statusBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#03543F',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#FAFAF7',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    padding: 10,
  },
  gridHeadLabel: {
    fontSize: 10,
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
  gridMetaText: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  gridMetaSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  monoRef: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#0F172A',
  },
  settledCheckText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 2,
    borderBottomColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableHeadCol: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  tableBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  itemDescText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#12201B',
  },
  itemAmtText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#12201B',
    textAlign: 'right',
  },
  totalsBlock: {
    alignItems: 'flex-end',
    marginVertical: 14,
  },
  totalsTable: {
    width: 220,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalsLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  totalsVal: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  totalsNetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: '#0F172A',
    paddingTop: 6,
    marginTop: 4,
  },
  totalsNetLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  totalsNetVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
  },
  bankSection: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    marginBottom: 14,
  },
  sectionHeadLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bankText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
  },
  termsSection: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    marginBottom: 16,
  },
  termsBodyText: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 15,
  },
  notesText: {
    fontSize: 10.5,
    color: '#0F172A',
    marginTop: 6,
  },
  signSection: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  signLegalText: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
  },
  signLine: {
    width: 140,
    height: 1.5,
    backgroundColor: '#0F172A',
    marginBottom: 4,
  },
  signNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  signRoleText: {
    fontSize: 10,
    color: '#64748B',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  downloadBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
  shareBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
});
