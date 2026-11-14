import { jsPDF } from 'jspdf';
import { PaymentTransaction, Agreement, Invoice, InvoiceTemplateConfig, PlatformInvoice, PlatformInvoiceTemplateConfig, DepositSettlement, CashHandoverClaim } from '../types';
import { DEFAULT_CURRENCY, getCurrencySymbol, normalizeCurrencyCode } from './currencyService';
import { formatOrdinalDay } from './dates';

export function renderRentReceiptPage(doc: jsPDF, payment: PaymentTransaction, propertyName: string, ownerName: string): void {
  // Header branding
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27); // #12201B
  doc.text('PROPITHUB PROPERTY PLATFORM', 20, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 92, 85); // #4B5C55
  doc.text('OFFICIAL RENT RECEIPT & PAYMENT CONFIRMATION', 20, 32);

  // Divider
  doc.setDrawColor(216, 222, 216);
  doc.line(20, 37, 190, 37);

  // Metadata block
  doc.setFontSize(11);
  doc.setTextColor(18, 32, 27);
  doc.text(`Receipt Reference: ${payment.id}`, 20, 48);
  doc.text(`Payment Date: ${payment.date}`, 130, 48);
  doc.text(`Payment Method: ${payment.method}`, 130, 56);
  doc.text(`Status: COMPLETED / CONFIRMED`, 20, 56);

  // Property & Tenant Box
  doc.setFillColor(245, 247, 245);
  doc.rect(20, 65, 170, 35, 'F');
  doc.rect(20, 65, 170, 35, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TENANT DETAILS', 25, 74);
  doc.text('PROPERTY & UNIT', 110, 74);

  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${payment.tenant}`, 25, 82);
  doc.text(`Unit: ${payment.unit}`, 110, 82);
  doc.text(`Landlord: ${ownerName}`, 25, 90);
  doc.text(`Property: ${propertyName}`, 110, 90);

  // Payment Breakdown Table Header
  doc.setFillColor(47, 93, 80); // ledger green
  doc.rect(20, 110, 170, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DESCRIPTION', 25, 117);
  doc.text('PERIOD / DUE DATE', 100, 117);
  doc.text('AMOUNT', 160, 117);

  const curr = getCurrencySymbol((payment as any).currency || DEFAULT_CURRENCY);
  const isIndian = normalizeCurrencyCode((payment as any).currency || DEFAULT_CURRENCY) === 'INR';

  // Table Row
  doc.setTextColor(18, 32, 27);
  doc.setFont('helvetica', 'normal');
  doc.text(`Monthly Rent - Unit ${payment.unit}`, 25, 130);
  doc.text(payment.dueDate || payment.date, 100, 130);
  doc.text(`${curr}${payment.amount.toLocaleString(isIndian ? 'en-IN' : 'en-US')}`, 160, 130);

  if (payment.lateFeeApplied) {
    doc.text(`Late Fee Penalty`, 25, 140);
    doc.text(`Grace period passed`, 100, 140);
    doc.text(`${curr}${payment.lateFeeApplied.toLocaleString(isIndian ? 'en-IN' : 'en-US')}`, 160, 140);
  }

  // Divider
  doc.line(20, 155, 190, 155);

  // Total
  const grandTotal = payment.amount + (payment.lateFeeApplied || 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TOTAL PAID:', 110, 168);
  doc.text(`${curr}${grandTotal.toLocaleString(isIndian ? 'en-IN' : 'en-US')}`, 160, 168);

  // Footer Note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(120, 135, 128);
  doc.text('This receipt was digitally generated and verified on the Propithub Property Management Platform.', 20, 260);
  doc.text('Propithub — Property operations, end to end.', 20, 266);
}

export function downloadRentReceipt(payment: PaymentTransaction, propertyName: string, ownerName: string): void {
  const doc = new jsPDF();
  renderRentReceiptPage(doc, payment, propertyName, ownerName);
  doc.save(`Receipt_${payment.id}_${payment.unit}.pdf`);
}

export function generateRentReceiptPdfBase64(payment: PaymentTransaction, propertyName: string, ownerName: string): string {
  const doc = new jsPDF();
  renderRentReceiptPage(doc, payment, propertyName, ownerName);
  const dataUri = doc.output('datauristring');
  return dataUri.split(',')[1] || '';
}

export function downloadAgreementSummary(agreement: Agreement, propertyName: string): void {
  const doc = new jsPDF();

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('RESIDENTIAL LEASE DOCUMENT', 20, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 92, 85);
  doc.text(`AGREEMENT REF: ${agreement.id}`, 20, 32);

  doc.setDrawColor(216, 222, 216);
  doc.line(20, 37, 190, 37);

  doc.setFontSize(11);
  doc.setTextColor(18, 32, 27);
  doc.text(`Property: ${propertyName}`, 20, 48);
  doc.text(`Unit: ${agreement.unit}`, 20, 56);
  doc.text(`Tenant: ${agreement.tenant}`, 20, 64);
  doc.text(`Lease Term: ${agreement.start} to ${agreement.end}`, 20, 72);
  const agCurr = getCurrencySymbol(agreement.currency || DEFAULT_CURRENCY);
  const isAgIndian = normalizeCurrencyCode(agreement.currency || DEFAULT_CURRENCY) === 'INR';
  doc.text(`Monthly Rent: ${agCurr}${agreement.rent.toLocaleString(isAgIndian ? 'en-IN' : 'en-US')}`, 20, 80);
  doc.text(`Security Deposit: ${agCurr}${agreement.deposit.toLocaleString(isAgIndian ? 'en-IN' : 'en-US')}`, 20, 88);
  doc.text(`Status: ${agreement.status.toUpperCase()}`, 20, 96);

  if (agreement.tenantSignature) {
    doc.setFillColor(241, 231, 210);
    doc.rect(20, 110, 170, 25, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('DIGITALLY SIGNED BY TENANT', 25, 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Timestamp: ${agreement.tenantSignature.signedAt}`, 25, 128);
  }

  doc.save(`Agreement_${agreement.id}_${agreement.unit}.pdf`);
}

/**
 * Download a single official Rental Invoice as A4 PDF
 */
export function downloadSingleInvoicePDF(
  invoice: Invoice,
  template?: Partial<InvoiceTemplateConfig>
): void {
  const doc = new jsPDF();
  renderInvoiceVoucherPage(doc, invoice, template);
  const cleanId = String(invoice.id || 'INVOICE').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUnit = String(invoice.unit || 'Premises').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Invoice_${cleanId}_${cleanUnit}.pdf`);
}

/**
 * Generate official A4 Rental Invoice as Base64-encoded PDF string
 */
export function generateInvoicePdfBase64(
  invoice: Invoice,
  template?: Partial<InvoiceTemplateConfig>
): string {
  const doc = new jsPDF();
  renderInvoiceVoucherPage(doc, invoice, template);
  const dataUri = doc.output('datauristring');
  return dataUri.split(',')[1] || '';
}

/**
 * Helper to render an official A4 Rental Invoice matching RentalInvoiceDocument 1:1
 */
function renderInvoiceVoucherPage(
  doc: jsPDF,
  invoice: Invoice,
  template?: Partial<InvoiceTemplateConfig>
): void {
  const tmpl = template || {};
  const isDeposit = invoice.invoiceType === 'deposit' || invoice.type === 'deposit';
  const propertyName = invoice.propertyName || '';
  const unitNumber = invoice.unit || 'Unit N/A';
  const tenantName = invoice.tenant || 'Resident';

  const issuerName =
    tmpl.issuerName ||
    invoice.issuerName ||
    (propertyName ? `${propertyName} Management` : 'Property Management');
  const issuerEmail = tmpl.issuerEmail || invoice.issuerEmail || '';
  const issuerPhone = tmpl.issuerPhone || invoice.issuerPhone || '';
  const issuerAddress = tmpl.issuerAddress || invoice.issuerAddress || '';
  const issuerTaxNo = tmpl.issuerTaxNo || invoice.issuerTaxNo || '';

  const documentTitle =
    invoice.documentTitle || tmpl.documentTitle || (isDeposit ? 'DEPOSIT RECEIPT' : 'INVOICE');

  const issueDate = invoice.issueDate ? String(invoice.issueDate).split('T')[0] : String(invoice.due || 'N/A');
  const formattedIssueDate =
    issueDate !== 'N/A'
      ? (() => {
          try {
            return new Date(issueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
          } catch {
            return issueDate;
          }
        })()
      : 'N/A';
  const dueDate = invoice.due ? String(invoice.due).split('T')[0] : 'N/A';

  const rawCurr = invoice.currency || DEFAULT_CURRENCY;
  const rawSym = getCurrencySymbol(rawCurr) || '$';
  const pdfSym = rawSym === '₹' ? 'Rs. ' : rawSym;
  const isIndian = normalizeCurrencyCode(rawCurr) === 'INR';
  const locale = isIndian ? 'en-IN' : 'en-US';
  const status = String(invoice.status || 'sent').toLowerCase();

  // 1. Header (Left: Issuer, Right: INVOICE + No. + Date + Status)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(String(issuerName), 20, 22);

  let leftY = 27.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128); // #6B7280
  if (issuerEmail) {
    doc.text(String(issuerEmail), 20, leftY);
    leftY += 4;
  }
  if (issuerPhone) {
    doc.text(String(issuerPhone), 20, leftY);
    leftY += 4;
  }
  if (issuerAddress) {
    const addrLines = doc.splitTextToSize(String(issuerAddress), 95);
    doc.text(addrLines, 20, leftY);
    leftY += addrLines.length * 4;
  }
  if (issuerTaxNo) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105); // #059669
    doc.text(String(issuerTaxNo), 20, leftY);
    leftY += 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text(String(documentTitle), 190, 22, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text(`No. ${invoice.id || 'INV-DRAFT'}`, 190, 27.5, { align: 'right' });
  doc.text(formattedIssueDate, 190, 31.5, { align: 'right' });

  if (status) {
    const statusText = status === 'pending_confirmation' ? 'PENDING CONFIRMATION' : status.toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const badgeW = doc.getTextWidth(statusText) + 7;
    if (status === 'paid') {
      doc.setFillColor(209, 250, 229);
      doc.setTextColor(5, 150, 105);
    } else if (status === 'overdue') {
      doc.setFillColor(254, 226, 226);
      doc.setTextColor(220, 38, 38);
    } else {
      doc.setFillColor(254, 243, 199);
      doc.setTextColor(217, 119, 6);
    }
    doc.roundedRect(190 - badgeW, 34.5, badgeW, 5.5, 2.5, 2.5, 'F');
    doc.text(statusText, 190 - 3.5, 38.3, { align: 'right' });
  }

  const headerBottomY = Math.max(leftY + 2, 43);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.35);
  doc.line(20, headerBottomY, 190, headerBottomY);

  // 2. Two-Column Info (BILL TO / PAYMENT DUE)
  let y = headerBottomY + 7;
  let billY = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175); // #9CA3AF
  doc.text(isDeposit ? 'RECEIVED FROM' : 'BILL TO', 20, billY);
  billY += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(String(tenantName), 20, billY);
  billY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text(`Unit ${unitNumber} - ${propertyName || 'Property Premises'}`, 20, billY);
  billY += 4.2;

  if (invoice.tenantEmail || invoice.tenantPhone) {
    doc.setFontSize(8);
    doc.text(`${invoice.tenantEmail || ''}${invoice.tenantPhone ? ` - ${invoice.tenantPhone}` : ''}`, 20, billY);
    billY += 4;
  }
  if (invoice.tenantTaxNo) {
    doc.setFontSize(8);
    doc.text(`Tax ID / PAN: ${invoice.tenantTaxNo}`, 20, billY);
    billY += 4;
  }

  // Right column: PAYMENT DUE / REFUND TIMELINE
  let dueY = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(isDeposit ? 'REFUND TIMELINE' : 'PAYMENT DUE', 190, dueY, { align: 'right' });
  dueY += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(!isDeposit && status === 'overdue' ? 220 : 17, !isDeposit && status === 'overdue' ? 38 : 24, !isDeposit && status === 'overdue' ? 38 : 39);
  const refundDays = invoice.refundTimelineDays || tmpl.refundTimelineDays || 14;
  doc.text(isDeposit ? `Within ${refundDays} days of move-out` : dueDate, 190, dueY, { align: 'right' });
  dueY += 4.5;

  if (!isDeposit && invoice.billingPeriodStart && invoice.billingPeriodEnd) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `Billing Cycle: ${String(invoice.billingPeriodStart).split('T')[0]} to ${String(invoice.billingPeriodEnd).split('T')[0]}`,
      190,
      dueY,
      { align: 'right' }
    );
    dueY += 4.2;
  }
  if (status === 'paid') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(5, 150, 105);
    const paidOn = invoice.paidAt ? ` on ${new Date(invoice.paidAt).toLocaleDateString()}` : '';
    doc.text(`Payment Settled & Cleared${paidOn}`, 190, dueY, { align: 'right' });
    dueY += 4.2;
  }

  // 3. Minimal Line Items Table
  y = Math.max(billY, dueY) + 6;
  const items =
    invoice.items && invoice.items.length > 0
      ? invoice.items
      : [
          {
            description:
              invoice.invoiceType === 'deposit'
                ? `Security Deposit - Unit ${unitNumber}`
                : invoice.invoiceType === 'utility'
                ? `Utility Charges - Unit ${unitNumber}`
                : invoice.invoiceType === 'maintenance'
                ? `Maintenance & Repairs - Unit ${unitNumber}`
                : invoice.invoiceType === 'late_fee'
                ? `Late Fee Surcharge - Unit ${unitNumber}`
                : `Monthly Rent - Unit ${unitNumber}`,
            amount: Number(invoice.amount) || 0,
          },
        ];

  const drawItemRow = (label: string, amtText: string, color: [number, number, number], bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(String(label), 125);
    doc.text(lines, 20, y);
    doc.text(amtText, 190, y, { align: 'right' });
    y += Math.max(7, lines.length * 4 + 3);
    doc.setDrawColor(243, 244, 246);
    doc.setLineWidth(0.25);
    doc.line(20, y - 2, 190, y - 2);
  };

  items.forEach((item) => {
    drawItemRow(
      item.description || (isDeposit ? 'Security deposit (Held in trust)' : 'Rental Charge'),
      `${pdfSym}${(Number(item.amount) || 0).toLocaleString(locale)}`,
      [17, 24, 39],
      true
    );
  });

  const taxAmt = Number(invoice.tax) || 0;
  if (taxAmt > 0) {
    drawItemRow(`Tax ${tmpl.taxLabel || 'GST'}`, `${pdfSym}${taxAmt.toLocaleString(locale)}`, [107, 114, 128]);
  }
  const discountAmt = Number(invoice.discount) || 0;
  if (discountAmt > 0) {
    drawItemRow('Discount / Concession Deducted', `-${pdfSym}${discountAmt.toLocaleString(locale)}`, [220, 38, 38]);
  }
  const lateFeeAmt = Number(invoice.lateFeeApplied) || 0;
  if (!invoice.lateFeeWaived && lateFeeAmt > 0) {
    drawItemRow(
      `Late Fee Penalty${invoice.lateFeeCalculation ? ` (${invoice.lateFeeCalculation})` : ''}`,
      `+${pdfSym}${lateFeeAmt.toLocaleString(locale)}`,
      [220, 38, 38],
      true
    );
  } else if (invoice.lateFeeWaived && lateFeeAmt > 0) {
    drawItemRow('Late Fee Penalty (Waived)', `${pdfSym}0 (WAIVED)`, [5, 150, 105], true);
  }

  // 4. Total Row
  y += 2;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(20, y, 190, y);
  y += 7;

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const effectiveLateFee = invoice.lateFeeWaived ? 0 : lateFeeAmt;
  const totalAmount = Number(
    invoice.total != null ? invoice.total : subtotal + taxAmt + effectiveLateFee - discountAmt
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(107, 114, 128);
  doc.text(isDeposit ? 'Held for you' : status === 'paid' ? 'Total Paid' : 'Total to pay', 20, y);

  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text(`${pdfSym}${totalAmount.toLocaleString(locale)}`, 190, y, { align: 'right' });

  // 5. PAY TO / HELD AT Box
  y += 8;
  const bankName = invoice.bankDetails?.bankName || tmpl.bankName || '';
  const accountName = invoice.bankDetails?.accountName || tmpl.accountName || '';
  const accountNumber = invoice.bankDetails?.accountNumber || tmpl.accountNumber || '';
  const ifscOrRouting = invoice.bankDetails?.ifscOrRouting || tmpl.ifscOrRouting || '';
  const upiId = invoice.bankDetails?.upiId || tmpl.upiId || '';
  const payToParts = [
    bankName,
    accountName && `A/C ${accountName}`,
    accountNumber && `(${accountNumber})`,
    ifscOrRouting && `IFSC: ${ifscOrRouting}`,
    upiId && `UPI: ${upiId}`,
  ].filter(Boolean);
  const payToText = payToParts.join(' - ') || (isDeposit ? 'Where deposit is held' : 'Bank or UPI details');
  const payToLines = doc.splitTextToSize(payToText, 162);
  const payBoxH = 10 + payToLines.length * 4;

  doc.setFillColor(249, 250, 251);
  doc.roundedRect(20, y, 170, payBoxH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(isDeposit ? 'HELD AT' : 'PAY TO', 24, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  doc.text(payToLines, 24, y + 10);
  y += payBoxH + 6;

  // 6. Terms & Conditions (only when includeTerms is enabled)
  const includeTerms = (invoice as any).includeTerms !== false && tmpl.includeTerms !== false;
  const termsText = invoice.termsAndConditions || tmpl.termsAndConditions || '';
  if (includeTerms && termsText.trim()) {
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(20, y, 190, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(isDeposit ? 'DEPOSIT TERMS & CONDITIONS' : 'TERMS & CONDITIONS', 20, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    const splitTerms = doc.splitTextToSize(String(termsText), 170);
    doc.text(splitTerms.slice(0, 7), 20, y);
  }

  // 7. Footer
  const footerY = 262;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(20, footerY, 190, footerY);

  const notesText = invoice.notes || tmpl.notes || (isDeposit ? 'Refundable upon move-out inspection.' : 'Thank you for your tenancy.');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  const noteLines = doc.splitTextToSize(String(notesText), 120);
  doc.text(noteLines, 20, footerY + 6);

  const signatory = invoice.signatoryName || tmpl.signatoryName || 'Authorized Property Manager';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39);
  doc.text(String(signatory), 190, footerY + 6, { align: 'right' });
}

/**
 * Bulk Download: Generates a multi-page PDF financial statement and vouchers for filtered invoices
 */
export function downloadBulkInvoicesPDF(invoices: Invoice[], title: string, timelineLabel: string): void {
  if (invoices.length === 0) return;

  const doc = new jsPDF();

  // Page 1: Financial Statement Summary Cover Page
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('PROPITHUB PROPERTY PLATFORM', 20, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(156, 122, 52);
  doc.text(title.toUpperCase(), 20, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 92, 85);
  doc.text(`Billing Timeline Filter: ${timelineLabel}`, 20, 39);
  doc.text(`Generated On: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 20, 45);

  doc.setDrawColor(216, 222, 216);
  doc.line(20, 50, 190, 50);

  // Summary Metrics Cards
  const totalBilled = invoices.reduce((sum, i) => sum + (Number(i.total != null ? i.total : i.amount) || 0), 0);
  const totalCollected = invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + (Number(i.total != null ? i.total : i.amount) || 0), 0);
  const pendingAmount = invoices.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + (Number(i.total != null ? i.total : i.amount) || 0), 0);
  const totalTaxes = invoices.reduce((sum, i) => sum + (Number(i.tax) || 0), 0);

  doc.setFillColor(245, 247, 245);
  doc.rect(20, 55, 38, 24, 'F');
  doc.rect(62, 55, 38, 24, 'F');
  doc.rect(104, 55, 38, 24, 'F');
  doc.rect(146, 55, 44, 24, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 92, 85);
  doc.text('TOTAL BILLED', 24, 62);
  doc.text('TOTAL COLLECTED', 66, 62);
  doc.text('OUTSTANDING', 108, 62);
  doc.text('TAXES / GST', 150, 62);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(18, 32, 27);
  doc.text(`INR ${totalBilled.toLocaleString('en-IN')}`, 24, 72);
  doc.setTextColor(22, 101, 52);
  doc.text(`INR ${totalCollected.toLocaleString('en-IN')}`, 66, 72);
  doc.setTextColor(162, 59, 46);
  doc.text(`INR ${pendingAmount.toLocaleString('en-IN')}`, 108, 72);
  doc.setTextColor(156, 122, 52);
  doc.text(`INR ${totalTaxes.toLocaleString('en-IN')}`, 150, 72);

  // Invoices Schedule Table
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 88, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('INVOICE ID', 23, 94);
  doc.text('TENANT & UNIT', 58, 94);
  doc.text('DUE DATE', 110, 94);
  doc.text('STATUS', 138, 94);
  doc.text('AMOUNT', 168, 94);

  let y = 103;
  doc.setTextColor(18, 32, 27);
  invoices.slice(0, 16).forEach((inv) => {
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.text(String(inv.id || 'INV-0000'), 23, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const tName = String(inv.tenant || 'Resident');
    const uName = String(inv.unit || 'Premises');
    doc.text(`${tName.slice(0, 14)} (${uName})`, 58, y);
    doc.text(String(inv.due || '—'), 110, y);

    doc.setFont('helvetica', 'bold');
    const st = String(inv.status || 'sent').toUpperCase();
    doc.text(st, 138, y);
    const invTot = Number(inv.total != null ? inv.total : inv.amount) || 0;
    doc.text(`INR ${invTot.toLocaleString('en-IN')}`, 168, y);
    y += 8;
  });

  if (invoices.length > 16) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(75, 92, 85);
    doc.text(`... and ${invoices.length - 16} more invoices attached on individual voucher pages below.`, 20, y + 4);
  }

  // Subsequent Pages: Each Individual Invoice Voucher
  invoices.forEach((inv) => {
    doc.addPage();
    renderInvoiceVoucherPage(doc, inv);
  });

  const cleanLabel = String(timelineLabel || 'Consolidated').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Bulk_Invoices_${cleanLabel}.pdf`);
}

/**
 * Bulk Download: Platform SaaS Subscription Invoices (Superadmin)
 */
export function downloadBulkPlatformInvoicesPDF(invoices: PlatformInvoice[], timelineLabel: string): void {
  if (invoices.length === 0) return;

  const doc = new jsPDF();

  // Page 1: SaaS Financial Cover Sheet
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('PROPITHUB SAAS CLOUD PLATFORM', 20, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(156, 122, 52);
  doc.text('PLATFORM SAAS SUBSCRIPTION INVOICE STATEMENT', 20, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 92, 85);
  doc.text(`Timeline Filter: ${timelineLabel} • Total Records: ${invoices.length}`, 20, 39);

  doc.setDrawColor(216, 222, 216);
  doc.line(20, 44, 190, 44);

  const totalCollected = invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.total, 0);
  const totalOutstanding = invoices.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + i.total, 0);

  doc.setFillColor(245, 247, 245);
  doc.rect(20, 50, 78, 22, 'F');
  doc.rect(112, 50, 78, 22, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('TOTAL RECONCILED MRR', 26, 58);
  doc.text('TOTAL OUTSTANDING', 118, 58);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(22, 101, 52);
  doc.text(`$${totalCollected.toLocaleString()}`, 26, 67);
  doc.setTextColor(162, 59, 46);
  doc.text(`$${totalOutstanding.toLocaleString()}`, 118, 67);

  // Table
  doc.setFillColor(18, 32, 27);
  doc.rect(20, 80, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('INVOICE ID', 22, 86);
  doc.text('PROPERTY OWNER', 54, 86);
  doc.text('TIER', 96, 86);
  doc.text('PAYMENT MODE', 120, 86);
  doc.text('STATUS', 148, 86);
  doc.text('AMOUNT', 170, 86);

  let y = 98;
  doc.setTextColor(18, 32, 27);
  invoices.forEach((inv) => {
    if (y > 270) {
      doc.addPage();
      y = 25;
    }
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.text(inv.id, 22, y);

    doc.setFont('helvetica', 'normal');
    doc.text(inv.ownerName.slice(0, 16), 54, y);
    doc.text(inv.planName.slice(0, 10), 96, y);
    doc.text((inv.paymentMethod || '—').slice(0, 12), 120, y);

    doc.setFont('helvetica', 'bold');
    doc.text(inv.status.toUpperCase(), 148, y);
    doc.text(`$${inv.total.toFixed(2)}`, 170, y);
    y += 8;
  });

  doc.save(`Platform_Invoices_${timelineLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

/**
 * Render Official A4 Platform SaaS Subscription Invoice page
 */
export function renderPlatformInvoicePage(
  doc: jsPDF,
  invoice: PlatformInvoice,
  template?: Partial<PlatformInvoiceTemplateConfig>
): void {
  const tmpl = template || {};
  const issuerName = invoice.issuerName || tmpl.issuerName || 'Propithub Technologies Inc.';
  const issuerAddress = invoice.issuerAddress || tmpl.issuerAddress || '100 Montgomery St, Suite 1800, San Francisco, CA';
  const issuerEmail = invoice.issuerEmail || tmpl.issuerEmail || 'billing@propithub.com';
  const issuerPhone = invoice.issuerPhone || tmpl.issuerPhone || '+1 (800) 555-PROP';
  const issuerTaxNo = invoice.issuerTaxNo || tmpl.issuerTaxNo || '';

  const currency = invoice.currency || 'USD';
  const rawSym = getCurrencySymbol(currency) || '$';
  const pdfSym = rawSym === '₹' ? 'Rs. ' : rawSym;

  const amountVal = Number(invoice.amount) || 0;
  const taxVal = Number(invoice.tax) || 0;
  const totalVal = Number(invoice.total != null ? invoice.total : amountVal + taxVal) || 0;
  const status = String(invoice.status || 'issued').toLowerCase();
  const isPaid = status === 'paid';
  const isOverdue = status === 'overdue';

  const fmtDisplayDate = (val?: string): string => {
    if (!val) return '-';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val).split('T')[0];
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

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

  // 1. Header Branding (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text('PROPIT', 20, 22);
  const propitW = doc.getTextWidth('PROPIT');
  doc.setTextColor(180, 130, 62); // #B4823E
  doc.text('HUB', 20 + propitW, 22);

  let leftY = 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(String(issuerName), 20, leftY);
  leftY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128); // #6B7280
  if (issuerAddress) {
    const addrLines = doc.splitTextToSize(String(issuerAddress), 95);
    doc.text(addrLines, 20, leftY);
    leftY += addrLines.length * 3.8;
  }
  if (issuerEmail) {
    doc.text(String(issuerEmail), 20, leftY);
    leftY += 3.8;
  }
  if (issuerPhone) {
    doc.text(String(issuerPhone), 20, leftY);
    leftY += 3.8;
  }
  if (issuerTaxNo) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105); // #059669
    doc.text(String(issuerTaxNo), 20, leftY);
    leftY += 4;
  }

  // 1b. Header Right (TAX INVOICE, Receipt Subtitle, ID, Status Pill)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text('TAX INVOICE', 190, 22, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('PLATFORM SUBSCRIPTION RECEIPT', 190, 27, { align: 'right' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(5, 150, 105);
  doc.text(String(invoice.id), 190, 33, { align: 'right' });

  const statusLabel = isPaid ? 'PAID & RECONCILED' : status.toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const badgeW = doc.getTextWidth(statusLabel) + 8;
  const badgeX = 190 - badgeW;
  if (isPaid) {
    doc.setFillColor(209, 250, 229);
    doc.setTextColor(5, 150, 105);
  } else if (isOverdue) {
    doc.setFillColor(254, 226, 226);
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setFillColor(254, 243, 199);
    doc.setTextColor(217, 119, 6);
  }
  doc.roundedRect(badgeX, 36, badgeW, 6, 3, 3, 'F');
  doc.text(statusLabel, 190 - 4, 40.2, { align: 'right' });

  const headerBottomY = Math.max(leftY + 2, 46);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.35);
  doc.line(20, headerBottomY, 190, headerBottomY);

  // 2. Recipient & Timeline 2-column cards
  const cardsY = headerBottomY + 6;
  const cardH = 30;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(20, cardsY, 82, cardH, 2, 2, 'FD');
  doc.roundedRect(108, cardsY, 82, cardH, 2, 2, 'FD');

  // Left card: BILLED TO (SUBSCRIBER)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text('BILLED TO (SUBSCRIBER)', 24, cardsY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text(String(invoice.ownerName || 'Property Owner').slice(0, 36), 24, cardsY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  let recY = cardsY + 17;
  if (invoice.ownerEmail) {
    doc.text(String(invoice.ownerEmail), 24, recY);
    recY += 4.2;
  }
  if (invoice.ownerId) {
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Account ID: ${invoice.ownerId}`, 24, recY);
    recY += 4.2;
  }
  if (invoice.ownerTaxNo) {
    doc.setFontSize(7.5);
    doc.text(`Tax ID: ${invoice.ownerTaxNo}`, 24, recY);
  }

  // Right card: SUBSCRIPTION TIMELINE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text('SUBSCRIPTION TIMELINE', 186, cardsY + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text(`Billing Period: ${periodStart} to ${periodEnd}`, 186, cardsY + 12, { align: 'right' });
  doc.text(`Issue Date: ${fmtDisplayDate(invoice.issueDate)}`, 186, cardsY + 17, { align: 'right' });
  if (isOverdue) {
    doc.setTextColor(220, 38, 38);
  }
  doc.text(`Payment Due Date: ${fmtDisplayDate(invoice.dueDate)}`, 186, cardsY + 22, { align: 'right' });

  if (isPaid) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(5, 150, 105);
    const paidLabel = `Paid${invoice.paymentMethod ? ` via ${invoice.paymentMethod}` : ''}${
      invoice.paidAt ? ` (${fmtDisplayDate(invoice.paidAt)})` : ''
    }`;
    doc.text(paidLabel, 186, cardsY + 27, { align: 'right' });
  }

  // 3. Line Items Table
  let y = cardsY + cardH + 8;
  doc.setFillColor(243, 244, 246);
  doc.rect(20, y, 170, 8, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.4);
  doc.line(20, y + 8, 190, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(75, 85, 99);
  doc.text('SUBSCRIPTION SERVICE DESCRIPTION', 23, y + 5.3);
  doc.text('PERIOD', 130, y + 5.3, { align: 'center' });
  doc.text(`AMOUNT (${currency})`, 187, y + 5.3, { align: 'right' });

  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text(`Propithub ${invoice.planName || 'Subscription'} SaaS License`, 23, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  const descNote = invoice.notes || 'Monthly SaaS subscription & cloud property management platform';
  const descLines = doc.splitTextToSize(String(descNote), 76);
  doc.text(descLines, 23, y + 4.5);

  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text(`${periodStart} - ${periodEnd}`, 130, y + 1, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(`${pdfSym}${amountVal.toFixed(2)}`, 187, y + 1, { align: 'right' });

  y += Math.max(10, descLines.length * 4 + 6);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);

  // 4. Totals Block (Right-aligned)
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Subtotal:', 125, y);
  doc.setTextColor(17, 24, 39);
  doc.text(`${pdfSym}${amountVal.toFixed(2)}`, 190, y, { align: 'right' });
  y += 5.5;

  if (taxVal > 0) {
    doc.setTextColor(75, 85, 99);
    doc.text(`${invoice.taxLabel || tmpl.taxLabel || 'Tax'}:`, 125, y);
    doc.setTextColor(17, 24, 39);
    doc.text(`${pdfSym}${taxVal.toFixed(2)}`, 190, y, { align: 'right' });
    y += 5.5;
  }

  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.5);
  doc.line(125, y, 190, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(isPaid ? 'Total Paid:' : 'Total Due:', 125, y);
  doc.setTextColor(180, 130, 62);
  doc.text(`${pdfSym}${totalVal.toFixed(2)} ${currency}`, 190, y, { align: 'right' });

  // 5. Terms & Conditions (only when includeTerms is enabled)
  if (includeTerms && terms.trim()) {
    y += 12;
    const splitTerms = doc.splitTextToSize(String(terms), 162);
    const boxH = 11 + splitTerms.length * 3.8;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(20, y, 170, boxH, 2, 2, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(17, 24, 39);
    doc.text('SUBSCRIPTION TERMS & CONDITIONS', 24, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(107, 114, 128);
    doc.text(splitTerms, 24, y + 11);
  }

  // 6. Footer & Signatory
  const footerY = 258;
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.line(20, footerY, 190, footerY);

  let fLeftY = footerY + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81);
  doc.text(String(issuerName), 20, fLeftY);
  fLeftY += 4.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (footerNote) {
    doc.setTextColor(75, 85, 99);
    const noteLines = doc.splitTextToSize(String(footerNote), 110);
    doc.text(noteLines, 20, fLeftY);
    fLeftY += noteLines.length * 3.8;
  }
  doc.setTextColor(107, 114, 128);
  doc.text('Electronic presentation valid without physical stamp.', 20, fLeftY);

  // Right Signatory
  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.4);
  doc.line(140, footerY + 7, 190, footerY + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text(String(signatory), 165, footerY + 12, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text(String(signatoryRole), 165, footerY + 16.5, { align: 'center' });
}

export function downloadSinglePlatformInvoicePDF(
  invoice: PlatformInvoice,
  template?: Partial<PlatformInvoiceTemplateConfig>
): void {
  const doc = new jsPDF();
  renderPlatformInvoicePage(doc, invoice, template);
  doc.save(`Platform_Invoice_${invoice.id}.pdf`);
}

export function generatePlatformInvoicePdfBase64(
  invoice: PlatformInvoice,
  template?: Partial<PlatformInvoiceTemplateConfig>
): string {
  const doc = new jsPDF();
  renderPlatformInvoicePage(doc, invoice, template);
  const dataUri = doc.output('datauristring');
  return dataUri.split(',')[1] || '';
}

/**
 * CSV Export Helper for Invoices (Excel / Accounting reconciliation)
 */
export function exportInvoicesCSV(invoices: Invoice[], filename = 'invoices_export.csv'): void {
  const headers = [
    'Invoice ID',
    'Tenant Name',
    'Unit',
    'Property',
    'Category',
    'Issue Date',
    'Due Date',
    'Status',
    'Subtotal',
    'Tax',
    'Discount',
    'Total (INR)',
    'Payment Method',
    'Receipt Number',
    'UTR / Payment Proof Ref',
    'Issuer Tax No',
  ];

  const rows = invoices.map((i) => [
    `"${i.id}"`,
    `"${i.tenant}"`,
    `"${i.unit}"`,
    `"${i.propertyName || ''}"`,
    `"${i.invoiceType || 'rent'}"`,
    `"${i.issueDate ? i.issueDate.split('T')[0] : ''}"`,
    `"${i.due}"`,
    `"${i.status}"`,
    i.amount,
    i.tax || 0,
    i.discount || 0,
    i.total,
    `"${i.paymentMethodUsed || ''}"`,
    `"${i.receiptNumber || ''}"`,
    `"${i.paymentProofRef || ''}"`,
    `"${i.issuerTaxNo || ''}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * CSV Export for Platform Invoices (Superadmin SaaS Ledger)
 */
export function exportPlatformInvoicesCSV(invoices: PlatformInvoice[], filename = 'platform_invoices_export.csv'): void {
  const headers = [
    'Invoice ID',
    'Owner Name',
    'Owner Email',
    'Account ID',
    'Plan Name',
    'Period Start',
    'Period End',
    'Issue Date',
    'Due Date',
    'Status',
    'Amount',
    'Tax',
    'Total ($)',
    'Payment Method',
    'Transaction Ref',
    'Platform Tax No',
  ];

  const rows = invoices.map((i) => [
    `"${i.id}"`,
    `"${i.ownerName}"`,
    `"${i.ownerEmail}"`,
    `"${i.ownerId}"`,
    `"${i.planName}"`,
    `"${i.periodStart ? i.periodStart.split('T')[0] : ''}"`,
    `"${i.periodEnd ? i.periodEnd.split('T')[0] : ''}"`,
    `"${i.issueDate ? i.issueDate.split('T')[0] : ''}"`,
    `"${i.dueDate ? i.dueDate.split('T')[0] : ''}"`,
    `"${i.status}"`,
    i.amount,
    i.tax || 0,
    i.total,
    `"${i.paymentMethod || ''}"`,
    `"${i.transactionRef || ''}"`,
    `"${i.issuerTaxNo || ''}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download Printable Residential Tenancy Agreement PDF for Physical Execution
 */
export function downloadAgreementPDF(
  agreement: Agreement,
  propertyName = 'Propithub Managed Residence',
  ownerName = 'Property Owner / Landlord',
  tenantName?: string
): void {
  const doc = new jsPDF();
  const effectiveTenant = tenantName || agreement.tenant || 'Tenant / Resident';

  // Page 1: Official Header & Preamble
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('RESIDENTIAL LEASE AGREEMENT', 20, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(156, 122, 52); // brass
  doc.text('PROPITHUB TRUST & PROPERTY MANAGEMENT PLATFORM', 20, 31);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text(`Official Tenancy Reference: ${agreement.id} • Issued: ${new Date().toLocaleDateString()}`, 20, 37);

  doc.setDrawColor(216, 222, 216);
  doc.setLineWidth(0.6);
  doc.line(20, 42, 190, 42);

  // Parties & Property Box
  doc.setFillColor(245, 247, 245);
  doc.rect(20, 48, 82, 36, 'F');
  doc.rect(106, 48, 84, 36, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text('LANDLORD (LESSOR)', 24, 55);
  doc.text('TENANT (LESSEE)', 110, 55);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(18, 32, 27);
  doc.text(ownerName, 24, 63);
  doc.text(effectiveTenant, 110, 63);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text(`Property: ${propertyName}`, 24, 70);
  doc.text(`Demised Unit: Unit ${agreement.unit}`, 24, 76);

  if (agreement.tenantEmail) {
    doc.text(`Email: ${agreement.tenantEmail}`, 110, 70);
  }
  if (agreement.tenantPhone) {
    doc.text(`Phone: ${agreement.tenantPhone}`, 110, 76);
  }

  // Financial & Term Summary Table
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 92, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('KEY LEASE SPECIFICATION', 25, 98);
  doc.text('AGREED COVENANT VALUE', 120, 98);

  const leaseCurr = agreement.currency || DEFAULT_CURRENCY;
  const leaseSymbol = getCurrencySymbol(leaseCurr);
  const specs = [
    ['Monthly Rental Consideration', `${leaseSymbol}${(agreement.rent || 0).toLocaleString()} / month`],
    ['Refundable Security Deposit', `${leaseSymbol}${(agreement.deposit || 0).toLocaleString()} (Held in Trust)`],
    ['Lease Term Commencement (Start Date)', agreement.start || `Next Month ${formatOrdinalDay(1)}`],
    ['Lease Term Expiration (End Date)', agreement.end || '12 Months following Start Date'],
    ['Monthly Rent Due Day', `${formatOrdinalDay(agreement.rentDueDay || 1)} of each calendar month`],
    ['Notice Period for Vacating / Non-Renewal', '30 Calendar Days written notice'],
    ['Automatic Lease Renewal', agreement.autoRenew ? 'Enabled (Mutual consent required)' : 'Disabled / Year-to-Year review'],
  ];

  let y = 108;
  doc.setTextColor(18, 32, 27);
  specs.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, 24, y);
    doc.setFont('helvetica', 'normal');
    doc.text(val, 120, y);
    doc.setDrawColor(235, 240, 235);
    doc.line(20, y + 2.5, 190, y + 2.5);
    y += 8;
  });

  // Legal Clauses & Terms
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 32, 27);
  doc.text('TERMS, CONDITIONS & STATUTORY COVENANTS:', 20, y);
  y += 6;

  const clauses = [
    '1. RENT & REMITTANCE: The Tenant agrees to pay the monthly rental amount on or before the due day specified above via Propithub online gateway or approved banking channels.',
    '2. SECURITY DEPOSIT: The Tenant shall deposit the agreed security deposit sum upon physical signing of this agreement. The deposit is held as security against damages or unpaid dues and is refundable within 14 days of move-out inspection.',
    '3. USE OF PREMISES: The leased premises shall be utilized exclusively for private residential dwelling purposes and in full adherence to community and association bye-laws.',
    '4. INSPECTION & MAINTENANCE: The Landlord or authorized property manager reserves the right to inspect the premises with reasonable advance written notice of not less than 24 hours.',
    '5. UTILITIES & CHARGES: Electricity, water, and broadband charges consumed during the tenancy term shall be settled directly by the Tenant prior to due dates.',
    '6. MOVE-OUT CONDITION: Upon termination or expiry, the Tenant shall hand over peaceful possession in a tidy, broom-clean condition fair wear and tear accepted.',
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 75, 70);
  clauses.forEach((c) => {
    const lines = doc.splitTextToSize(c, 170);
    doc.text(lines, 20, y);
    y += lines.length * 4.2 + 2;
  });

  // Physical Signature Execution Blocks (Bottom of Page)
  y = 236;
  doc.setDrawColor(180, 190, 185);
  doc.setLineWidth(0.5);
  doc.line(20, y, 190, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(18, 32, 27);
  doc.text('PHYSICAL SIGNATURE EXECUTION & CERTIFICATION', 20, y);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 135, 128);
  doc.text('(Print this document, sign in physical ink, and upload the signed copy to your resident portal)', 20, y + 4);

  y += 12;
  // Two signature columns
  doc.setFillColor(250, 250, 248);
  doc.rect(20, y, 80, 26, 'F');
  doc.rect(110, y, 80, 26, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(75, 92, 85);
  doc.text('LESSEE (TENANT) SIGNATURE:', 24, y + 6);
  doc.text('LESSOR (LANDLORD) APPROVAL:', 114, y + 6);

  doc.setDrawColor(150, 160, 155);
  doc.line(24, y + 18, 90, y + 18);
  doc.line(114, y + 18, 180, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Signature of ${effectiveTenant} • Date: ___/___/2026`, 24, y + 22);
  doc.text(`Approval / Signature by ${ownerName} • Date: ___/___/2026`, 114, y + 22);

  doc.save(`Tenancy_Agreement_${agreement.id}_Unit_${agreement.unit.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

export function downloadDepositSettlementPdf(
  settlement: DepositSettlement,
  landlordName = 'Property Owner / Landlord'
): void {
  const doc = new jsPDF();
  const currency = settlement.currency || DEFAULT_CURRENCY;
  const isIndian = normalizeCurrencyCode(currency) === 'INR';

  // Header branding
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(18, 32, 27);
  doc.text('SECURITY DEPOSIT SETTLEMENT VOUCHER', 20, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(156, 122, 52); // brass
  doc.text('OFFICIAL MOVE-OUT RECONCILIATION & REFUND DISBURSEMENT CERTIFICATE', 20, 31);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 92, 85);
  doc.text(
    `Settlement Ref: ${settlement.id} • Agreement: ${settlement.agreementId} • Issued: ${new Date().toLocaleDateString()}`,
    20,
    37
  );

  doc.setDrawColor(216, 222, 216);
  doc.setLineWidth(0.6);
  doc.line(20, 42, 190, 42);

  // Parties Box
  doc.setFillColor(245, 247, 245);
  doc.rect(20, 48, 82, 36, 'F');
  doc.rect(106, 48, 84, 36, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text('PROPERTY OWNER (LESSOR)', 24, 55);
  doc.text('TENANT (LESSEE)', 110, 55);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(18, 32, 27);
  doc.text(landlordName, 24, 63);
  doc.text(settlement.tenantName || 'Tenant', 110, 63);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 92, 85);
  doc.text(`Property: ${settlement.propertyName}`, 24, 70);
  doc.text(`Demised Unit: Unit ${settlement.unit}`, 24, 76);

  if (settlement.tenantEmail) {
    doc.text(`Email: ${settlement.tenantEmail}`, 110, 70);
  }
  doc.text(`Status: ${settlement.status.toUpperCase()}`, 110, 76);

  // Financial Breakdown Header
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 92, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DEPOSIT SETTLEMENT ITEMIZATION', 25, 98);
  doc.text('AMOUNT', 160, 98);

  let y = 108;

  // Gross deposit row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(18, 32, 27);
  doc.text('1. Initial Security Deposit Held in Trust', 25, y);
  doc.text(`${currency} ${settlement.grossDepositHeld.toLocaleString(isIndian ? 'en-IN' : 'en-US')}`, 155, y);
  y += 8;

  doc.setDrawColor(230, 235, 232);
  doc.line(20, y - 3, 190, y - 3);

  // Deductions Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(180, 50, 50);
  doc.text('2. Less: Itemized Move-Out Deductions', 25, y);
  y += 6;

  if (settlement.deductions && settlement.deductions.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(75, 92, 85);
    settlement.deductions.forEach((d, idx) => {
      const catLabel = d.category.replace('_', ' ').toUpperCase();
      doc.text(`   (${String.fromCharCode(97 + idx)}) [${catLabel}] ${d.title}`, 25, y);
      doc.setTextColor(180, 50, 50);
      doc.text(`- ${currency} ${d.amount.toLocaleString(isIndian ? 'en-IN' : 'en-US')}`, 155, y);
      doc.setTextColor(75, 92, 85);
      y += 5.5;
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 135, 128);
    doc.text('   No deductions assessed. Full deposit refund authorized.', 25, y);
    y += 6;
  }

  doc.setDrawColor(216, 222, 216);
  doc.line(20, y + 2, 190, y + 2);
  y += 8;

  // Net Refund Highlight Box
  doc.setFillColor(240, 248, 244);
  doc.rect(20, y, 170, 16, 'F');
  doc.setDrawColor(47, 93, 80);
  doc.setLineWidth(0.8);
  doc.rect(20, y, 170, 16, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(47, 93, 80);
  doc.text('NET SECURITY DEPOSIT REFUNDABLE / DISBURSED:', 25, y + 10);
  doc.setFontSize(12);
  doc.text(`${currency} ${settlement.netRefundableAmount.toLocaleString(isIndian ? 'en-IN' : 'en-US')}`, 145, y + 10);

  y += 24;

  // Payout Execution Details Box
  doc.setFillColor(250, 250, 248);
  doc.rect(20, y, 170, 36, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(18, 32, 27);
  doc.text('PAYMENT EXECUTION & DISBURSEMENT DETAILS', 25, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 92, 85);

  let destStr = 'Direct Settlement';
  if (settlement.chosenPayoutDetails) {
    const c = settlement.chosenPayoutDetails;
    if (c.method === 'upi') destStr = `UPI ID: ${c.upiId} (${c.accountHolderName})`;
    else if (c.method === 'paypal') destStr = `PayPal: ${c.paypalEmail} (${c.accountHolderName})`;
    else if (c.method === 'iban') destStr = `IBAN: ${c.iban} ${c.swiftBic ? `• BIC: ${c.swiftBic}` : ''} (${c.accountHolderName})`;
    else if (c.method === 'bank_in') destStr = `Bank Acc: ${c.accountNumber} • IFSC: ${c.ifscCode} (${c.accountHolderName})`;
    else if (c.method === 'cash') destStr = `In-Person Hand Cash Handover (${c.accountHolderName})`;
  } else if (settlement.payoutProfileSnapshot) {
    destStr = `${settlement.payoutProfileSnapshot.channel.toUpperCase()} (${settlement.payoutProfileSnapshot.accountHolderName})`;
  }

  doc.text(`Tenant Designated Destination: ${destStr}`, 25, y + 14);
  doc.text(`Bank / UTR Reference: ${settlement.paymentReference || 'Pending Execution'}`, 25, y + 20);
  doc.text(`Disbursed Timestamp: ${settlement.disbursedAt || settlement.createdAt || 'N/A'}`, 25, y + 26);
  if (settlement.proofDocumentUrl) {
    doc.text(`Payment Receipt Proof: Verified & archived on platform audit trail`, 25, y + 31);
  }

  y += 44;

  // Legal Disclaimer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 135, 128);
  doc.text(
    'Disclaimer: This certificate constitutes a final binding settlement statement of the residential tenancy deposit.',
    20,
    y
  );
  doc.text(
    'Execution of this refund concludes the financial tenancy covenant between the parties for the specified premises.',
    20,
    y + 4
  );

  doc.save(`Deposit_Settlement_${settlement.id}_Unit_${settlement.unit.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

export function downloadCashHandoverReceiptPdf(
  claim: CashHandoverClaim,
  transaction?: PaymentTransaction
): void {
  const doc = new jsPDF();
  const claimCurrency = claim.currency || DEFAULT_CURRENCY;
  const isClaimIndian = normalizeCurrencyCode(claimCurrency) === 'INR';

  // Header branding
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27); // #12201B
  doc.text('PROPITHUB PROPERTY PLATFORM', 20, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 92, 85);
  doc.text('DUAL-ACKNOWLEDGED CASH PAYMENT & SETTLEMENT VOUCHER', 20, 31);

  doc.setDrawColor(216, 222, 216);
  doc.line(20, 36, 190, 36);

  // Metadata block
  doc.setFontSize(10.5);
  doc.setTextColor(18, 32, 27);
  doc.text(`Handover Claim ID: ${claim.id}`, 20, 46);
  doc.text(`Handover Date: ${claim.handoverDate}`, 125, 46);
  doc.text(`Ledger Transaction: ${claim.transactionId || transaction?.id || 'Reconciled'}`, 20, 53);
  doc.text(`Direction: ${claim.direction === 'inflow' ? 'TENANT -> LANDLORD (PAY-IN)' : 'LANDLORD -> TENANT (REFUND)'}`, 125, 53);
  doc.text(`Settlement Status: ${claim.status.toUpperCase()}`, 20, 60);

  // Participant details box
  doc.setFillColor(245, 247, 245);
  doc.rect(20, 68, 170, 36, 'F');
  doc.rect(20, 68, 170, 36, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('PAYOR / CLAIMANT', 25, 77);
  doc.text('PAYEE / RECIPIENT', 110, 77);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Name: ${claim.claimedByName}`, 25, 85);
  doc.text(`Role: ${claim.claimedByRole.toUpperCase()}`, 25, 92);
  doc.text(`Unit: ${claim.unit}`, 25, 99);

  doc.text(`Name: ${claim.confirmedByName || (claim.claimedByRole === 'tenant' ? 'Property Owner' : claim.tenantName)}`, 110, 85);
  doc.text(`Role: ${claim.claimedByRole === 'tenant' ? 'PROPERTY OWNER' : 'RESIDENTIAL TENANT'}`, 110, 92);
  doc.text(`Property: ${claim.propertyName || 'Residential Complex'}`, 110, 99);

  // Handover summary table
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 115, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('TRANSACTION CLASSIFICATION', 25, 121);
  doc.text('AMOUNT', 160, 121);

  doc.setTextColor(18, 32, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`${claim.type.toUpperCase().replace('_', ' ')} (CASH IN-PERSON HANDOVER)`, 25, 133);
  doc.text(`${claimCurrency} ${claim.amount.toLocaleString(isClaimIndian ? 'en-IN' : 'en-US')}`, 155, 133);

  doc.setDrawColor(216, 222, 216);
  doc.line(20, 140, 190, 140);

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL RECONCILED CASH AMOUNT:', 25, 150);
  doc.setTextColor(47, 93, 80);
  doc.text(`${claimCurrency} ${claim.amount.toLocaleString(isClaimIndian ? 'en-IN' : 'en-US')}`, 150, 150);

  // Dual Audit Stamp Box
  doc.setFillColor(250, 250, 248);
  doc.rect(20, 162, 170, 52, 'F');
  doc.rect(20, 162, 170, 52, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(18, 32, 27);
  doc.text('DUAL-PARTY TWO-FACTOR AUDIT SIGNATURES', 25, 171);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 92, 85);
  doc.text(`1. Claimant Handover Logged:`, 25, 180);
  doc.text(`   Logged by: ${claim.claimedByName} (${claim.claimedByRole}) on ${claim.claimedAt.replace('T', ' ').slice(0, 19)}`, 25, 186);
  doc.text(`   Handover Location: ${claim.handoverLocation || 'On-site / In-person'}`, 25, 192);

  doc.text(`2. Counterparty Confirmation Stamp:`, 25, 201);
  doc.text(
    `   Status: ${claim.status === 'confirmed' ? '✓ EXPLICITLY CONFIRMED & RECONCILED' : 'PENDING CONFIRMATION'}`,
    25,
    207
  );
  if (claim.confirmedAt) {
    doc.text(`   Confirmed by: ${claim.confirmedByName} on ${claim.confirmedAt.replace('T', ' ').slice(0, 19)}`, 25, 213);
  }

  // Legal declaration
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 135, 128);
  doc.text(
    'Legal Covenant: This voucher serves as official proof of physical currency handover between landlord and resident.',
    20,
    230
  );
  doc.text(
    'Both parties have registered verification through the Propithub secure audit ledger.',
    20,
    235
  );

  doc.save(`Cash_Handover_Voucher_${claim.id}.pdf`);
}




