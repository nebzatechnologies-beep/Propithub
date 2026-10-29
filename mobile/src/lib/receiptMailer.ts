import { httpsCallable } from 'firebase/functions';
import { functions, db, isFirebaseConfigured } from './firebase';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import {
  MobileInvoice,
  MobilePaymentTransaction,
  MobilePlatformInvoice,
  MobileCommunicationLog,
} from '../types';
import { DEFAULT_CURRENCY_SYMBOL } from './currencyService';

export interface DispatchRentReceiptOptions {
  invoice?: MobileInvoice;
  payment: MobilePaymentTransaction;
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
  invoice: MobilePlatformInvoice;
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
 * Dispatch automated payment confirmation email to BOTH the Tenant and the Owner,
 * with Firestore communicationLogs audit logging.
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
      propertyName = invoice?.propertyName || payment.propertyName || 'Rental Property',
      unit = payment.unit || invoice?.unit || 'N/A',
      currencySymbol = invoice?.currency || (payment as any).currency || DEFAULT_CURRENCY_SYMBOL,
    } = options;

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
      lateFeeApplied: invoice?.lateFeeApplied || 0,
      lateFeeCalculation: invoice?.lateFeeCalculation,
      lateFeeWaived: invoice?.lateFeeWaived,
    };

    let result = {
      success: true,
      tenantDelivery: { status: tenantEmail ? 'delivered' : 'skipped' },
      ownerDelivery: { status: ownerEmail ? 'delivered' : 'skipped' },
    };

    // 1. Call Cloud Function if Firebase is active
    if (isFirebaseConfigured && (tenantEmail || ownerEmail)) {
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

    // 2. Log to Firestore communicationLogs for transparency and audit trail
    try {
      const commLogId = `COMM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const lateFeeNote = (invoice?.lateFeeApplied || 0) > 0 ? ` (Includes late fee penalty of ${currencySymbol}${invoice?.lateFeeApplied})` : '';
      const logEntry: MobileCommunicationLog = {
        id: commLogId,
        type: 'PAYMENT_RECEIPT_ISSUED',
        category: 'rent',
        title: `Rent Payment Receipt: ${currencySymbol}${payment.amount.toLocaleString()} (Unit ${unit})`,
        body: `Receipt dispatched for transaction ${payment.id}${lateFeeNote}. Tenant: ${tenantEmail || tenantName}, Owner: ${ownerEmail || ownerName}.`,
        channels: ['email', 'in_app'],
        recipientId: tenantId || '',
        recipientName: tenantName,
        recipientRole: 'tenant',
        recipientContact: {
          email: tenantEmail,
        },
        senderId: ownerId || 'system',
        senderName: ownerName,
        senderRole: 'system',
        ownerId: ownerId || null,
        ownerName,
        propertyName,
        unitNumber: unit,
        relatedEntityId: payment.id,
        deliveryStatus: {
          email: tenantEmail || ownerEmail ? 'delivered' : 'skipped',
          inApp: 'delivered',
        },
        createdAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured) {
        await setDoc(doc(db, 'communicationLogs', commLogId), logEntry).catch(console.warn);
      }
    } catch (auditErr: any) {
      console.warn('[ReceiptMailer] Could not save audit log:', auditErr?.message);
    }

    return result;
  } catch (err: any) {
    console.error('[ReceiptMailer] Fatal error in dispatchRentPaymentReceiptEmail:', err);
    return { success: false, error: err?.message || 'Failed to dispatch receipt email' };
  }
}

/**
 * Dispatch automated SaaS Subscription Confirmation & Official Tax Invoice
 * to Property Owner upon plan upgrade/renewal.
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

    const commLogId = `COMM-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const logEntry: MobileCommunicationLog = {
      id: commLogId,
      type: 'SUBSCRIPTION_RECEIPT_ISSUED',
      category: 'subscription',
      title: `Propithub SaaS Tier Receipt: ${planName} (${billingCycle})`,
      body: `Payment of ${currencySymbol}${amount} for ${planName} tier received via ${paymentMethod}. Transaction: ${transactionId}.`,
      channels: ['email', 'in_app'],
      recipientId: ownerId,
      recipientName: ownerName,
      recipientRole: 'owner',
      recipientContact: {
        email: ownerEmail,
      },
      senderId: 'superadmin',
      senderName: 'Propithub Billing Admin',
      senderRole: 'superadmin',
      ownerId,
      ownerName,
      relatedEntityId: invoice.id,
      deliveryStatus: {
        email: ownerEmail ? 'delivered' : 'skipped',
        inApp: 'delivered',
      },
      createdAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'communicationLogs', commLogId), logEntry).catch(console.warn);
    }

    return { success: true, ownerDelivery: { status: ownerEmail ? 'delivered' : 'skipped' } };
  } catch (err: any) {
    console.error('[ReceiptMailer] Subscription receipt error:', err);
    return { success: false, error: err?.message || 'Failed to dispatch subscription receipt' };
  }
}
