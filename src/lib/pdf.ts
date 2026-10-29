import { jsPDF } from 'jspdf';
import { PaymentTransaction, Agreement, Invoice, PlatformInvoice, DepositSettlement, CashHandoverClaim } from '../types';
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
export function downloadSingleInvoicePDF(invoice: Invoice): void {
  const doc = new jsPDF();
  renderInvoiceVoucherPage(doc, invoice);
  const cleanId = String(invoice.id || 'INVOICE').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUnit = String(invoice.unit || 'Premises').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Invoice_${cleanId}_${cleanUnit}.pdf`);
}

/**
 * Generate official A4 Rental Invoice as Base64-encoded PDF string
 */
export function generateInvoicePdfBase64(invoice: Invoice): string {
  const doc = new jsPDF();
  renderInvoiceVoucherPage(doc, invoice);
  const dataUri = doc.output('datauristring');
  return dataUri.split(',')[1] || '';
}

/**
 * Helper to render an official A4 Rental Invoice on a given jsPDF page
 */
function renderInvoiceVoucherPage(doc: jsPDF, invoice: Invoice): void {
  // Top Branding & Title
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('PROPITHUB PROPERTY PLATFORM', 20, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(156, 122, 52); // brass
  doc.text(invoice.issuerName || 'Official Property Management', 20, 28);

  if (invoice.issuerTaxNo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 92, 85);
    doc.text(String(invoice.issuerTaxNo), 20, 33);
  }

  // Invoice ID & Status Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(18, 32, 27);
  doc.text('TAX INVOICE', 140, 22);

  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(156, 122, 52);
  doc.text(String(invoice.id || 'INV-DRAFT'), 140, 28);

  const safeStatus = String(invoice.status || 'sent').toLowerCase();
  const isPaid = safeStatus === 'paid';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(isPaid ? 22 : 133, isPaid ? 101 : 77, isPaid ? 52 : 14);
  doc.text(`STATUS: ${safeStatus.toUpperCase()}`, 140, 34);

  // Divider line
  doc.setDrawColor(216, 222, 216);
  doc.setLineWidth(0.5);
  doc.line(20, 38, 190, 38);

  // Recipient & Schedule Boxes
  doc.setFillColor(250, 250, 247);
  doc.rect(20, 43, 82, 38, 'F');
  doc.rect(20, 43, 82, 38, 'S');

  doc.rect(108, 43, 82, 38, 'F');
  doc.rect(108, 43, 82, 38, 'S');

  // Billed To Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text('BILLED TO (TENANT):', 24, 50);

  const tenantName = String(invoice.tenant || 'Resident');
  const unitName = String(invoice.unit || 'Premises');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(18, 32, 27);
  doc.text(tenantName, 24, 57);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Unit: ${unitName} ${invoice.propertyName ? `• ${invoice.propertyName}` : ''}`, 24, 64);
  if (invoice.tenantPhone || invoice.tenantEmail) {
    doc.text(`${invoice.tenantPhone || ''} ${invoice.tenantEmail ? `| ${invoice.tenantEmail}` : ''}`.trim(), 24, 71);
  }
  if (invoice.tenantTaxNo) {
    doc.text(`Tax ID: ${invoice.tenantTaxNo}`, 24, 77);
  }

  // Schedule Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text('INVOICE SCHEDULE:', 112, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(18, 32, 27);
  const issueDateStr = invoice.issueDate ? String(invoice.issueDate).split('T')[0] : '—';
  const dueDateStr = invoice.due ? String(invoice.due).split('T')[0] : '—';
  doc.text(`Issue Date: ${issueDateStr}`, 112, 57);
  doc.text(`Due Date: ${dueDateStr}`, 112, 64);
  if (invoice.billingPeriodStart && invoice.billingPeriodEnd) {
    doc.text(`Period: ${String(invoice.billingPeriodStart).split('T')[0]} to ${String(invoice.billingPeriodEnd).split('T')[0]}`, 112, 71);
  }
  if (invoice.paidAt) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Paid: ${String(invoice.paidAt).split('T')[0]} (${invoice.paymentMethodUsed || 'Direct'})`, 112, 77);
  }

  const curr = getCurrencySymbol(invoice.currency || DEFAULT_CURRENCY);
  const isIndian = normalizeCurrencyCode(invoice.currency || DEFAULT_CURRENCY) === 'INR';
  const locale = isIndian ? 'en-IN' : 'en-US';

  // Line Items Table Header
  doc.setFillColor(47, 93, 80); // ledger green
  doc.rect(20, 88, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('DESCRIPTION / LINE ITEM', 25, 94);
  doc.text(`AMOUNT (${curr})`, 155, 94);

  // Line items
  let yPos = 105;
  doc.setTextColor(18, 32, 27);
  const items = invoice.items && invoice.items.length > 0
    ? invoice.items
    : [{ description: `${invoice.invoiceType || 'Rental'} Charge — Unit ${unitName}`, amount: Number(invoice.amount) || 0 }];

  items.forEach((item: { description: string; amount: number }) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(String(item.description || 'Charge'), 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(`${curr} ${(Number(item.amount) || 0).toLocaleString(locale)}`, 155, yPos);
    yPos += 8;
  });

  if (invoice.tax && invoice.tax > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 92, 85);
    doc.text(`Applicable Tax (${invoice.issuerTaxNo || 'GST'})`, 25, yPos);
    doc.text(`${curr} ${Number(invoice.tax).toLocaleString(locale)}`, 155, yPos);
    yPos += 8;
  }

  if (invoice.discount && invoice.discount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(162, 59, 46);
    doc.text('Discount / Concession Applied', 25, yPos);
    doc.text(`-${curr} ${Number(invoice.discount).toLocaleString(locale)}`, 155, yPos);
    yPos += 8;
  }

  if (invoice.lateFeeApplied && invoice.lateFeeApplied > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(190, 18, 60);
    doc.text(`Late Fee Penalty (${invoice.lateFeeCalculation || 'Overdue Fee'})`, 25, yPos);
    doc.text(`${curr} ${Number(invoice.lateFeeApplied).toLocaleString(locale)}`, 155, yPos);
    yPos += 8;
  }

  // Subtotal & Total Block
  doc.setDrawColor(216, 222, 216);
  doc.line(20, yPos + 2, 190, yPos + 2);
  yPos += 10;

  const totalPayable = Number(invoice.total != null ? invoice.total : (invoice.amount != null ? invoice.amount : 0)) || 0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(18, 32, 27);
  doc.text('TOTAL PAYABLE:', 105, yPos);
  doc.setTextColor(156, 122, 52);
  doc.text(`${curr} ${totalPayable.toLocaleString(locale)}`, 155, yPos);

  yPos += 14;

  // Bank & Remittance Box
  if (invoice.bankDetails?.accountNumber || invoice.bankDetails?.upiId) {
    doc.setFillColor(250, 250, 247);
    doc.rect(20, yPos, 170, 22, 'F');
    doc.rect(20, yPos, 170, 22, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(75, 92, 85);
    doc.text('PAYMENT REMITTANCE INSTRUCTIONS:', 24, yPos + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(18, 32, 27);
    doc.text(
      `Bank: ${invoice.bankDetails.bankName || 'Direct Transfer'} | A/C: ${invoice.bankDetails.accountNumber || '—'}${invoice.bankDetails.ifscOrRouting ? ` | IFSC: ${invoice.bankDetails.ifscOrRouting}` : ''}`,
      24,
      yPos + 12
    );
    if (invoice.bankDetails.upiId) {
      doc.text(`UPI VPA: ${invoice.bankDetails.upiId}`, 24, yPos + 18);
    }
    yPos += 28;
  }

  // Terms & Conditions (T&C) Box
  if (invoice.termsAndConditions) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(75, 92, 85);
    doc.text('TERMS & CONDITIONS (T&C):', 20, yPos);
    yPos += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 115, 108);
    const splitTerms = doc.splitTextToSize(String(invoice.termsAndConditions), 170);
    doc.text(splitTerms.slice(0, 5), 20, yPos);
    yPos += Math.min(splitTerms.length, 5) * 4 + 6;
  }

  // Signatory & Legal Footnote
  doc.setDrawColor(216, 222, 216);
  doc.line(20, 260, 190, 260);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 135, 128);
  doc.text('Propithub Cloud Operating Platform • Computer generated official tax invoice.', 20, 267);

  doc.setFont('helvetica', 'bold');
  doc.text(String(invoice.signatoryName || 'Authorized Signatory'), 140, 267);
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
export function renderPlatformInvoicePage(doc: jsPDF, invoice: PlatformInvoice): void {

  // Header Branding
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('PROPITHUB SAAS CLOUD PLATFORM', 20, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(156, 122, 52);
  doc.text('Propithub Technologies Inc. • Corporate SaaS Billing', 20, 28);

  if (invoice.issuerTaxNo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 92, 85);
    doc.text(`TAX / EIN: ${invoice.issuerTaxNo}`, 20, 33);
  }

  // Invoice ID & Status Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(18, 32, 27);
  doc.text('SAAS INVOICE', 140, 22);

  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(156, 122, 52);
  doc.text(invoice.id, 140, 28);

  const safeStatus = String(invoice.status || 'sent').toLowerCase();
  const isPaid = safeStatus === 'paid';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(isPaid ? 22 : 185, isPaid ? 101 : 28, isPaid ? 52 : 28);
  doc.text(`STATUS: ${safeStatus.toUpperCase()}`, 140, 34);

  // Divider line
  doc.setDrawColor(216, 222, 216);
  doc.setLineWidth(0.5);
  doc.line(20, 38, 190, 38);

  // Subscriber Box
  doc.setFillColor(245, 247, 245);
  doc.rect(20, 44, 82, 38, 'F');
  doc.rect(106, 44, 84, 38, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text('BILLED TO (SUBSCRIBER)', 24, 51);
  doc.text('BILLING SPECIFICATIONS', 110, 51);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(18, 32, 27);
  doc.text(String(invoice.ownerName || 'Subscriber'), 24, 59);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text(String(invoice.ownerEmail || '—'), 24, 65);
  doc.text(`Owner ID: ${invoice.ownerId || '—'}`, 24, 71);

  doc.setTextColor(18, 32, 27);
  doc.text(`Plan: ${invoice.planName || 'Standard'}`, 110, 59);
  doc.text(`Issue Date: ${invoice.issueDate || '—'}`, 110, 65);
  doc.text(`Due Date: ${invoice.dueDate || '—'}`, 110, 71);
  if (invoice.paymentMethod) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Paid Via: ${invoice.paymentMethod}`, 110, 77);
  }

  // Item Table Header
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 88, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SUBSCRIPTION DESCRIPTION', 25, 94);
  doc.text('BILLING PERIOD', 110, 94);
  doc.text('SUBTOTAL ($)', 160, 94);

  // Item Row
  const amountVal = Number(invoice.amount) || 0;
  const totalVal = Number(invoice.total != null ? invoice.total : invoice.amount) || 0;
  doc.setTextColor(18, 32, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Propithub ${invoice.planName || 'Enterprise'} SaaS Platform License`, 25, 105);
  doc.text(`${invoice.periodStart ? String(invoice.periodStart).split('T')[0] : 'Current'} to ${invoice.periodEnd ? String(invoice.periodEnd).split('T')[0] : 'Renewal'}`, 110, 105);
  doc.text(`$${amountVal.toFixed(2)}`, 160, 105);

  // Totals Box
  let y = 120;
  doc.line(20, y, 190, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Subtotal:', 130, y);
  doc.text(`$${amountVal.toFixed(2)}`, 170, y);
  y += 6;

  if (invoice.tax) {
    doc.text(`Tax (${invoice.taxLabel || 'Tax'}):`, 130, y);
    doc.text(`$${Number(invoice.tax).toFixed(2)}`, 170, y);
    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(18, 32, 27);
  doc.text('Total Amount:', 130, y + 2);
  doc.setTextColor(156, 122, 52);
  doc.text(`$${totalVal.toFixed(2)}`, 170, y + 2);

  // Terms & Conditions
  if (invoice.termsAndConditions) {
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(18, 32, 27);
    doc.text('TERMS & CONDITIONS:', 20, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(75, 92, 85);
    const splitTerms = doc.splitTextToSize(String(invoice.termsAndConditions), 170);
    doc.text(splitTerms, 20, y);
  }

  // Footer & Signatory
  doc.setDrawColor(216, 222, 216);
  doc.line(20, 260, 190, 260);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 135, 128);
  doc.text('Propithub Cloud Operating Platform • Enterprise Billing Infrastructure', 20, 267);

  doc.setFont('helvetica', 'bold');
  doc.text(String(invoice.signatoryName || 'Corporate Controller'), 140, 267);
}

export function downloadSinglePlatformInvoicePDF(invoice: PlatformInvoice): void {
  const doc = new jsPDF();
  renderPlatformInvoicePage(doc, invoice);
  doc.save(`Platform_Invoice_${invoice.id}.pdf`);
}

export function generatePlatformInvoicePdfBase64(invoice: PlatformInvoice): string {
  const doc = new jsPDF();
  renderPlatformInvoicePage(doc, invoice);
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




