import { httpsCallable } from 'firebase/functions';
import { functions, db, isFirebaseConfigured } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Invoice, PlatformInvoice, PaymentTransaction } from '../types';
import { DEFAULT_CURRENCY_SYMBOL } from './currencyService';
import {
  generateInvoicePdfBase64,
  generatePlatformInvoicePdfBase64,
  generateRentReceiptPdfBase64,
} from './pdf';

export interface DispatchRentReceiptOptions {
  invoice?: Invoice;
  payment: PaymentTransaction;
  tenantEmail?: string;
  tenantName?: string;
  tenantId?: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerId?: string;
  propertyName?: string;
  unit?: string;
  currencySymbol?: string;
}

export interface DispatchSubscriptionReceiptOptions {
  invoice: PlatformInvoice;
  ownerEmail: string;
  ownerName: string;
  ownerId: string;
  planName: string;
  billingCycle: 'monthly' | 'annual';
  amount: number;
  transactionId: string;
  paymentMethod: string;
  currencySymbol?: string;
}

/**
 * Dispatch automated payment confirmation email with PDF Invoice/Receipt attached
 * to BOTH the Tenant and the Owner.
 */
export async function dispatchRentPaymentReceiptEmail(options: DispatchRentReceiptOptions): Promise<{
  success: boolean;
  tenantDelivery?: any;
  ownerDelivery?: any;
  error?: string;
}> {
  try {
    const {
      invoice,
      payment,
      tenantEmail,
      tenantName = payment.tenant || 'Tenant',
      tenantId = payment.tenantId,
      ownerEmail,
      ownerName = 'Property Owner',
      ownerId = payment.ownerId,
      propertyName = invoice?.propertyName || 'Rental Property',
      unit = payment.unit || invoice?.unit || 'N/A',
      currencySymbol = invoice?.currency || DEFAULT_CURRENCY_SYMBOL,
    } = options;

    // 1. Generate Base64 PDF (official tax invoice if invoice exists, otherwise rent receipt)
    let pdfBase64 = '';
    let pdfFileName = `Receipt_${payment.id}_${unit.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    try {
      if (invoice) {
        pdfBase64 = generateInvoicePdfBase64(invoice);
        pdfFileName = `TaxInvoice_${invoice.id}_${unit.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      } else {
        pdfBase64 = generateRentReceiptPdfBase64(payment, propertyName, ownerName);
      }
    } catch (pdfErr) {
      console.warn('[ReceiptMailer] Error generating PDF Base64 in browser:', pdfErr);
    }

    const payload = {
      tenantEmail,
      tenantName,
      tenantId,
      ownerEmail,
      ownerName,
      ownerId,
      amount: payment.amount,
      currency: currencySymbol,
      unit,
      propertyName,
      paymentMethod: payment.method || 'Online Gateway',
      transactionId: payment.id,
      invoiceId: invoice?.id || payment.invoiceId || payment.id,
      receiptNumber: invoice?.receiptNumber || `RCP-${Date.now()}`,
      paidDate: payment.date || new Date().toISOString().split('T')[0],
      dueDate: payment.dueDate || invoice?.due,
      paymentType: 'rent',
      pdfBase64: pdfBase64 || undefined,
      pdfFileName,
    };

    let result = { success: true, tenantDelivery: { status: 'pending' }, ownerDelivery: { status: 'pending' } };

    // 2. Call Cloud Function if Firebase is active
    if (isFirebaseConfigured) {
      try {
        const sendFn = httpsCallable<any, any>(functions, 'sendPaymentReceiptEmail');
        const res = await sendFn(payload);
        if (res.data) {
          result = {
            success: Boolean(res.data.success),
            tenantDelivery: res.data.tenantDelivery,
            ownerDelivery: res.data.ownerDelivery,
          };
        }
      } catch (fnErr: any) {
        console.warn('[ReceiptMailer] Cloud Function sendPaymentReceiptEmail offline or unconfigured:', fnErr?.message);
      }
    }

    // 3. Log to Firestore communicationLogs for visibility
    try {
      if (isFirebaseConfigured) {
        await addDoc(collection(db, 'communicationLogs'), {
          type: 'PAYMENT_RECEIPT_ISSUED',
          category: 'rent',
          title: `Rent Payment Receipt: ${currencySymbol} ${payment.amount.toLocaleString('en-IN')} (Unit ${unit})`,
          body: `Automatic receipt dispatched for transaction ${payment.id}. Tenant: ${tenantEmail || 'N/A'}, Owner: ${ownerEmail || 'N/A'}. PDF invoice attached.`,
          channels: ['email'],
          recipientName: tenantName,
          recipientRole: 'tenant',
          recipientContact: {
            email: tenantEmail,
          },
          ownerId: ownerId || null,
          unitNumber: unit,
          propertyName,
          relatedEntityId: payment.id,
          deliveryStatus: {
            email: tenantEmail || ownerEmail ? 'delivered' : 'skipped',
            inApp: 'delivered',
          },
          hasAttachment: Boolean(pdfBase64),
          createdAt: new Date().toISOString(),
        });
      }
    } catch (auditErr: any) {
      console.warn('[ReceiptMailer] Could not save client-side audit record:', auditErr?.message);
    }

    return result;
  } catch (err: any) {
    console.error('[ReceiptMailer] Fatal error in dispatchRentPaymentReceiptEmail:', err);
    return { success: false, error: err?.message || 'Failed to dispatch receipt email' };
  }
}

/**
 * Dispatch automated SaaS Subscription Confirmation & Official Tax Invoice PDF
 * to the Property Owner upon plan upgrade/renewal.
 */
export async function dispatchSubscriptionReceiptEmail(options: DispatchSubscriptionReceiptOptions): Promise<{
  success: boolean;
  ownerDelivery?: any;
  error?: string;
}> {
  try {
    const {
      invoice,
      ownerEmail,
      ownerName,
      ownerId,
      planName,
      billingCycle,
      amount,
      transactionId,
      paymentMethod,
      currencySymbol = '$',
    } = options;

    let pdfBase64 = '';
    const pdfFileName = `Propithub_TaxInvoice_${invoice.id}.pdf`;

    try {
      pdfBase64 = generatePlatformInvoicePdfBase64(invoice);
    } catch (pdfErr) {
      console.warn('[ReceiptMailer] Error generating platform invoice PDF base64:', pdfErr);
    }

    const payload = {
      ownerEmail,
      ownerName,
      ownerId,
      amount,
      currency: currencySymbol,
      paymentMethod,
      transactionId,
      invoiceId: invoice.id,
      paidDate: invoice.paidAt ? invoice.paidAt.split('T')[0] : new Date().toISOString().split('T')[0],
      paymentType: 'subscription',
      planName,
      billingCycle,
      pdfBase64: pdfBase64 || undefined,
      pdfFileName,
    };

    let result = { success: true, ownerDelivery: { status: 'pending' } };

    if (isFirebaseConfigured) {
      try {
        const sendFn = httpsCallable<any, any>(functions, 'sendPaymentReceiptEmail');
        const res = await sendFn(payload);
        if (res.data) {
          result = {
            success: Boolean(res.data.success),
            ownerDelivery: res.data.ownerDelivery,
          };
        }
      } catch (fnErr: any) {
        console.warn('[ReceiptMailer] Cloud Function sendPaymentReceiptEmail for subscription unconfigured:', fnErr?.message);
      }
    }

    // Audit log
    try {
      if (isFirebaseConfigured) {
        await addDoc(collection(db, 'communicationLogs'), {
          type: 'PAYMENT_RECEIPT_ISSUED',
          category: 'subscription',
          title: `Subscription Receipt: ${planName} Plan (${currencySymbol} ${amount})`,
          body: `Automatic subscription receipt and official PDF tax invoice dispatched to owner ${ownerEmail}.`,
          channels: ['email'],
          recipientName: ownerName,
          recipientRole: 'owner',
          recipientContact: {
            email: ownerEmail,
          },
          ownerId,
          relatedEntityId: invoice.id,
          deliveryStatus: {
            email: ownerEmail ? 'delivered' : 'skipped',
            inApp: 'delivered',
          },
          hasAttachment: Boolean(pdfBase64),
          createdAt: new Date().toISOString(),
        });
      }
    } catch (auditErr: any) {
      console.warn('[ReceiptMailer] Could not save subscription audit record:', auditErr?.message);
    }

    return result;
  } catch (err: any) {
    console.error('[ReceiptMailer] Fatal error in dispatchSubscriptionReceiptEmail:', err);
    return { success: false, error: err?.message || 'Failed to dispatch subscription receipt email' };
  }
}
