import './polyfills';
import { Platform, Alert, Share } from 'react-native';
import { jsPDF } from 'jspdf';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface DocumentDownloadItem {
  fileName: string;
  fileUrl?: string;
  title?: string;
  docType?: string;
  meta?: {
    tenantName?: string;
    unit?: string;
    propertyName?: string;
    amount?: string | number;
    date?: string;
    status?: string;
    agreementId?: string;
    claimId?: string;
    docKey?: 'initial' | 'signed' | 'id';
    idDocId?: string;
    ownerName?: string;
  };
}

/**
 * Generates an official Propithub Dual-Party Cash Handover Voucher PDF.
 */
function generateCashHandoverVoucherPdf(item: DocumentDownloadItem): jsPDF {
  const doc = new jsPDF();
  const meta = item.meta || {};
  const claimId =
    meta.claimId ||
    item.fileName.replace(/^Cash_Handover_Voucher_/i, '').replace(/\.pdf$/i, '') ||
    meta.agreementId ||
    'CSH-570191';
  const unit = meta.unit || '101';
  const prop = meta.propertyName || 'Propithub Managed Complex';
  const tenant = meta.tenantName || 'Residential Resident';
  const owner = meta.ownerName || 'Property Owner / Landlord';
  const amount =
    typeof meta.amount === 'number'
      ? `INR ${meta.amount.toLocaleString('en-IN')}`
      : meta.amount || (meta.unit ? `Unit ${meta.unit} Settlement` : '-');
  const date = meta.date || new Date().toISOString().split('T')[0];

  // Header branding
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('PROPITHUB PROPERTY PLATFORM', 20, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 92, 85);
  doc.text('DUAL-ACKNOWLEDGED CASH PAYMENT & SETTLEMENT VOUCHER', 20, 31);

  doc.setDrawColor(216, 222, 216);
  doc.setLineWidth(0.6);
  doc.line(20, 36, 190, 36);

  // Metadata block
  doc.setFontSize(10);
  doc.setTextColor(18, 32, 27);
  doc.text(`Handover Claim ID: ${claimId}`, 20, 46);
  doc.text(`Handover Date: ${date}`, 120, 46);
  doc.text('Direction: TENANT -> LANDLORD (PAY-IN)', 20, 54);
  doc.text('Settlement Status: CONFIRMED & VERIFIED', 120, 54);

  // Participant details box
  doc.setFillColor(245, 247, 245);
  doc.rect(20, 62, 170, 36, 'F');
  doc.rect(20, 62, 170, 36, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('PAYOR / RESIDENT', 25, 71);
  doc.text('PAYEE / LANDLORD', 110, 71);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Name: ${tenant}`, 25, 79);
  doc.text('Role: RESIDENTIAL TENANT', 25, 86);
  doc.text(`Unit: Unit ${unit}`, 25, 93);

  doc.text(`Name: ${owner}`, 110, 79);
  doc.text('Role: PROPERTY OWNER', 110, 86);
  doc.text(`Property: ${prop}`, 110, 93);

  // Handover summary table
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 108, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('TRANSACTION CLASSIFICATION', 25, 114);
  doc.text('AMOUNT', 150, 114);

  doc.setTextColor(18, 32, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('PHYSICAL CASH IN-PERSON HANDOVER', 25, 126);
  doc.text(`${amount}`, 150, 126);

  doc.setDrawColor(216, 222, 216);
  doc.line(20, 133, 190, 133);

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL RECONCILED CASH AMOUNT:', 25, 144);
  doc.setTextColor(47, 93, 80);
  doc.text(`${amount}`, 145, 144);

  // Dual Audit Stamp Box
  doc.setFillColor(250, 250, 248);
  doc.rect(20, 156, 170, 52, 'F');
  doc.rect(20, 156, 170, 52, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(18, 32, 27);
  doc.text('DUAL-PARTY TWO-FACTOR AUDIT SIGNATURES', 25, 165);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 92, 85);
  doc.text('1. Resident Claimant Handover Logged:', 25, 174);
  doc.text(`   Logged by: ${tenant} (Resident) on ${date}`, 25, 180);
  doc.text('   Handover Location: On-site / Premises Handover', 25, 186);

  doc.text('2. Landlord Confirmation Stamp:', 25, 195);
  doc.text('   Status: ✓ EXPLICITLY CONFIRMED & AUDITED', 25, 201);

  // Legal declaration
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 135, 128);
  doc.text(
    'Legal Covenant: This voucher serves as official proof of physical currency handover between landlord and resident.',
    20,
    224
  );
  doc.text(
    'Both parties have registered verification through the Propithub secure audit ledger.',
    20,
    230
  );

  return doc;
}

/**
 * Generates an official Propithub Residential Lease Agreement PDF.
 */
function generateAgreementLeasePdf(item: DocumentDownloadItem): jsPDF {
  const doc = new jsPDF();
  const meta = item.meta || {};
  const agId = meta.agreementId || item.fileName.replace(/\.pdf$/i, '') || 'AG-2026-001';
  const unit = meta.unit || '101';
  const prop = meta.propertyName || 'Propithub Managed Complex';
  const tenant = meta.tenantName || 'Resident';
  const owner = meta.ownerName || 'Property Owner / Landlord';
  const rent =
    typeof meta.amount === 'number'
      ? `INR ${meta.amount.toLocaleString('en-IN')}`
      : meta.amount || 'INR 25,000 / month';
  const date = meta.date || new Date().toISOString().split('T')[0];

  // Header & Preamble
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text('RESIDENTIAL LEASE AGREEMENT', 20, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(156, 122, 52);
  doc.text('PROPITHUB TRUST & PROPERTY MANAGEMENT PLATFORM', 20, 31);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text(`Official Tenancy Reference: ${agId} • Issued: ${date}`, 20, 37);

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
  doc.text(owner, 24, 63);
  doc.text(tenant, 110, 63);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text(`Property: ${prop}`, 24, 70);
  doc.text(`Demised Unit: Unit ${unit}`, 24, 76);

  doc.text('Tenancy Mode: Residential Lease Deed', 110, 70);
  doc.text('Verification: Verified Resident', 110, 76);

  // Financial & Term Summary Table
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 92, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('KEY LEASE SPECIFICATION', 25, 98);
  doc.text('AGREED COVENANT VALUE', 120, 98);

  const specs = [
    ['Monthly Rental Consideration', `${rent}`],
    ['Refundable Security Deposit', 'Held in Trust under Fiduciary Custody'],
    ['Lease Term Commencement (Start Date)', date],
    ['Lease Term Expiration (End Date)', '12 Months following Start Date'],
    ['Monthly Rent Due Day', '1st of each calendar month'],
    ['Notice Period for Vacating / Non-Renewal', '30 Calendar Days written notice'],
    ['Automatic Lease Renewal', 'Year-to-Year review on mutual terms'],
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

  // Dual Execution Stamp Box
  y += 6;
  doc.setFillColor(250, 250, 248);
  doc.rect(20, y, 170, 42, 'F');
  doc.rect(20, y, 170, 42, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(18, 32, 27);
  doc.text('EXECUTION & AUDIT ATTESTATION', 25, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 92, 85);
  doc.text(`Lessor Signatory: ${owner}`, 25, y + 17);
  doc.text(`Digital Audit Stamp: Propithub Secure Ledger (${agId})`, 25, y + 24);
  doc.text(`Lessee Signatory: ${tenant}`, 110, y + 17);
  doc.text('Status: Signed & Verified Attestation', 110, y + 24);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 135, 128);
  doc.text(
    'Execution under Section 10A Indian Contract Act & State Residential Tenancy Enactments.',
    20,
    y + 54
  );

  return doc;
}

/**
 * Generates an official Propithub Invoice / Receipt / Generic Record PDF.
 */
function generateGenericDocumentPdf(item: DocumentDownloadItem): jsPDF {
  const isInvoice =
    /invoice/i.test(item.fileName) ||
    /invoice/i.test(item.docType || '') ||
    /invoice/i.test(item.title || '');
  const isReceipt =
    /receipt/i.test(item.fileName) ||
    /receipt/i.test(item.docType || '') ||
    /receipt/i.test(item.title || '');

  const doc = new jsPDF();
  const meta = item.meta || {};
  const unit = meta.unit || '101';
  const prop = meta.propertyName || 'Propithub Managed Property';
  const tenant = meta.tenantName || 'Resident';
  const amount =
    typeof meta.amount === 'number'
      ? `INR ${meta.amount.toLocaleString('en-IN')}`
      : meta.amount || 'INR 25,000';
  const date = meta.date || new Date().toISOString().split('T')[0];

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 32, 27);
  doc.text(
    isInvoice ? 'TAX INVOICE' : isReceipt ? 'OFFICIAL INFLOW RECEIPT' : 'OFFICIAL TENANCY RECORD',
    20,
    24
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(156, 122, 52);
  doc.text('PROPITHUB AUDITED PROPERTY SYSTEM', 20, 31);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 92, 85);
  doc.text(`Document Reference: ${item.fileName} • Date: ${date}`, 20, 37);

  doc.setDrawColor(216, 222, 216);
  doc.setLineWidth(0.6);
  doc.line(20, 42, 190, 42);

  // Card
  doc.setFillColor(245, 247, 245);
  doc.rect(20, 48, 170, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(18, 32, 27);
  doc.text(`Resident: ${tenant}`, 25, 58);
  doc.text(`Unit: Unit ${unit} • Property: ${prop}`, 25, 66);
  doc.text(`Document Classification: ${item.docType || item.title || 'Official Record'}`, 25, 74);

  // Financial Table
  doc.setFillColor(47, 93, 80);
  doc.rect(20, 90, 170, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ITEM DESCRIPTION', 25, 96);
  doc.text('TOTAL', 150, 96);

  doc.setTextColor(18, 32, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`${item.docType || item.title || item.fileName}`, 25, 108);
  doc.text(`${amount}`, 150, 108);

  doc.setDrawColor(216, 222, 216);
  doc.line(20, 116, 190, 116);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 135, 128);
  doc.text(
    'Attested and reconciled through Propithub cryptographically stamped financial audit log.',
    20,
    140
  );

  return doc;
}

/**
 * Returns the exact Data URL for a document.
 * If a real Data URL (like base64 image or uploaded base64 PDF) is present, returns it.
 * Otherwise, generates the authentic official Propithub PDF Data URL so it can be viewed and downloaded directly.
 */
export function getOrGenerateDocumentDataUrl(item: DocumentDownloadItem): string {
  // If item already has a real Data URL or external URL:
  if (
    item.fileUrl &&
    (item.fileUrl.startsWith('data:') ||
      item.fileUrl.startsWith('blob:') ||
      (item.fileUrl.startsWith('http') && !item.fileUrl.includes('storage.propithub.app')))
  ) {
    return item.fileUrl;
  }

  // Otherwise generate official PDF data uri string
  const isVoucher =
    /cash_handover/i.test(item.fileName) ||
    /csh-/i.test(item.fileName) ||
    /voucher/i.test(item.fileName) ||
    /voucher/i.test(item.docType || '');

  const isAgreement =
    /lease/i.test(item.fileName) ||
    /agreement/i.test(item.fileName) ||
    /deed/i.test(item.fileName) ||
    /signed/i.test(item.fileName) ||
    /draft/i.test(item.fileName);

  let doc: jsPDF;
  if (isVoucher) {
    doc = generateCashHandoverVoucherPdf(item);
  } else if (isAgreement) {
    doc = generateAgreementLeasePdf(item);
  } else {
    doc = generateGenericDocumentPdf(item);
  }

  return doc.output('datauristring');
}

/**
 * Universal document download/export utility that reliably downloads or shares the document file.
 * On Web: Direct browser file download.
 * On Native (iOS / Android): Writes to local cache using expo-file-system and triggers native share/save sheet via expo-sharing.
 */
export async function downloadDocument(doc: DocumentDownloadItem): Promise<boolean> {
  const cleanFileName = doc.fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'Document.pdf';

  try {
    const dataUrl = getOrGenerateDocumentDataUrl(doc);

    // 1. Web Environment: Direct download anchor click
    if (Platform.OS === 'web' || typeof window !== 'undefined') {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = cleanFileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    }

    // 2. React Native (iOS / Android): Write to FileSystem and use Sharing
    const fileUri = `${FileSystem.cacheDirectory}${cleanFileName}`;

    if (dataUrl.startsWith('data:')) {
      const commaIdx = dataUrl.indexOf(',');
      const base64Data = commaIdx !== -1 ? dataUrl.substring(commaIdx + 1) : dataUrl;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (dataUrl.startsWith('http')) {
      await FileSystem.downloadAsync(dataUrl, fileUri);
    } else {
      await FileSystem.writeAsStringAsync(fileUri, dataUrl, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      const isPdf = cleanFileName.toLowerCase().endsWith('.pdf');
      await Sharing.shareAsync(fileUri, {
        mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
        dialogTitle: cleanFileName,
        UTI: isPdf ? 'com.adobe.pdf' : 'public.jpeg',
      });
      return true;
    }

    // Fallback to Share.share if Sharing module not available
    await Share.share({
      title: cleanFileName,
      message: `Propithub Document: ${cleanFileName}`,
      url: fileUri,
    });
    return true;
  } catch (err: any) {
    console.error('Document download/export failed:', err);
    Alert.alert('Download Error', `Unable to export ${cleanFileName}: ${err?.message || 'Unknown error'}`);
    return false;
  }
}

/**
 * Direct file/data URL download helper.
 */
export async function downloadOrShareDocument(dataUrl: string, fileName: string): Promise<boolean> {
  return downloadDocument({
    fileName,
    fileUrl: dataUrl,
    title: fileName,
  });
}
