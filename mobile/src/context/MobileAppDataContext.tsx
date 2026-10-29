import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isFirebaseConfigured, createSecondaryAuthUser } from '../lib/firebase';
import { useMobileAuth } from './MobileAuthContext';
import {
  MobileProperty,
  MobileUnit,
  MobileTenantRecord,
  MobileAgreement,
  MobileInvoice,
  MobilePaymentTransaction,
  MobileTicket,
  MobileMoveOut,
  MobileDispute,
  MobileStaffMember,
  MobileInAppNotification,
  MobilePlanUsage,
  MobilePaymentMethodsConfig,
  MobileAnnouncement,
  MobileTenancyRequest,
  MobilePropertyManager,
  MobileManagerPayout,
  MobileStaffScheduleItem,
  MobilePlatformSupportTicket,
  MobileTenantReview,
  MobilePlan,
  MobilePlatformInvoice,
  MobileOwnerSettings,
  MobilePlatformGateways,
  MobileUserProfile,
  MobileRenewalItem,
  MobileCashHandoverClaim,
  MobileCommunicationLog,
  MobileCommsConfig,
  MobileLateFeeSettings,
  MobileDepositSettlement,
  MobileAgreementTemplate,
} from '../types';
import { calculateMobileInvoiceLateFee } from '../lib/lateFeeService';
import { DEFAULT_CURRENCY_SYMBOL, formatCurrencyAmount } from '../lib/currencyService';
import { uploadOrCompressDocument, getObjectByteSize } from '../lib/imageUploader';

export const DEFAULT_CASH_CLAIMS: MobileCashHandoverClaim[] = [];
export const DEFAULT_TENANCY_REQUESTS: MobileTenancyRequest[] = [];
export const DEFAULT_MANAGER_PAYOUTS: MobileManagerPayout[] = [];

export const DEFAULT_PLANS: MobilePlan[] = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    price: 0,
    properties: 2,
    units: 10,
    tenants: 10,
    managers: 1,
    staff: 2,
    owners: 1,
    isTrialOnly: true,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    properties: 2,
    units: 10,
    tenants: 10,
    managers: 1,
    staff: 2,
    owners: 1,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 79,
    properties: 8,
    units: 50,
    tenants: 50,
    managers: 3,
    staff: 8,
    owners: 1,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    properties: 50,
    units: 500,
    tenants: 500,
    managers: 15,
    staff: 50,
    owners: 1,
  },
];

export const DEFAULT_PLATFORM_GATEWAYS: MobilePlatformGateways = {
  stripe: { enabled: false, pubKey: '' },
  razorpay: { enabled: false, keyId: '' },
  paypal: { enabled: false, clientId: '' },
  easebuzz: { enabled: false, connected: false, merchantKey: '', salt: '', subMerchantId: '', mode: 'live' },
  mock: { enabled: false },
};

export const DEFAULT_COMMS_CONFIG: MobileCommsConfig = {
  twilioSid: '',
  twilioAuthToken: '',
  twilioConnected: false,
  twilioNumber: '',
  sendgridKey: '',
  sendgridConnected: false,
  sendgridFrom: 'notifications@propithub.app',
};

export interface MobileAppState {
  properties: MobileProperty[];
  units: MobileUnit[];
  tenants: MobileTenantRecord[];
  agreements: MobileAgreement[];
  invoices: MobileInvoice[];
  payments: MobilePaymentTransaction[];
  tickets: MobileTicket[];
  moveOuts: MobileMoveOut[];
  disputes: MobileDispute[];
  staff: MobileStaffMember[];
  propertyManagers: MobilePropertyManager[];
  managerPayouts: MobileManagerPayout[];
  staffSchedules: MobileStaffScheduleItem[];
  notifications: MobileInAppNotification[];
  announcements: MobileAnnouncement[];
  paymentMethods: MobilePaymentMethodsConfig;
  tenancyRequests: MobileTenancyRequest[];
  renewals: MobileRenewalItem[];
  platformSupport: MobilePlatformSupportTicket[];
  reviews: MobileTenantReview[];
  plans: MobilePlan[];
  platformInvoices: MobilePlatformInvoice[];
  ownerSettings: Record<string, MobileOwnerSettings>;
  platformGateways: MobilePlatformGateways;
  defaultTrialDays: number;
  annualDiscountPercent: number;
  users: MobileUserProfile[];
  cashClaims: MobileCashHandoverClaim[];
  communicationLogs: MobileCommunicationLog[];
  commsConfig: MobileCommsConfig;
  lateFeeSettings: MobileLateFeeSettings;
  depositSettlements: MobileDepositSettlement[];
  agreementTemplates: MobileAgreementTemplate[];
}

export const DEFAULT_MOBILE_LATE_FEE_SETTINGS: MobileLateFeeSettings = {
  enabled: true,
  graceDays: 5,
  type: 'daily_fixed',
  value: 50,
  cap: 500,
};

const INITIAL_STATE: MobileAppState = {
  properties: [],
  units: [],
  tenants: [],
  agreements: [],
  invoices: [],
  payments: [],
  tickets: [],
  moveOuts: [],
  disputes: [],
  staff: [],
  propertyManagers: [],
  managerPayouts: [],
  staffSchedules: [],
  notifications: [],
  announcements: [],
  paymentMethods: {},
  tenancyRequests: [],
  renewals: [],
  platformSupport: [],
  reviews: [],
  plans: DEFAULT_PLANS,
  platformInvoices: [],
  ownerSettings: {},
  platformGateways: DEFAULT_PLATFORM_GATEWAYS,
  defaultTrialDays: 14,
  annualDiscountPercent: 20,
  users: [],
  cashClaims: [],
  communicationLogs: [],
  commsConfig: DEFAULT_COMMS_CONFIG,
  lateFeeSettings: DEFAULT_MOBILE_LATE_FEE_SETTINGS,
  depositSettlements: [],
  agreementTemplates: [],
};


interface MobileAppDataContextType {
  state: MobileAppState;
  planUsage: MobilePlanUsage;
  saveProperty: (prop: MobileProperty, units?: MobileUnit[]) => void;
  saveUnit: (unit: MobileUnit) => void;
  deleteUnit: (unitId: string) => void;
  saveAgreement: (agreement: MobileAgreement) => void;
  saveAgreementTemplate: (template: MobileAgreementTemplate) => Promise<void>;
  deleteAgreementTemplate: (templateId: string) => Promise<void>;
  deleteAgreement: (agreementId: string) => Promise<void>;
  addAgreement: (agreement: MobileAgreement) => void;
  updateAgreement: (agreementId: string, updates: Partial<MobileAgreement>) => void;
  saveInvoice: (invoice: MobileInvoice) => void;
  markInvoicePaid: (
    invoiceId: string,
    paymentMethod: string,
    receiptNumber?: string,
    additionalMetadata?: {
      lateFeeApplied?: number;
      lateFeeCalculation?: string;
      finalTotal?: number;
    }
  ) => void;
  waiveInvoiceLateFee: (invoiceId: string, reason?: string) => Promise<void>;
  updateLateFeeSettings: (settings: Partial<MobileLateFeeSettings>, ownerId?: string) => Promise<void>;
  savePayment: (payment: MobilePaymentTransaction) => void;
  recordPayment: (payment: MobilePaymentTransaction) => void;
  confirmOfflinePayment: (paymentId: string) => void;
  rejectOfflinePayment: (paymentId: string, reason: string) => void;
  savePaymentMethods: (methods: MobilePaymentMethodsConfig, ownerId?: string) => void;
  saveAnnouncement: (announcement: MobileAnnouncement) => void;
  togglePinAnnouncement: (id: string) => void;
  archiveAnnouncement: (id: string) => void;
  deleteAnnouncement: (id: string) => void;
  acknowledgeAnnouncement: (id: string, userId?: string) => void;
  sendTenancyRequest: (req: MobileTenancyRequest) => void;
  updateTenancyRequest: (id: string, status: 'accepted' | 'declined' | 'cancelled') => void;
  saveTicket: (ticket: MobileTicket) => void;
  updateTicket: (ticketId: string, updates: Partial<MobileTicket>) => void;
  sendStaffPaymentReminder: (ticketId: string) => void;
  saveMoveOut: (moveout: MobileMoveOut) => void;
  addMoveOut: (moveout: MobileMoveOut) => void;
  updateMoveOut: (moveOutId: string, updates: Partial<MobileMoveOut>) => void;
  createDepositSettlement: (settlement: Partial<MobileMoveOut>) => void;
  saveDepositSettlement: (settlement: MobileDepositSettlement) => Promise<void>;
  respondToDepositSettlement: (settlementId: string, status: 'approved' | 'rejected', notes?: string, payoutDetails?: any) => Promise<void>;
  confirmRefundReceipt: (claimOrMoveOutOrSettleId: string) => Promise<void>;
  confirmCashClaim: (claimOrMoveOutId: string) => void;
  rejectCashClaim: (claimOrMoveOutId: string, reason?: string) => void;
  submitCashClaim: (claimData: any) => void;
  saveDispute: (dispute: MobileDispute) => void;
  updateDispute: (disputeId: string, updates: Partial<MobileDispute>) => void;
  resolveDispute: (disputeId: string, resolution: string) => void;
  saveTenant: (tenant: MobileTenantRecord, password?: string) => Promise<string | void>;
  addTenant: (tenant: MobileTenantRecord, password?: string) => Promise<string | void>;
  addStaff: (member: MobileStaffMember, password?: string) => Promise<string | void>;
  saveManager: (manager: MobilePropertyManager, password?: string) => Promise<string | void>;
  deleteManager: (managerId: string) => void;
  reassignManagerProperty: (managerId: string, propertyId: string | null) => Promise<void>;
  recordManagerPayout: (payout: MobileManagerPayout) => void;
  saveStaffSchedule: (item: MobileStaffScheduleItem) => void;
  deleteStaffSchedule: (id: string) => void;
  updatePlanUsage: (updates: Partial<MobilePlanUsage>) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;
  createPlatformSupportTicket: (ticket: Omit<MobilePlatformSupportTicket, 'id' | 'createdAt' | 'status'> & { id?: string }) => Promise<MobilePlatformSupportTicket>;
  resolvePlatformSupportTicket: (ticketId: string, reply?: string) => Promise<void>;
  saveReview: (review: MobileTenantReview) => Promise<void>;
  savePlatformInvoice: (invoice: MobilePlatformInvoice) => Promise<void>;
  saveOwnerSettings: (ownerId: string, settings: Partial<MobileOwnerSettings>) => Promise<void>;
  isOwnerPlanActive: (ownerId?: string) => boolean;
  approveSignedAgreement: (agreementId: string, signatoryName?: string, notes?: string) => Promise<string>;
  rejectSignedAgreement: (agreementId: string, reason: string) => Promise<void>;
  requestLeaseRenewal: (unit: string, tenantNotes?: string, propertyId?: string) => Promise<void>;
  offerLeaseRenewal: (
    unit: string,
    terms: {
      currentRent: number;
      percentageIncrease: number;
      proposedRent: number;
      termMonths: number;
      newLeaseStart: string;
      newLeaseEnd: string;
      ownerNotes?: string;
      ownerAgreementFileUrl?: string | null;
      ownerAgreementFileName?: string | null;
      ownerAgreementFileSize?: number | null;
      currency?: string;
      propertyId?: string;
    }
  ) => Promise<void>;
  submitTenantSignedRenewal: (
    unit: string,
    fileData: string,
    fileName: string,
    fileSize?: number,
    propertyId?: string
  ) => Promise<void>;
  respondToLeaseRenewal: (
    unit: string,
    decision: 'accepted' | 'rejected',
    feedback?: string,
    propertyId?: string
  ) => Promise<void>;
  approveLeaseRenewal: (unit: string, propertyId?: string) => Promise<void>;
  logCommunication: (entry: Omit<MobileCommunicationLog, 'id' | 'createdAt'>) => Promise<string>;
  saveCommsConfig: (config: Partial<MobileCommsConfig>) => Promise<void>;
  selectedTenantUnitId: string | null;
  setSelectedTenantUnitId: (unitId: string | null) => void;
  updateAgreementAutopay: (agreementId: string, autopayData: Partial<NonNullable<MobileAgreement['autopay']>>) => Promise<void>;
  cancelAgreementAutopay: (agreementId: string) => Promise<void>;
  updateOwnerAutopay: (ownerId: string, mandateData: Partial<NonNullable<MobileOwnerSettings['subscriptionMandate']>>) => Promise<void>;
  cancelOwnerAutopay: (ownerId: string) => Promise<void>;
}


const MobileAppDataContext = createContext<MobileAppDataContextType | undefined>(undefined);

export const MobileAppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, isAuthenticated } = useMobileAuth();
  const [rawState, setRawState] = useState<MobileAppState>(INITIAL_STATE);
  const setState = setRawState;
  const [selectedTenantUnitId, setSelectedTenantUnitId] = useState<string | null>(null);


  // Live real-time sync with all Firestore collections
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const unsubProps = onSnapshot(collection(db, 'properties'), (snap) => {
      const items: MobileProperty[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileProperty));
      setState((prev) => ({ ...prev, properties: items }));
    }, (err) => console.warn('Firestore properties sync error:', err));

    const unsubUnits = onSnapshot(collection(db, 'units'), (snap) => {
      const items: MobileUnit[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileUnit));
      setState((prev) => ({ ...prev, units: items }));
    }, (err) => console.warn('Firestore units sync error:', err));

    const unsubTenants = onSnapshot(collection(db, 'tenants'), (snap) => {
      const items: MobileTenantRecord[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileTenantRecord));
      // Deduplicate by email and unit
      const seenTenantKeys = new Set<string>();
      const dedupedTenants: MobileTenantRecord[] = [];
      items.forEach((t) => {
        const emailKey = t.email ? `email:${t.email.toLowerCase().trim()}` : '';
        const unitKey = t.unit && t.unit !== 'Unassigned' ? `unit:${t.propertyId || ''}_${t.unit.toLowerCase().trim()}` : '';
        const idKey = t.id ? `id:${t.id}` : '';
        if (emailKey && seenTenantKeys.has(emailKey)) return;
        if (unitKey && seenTenantKeys.has(unitKey)) return;
        if (idKey && seenTenantKeys.has(idKey)) return;
        if (emailKey) seenTenantKeys.add(emailKey);
        if (unitKey) seenTenantKeys.add(unitKey);
        if (idKey) seenTenantKeys.add(idKey);
        dedupedTenants.push(t);
      });
      setState((prev) => ({ ...prev, tenants: dedupedTenants }));
    }, (err) => console.warn('Firestore tenants sync error:', err));

    const unsubAgreements = onSnapshot(collection(db, 'agreements'), (snap) => {
      const items: MobileAgreement[] = [];
      snap.forEach((d) => {
        const item = { id: d.id, ...d.data() } as MobileAgreement;
        if ((item as any).status === 'awaiting_owner_signature') {
          item.status = 'pending_approval';
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'agreements', d.id), { status: 'pending_approval' }, { merge: true }).catch(console.warn);
          }
        }
        items.push(item);
      });

      const terminatedPrevAgIds = new Set<string>();
      const terminatedRenewalKeys = new Set<string>();
      items.forEach((a) => {
        if (a.status === 'terminated') {
          if ((a as any).previousAgreementId) terminatedPrevAgIds.add((a as any).previousAgreementId);
          if ((a as any).isRenewal && a.unit && a.tenantId) {
            terminatedRenewalKeys.add(`${a.propertyId || ''}_${a.unit}_${a.tenantId}`);
          }
        }
      });
      items.forEach((a) => {
        const key = `${a.propertyId || ''}_${a.unit}_${a.tenantId}`;
        if ((terminatedPrevAgIds.has(a.id) || terminatedRenewalKeys.has(key)) && a.status !== 'terminated') {
          a.status = 'terminated';
          a.depositStatus = 'refunded';
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'agreements', a.id), { status: 'terminated', depositStatus: 'refunded' }, { merge: true }).catch(console.warn);
          }
        }
      });

      setState((prev) => ({ ...prev, agreements: items }));
    }, (err) => console.warn('Firestore agreements sync error:', err));

    const unsubTemplates = onSnapshot(collection(db, 'agreementTemplates'), (snap) => {
      const items: MobileAgreementTemplate[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileAgreementTemplate));
      setState((prev) => ({ ...prev, agreementTemplates: items }));
    }, (err) => console.warn('Firestore agreementTemplates sync error:', err));

    const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snap) => {
      const items: MobileInvoice[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileInvoice));
      setState((prev) => ({ ...prev, invoices: items }));
    }, (err) => console.warn('Firestore invoices sync error:', err));

    const unsubPayments = onSnapshot(collection(db, 'payments'), (snap) => {
      const items: MobilePaymentTransaction[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobilePaymentTransaction));
      // Deduplicate by invoiceId and id
      const invoicePayMap = new Map<string, string>();
      const payMap = new Map<string, MobilePaymentTransaction>();
      items.forEach((p) => {
        if (p.invoiceId) {
          const existingId = invoicePayMap.get(p.invoiceId);
          if (existingId && existingId !== p.id) {
            return;
          }
          invoicePayMap.set(p.invoiceId, p.id);
        }
        payMap.set(p.id, p);
      });
      setState((prev) => ({ ...prev, payments: Array.from(payMap.values()) }));
    }, (err) => console.warn('Firestore payments sync error:', err));

    const unsubTickets = onSnapshot(collection(db, 'tickets'), (snap) => {
      const items: MobileTicket[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileTicket));
      setState((prev) => ({ ...prev, tickets: items }));
    }, (err) => console.warn('Firestore tickets sync error:', err));

    const unsubStaff = onSnapshot(collection(db, 'staff'), (snap) => {
      const items: MobileStaffMember[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileStaffMember));
      setState((prev) => ({ ...prev, staff: items }));
    }, (err) => console.warn('Firestore staff sync error:', err));

    const unsubAnnouncements = onSnapshot(collection(db, 'announcements'), (snap) => {
      const items: MobileAnnouncement[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileAnnouncement));
      setState((prev) => ({ ...prev, announcements: items }));
    }, (err) => console.warn('Firestore announcements sync error:', err));

    const unsubTenancyRequests = onSnapshot(collection(db, 'tenancyRequests'), (snap) => {
      const items: MobileTenancyRequest[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileTenancyRequest));
      setState((prev) => ({
        ...prev,
        tenancyRequests: items
      }));
    }, (err) => console.warn('Firestore tenancyRequests sync error:', err));

    const unsubRenewals = onSnapshot(collection(db, 'renewals'), (snap) => {
      const items: MobileRenewalItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileRenewalItem));
      const getRenewalTs = (item: MobileRenewalItem) => {
        const t = (item as any).offeredAt || (item as any).ownerApprovedAt || (item as any).tenantSignedAt || (item as any).respondedAt || (item as any).requestedAt;
        return t ? new Date(t).getTime() : 0;
      };
      const map = new Map<string, MobileRenewalItem>();
      items.forEach((r) => {
        const existing = map.get(r.unit);
        if (!existing || getRenewalTs(r) >= getRenewalTs(existing)) {
          map.set(r.unit, r);
        }
      });
      setState((prev) => ({ ...prev, renewals: Array.from(map.values()) }));
    }, (err) => console.warn('Firestore renewals sync error:', err));

    const unsubMoveouts = onSnapshot(collection(db, 'moveouts'), (snap) => {
      const items: MobileMoveOut[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const normalizedStatus =
          data.status === 'awaiting_tenant_approval' || data.status === 'settlement_pending'
            ? 'refund_scheduled'
            : data.status;
        items.push({ id: d.id, ...data, status: normalizedStatus } as MobileMoveOut);
      });
      setState((prev) => ({ ...prev, moveOuts: items }));
    }, (err) => console.warn('Firestore moveouts sync error:', err));

    const unsubSettlements = onSnapshot(collection(db, 'depositSettlements'), (snap) => {
      const items: MobileDepositSettlement[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        items.push({ id: d.id, ...data } as MobileDepositSettlement);
      });
      setState((prev) => ({ ...prev, depositSettlements: items }));
    }, (err) => console.warn('Firestore depositSettlements sync error:', err));

    const unsubManagers = onSnapshot(collection(db, 'propertyManagers'), (snap) => {
      const items: MobilePropertyManager[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobilePropertyManager));
      setState((prev) => ({ ...prev, propertyManagers: items }));
    }, (err) => console.warn('Firestore propertyManagers sync error:', err));

    const unsubManagerPayouts = onSnapshot(collection(db, 'managerPayouts'), (snap) => {
      const items: MobileManagerPayout[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileManagerPayout));
      setState((prev) => ({ ...prev, managerPayouts: items }));
    }, (err) => console.warn('Firestore managerPayouts sync error:', err));

    const unsubStaffSchedules = onSnapshot(collection(db, 'staffSchedules'), (snap) => {
      const items: MobileStaffScheduleItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as unknown as MobileStaffScheduleItem));
      setState((prev) => ({ ...prev, staffSchedules: items }));
    }, (err) => console.warn('Firestore staffSchedules sync error:', err));

    const unsubCashClaims = onSnapshot(collection(db, 'cashClaims'), (snap) => {
      const items: MobileCashHandoverClaim[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileCashHandoverClaim));
      setState((prev) => ({ ...prev, cashClaims: items }));
    }, (err) => console.warn('Firestore cashClaims sync error:', err));


    const unsubNotifications = onSnapshot(collection(db, 'notifications'), (snap) => {
      const items: MobileInAppNotification[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileInAppNotification));
      setState((prev) => ({ ...prev, notifications: items }));
    }, (err) => console.warn('Firestore notifications sync error:', err));

    const unsubPlatformSupport = onSnapshot(collection(db, 'platformSupport'), (snap) => {
      const items: MobilePlatformSupportTicket[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobilePlatformSupportTicket));
      setState((prev) => ({ ...prev, platformSupport: items }));
    }, (err) => console.warn('Firestore platformSupport sync error:', err));

    const unsubReviews = onSnapshot(collection(db, 'reviews'), (snap) => {
      const items: MobileTenantReview[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileTenantReview));
      setState((prev) => ({ ...prev, reviews: items }));
    }, (err) => console.warn('Firestore reviews sync error:', err));

    const unsubPlans = onSnapshot(collection(db, 'plans'), (snap) => {
      const items: MobilePlan[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobilePlan));
      if (items.length > 0) {
        setState((prev) => ({ ...prev, plans: items }));
      }
    }, (err) => console.warn('Firestore plans sync error:', err));

    const unsubPlatformInvoices = onSnapshot(collection(db, 'platformInvoices'), (snap) => {
      const items: MobilePlatformInvoice[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobilePlatformInvoice));
      setState((prev) => ({ ...prev, platformInvoices: items }));
    }, (err) => console.warn('Firestore platformInvoices sync error:', err));

    const unsubOwners = onSnapshot(collection(db, 'owners'), (snap) => {
      const ownerMap: Record<string, MobileOwnerSettings> = {};
      snap.forEach((d) => {
        const data = d.data();
        ownerMap[d.id] = { id: d.id, ...data } as unknown as MobileOwnerSettings;
        // paymentMethods field on the owner doc (written by web app) is captured here
        if (data.paymentMethods) {
          ownerMap[d.id].paymentMethods = data.paymentMethods as MobilePaymentMethodsConfig;
        }
      });
      setState((prev) => ({
        ...prev,
        ownerSettings: ownerMap,
        // Also update global paymentMethods to reflect the first (or single) owner's configured methods
        // This ensures backward compat with code reading state.paymentMethods directly
        paymentMethods: Object.values(ownerMap)
          .map((s) => s.paymentMethods)
          .find((m) => m && Object.keys(m).length > 0) || prev.paymentMethods,
      }));
    }, (err) => console.warn('Firestore owners sync error:', err));

    const unsubGateways = onSnapshot(doc(db, 'platformConfig', 'gateways'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.platformGateways) {
          setState((prev) => ({
            ...prev,
            platformGateways: {
              ...prev.platformGateways,
              ...data.platformGateways,
            },
          }));
        }
      }
    }, (err) => console.warn('Firestore gateways sync error:', err));

    const unsubTrial = onSnapshot(doc(db, 'platformConfig', 'trialPolicy'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const hasDays = typeof data.defaultTrialDays === 'number';
        const hasDiscount = typeof data.annualDiscountPercent === 'number';
        if (hasDays || hasDiscount) {
          setState((prev) => ({
            ...prev,
            ...(hasDays ? { defaultTrialDays: Math.max(0, data.defaultTrialDays) } : {}),
            ...(hasDiscount ? { annualDiscountPercent: Math.min(90, Math.max(0, data.annualDiscountPercent)) } : {}),
          }));
        }
      }
    }, (err) => console.warn('Firestore trialPolicy sync error:', err));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const items: MobileUserProfile[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileUserProfile));
      setState((prev) => ({ ...prev, users: items }));
    }, (err) => console.warn('Firestore users sync error:', err));

    const unsubCommLogs = onSnapshot(collection(db, 'communicationLogs'), (snap) => {
      const items: MobileCommunicationLog[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MobileCommunicationLog));
      if (items.length > 0) {
        setState((prev) => ({ ...prev, communicationLogs: items }));
      }
    }, (err) => console.warn('Firestore communicationLogs sync error:', err));

    const unsubComms = onSnapshot(doc(db, 'platformConfig', 'comms'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.commsConfig) {
          setState((prev) => ({
            ...prev,
            commsConfig: {
              ...prev.commsConfig,
              ...data.commsConfig,
            },
          }));
        }
      }
    }, (err) => console.warn('Firestore commsConfig sync error:', err));

    return () => {
      unsubProps();
      unsubUnits();
      unsubTenants();
      unsubAgreements();
      unsubTemplates();
      unsubInvoices();
      unsubPayments();
      unsubTickets();
      unsubStaff();
      unsubAnnouncements();
      unsubTenancyRequests();
      unsubRenewals();
      unsubMoveouts();
      unsubManagers();
      unsubManagerPayouts();
      unsubStaffSchedules();
      unsubNotifications();
      unsubPlatformSupport();
      unsubReviews();
      unsubPlans();
      unsubPlatformInvoices();
      unsubOwners();
      unsubGateways();
      unsubTrial();
      unsubUsers();
      unsubCommLogs();
      unsubComms();
    };
  }, []);

  // -------------------------------------------------------------
  // REAL-TIME CONCURRENCY & OFFLINE PERSISTENCE (AsyncStorage + localStorage)
  // -------------------------------------------------------------
  useEffect(() => {
    // 1. Native Mobile Storage Hydration (AsyncStorage)
    AsyncStorage.getItem('propithub_state_v2').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            setState((prev) => ({
              ...prev,
              renewals: parsed.renewals && parsed.renewals.length > 0 ? parsed.renewals : prev.renewals,
              agreements: parsed.agreements && parsed.agreements.length > 0 ? parsed.agreements : prev.agreements,
              tenants: parsed.tenants && parsed.tenants.length > 0 ? parsed.tenants : prev.tenants,
              units: parsed.units && parsed.units.length > 0 ? parsed.units : prev.units,
            }));
          }
        } catch (_) {}
      }
    }).catch(() => {});

    // 2. Web DOM Storage Hydration & Cross-Tab Sync
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawCached = localStorage.getItem('propithub_state_v2');
        if (rawCached) {
          const parsed = JSON.parse(rawCached);
          if (parsed && typeof parsed === 'object') {
            setState((prev) => ({
              ...prev,
              renewals: parsed.renewals && parsed.renewals.length > 0 ? parsed.renewals : prev.renewals,
              agreements: parsed.agreements && parsed.agreements.length > 0 ? parsed.agreements : prev.agreements,
              tenants: parsed.tenants && parsed.tenants.length > 0 ? parsed.tenants : prev.tenants,
              units: parsed.units && parsed.units.length > 0 ? parsed.units : prev.units,
            }));
          }
        }
      } catch (_) {}

      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'propithub_state_v2' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed && typeof parsed === 'object') {
              setState((prev) => ({
                ...prev,
                renewals: parsed.renewals || prev.renewals,
                agreements: parsed.agreements || prev.agreements,
                tenants: parsed.tenants || prev.tenants,
                units: parsed.units || prev.units,
                notifications: parsed.notifications || prev.notifications,
              }));
            }
          } catch (_) {}
        }
      };

      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }
  }, []);

  useEffect(() => {
    const updated = {
      renewals: rawState.renewals,
      agreements: rawState.agreements,
      tenants: rawState.tenants,
      units: rawState.units,
    };
    const serialized = JSON.stringify(updated);

    // Save to native AsyncStorage for instant cold-boot
    AsyncStorage.setItem('propithub_state_v2', serialized).catch(() => {});

    // Save to web localStorage if in browser
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('propithub_state_v2', serialized);
      } catch (_) {}
    }
  }, [rawState.renewals, rawState.agreements, rawState.tenants, rawState.units]);

  // -------------------------------------------------------------
  // AUTOMATED LATE FEE BACKGROUND EVALUATOR
  // -------------------------------------------------------------
  useEffect(() => {
    if (!rawState.invoices || rawState.invoices.length === 0) return;
    const now = new Date();
    let hasUpdates = false;

    const updatedInvoices = rawState.invoices.map((inv) => {
      if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'draft') {
        return inv;
      }

      const ownerSettings = inv.ownerId ? rawState.ownerSettings[inv.ownerId] : undefined;
      const effectiveLateFeeSettings = ownerSettings?.lateFeeConfig || rawState.lateFeeSettings;

      const result = calculateMobileInvoiceLateFee(inv, effectiveLateFeeSettings, now);

      if (result.isOverdue) {
        const newStatus = 'overdue' as const;
        const newFee = result.accruedLateFee;
        const newCalc = result.ruleDescription;
        const newTotal = (inv.amount || 0) + (inv.tax || 0) + (result.isWaived ? 0 : newFee);

        if (
          inv.status !== newStatus ||
          inv.lateFeeApplied !== newFee ||
          inv.total !== newTotal ||
          inv.lateFeeCalculation !== newCalc
        ) {
          hasUpdates = true;
          return {
            ...inv,
            status: newStatus,
            lateFeeApplied: newFee,
            lateFeeCalculation: newCalc,
            total: newTotal,
          };
        }
      }
      return inv;
    });

    if (hasUpdates) {
      setRawState((prev) => ({
        ...prev,
        invoices: updatedInvoices,
      }));
    }
  }, [rawState.invoices.length, rawState.lateFeeSettings, rawState.ownerSettings]);

  // -------------------------------------------------------------
  // AUTHORITATIVE ROLE-BASED DATA ISOLATION ENGINE
  // Strict multi-tenant sandboxing for Owner, Tenant, Manager, Staff
  // -------------------------------------------------------------
  const state: MobileAppState = useMemo(() => {
    if (!isAuthenticated || !user) {
      return {
        ...rawState,
        properties: [],
        units: [],
        tenants: [],
        agreements: [],
        invoices: [],
        payments: [],
        tickets: [],
        moveOuts: [],
        disputes: [],
        staff: [],
        propertyManagers: [],
        managerPayouts: [],
        staffSchedules: [],
        notifications: [],
        announcements: [],
        tenancyRequests: [],
        renewals: [],
        cashClaims: [],
        platformSupport: [],
        reviews: [],
        platformInvoices: [],
        communicationLogs: [],
      };
    }

    const currentUserId = user.id;
    const currentUserEmail = (user.email || '').toLowerCase().trim();
    const currentUserName = (user.displayName || '').toLowerCase().trim();
    const currentRole = role || user.role || 'owner';

    // ─── 1. OWNER ROLE ISOLATION ──────────────────────────────────────────
    if (currentRole === 'owner') {
      const myOwnerId = currentUserId;

      const properties = (rawState.properties || []).filter(
        (p) => p.ownerId === myOwnerId
      );
      const myPropertyIds = new Set(properties.map((p) => p.id));

      const units = (rawState.units || []).filter(
        (u) => u.ownerId === myOwnerId || (Boolean(u.propertyId) && myPropertyIds.has(u.propertyId))
      );
      const myUnitIds = new Set(units.map((u) => u.id));
      const myUnitNumbers = new Set(units.map((u) => u.unitNumber?.toLowerCase().trim()).filter(Boolean));

      const tenants = (rawState.tenants || []).filter((t) => {
        if (t.ownerId === myOwnerId) return true;
        if (t.propertyId && myPropertyIds.has(t.propertyId)) return true;
        if (t.unit && (myUnitIds.has(t.unit) || myUnitNumbers.has(t.unit.toLowerCase().trim()))) return true;
        return false;
      });

      const agreements = (rawState.agreements || []).filter((a) => {
        if (a.ownerId === myOwnerId) return true;
        if (a.propertyId && myPropertyIds.has(a.propertyId)) return true;
        return false;
      });

      const invoices = (rawState.invoices || []).filter((inv) => {
        if (inv.ownerId === myOwnerId) return true;
        if (inv.propertyId && myPropertyIds.has(inv.propertyId)) return true;
        return false;
      });

      const payments = (rawState.payments || []).filter((p) => {
        if (p.ownerId === myOwnerId) return true;
        if (p.propertyId && myPropertyIds.has(p.propertyId)) return true;
        if (p.unit && (myUnitIds.has(p.unit) || myUnitNumbers.has(p.unit.toLowerCase().trim()))) return true;
        return false;
      });

      const tickets = (rawState.tickets || []).filter((t) => {
        if (t.ownerId === myOwnerId) return true;
        if (t.propertyId && myPropertyIds.has(t.propertyId)) return true;
        return false;
      });

      const moveOuts = (rawState.moveOuts || []).filter((m) => {
        if (m.ownerId === myOwnerId) return true;
        if (m.propertyId && myPropertyIds.has(m.propertyId)) return true;
        return false;
      });

      const disputes = (rawState.disputes || []).filter((d) => {
        if (d.ownerId === myOwnerId) return true;
        if (d.propertyId && myPropertyIds.has(d.propertyId)) return true;
        return false;
      });

      const staff = (rawState.staff || []).filter((s) => s.ownerId === myOwnerId);
      const staffIds = new Set(staff.map((s) => s.id));

      const propertyManagers = (rawState.propertyManagers || []).filter((pm) => pm.ownerId === myOwnerId);

      const managerPayouts = (rawState.managerPayouts || []).filter((mp) => mp.ownerId === myOwnerId);

      const staffSchedules = (rawState.staffSchedules || []).filter(
        (sc) => sc.ownerId === myOwnerId || staffIds.has(sc.staffId)
      );

      const tenancyRequests = (rawState.tenancyRequests || []).filter((tr) => {
        if (tr.ownerId === myOwnerId) return true;
        if (tr.propertyId && myPropertyIds.has(tr.propertyId)) return true;
        return false;
      });

      const renewals = (rawState.renewals || []).filter((r) => {
        if (r.ownerId === myOwnerId) return true;
        if (r.propertyId && myPropertyIds.has(r.propertyId)) return true;
        return false;
      });

      const cashClaims = (rawState.cashClaims || []).filter((c) => c.ownerId === myOwnerId);

      const announcements = (rawState.announcements || []).filter(
        (a) => a.ownerId === myOwnerId || a.authorId === myOwnerId
      );

      const notifications = (rawState.notifications || []).filter((n) => {
        if (n.recipientId && n.recipientId === myOwnerId) return true;
        if (n.userId && n.userId === myOwnerId) return true;
        if (n.ownerId && n.ownerId === myOwnerId) return true;
        return false;
      });

      const platformSupport = (rawState.platformSupport || []).filter(
        (ps) => ps.userId === myOwnerId || ps.ownerId === myOwnerId
      );

      const reviews = (rawState.reviews || []).filter(
        (rv) => rv.ownerId === myOwnerId || (Boolean(rv.propertyId) && myPropertyIds.has(rv.propertyId))
      );

      const platformInvoices = (rawState.platformInvoices || []).filter((pi) => pi.ownerId === myOwnerId);

      const communicationLogs = (rawState.communicationLogs || []).filter(
        (cl) => cl.senderId === myOwnerId || cl.recipientId === myOwnerId
      );

      const ownerUsers = (rawState.users || []).filter(
        (u) => u.id === myOwnerId || u.ownerId === myOwnerId
      );

      return {
        ...rawState,
        properties,
        units,
        tenants,
        agreements,
        invoices,
        payments,
        tickets,
        moveOuts,
        disputes,
        staff,
        propertyManagers,
        managerPayouts,
        staffSchedules,
        tenancyRequests,
        renewals,
        cashClaims,
        announcements,
        notifications,
        platformSupport,
        reviews,
        platformInvoices,
        communicationLogs,
        users: ownerUsers,
      };
    }

    // ─── 2. TENANT ROLE ISOLATION ─────────────────────────────────────────
    if (currentRole === 'tenant') {
      const myTenantUserId = currentUserId;

      const tenants = (rawState.tenants || []).filter((t) => {
        if (t.id === myTenantUserId) return true;
        if (currentUserEmail && t.email?.toLowerCase().trim() === currentUserEmail) return true;
        if (currentUserName && t.name?.toLowerCase().trim() === currentUserName) return true;
        return false;
      });
      const myTenantIds = new Set(tenants.map((t) => t.id));
      myTenantIds.add(myTenantUserId);

      const agreements = (rawState.agreements || []).filter((a) => {
        if (myTenantIds.has(a.tenantId)) return true;
        if (currentUserEmail && a.tenantEmail?.toLowerCase().trim() === currentUserEmail) return true;
        if (currentUserName && a.tenant?.toLowerCase().trim() === currentUserName) return true;
        return false;
      });

      const tenantPropertyIds = new Set<string>();
      const tenantPropertyUnitKeys = new Set<string>(); // `${propertyId}:${unitString.toLowerCase()}`
      const tenantDirectUnitIds = new Set<string>();

      agreements.forEach((a) => {
        if (a.propertyId) {
          tenantPropertyIds.add(a.propertyId);
          if (a.unit) tenantPropertyUnitKeys.add(`${a.propertyId}:${a.unit.toLowerCase().trim()}`);
          if (a.unitId) {
            tenantDirectUnitIds.add(a.unitId);
            tenantPropertyUnitKeys.add(`${a.propertyId}:${a.unitId.toLowerCase().trim()}`);
          }
        }
      });

      tenants.forEach((t) => {
        if (t.propertyId) {
          tenantPropertyIds.add(t.propertyId);
          if (t.unit && t.unit !== 'Unassigned' && t.unit !== 'Pending') {
            tenantPropertyUnitKeys.add(`${t.propertyId}:${t.unit.toLowerCase().trim()}`);
          }
          (t.unitsRented || []).forEach((u) => {
            if (u) tenantPropertyUnitKeys.add(`${t.propertyId}:${u.toLowerCase().trim()}`);
          });
        }
      });

      const units = (rawState.units || []).filter((u) => {
        if (u.currentTenantId === myTenantUserId) return true;
        if (tenantDirectUnitIds.has(u.id)) return true;
        if (agreements.some((a) => (a.unitId === u.id || a.unit === u.unitNumber) && a.propertyId === u.propertyId)) return true;
        if (currentUserEmail && u.tenant?.toLowerCase().trim() === currentUserEmail && (!u.propertyId || tenantPropertyIds.has(u.propertyId))) return true;
        if (u.propertyId && (tenantPropertyUnitKeys.has(`${u.propertyId}:${u.id.toLowerCase().trim()}`) || (u.unitNumber && tenantPropertyUnitKeys.has(`${u.propertyId}:${u.unitNumber.toLowerCase().trim()}`)))) return true;
        return false;
      });
      units.forEach((u) => {
        if (u.propertyId) tenantPropertyIds.add(u.propertyId);
      });

      const properties = (rawState.properties || []).filter((p) => tenantPropertyIds.has(p.id));

      const invoices = (rawState.invoices || []).filter((inv) => {
        if (inv.tenantId && myTenantIds.has(inv.tenantId)) return true;
        if (inv.leaseAgreementId && agreements.some((a) => a.id === inv.leaseAgreementId)) return true;
        if (inv.agreementId && agreements.some((a) => a.id === inv.agreementId)) return true;
        if (currentUserEmail && inv.tenantEmail?.toLowerCase().trim() === currentUserEmail && (!inv.propertyId || tenantPropertyIds.has(inv.propertyId))) return true;
        if (inv.unitId && tenantDirectUnitIds.has(inv.unitId)) return true;
        if (inv.unit && inv.propertyId && tenantPropertyUnitKeys.has(`${inv.propertyId}:${inv.unit.toLowerCase().trim()}`)) return true;
        return false;
      });

      const payments = (rawState.payments || []).filter((p) => {
        if (p.tenantId && myTenantIds.has(p.tenantId)) return true;
        if (p.invoiceId && invoices.some((i) => i.id === p.invoiceId)) return true;
        if (p.agreementId && agreements.some((a) => a.id === p.agreementId)) return true;
        if (currentUserEmail && ((p as any).tenantEmail?.toLowerCase().trim() === currentUserEmail || p.tenant?.toLowerCase().trim() === currentUserEmail) && (!p.propertyId || tenantPropertyIds.has(p.propertyId))) return true;
        if (p.unitId && tenantDirectUnitIds.has(p.unitId)) return true;
        if (p.unit && p.propertyId && tenantPropertyUnitKeys.has(`${p.propertyId}:${p.unit.toLowerCase().trim()}`)) return true;
        return false;
      });

      const tickets = (rawState.tickets || []).filter((t) => {
        if (t.tenantId && myTenantIds.has(t.tenantId)) return true;
        if (currentUserEmail && (t.tenantEmail?.toLowerCase().trim() === currentUserEmail || t.tenant?.toLowerCase().trim() === currentUserEmail) && (!t.propertyId || tenantPropertyIds.has(t.propertyId))) return true;
        if (t.unitId && tenantDirectUnitIds.has(t.unitId)) return true;
        if (t.unit && t.propertyId && tenantPropertyUnitKeys.has(`${t.propertyId}:${t.unit.toLowerCase().trim()}`)) return true;
        return false;
      });

      const moveOuts = (rawState.moveOuts || []).filter((m) => {
        if (m.tenantId && myTenantIds.has(m.tenantId)) return true;
        if (m.agreementId && agreements.some((a) => a.id === m.agreementId)) return true;
        if (currentUserEmail && (m.tenantEmail?.toLowerCase().trim() === currentUserEmail || m.tenantName?.toLowerCase().trim() === currentUserEmail) && (!m.propertyId || tenantPropertyIds.has(m.propertyId))) return true;
        if (m.unitId && tenantDirectUnitIds.has(m.unitId)) return true;
        if (m.unit && m.propertyId && tenantPropertyUnitKeys.has(`${m.propertyId}:${m.unit.toLowerCase().trim()}`)) return true;
        return false;
      });

      const disputes = (rawState.disputes || []).filter((d) => {
        if (d.tenantId && myTenantIds.has(d.tenantId)) return true;
        if (d.raisedById === myTenantUserId || (d as any).raisedBy === myTenantUserId || (d as any).userId === myTenantUserId) return true;
        return false;
      });

      const cashClaims = (rawState.cashClaims || []).filter((c) => {
        if (c.tenantId && myTenantIds.has(c.tenantId)) return true;
        if (c.claimedBy === myTenantUserId) return true;
        return false;
      });

      const tenancyRequests = (rawState.tenancyRequests || []).filter((tr) => {
        if (tr.tenantId && myTenantIds.has(tr.tenantId)) return true;
        if (currentUserEmail && tr.tenantEmail?.toLowerCase().trim() === currentUserEmail) return true;
        return false;
      });

      const tenantUnitIdentifiers = new Set<string>();
      units.forEach((u) => {
        if (u.id) tenantUnitIdentifiers.add(u.id.toLowerCase().trim());
        if (u.unitNumber) tenantUnitIdentifiers.add(u.unitNumber.toLowerCase().trim());
      });
      agreements.forEach((a) => {
        if (a.unit) tenantUnitIdentifiers.add(a.unit.toLowerCase().trim());
        if (a.unitId) tenantUnitIdentifiers.add(a.unitId.toLowerCase().trim());
      });

      const renewals = (rawState.renewals || []).filter((r) => {
        if (r.tenantId && myTenantIds.has(r.tenantId)) return true;
        if (r.unit && tenantUnitIdentifiers.has(r.unit.toLowerCase().trim())) return true;
        return false;
      });

      const announcements = (rawState.announcements || []).filter((a) => {
        const matchesRole = !a.targetRoles || a.targetRoles.includes('tenant');
        const matchesProp = !a.propertyId || tenantPropertyIds.has(a.propertyId);
        return a.status === 'published' && matchesRole && matchesProp;
      });

      const notifications = (rawState.notifications || []).filter((n) => {
        if (n.recipientId && n.recipientId === myTenantUserId) return true;
        if (n.userId && n.userId === myTenantUserId) return true;
        return false;
      });

      const reviews = (rawState.reviews || []).filter((rv) => {
        if (rv.tenantId && myTenantIds.has(rv.tenantId)) return true;
        if (rv.propertyId && tenantPropertyIds.has(rv.propertyId)) return true;
        return false;
      });

      return {
        ...rawState,
        properties,
        units,
        tenants,
        agreements,
        invoices,
        payments,
        tickets,
        moveOuts,
        disputes,
        staff: [],
        propertyManagers: [],
        managerPayouts: [],
        staffSchedules: [],
        tenancyRequests,
        renewals,
        cashClaims,
        announcements,
        notifications,
        platformSupport: (rawState.platformSupport || []).filter((ps) => ps.userId === myTenantUserId),
        reviews,
        communicationLogs: (rawState.communicationLogs || []).filter((cl) => cl.recipientId === myTenantUserId),
      };
    }

    // ─── 3. MANAGER ROLE ISOLATION ────────────────────────────────────────
    if (currentRole === 'manager') {
      const managerOwnerId = user.ownerId || '';
      const properties = (rawState.properties || []).filter((p) => {
        if (managerOwnerId && p.ownerId !== managerOwnerId) return false;
        if (p.assignedManagerId && p.assignedManagerId === currentUserId) return true;
        if (p.ownerId === managerOwnerId) return true;
        return false;
      });
      const myPropertyIds = new Set(properties.map((p) => p.id));

      const units = (rawState.units || []).filter((u) => u.propertyId && myPropertyIds.has(u.propertyId));
      const tenants = (rawState.tenants || []).filter((t) => t.propertyId && myPropertyIds.has(t.propertyId));
      const agreements = (rawState.agreements || []).filter((a) => a.propertyId && myPropertyIds.has(a.propertyId));
      const invoices = (rawState.invoices || []).filter((inv) => inv.propertyId && myPropertyIds.has(inv.propertyId));
      const payments = (rawState.payments || []).filter((p) => p.propertyId && myPropertyIds.has(p.propertyId));
      const tickets = (rawState.tickets || []).filter((t) => t.propertyId && myPropertyIds.has(t.propertyId));
      const moveOuts = (rawState.moveOuts || []).filter((m) => m.propertyId && myPropertyIds.has(m.propertyId));
      const disputes = (rawState.disputes || []).filter((d) => d.propertyId && myPropertyIds.has(d.propertyId));
      const staff = (rawState.staff || []).filter((s) => managerOwnerId && s.ownerId === managerOwnerId);
      const managerPayouts = (rawState.managerPayouts || []).filter(
        (mp) => mp.managerId === currentUserId || (managerOwnerId && mp.ownerId === managerOwnerId)
      );
      const staffSchedules = (rawState.staffSchedules || []).filter((sc) => managerOwnerId && sc.ownerId === managerOwnerId);
      const tenancyRequests = (rawState.tenancyRequests || []).filter((tr) => tr.propertyId && myPropertyIds.has(tr.propertyId));
      const renewals = (rawState.renewals || []).filter((r) => r.propertyId && myPropertyIds.has(r.propertyId));
      const cashClaims = (rawState.cashClaims || []).filter((c) => managerOwnerId && c.ownerId === managerOwnerId);
      const announcements = (rawState.announcements || []).filter((a) => managerOwnerId && a.ownerId === managerOwnerId);
      const notifications = (rawState.notifications || []).filter(
        (n) => n.recipientId === currentUserId || n.userId === currentUserId || (managerOwnerId && n.ownerId === managerOwnerId && (!n.recipientId || n.recipientRole === 'manager'))
      );

      return {
        ...rawState,
        properties,
        units,
        tenants,
        agreements,
        invoices,
        payments,
        tickets,
        moveOuts,
        disputes,
        staff,
        propertyManagers: (rawState.propertyManagers || []).filter(
          (pm) => pm.id === currentUserId || (managerOwnerId && pm.ownerId === managerOwnerId)
        ),
        managerPayouts,
        staffSchedules,
        tenancyRequests,
        renewals,
        cashClaims,
        announcements,
        notifications,
        platformSupport: (rawState.platformSupport || []).filter((ps) => ps.userId === currentUserId),
        reviews: (rawState.reviews || []).filter((rv) => rv.propertyId && myPropertyIds.has(rv.propertyId)),
        communicationLogs: (rawState.communicationLogs || []).filter(
          (cl) => cl.senderId === currentUserId || cl.recipientId === currentUserId
        ),
      };
    }

    // ─── 4. STAFF ROLE ISOLATION ──────────────────────────────────────────
    if (currentRole === 'staff') {
      const staffOwnerId = user.ownerId || '';
      const tickets = (rawState.tickets || []).filter((t) => {
        if (t.assignedStaffId === currentUserId) return true;
        if (currentUserName && t.assignedStaffName?.toLowerCase().includes(currentUserName)) return true;
        if (staffOwnerId && t.ownerId === staffOwnerId && (t.status === 'open' || t.status === 'assigned' || t.status === 'in_progress')) return true;
        return false;
      });

      const staffTicketPropIds = new Set(tickets.map((t) => t.propertyId).filter(Boolean));
      const properties = (rawState.properties || []).filter((p) => {
        if (staffOwnerId && p.ownerId === staffOwnerId) return true;
        if (staffTicketPropIds.has(p.id)) return true;
        return false;
      });
      const myPropertyIds = new Set(properties.map((p) => p.id));

      const units = (rawState.units || []).filter((u) => u.propertyId && myPropertyIds.has(u.propertyId));
      const staffMember = (rawState.staff || []).filter(
        (s) => s.id === currentUserId || (currentUserEmail && s.email?.toLowerCase().trim() === currentUserEmail)
      );
      const staffSchedules = (rawState.staffSchedules || []).filter((sc) => sc.staffId === currentUserId);
      const announcements = (rawState.announcements || []).filter((a) => {
        if (staffOwnerId && a.ownerId !== staffOwnerId) return false;
        return a.status === 'published' && (!a.targetRoles || a.targetRoles.includes('staff'));
      });
      const notifications = (rawState.notifications || []).filter(
        (n) => n.recipientId === currentUserId || n.userId === currentUserId
      );

      return {
        ...rawState,
        properties,
        units,
        tenants: [],
        agreements: [],
        invoices: [],
        payments: [],
        tickets,
        moveOuts: [],
        disputes: [],
        staff: staffMember,
        propertyManagers: [],
        managerPayouts: [],
        staffSchedules,
        tenancyRequests: [],
        renewals: [],
        cashClaims: [],
        announcements,
        notifications,
        platformSupport: (rawState.platformSupport || []).filter((ps) => ps.userId === currentUserId),
        reviews: [],
        communicationLogs: [],
      };
    }

    return rawState;
  }, [rawState, user, role, isAuthenticated]);

  // Dynamic Plan limits (Growth Tier default: Max 10 properties, Max 25 units)
  const [planConfig, setPlanConfig] = useState<Partial<MobilePlanUsage>>({
    tier: 'growth',
    maxProperties: 10,
    maxUnits: 25,
    planName: 'Growth Plan',
  });

  const maxProperties = planConfig.maxProperties || planConfig.propertiesMax || 10;
  const maxUnits = planConfig.maxUnits || planConfig.unitsMax || 25;
  const planUsage: MobilePlanUsage = {
    planName: planConfig.planName || 'Growth Plan',
    tier: planConfig.tier || 'growth',
    propertiesUsed: state.properties.length,
    propertiesMax: maxProperties,
    maxProperties,
    unitsUsed: state.units.length,
    unitsMax: maxUnits,
    maxUnits,
    isPropertyLimitReached: state.properties.length >= maxProperties,
    isUnitLimitReached: state.units.length >= maxUnits,
  };

  const saveProperty = (prop: MobileProperty, newUnits?: MobileUnit[]) => {
    const ownerIdToSet = prop.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const propToSave: MobileProperty = { ...prop, ownerId: ownerIdToSet };
    const unitsToSave = newUnits?.map((u) => ({
      ...u,
      ownerId: u.ownerId || ownerIdToSet,
      propertyId: u.propertyId || prop.id,
    }));

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'properties', propToSave.id), propToSave, { merge: true }).catch(console.warn);
      if (unitsToSave && unitsToSave.length > 0) {
        unitsToSave.forEach((u) => setDoc(doc(db, 'units', u.id), u, { merge: true }).catch(console.warn));
      }
    }
    setState((prev) => {
      const exists = prev.properties.some((p) => p.id === propToSave.id);
      const updatedProps = exists
        ? prev.properties.map((p) => (p.id === propToSave.id ? propToSave : p))
        : [propToSave, ...prev.properties];

      let updatedUnits = [...prev.units];
      if (unitsToSave && unitsToSave.length > 0) {
        const filtered = prev.units.filter((u) => u.propertyId !== propToSave.id);
        updatedUnits = [...filtered, ...unitsToSave];
      }

      const newNotif: MobileInAppNotification = {
        id: `notif-${Date.now()}`,
        title: `Property Published: ${propToSave.name}`,
        body: `Successfully configured with ${unitsToSave ? unitsToSave.length : propToSave.unitCount} units in your portfolio.`,
        category: 'system',
        isRead: false,
        createdAt: new Date().toISOString(),
        relatedEntityId: propToSave.id,
        recipientId: user?.id,
        ownerId: ownerIdToSet,
      };

      return {
        ...prev,
        properties: updatedProps,
        units: updatedUnits,
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const saveUnit = (unit: MobileUnit) => {
    const ownerIdToSet = unit.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const unitToSave: MobileUnit = { ...unit, ownerId: ownerIdToSet };

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'units', unitToSave.id), unitToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.units.some((u) => u.id === unitToSave.id);
      const updatedUnits = exists
        ? prev.units.map((u) => (u.id === unitToSave.id ? unitToSave : u))
        : [unitToSave, ...prev.units];

      const updatedProps = prev.properties.map((p) => {
        if (p.id === unitToSave.propertyId) {
          const propUnits = updatedUnits.filter((u) => u.propertyId === p.id);
          const occupied = propUnits.filter((u) => u.status === 'occupied').length;
          return { ...p, unitCount: propUnits.length, occupied };
        }
        return p;
      });

      return {
        ...prev,
        properties: updatedProps,
        units: updatedUnits,
      };
    });
  };

  const deleteUnit = (unitId: string) => {
    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'units', unitId)).catch(console.warn);
    }
    setState((prev) => {
      const target = prev.units.find((u) => u.id === unitId);
      if (!target) return prev;
      const updatedUnits = prev.units.filter((u) => u.id !== unitId);
      const updatedProps = prev.properties.map((p) => {
        if (p.id === target.propertyId) {
          const propUnits = updatedUnits.filter((u) => u.propertyId === p.id);
          const occupied = propUnits.filter((u) => u.status === 'occupied').length;
          return { ...p, unitCount: propUnits.length, occupied };
        }
        return p;
      });
      return { ...prev, properties: updatedProps, units: updatedUnits };
    });
  };

  // Helper to sanitize agreement payload before Firestore setDoc, preventing 1MiB overflow
  const sanitizeAgreementForFirestore = async (
    agr: Partial<MobileAgreement>,
    agId: string
  ): Promise<Partial<MobileAgreement>> => {
    const payload = { ...agr };
    const fieldsToProcess: Array<keyof MobileAgreement> = [
      'signedDocumentUrl',
      'initialAgreementUrl',
      'ownerSignedDocumentUrl',
      'documentUrl',
      'tenantUploadedIdUrl',
    ];

    for (const field of fieldsToProcess) {
      const val = payload[field];
      if (typeof val === 'string' && val.startsWith('data:')) {
        try {
          const cloudUrl = await uploadOrCompressDocument(
            val,
            `agreements/${agId}/${String(field)}_${Date.now()}`
          );
          (payload as any)[field] = cloudUrl;
        } catch (e) {
          console.warn(`Failed to auto-upload ${field}:`, e);
        }
      }
    }

    const totalBytes = getObjectByteSize(payload);
    if (totalBytes > 950000) {
      console.warn(
        `[Firestore Guard] Agreement payload size (${totalBytes} bytes) exceeds safe limit of 950KB for ${agId}. Trimming oversized data URLs.`
      );
      for (const field of fieldsToProcess) {
        const val = payload[field];
        if (typeof val === 'string' && val.startsWith('data:')) {
          (payload as any)[field] = undefined;
        }
      }
    }

    return payload;
  };

  const saveAgreement = (agr: MobileAgreement) => {
    const ownerIdToSet = agr.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const agrToSave: MobileAgreement = { ...agr, ownerId: ownerIdToSet };

    if (isFirebaseConfigured) {
      sanitizeAgreementForFirestore(agrToSave, agrToSave.id)
        .then((sanitized) => {
          setDoc(doc(db, 'agreements', agrToSave.id), sanitized, { merge: true }).catch(console.warn);
        })
        .catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.agreements.some((a) => a.id === agrToSave.id);
      const updatedAgreements = exists
        ? prev.agreements.map((a) => (a.id === agrToSave.id ? agrToSave : a))
        : [agrToSave, ...prev.agreements];

      let updatedUnits = prev.units;
      if (agrToSave.status === 'active' && !agrToSave.isDraft) {
        updatedUnits = prev.units.map((u) => {
          if (u.propertyId === agrToSave.propertyId && u.unitNumber === agrToSave.unit) {
            return {
              ...u,
              status: 'occupied',
              tenant: agrToSave.tenant,
              currentTenantId: agrToSave.tenantId,
              rent: agrToSave.rent,
              deposit: agrToSave.deposit,
            };
          }
          return u;
        });
      }

      return {
        ...prev,
        agreements: updatedAgreements,
        units: updatedUnits,
      };
    });
  };

  const saveAgreementTemplate = async (template: MobileAgreementTemplate) => {
    const ownerIdToSet = template.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const tmplToSave: MobileAgreementTemplate = { ...template, ownerId: ownerIdToSet };

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'agreementTemplates', tmplToSave.id), tmplToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.agreementTemplates.some((t) => t.id === tmplToSave.id);
      return {
        ...prev,
        agreementTemplates: exists
          ? prev.agreementTemplates.map((t) => (t.id === tmplToSave.id ? tmplToSave : t))
          : [tmplToSave, ...prev.agreementTemplates],
      };
    });
  };

  const deleteAgreementTemplate = async (templateId: string) => {
    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'agreementTemplates', templateId)).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      agreementTemplates: prev.agreementTemplates.filter((t) => t.id !== templateId),
    }));
  };

  const deleteAgreement = async (agreementId: string) => {
    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'agreements', agreementId)).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      agreements: prev.agreements.filter((a) => a.id !== agreementId),
    }));
  };

  const saveInvoice = (invoice: MobileInvoice) => {
    const invType = invoice.type || invoice.invoiceType || 'rent';
    const ownerIdToSet = invoice.ownerId || (user?.role === 'owner' ? user.id : '') || '';
    const invoiceToSave: MobileInvoice = {
      ...invoice,
      ownerId: ownerIdToSet,
      type: invType as any,
      invoiceType: invType as any,
    };

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'invoices', invoiceToSave.id), invoiceToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.invoices.some((i) => i.id === invoiceToSave.id);
      const updated = exists
        ? prev.invoices.map((i) => (i.id === invoiceToSave.id ? invoiceToSave : i))
        : [invoiceToSave, ...prev.invoices];

      const newNotif: MobileInAppNotification = {
        id: `notif-inv-${Date.now()}`,
        title: `Invoice Generated: ${invoiceToSave.id}`,
        body: `Total: ${formatCurrencyAmount(invoiceToSave.total, invoiceToSave.currency)} due on ${invoiceToSave.due}`,
        category: 'bills',
        isRead: false,
        createdAt: new Date().toISOString(),
        relatedEntityId: invoiceToSave.id,
        recipientId: invoiceToSave.tenantId || user?.id,
        ownerId: ownerIdToSet,
      };

      return {
        ...prev,
        invoices: updated,
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const markInvoicePaid = (
    invoiceId: string,
    paymentMethod: string,
    receiptNumber?: string,
    additionalMetadata?: {
      lateFeeApplied?: number;
      lateFeeCalculation?: string;
      finalTotal?: number;
    }
  ) => {
    const target = state.invoices.find((i) => i.id === invoiceId);
    const assignedReceipt = receiptNumber || `RCP-${Date.now().toString().slice(-6)}`;
    const isDepositInvoice =
      (target as any)?.type === 'deposit' ||
      target?.invoiceType === 'deposit' ||
      invoiceId.startsWith('INV-DEP');

    const effectiveTotal = additionalMetadata?.finalTotal ?? (target?.total || 0);
    const effectiveLateFee = additionalMetadata?.lateFeeApplied ?? (target?.lateFeeApplied || 0);
    const effectiveLateFeeCalc = additionalMetadata?.lateFeeCalculation ?? target?.lateFeeCalculation;

    setState((prev) => {
      const invTarget = prev.invoices.find((i) => i.id === invoiceId) || target;
      const targetUnitNum = invTarget?.unit || target?.unit || '';
      const targetTenantId = invTarget?.tenantId || target?.tenantId || user?.id || '';
      const targetPropId = invTarget?.propertyId || target?.propertyId || '';

      const existingTxn = prev.payments.find((p) => p.invoiceId === invoiceId || (receiptNumber && p.id === receiptNumber));
      const resolvedTxnId = existingTxn ? existingTxn.id : (receiptNumber?.startsWith('TXN-') ? receiptNumber : `TXN-${Date.now().toString().slice(-6)}`);

      const updatedTxn: MobilePaymentTransaction = {
        ...(existingTxn || {}),
        id: resolvedTxnId,
        invoiceId: target?.id || invoiceId,
        ownerId: target?.ownerId || existingTxn?.ownerId || '',
        tenant: target?.tenant || existingTxn?.tenant || 'Resident',
        tenantId: targetTenantId || existingTxn?.tenantId,
        unit: targetUnitNum || existingTxn?.unit || 'Unit',
        propertyName: invTarget?.propertyName || target?.propertyName || existingTxn?.propertyName,
        amount: effectiveTotal,
        currency: target?.currency || existingTxn?.currency || DEFAULT_CURRENCY_SYMBOL,
        date: new Date().toISOString().split('T')[0],
        dueDate: target?.due || existingTxn?.dueDate || '',
        status: 'paid',
        method: paymentMethod as any,
        type: isDepositInvoice ? 'deposit' : 'rent',
        referenceNo: existingTxn?.referenceNo || `REF/${Date.now().toString().slice(-8)}`,
        notes: isDepositInvoice
          ? `Security deposit paid via ${paymentMethod}`
          : effectiveLateFee > 0
          ? `Paid via ${paymentMethod} (Includes late fee penalty of ${effectiveLateFee})`
          : `Paid via ${paymentMethod}`,
      };

      if (isFirebaseConfigured) {
        setDoc(doc(db, 'invoices', invoiceId), {
          status: 'paid',
          paidAt: new Date().toISOString(),
          paymentMethodUsed: paymentMethod,
          receiptNumber: assignedReceipt,
          total: effectiveTotal,
          amount: invTarget?.amount || effectiveTotal,
          invoiceType: isDepositInvoice ? 'deposit' : 'rent',
          type: isDepositInvoice ? 'deposit' : 'rent',
          unit: targetUnitNum,
          propertyId: targetPropId,
          tenantId: targetTenantId,
          leaseAgreementId: invTarget?.leaseAgreementId || target?.leaseAgreementId,
          lateFeeApplied: effectiveLateFee,
          ...(effectiveLateFeeCalc ? { lateFeeCalculation: effectiveLateFeeCalc } : {}),
        }, { merge: true }).catch(console.warn);
        setDoc(doc(db, 'payments', updatedTxn.id), updatedTxn, { merge: true }).catch(console.warn);
      }

      let updatedInvoices = prev.invoices.map((inv) => {
        if (inv.id === invoiceId) {
          return {
            ...inv,
            status: 'paid' as const,
            paidAt: new Date().toISOString(),
            paymentMethodUsed: paymentMethod,
            receiptNumber: assignedReceipt,
            total: effectiveTotal,
            invoiceType: (isDepositInvoice ? 'deposit' : 'rent') as any,
            type: (isDepositInvoice ? 'deposit' : 'rent') as any,
            lateFeeApplied: effectiveLateFee,
            ...(effectiveLateFeeCalc ? { lateFeeCalculation: effectiveLateFeeCalc } : {}),
          };
        }
        return inv;
      });

      let updatedAgreements = prev.agreements;
      let updatedUnits = prev.units;
      let updatedProperties = prev.properties;
      const newNotifs: MobileInAppNotification[] = [];

      if (isDepositInvoice) {
        let activatedAgId = '';
        updatedAgreements = prev.agreements.map((a) => {
          const aUnit = (a.unit || '').toLowerCase().trim();
          const invTargetUnit = (invTarget?.unit || '').toLowerCase().trim();
          const targetUnitStr = (target?.unit || '').toLowerCase().trim();

          const matchDep =
            a.depositInvoiceId === invoiceId ||
            (invTarget?.leaseAgreementId && a.id === invTarget.leaseAgreementId) ||
            (target?.leaseAgreementId && a.id === target.leaseAgreementId) ||
            (invTarget &&
              aUnit &&
              invTargetUnit &&
              aUnit === invTargetUnit &&
              (!invTarget.propertyId || !a.propertyId || a.propertyId === invTarget.propertyId)) ||
            (target &&
              aUnit &&
              targetUnitStr &&
              aUnit === targetUnitStr &&
              (!target.propertyId || !a.propertyId || a.propertyId === target.propertyId));

          if (matchDep) {
            if (a.status === 'pending_deposit') {
              activatedAgId = a.id;
              return {
                ...a,
                depositStatus: 'paid' as const,
                status: 'active' as const,
              };
            } else {
              return {
                ...a,
                depositStatus: 'paid' as const,
              };
            }
          }
          return a;
        });

        const targetAg = updatedAgreements.find((a) => a.id === activatedAgId);
        const uNum = targetAg?.unit || invTarget?.unit || target?.unit || '';
        const cleanUNum = (uNum || '').toLowerCase().trim();
        const propId = targetAg?.propertyId || invTarget?.propertyId || target?.propertyId || '';

        // Persist activated agreement to Firestore immediately so Web updates instantly
        if (isFirebaseConfigured && targetAg) {
          setDoc(doc(db, 'agreements', targetAg.id), {
            status: 'active',
            depositStatus: 'paid',
          }, { merge: true }).catch(console.warn);
        }

        updatedUnits = prev.units.map((u) => {
          const uNumClean = (u.unitNumber || '').toLowerCase().trim();
          const uIdClean = (u.id || '').toLowerCase().trim();
          const matchUnit =
            cleanUNum &&
            (uNumClean === cleanUNum || uIdClean === cleanUNum) &&
            (!propId || !u.propertyId || u.propertyId === propId);

          if (matchUnit) {
            return {
              ...u,
              status: 'occupied' as const,
              tenant: targetAg?.tenant || invTarget?.tenant || target?.tenant || u.tenant,
              currentTenantId: targetAg?.tenantId || invTarget?.tenantId || target?.tenantId || u.currentTenantId,
            };
          }
          return u;
        });

        const targetUnit = updatedUnits.find((u) => {
          const uNumClean = (u.unitNumber || '').toLowerCase().trim();
          const uIdClean = (u.id || '').toLowerCase().trim();
          return (
            cleanUNum &&
            (uNumClean === cleanUNum || uIdClean === cleanUNum) &&
            (!propId || !u.propertyId || u.propertyId === propId)
          );
        });

        // Persist occupied unit to Firestore immediately
        if (isFirebaseConfigured && targetUnit) {
          setDoc(doc(db, 'units', targetUnit.id), {
            status: 'occupied',
            tenant: targetAg?.tenant || invTarget?.tenant || target?.tenant || targetUnit.tenant,
            currentTenantId: targetAg?.tenantId || invTarget?.tenantId || target?.tenantId || targetUnit.currentTenantId,
          }, { merge: true }).catch(console.warn);
        }

        if (propId) {
          updatedProperties = prev.properties.map((p) => {
            if (p.id === propId) {
              const occCount = updatedUnits.filter((u) => u.propertyId === propId && u.status === 'occupied').length;
              return { ...p, occupied: occCount };
            }
            return p;
          });
        }

        const cleanAgId = (targetAg?.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const canonicalRentId = `INV-RENT-${cleanAgId}-M1`;
        const hasRentInv = updatedInvoices.some((inv) => inv.id === canonicalRentId || (inv.leaseAgreementId === targetAg?.id && inv.type === 'rent'));

        if (!hasRentInv && targetAg && targetAg.rent > 0) {
          const nextMonthDate = new Date();
          nextMonthDate.setDate(1);
          nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
          const rentDueDate = nextMonthDate.toISOString().split('T')[0];

          const m1RentInvoice: MobileInvoice = {
            id: canonicalRentId,
            ownerId: targetAg.ownerId,
            propertyId: targetAg.propertyId,
            tenant: targetAg.tenant,
            tenantId: targetAg.tenantId,
            unit: targetAg.unit,
            propertyName: targetAg.propertyName,
            amount: targetAg.rent,
            tax: 0,
            total: targetAg.rent,
            due: rentDueDate,
            status: 'sent',
            currency: targetAg.currency || DEFAULT_CURRENCY_SYMBOL,
            type: 'rent',
            invoiceType: 'rent',
            leaseAgreementId: targetAg.id,
            items: [{ description: `Monthly Rent - Unit ${targetAg.unit}`, amount: targetAg.rent }],
            createdAt: new Date().toISOString(),
          };
          updatedInvoices = [m1RentInvoice, ...updatedInvoices];

          if (isFirebaseConfigured) {
            setDoc(doc(db, 'invoices', m1RentInvoice.id), m1RentInvoice, { merge: true }).catch(console.warn);
          }
        }

        newNotifs.push({
          id: `notif-dep-act-${Date.now()}`,
          title: 'Deposit Paid — Lease Active! 🏡',
          body: `Security deposit of ${formatCurrencyAmount(target?.total || 0, target?.currency)} settled for Unit ${uNum}. Lease is now fully active!`,
          category: 'leases',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      return {
        ...prev,
        invoices: updatedInvoices,
        agreements: updatedAgreements,
        units: updatedUnits,
        properties: updatedProperties,
        payments: [updatedTxn, ...prev.payments.filter((p) => p.id !== updatedTxn.id)],
        notifications: [...newNotifs, ...prev.notifications],
      };
    });
  };

  const waiveInvoiceLateFee = async (invoiceId: string, reason = 'Waived by Property Landlord') => {
    const inv = state.invoices.find((i) => i.id === invoiceId);
    if (!inv) return;

    const baseAmount = inv.amount || 0;
    const tax = inv.tax || 0;
    const restoredTotal = baseAmount + tax;

    const updatedInvoice: MobileInvoice = {
      ...inv,
      lateFeeWaived: true,
      lateFeeWaivedReason: reason,
      lateFeeApplied: 0,
      lateFeeCalculation: 'Late fee waived by landlord',
      total: restoredTotal,
    };

    saveInvoice(updatedInvoice);

    if (inv.tenantId) {
      const notif: MobileInAppNotification = {
        id: `notif-wf-${Date.now()}`,
        userId: inv.tenantId,
        title: 'Late Fee Penalty Waived',
        body: `Your landlord has waived the late fee penalty for invoice #${inv.id}. Adjusted balance: ${formatCurrencyAmount(restoredTotal, inv.currency)}.`,
        category: 'bills',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        notifications: [notif, ...(prev.notifications || [])],
      }));
    }
  };

  const updateLateFeeSettings = async (settings: Partial<MobileLateFeeSettings>, ownerId?: string) => {
    if (ownerId) {
      const currentOwnerSettings: MobileOwnerSettings = state.ownerSettings[ownerId] || {
        ownerId,
        planId: 'growth',
        planName: 'Growth',
        planStatus: 'active',
        trialEndsAt: null,
        subscriptionEndsAt: null,
      };
      const updatedOwnerSettings: MobileOwnerSettings = {
        ...currentOwnerSettings,
        lateFeeConfig: {
          ...(currentOwnerSettings.lateFeeConfig || state.lateFeeSettings),
          ...settings,
        },
      };
      setState((prev) => ({
        ...prev,
        ownerSettings: {
          ...prev.ownerSettings,
          [ownerId]: updatedOwnerSettings,
        },
      }));
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'owners', ownerId), updatedOwnerSettings, { merge: true }).catch(console.warn);
      }
    } else {
      setState((prev) => ({
        ...prev,
        lateFeeSettings: {
          ...prev.lateFeeSettings,
          ...settings,
        },
      }));
    }
  };

  const savePayment = (payment: MobilePaymentTransaction) => {
    const ownerIdToSet = payment.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const paymentToSave: MobilePaymentTransaction = { ...payment, ownerId: ownerIdToSet };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'payments', paymentToSave.id), paymentToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      payments: [paymentToSave, ...prev.payments],
    }));
  };

  const saveTicket = (ticket: MobileTicket) => {
    const ownerIdToSet = ticket.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const ticketToSave: MobileTicket = { ...ticket, ownerId: ownerIdToSet };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'tickets', ticketToSave.id), ticketToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.tickets.some((t) => t.id === ticketToSave.id);
      const updated = exists
        ? prev.tickets.map((t) => (t.id === ticketToSave.id ? ticketToSave : t))
        : [ticketToSave, ...prev.tickets];

      const notif: MobileInAppNotification = {
        id: `notif-tck-${Date.now()}`,
        title: `Repair Request: ${ticketToSave.category}`,
        body: `${ticketToSave.unit} reported: ${ticketToSave.issue}`,
        category: 'repairs',
        isRead: false,
        createdAt: new Date().toISOString(),
        relatedEntityId: ticketToSave.id,
        recipientId: ownerIdToSet,
        ownerId: ownerIdToSet,
      };

      return {
        ...prev,
        tickets: updated,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const updateTicket = (ticketId: string, updates: Partial<MobileTicket>) => {
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'tickets', ticketId), updates, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      tickets: prev.tickets.map((t) => (t.id === ticketId ? { ...t, ...updates } : t)),
    }));
  };

  const sendStaffPaymentReminder = (ticketId: string) => {
    const target = state.tickets.find((t) => t.id === ticketId);
    if (!target) return;
    const notif: MobileInAppNotification = {
      id: `notif-rem-${Date.now()}`,
      title: 'Payment Reminder Sent',
      body: `Payment reminder for Ticket #${target.id} sent to ${target.payment?.payer || 'payer'}.`,
      category: 'repairs',
      isRead: false,
      createdAt: new Date().toISOString(),
      relatedEntityId: ticketId,
      recipientId: target.assignedStaffId || user?.id,
      ownerId: target.ownerId,
    };
    setState((prev) => ({
      ...prev,
      notifications: [notif, ...prev.notifications],
    }));
  };

  const saveMoveOut = (moveout: MobileMoveOut) => {
    const ownerIdToSet = moveout.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const moveoutToSave: MobileMoveOut = { ...moveout, ownerId: ownerIdToSet };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'moveouts', moveoutToSave.id), moveoutToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.moveOuts.some((m) => m.id === moveoutToSave.id);
      return {
        ...prev,
        moveOuts: exists
          ? prev.moveOuts.map((m) => (m.id === moveoutToSave.id ? moveoutToSave : m))
          : [moveoutToSave, ...prev.moveOuts],
      };
    });
  };

  const applyMoveOutSettlementState = (
    prev: MobileAppState,
    targetMoveOut: MobileMoveOut | undefined,
    settlementData?: Partial<MobileMoveOut>
  ) => {
    if (!targetMoveOut && !settlementData) {
      return {
        units: prev.units,
        agreements: prev.agreements,
        tenants: prev.tenants,
        properties: prev.properties,
      };
    }
    const unitNum = settlementData?.unit || targetMoveOut?.unit;
    const propId = settlementData?.propertyId || targetMoveOut?.propertyId;
    const tenantId = settlementData?.tenantId || targetMoveOut?.tenantId;
    const tenantName = settlementData?.tenantName || targetMoveOut?.tenantName;

    const cleanUnitStr = (s?: string) => (s || '').toLowerCase().replace(/unit\s*|-/g, '').trim();

    // Check if the unit is currently re-rented to another tenant
    const hasOtherActiveTenancy = prev.agreements.some((a) => {
      const isTargetUnit = cleanUnitStr(a.unit) === cleanUnitStr(unitNum) || a.unit === unitNum;
      const isNonTerminated = a.status === 'active';
      const isDifferentTenant = tenantId ? a.tenantId !== tenantId : a.id !== targetMoveOut?.agreementId;
      return isTargetUnit && isNonTerminated && isDifferentTenant;
    });

    const hasNewPendingRequest = (prev.tenancyRequests || []).some((r) => {
      const isTargetUnit = cleanUnitStr(r.unitNumber) === cleanUnitStr(unitNum) || r.unitNumber === unitNum || r.unitId === unitNum;
      const isDifferentTenant = tenantId ? r.tenantId !== tenantId : true;
      return isTargetUnit && (r.status === 'pending' || r.status === 'accepted') && isDifferentTenant;
    });

    const shouldFreeUnit = !hasOtherActiveTenancy && !hasNewPendingRequest;

    // 1. Free unit back to vacant ONLY IF no other active tenancy exists for this unit
    const updatedUnits = prev.units.map((u) => {
      if (shouldFreeUnit && (cleanUnitStr(u.unitNumber) === cleanUnitStr(unitNum) || u.unitNumber === unitNum || u.id === unitNum) && (!propId || u.propertyId === propId)) {
        const vacatedUnit: MobileUnit = {
          ...u,
          status: 'vacant' as const,
          tenant: null,
          currentTenantId: null,
        };
        if (isFirebaseConfigured) {
          setDoc(doc(db, 'units', u.id), vacatedUnit, { merge: true }).catch(console.warn);
        }
        return vacatedUnit;
      }
      return u;
    });

    // 2. Terminate all agreements for this specific vacated unit
    const updatedAgreements = prev.agreements.map((a) => {
      const isExplicitTarget = Boolean(targetMoveOut?.agreementId && (a.id === targetMoveOut.agreementId || (a as any).leaseAgreementId === targetMoveOut.agreementId));
      const cleanAgUnit = cleanUnitStr(a.unit);
      const cleanTargetUnit = cleanUnitStr(unitNum);
      const isUnitMatch = (cleanAgUnit && cleanTargetUnit && cleanAgUnit === cleanTargetUnit) || a.unit === unitNum;
      const isPropMatch = !propId || !a.propertyId || a.propertyId === propId;
      const isTenantMatch = !tenantId || a.tenantId === tenantId || (tenantName && a.tenant?.toLowerCase() === tenantName.toLowerCase()) || !a.tenantId;

      if (isExplicitTarget || (isUnitMatch && isPropMatch && isTenantMatch)) {
        const termAg: MobileAgreement = { ...a, status: 'terminated' as const };
        if (isFirebaseConfigured) {
          setDoc(doc(db, 'agreements', a.id), termAg, { merge: true }).catch(console.warn);
        }
        return termAg;
      }
      return a;
    });

    // 3. Update tenant's unitsRented, unit, rent, deposit
    const updatedTenants = prev.tenants.map((t) => {
      if (t.id === tenantId || (tenantName && t.name?.toLowerCase() === tenantName.toLowerCase())) {
        const nextUnits = (t.unitsRented || []).filter((u) => cleanUnitStr(u) !== cleanUnitStr(unitNum) && u !== unitNum);

        // Find remaining active agreement for this tenant
        const remainingAg = updatedAgreements.find(
          (a) =>
            a.status === 'active' &&
            (a.tenantId === t.id || (t.email && a.tenantEmail?.toLowerCase() === t.email.toLowerCase()))
        );

        const nextUnit = remainingAg?.unit || nextUnits[0] || 'Unassigned';
        const remainingProp = remainingAg ? prev.properties.find((p) => p.id === remainingAg.propertyId) : null;

        const upTenant: MobileTenantRecord = {
          ...t,
          unit: nextUnit,
          unitsRented: remainingAg ? (nextUnits.length > 0 ? nextUnits : [remainingAg.unit]) : nextUnits,
          propertyName: remainingAg ? (remainingAg.propertyName || remainingProp?.name || t.propertyName) : (nextUnit === 'Unassigned' ? 'Unassigned' : t.propertyName),
          propertyId: remainingAg ? remainingAg.propertyId : (nextUnit === 'Unassigned' ? '' : t.propertyId),
          ownerId: remainingAg ? remainingAg.ownerId : (nextUnit === 'Unassigned' ? '' : t.ownerId),
          rent: remainingAg ? remainingAg.rent : (nextUnit === 'Unassigned' ? 0 : t.rent),
          deposit: remainingAg ? remainingAg.deposit : (nextUnit === 'Unassigned' ? 0 : t.deposit),
          leaseStart: remainingAg ? remainingAg.start : (nextUnit === 'Unassigned' ? '' : t.leaseStart),
          leaseEnd: remainingAg ? remainingAg.end : (nextUnit === 'Unassigned' ? '' : t.leaseEnd),
          currency: remainingAg ? remainingAg.currency : t.currency,
        };
        if (isFirebaseConfigured) {
          setDoc(doc(db, 'tenants', t.id), upTenant, { merge: true }).catch(console.warn);
        }
        return upTenant;
      }
      return t;
    });

    // 4. Update property occupancy counts
    const updatedProperties = prev.properties.map((p) => {
      if (!propId || p.id === propId) {
        const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
        const upProp: MobileProperty = { ...p, occupied: occ };
        if (isFirebaseConfigured) {
          setDoc(doc(db, 'properties', p.id), upProp, { merge: true }).catch(console.warn);
        }
        return upProp;
      }
      return p;
    });

    // 5. Void any pending/overdue rent/deposit invoices for this vacated tenancy
    // BUT DO NOT void invoices belonging to a new active agreement or created after move-out!
    const updatedInvoices = prev.invoices.map((inv) => {
      if (inv.status === 'paid' || inv.status === 'cancelled' || (inv as any).status === 'void' || (inv as any).status === 'refunded') return inv;
      const isForThisUnit =
        (cleanUnitStr(inv.unit) === cleanUnitStr(unitNum) || inv.unit === unitNum || (inv as any).unitId === unitNum) &&
        (!propId || !inv.propertyId || inv.propertyId === propId);
      const isForThisTenant =
        (!tenantId || inv.tenantId === tenantId) ||
        (tenantName && inv.tenant?.toLowerCase() === tenantName.toLowerCase());

      if (!isForThisUnit || !isForThisTenant) return inv;

      // If invoice belongs to a different (newer) agreement, do not void
      if (targetMoveOut?.agreementId && inv.leaseAgreementId && inv.leaseAgreementId !== targetMoveOut.agreementId) {
        return inv;
      }
      const moTime = new Date((targetMoveOut as any)?.createdAt || targetMoveOut?.moveOutDate || 0).getTime();
      const invTime = new Date(inv.createdAt || inv.due || 0).getTime();
      if (moTime > 0 && invTime > moTime && !inv.leaseAgreementId) {
        return inv;
      }

      const voidedInv = {
        ...inv,
        status: 'void' as any,
        notes: 'Voided automatically upon move-out conclusion and settlement.',
      };
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'invoices', inv.id), voidedInv, { merge: true }).catch(console.warn);
      }
      return voidedInv;
    });

    return {
      units: updatedUnits,
      agreements: updatedAgreements,
      tenants: updatedTenants,
      properties: updatedProperties,
      invoices: updatedInvoices,
    };
  };

  const cleanFirestoreObject = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanFirestoreObject);
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreObject(value);
      }
    }
    return cleaned;
  };

  const createDepositSettlement = (settlement: Partial<MobileMoveOut>) => {
    const isSettled = settlement.status === 'settled' || settlement.status === 'refund_completed';
    const moveOutStatus = isSettled ? 'refund_completed' : 'refund_scheduled';
    const settlementStatus = isSettled ? 'refunded' : 'awaiting_tenant_approval';
    if (isFirebaseConfigured && settlement.id) {
      setDoc(doc(db, 'moveouts', settlement.id), cleanFirestoreObject({ ...settlement, status: moveOutStatus }), { merge: true }).catch(console.warn);
      const settleDocId = settlement.id.startsWith('DEP-SETTLE-') ? settlement.id : `DEP-SETTLE-${settlement.id}`;
      const settlePayload = {
        id: settleDocId,
        moveOutId: settlement.id,
        unit: settlement.unit,
        propertyId: settlement.propertyId,
        tenantId: settlement.tenantId,
        tenantName: settlement.tenantName,
        totalDeductions: settlement.totalDeductions || 0,
        netRefundableAmount: settlement.netRefundAmount,
        status: settlementStatus,
        deductions: (settlement.inspectionChecklist || [])
          .filter((c) => c.deduction > 0)
          .map((c, i) => ({
            id: `ded-${i}`,
            title: `${c.room} - ${c.item}`,
            amount: c.deduction,
            category: 'repair_damage',
          })),
        createdAt: new Date().toISOString(),
      };
      setDoc(doc(db, 'depositSettlements', settleDocId), cleanFirestoreObject(settlePayload), { merge: true }).catch(console.warn);
      setDoc(doc(db, 'depositSettlements', settlement.id), cleanFirestoreObject(settlePayload), { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const target = prev.moveOuts.find((m) => m.id === settlement.id);
      const updatedMoveOuts = prev.moveOuts.map((m) =>
        m.id === settlement.id ? { ...m, ...settlement, status: moveOutStatus as any } : m
      );
      const sideEffects = isSettled ? applyMoveOutSettlementState(prev, target, settlement) : {};

      const notif: MobileInAppNotification = {
        id: `notif-settle-${Date.now()}`,
        title: isSettled ? 'Deposit Settlement Finalized ✓' : 'Settlement Voucher Prepared',
        body: isSettled
          ? `Move-out settlement for Unit ${settlement.unit || target?.unit || ''} completed. Unit is now vacant and ready for leasing.`
          : `Inspection completed for Unit ${settlement.unit || target?.unit || ''}. Deductions calculated and settlement statement generated.`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        moveOuts: updatedMoveOuts,
        ...sideEffects,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const saveDepositSettlement = async (settlement: MobileDepositSettlement) => {
    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'depositSettlements', settlement.id), cleanFirestoreObject(settlement), { merge: true }).catch(console.warn);
      if (settlement.id.startsWith('DEP-SETTLE-')) {
        const stripped = settlement.id.replace('DEP-SETTLE-', '');
        await setDoc(doc(db, 'depositSettlements', stripped), cleanFirestoreObject(settlement), { merge: true }).catch(console.warn);
      }
    }
    setState((prev) => {
      const exists = prev.depositSettlements.some((s) => s.id === settlement.id);
      return {
        ...prev,
        depositSettlements: exists
          ? prev.depositSettlements.map((s) => (s.id === settlement.id ? settlement : s))
          : [settlement, ...prev.depositSettlements],
      };
    });
  };

  const respondToDepositSettlement = async (
    settlementId: string,
    status: 'approved' | 'rejected',
    notes?: string,
    payoutDetails?: any
  ) => {
    const strippedId = settlementId.replace('DEP-SETTLE-', '');
    const matched = rawState.depositSettlements.find((s) => s.id === settlementId || s.id === strippedId);
    const matchedMo = rawState.moveOuts.find((m) => m.id === settlementId || m.id === strippedId || (matched && m.unit === matched.unit));

    const updatedSettlement: Partial<MobileDepositSettlement> = {
      status,
      chosenPayoutDetails: payoutDetails || matched?.chosenPayoutDetails,
      rejectionReason: status === 'rejected' ? notes : undefined,
      revisionNotes: status === 'rejected' ? notes : undefined,
    };

    const updatedMoveOut: Partial<MobileMoveOut> = {
      status: status === 'approved' ? 'refund_scheduled' : 'disputed',
      settlementStatus: status === 'approved' ? 'approved' : 'rejected',
      tenantApprovedSettlement: status === 'approved',
      tenantDisputeRaised: status === 'rejected',
      chosenPayoutDetails: payoutDetails || matchedMo?.chosenPayoutDetails,
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'depositSettlements', settlementId), cleanFirestoreObject(updatedSettlement), { merge: true });
        await setDoc(doc(db, 'depositSettlements', strippedId), cleanFirestoreObject(updatedSettlement), { merge: true });
        if (matchedMo) {
          await setDoc(doc(db, 'moveouts', matchedMo.id), cleanFirestoreObject(updatedMoveOut), { merge: true });
        }
      } catch (err) {
        console.warn('Firestore respondToDepositSettlement error:', err);
      }
    }

    setState((prev) => ({
      ...prev,
      depositSettlements: prev.depositSettlements.map((s) =>
        s.id === settlementId || s.id === strippedId || s.id === matched?.id || (matchedMo && s.unit === matchedMo.unit)
          ? { ...s, ...updatedSettlement }
          : s
      ),
      moveOuts: prev.moveOuts.map((m) =>
        m.id === matchedMo?.id || m.id === settlementId || m.id === strippedId || (matched && m.unit === matched.unit)
          ? { ...m, ...updatedMoveOut }
          : m
      ),
    }));
  };

  const confirmRefundReceipt = async (claimOrMoveOutOrSettleId: string) => {
    const strippedId = claimOrMoveOutOrSettleId.replace('DEP-SETTLE-', '');
    const now = new Date().toISOString();

    setState((prev) => {
      const matchedSettle = prev.depositSettlements.find(
        (s) => s.id === claimOrMoveOutOrSettleId || s.id === strippedId || s.id === `DEP-SETTLE-${strippedId}`
      );
      const matchedMo = prev.moveOuts.find(
        (m) =>
          m.id === claimOrMoveOutOrSettleId ||
          m.id === strippedId ||
          (matchedSettle && (m.unit === matchedSettle.unit || m.id === matchedSettle.moveOutId))
      );

      const targetUnit = matchedMo?.unit || matchedSettle?.unit;
      const targetPropId = matchedMo?.propertyId || matchedSettle?.propertyId;
      const targetTenantId = matchedMo?.tenantId || matchedSettle?.tenantId;
      const targetTenantName = matchedMo?.tenantName || matchedSettle?.tenantName;

      const updatedSettlements = prev.depositSettlements.map((s) => {
        if (s.id === claimOrMoveOutOrSettleId || s.id === strippedId || s.id === `DEP-SETTLE-${strippedId}` || (targetUnit && s.unit === targetUnit)) {
          const upSettle: MobileDepositSettlement = {
            ...s,
            status: 'refunded',
            tenantConfirmedReceipt: true,
            tenantConfirmedAt: now,
          };
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'depositSettlements', s.id), cleanFirestoreObject(upSettle), { merge: true }).catch(console.warn);
          }
          return upSettle;
        }
        return s;
      });

      const updatedMoveOuts = prev.moveOuts.map((m) => {
        if (m.id === matchedMo?.id || m.id === claimOrMoveOutOrSettleId || m.id === strippedId || (targetUnit && m.unit === targetUnit)) {
          const upMo: MobileMoveOut = {
            ...m,
            status: 'refund_completed',
            settledAt: now,
            tenantConfirmedReceipt: true,
            tenantConfirmedAt: now,
          };
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'moveouts', m.id), cleanFirestoreObject(upMo), { merge: true }).catch(console.warn);
          }
          return upMo;
        }
        return m;
      });

      const sideEffects = applyMoveOutSettlementState(
        prev,
        matchedMo || ({ unit: targetUnit, propertyId: targetPropId, tenantId: targetTenantId, tenantName: targetTenantName } as any)
      );

      const notif: MobileInAppNotification = {
        id: `notif-ref-conf-${Date.now()}`,
        title: 'Deposit Refund Confirmed ✓',
        body: `Deposit refund receipt confirmed for Unit ${targetUnit || ''}. Tenancy has concluded and obligations cleared.`,
        category: 'bills',
        isRead: false,
        createdAt: now,
      };

      return {
        ...prev,
        depositSettlements: updatedSettlements,
        moveOuts: updatedMoveOuts,
        ...sideEffects,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const confirmCashClaim = (claimOrMoveOutId: string) => {
    setState((prev) => {
      const now = new Date().toISOString();
      const targetClaim = (prev.cashClaims || []).find((c) => c.id === claimOrMoveOutId);
      let updatedCashClaims = prev.cashClaims || [];
      let updatedPayments = prev.payments;
      let updatedInvoices = prev.invoices;
      let updatedSettlements = prev.depositSettlements;

      if (targetClaim) {
        const confirmedClaim: MobileCashHandoverClaim = {
          ...targetClaim,
          status: 'confirmed',
          confirmedAt: now,
          confirmedByName: 'Property Owner',
        };
        updatedCashClaims = updatedCashClaims.map((c) => (c.id === claimOrMoveOutId ? confirmedClaim : c));

        if (isFirebaseConfigured) {
          setDoc(doc(db, 'cashClaims', claimOrMoveOutId), cleanFirestoreObject(confirmedClaim), { merge: true }).catch(console.warn);
        }

        // Reconcile or create payment transaction
        const existingTxn = prev.payments.find(
          (p) =>
            p.cashClaimId === claimOrMoveOutId ||
            (p.tenantId === targetClaim.tenantId &&
              (!targetClaim.propertyId || !p.propertyId || p.propertyId === targetClaim.propertyId) &&
              p.unit === targetClaim.unit &&
              p.status === 'pending_confirmation')
        );
        if (existingTxn) {
          updatedPayments = prev.payments.map((p) =>
            p.id === existingTxn.id ? { ...p, status: 'paid' as const, method: 'Cash Handover' } : p
          );
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'payments', existingTxn.id), cleanFirestoreObject({ status: 'paid' }), { merge: true }).catch(console.warn);
          }
        } else {
          const newTxn: MobilePaymentTransaction = {
            id: `TXN-CSH-${Date.now().toString().slice(-6)}`,
            ownerId: targetClaim.ownerId,
            tenant: targetClaim.tenantName,
            tenantId: targetClaim.tenantId,
            unit: targetClaim.unit,
            unitId: targetClaim.unit,
            propertyId: targetClaim.propertyId,
            propertyName: targetClaim.propertyName || 'Property Premises',
            amount: targetClaim.amount,
            currency: targetClaim.currency || DEFAULT_CURRENCY_SYMBOL,
            date: targetClaim.handoverDate || now.split('T')[0],
            status: 'paid',
            direction: targetClaim.direction || 'inflow',
            method: 'Cash Handover',
            type: (targetClaim.type as any) || 'rent',
            cashClaimId: targetClaim.id,
            notes: `Confirmed cash handover. Location: ${targetClaim.handoverLocation || 'On-Site'}. Ref #${targetClaim.id}`,
          };
          updatedPayments = [newTxn, ...prev.payments];
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'payments', newTxn.id), cleanFirestoreObject(newTxn), { merge: true }).catch(console.warn);
          }
        }

        // Mark any matching unpaid invoice as paid
        const matchingInv = targetClaim.invoiceId
          ? prev.invoices.find((inv) => inv.id === targetClaim.invoiceId)
          : prev.invoices.find(
              (inv) =>
                inv.tenantId === targetClaim.tenantId &&
                (!targetClaim.propertyId || !inv.propertyId || inv.propertyId === targetClaim.propertyId) &&
                inv.unit === targetClaim.unit &&
                inv.status !== 'paid'
            );
        if (matchingInv) {
          updatedInvoices = prev.invoices.map((inv) =>
            inv.id === matchingInv.id
              ? {
                  ...inv,
                  status: 'paid' as const,
                  paidAt: now,
                  paymentMethodUsed: 'Cash Handover',
                  receiptNumber: `RCP-CSH-${Date.now().toString().slice(-6)}`,
                }
              : inv
          );
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'invoices', matchingInv.id), cleanFirestoreObject({
              status: 'paid',
              paidAt: now,
              paymentMethodUsed: 'Cash Handover',
            }), { merge: true }).catch(console.warn);
          }
        }
      }

      // Check if it's linked to Move-Out cash refund or deposit settlement
      const isDepositRefund =
        targetClaim?.type === 'deposit_refund' ||
        targetClaim?.direction === 'outflow' ||
        Boolean(targetClaim?.settlementId) ||
        Boolean(targetClaim?.moveOutId);

      const targetSettle = isDepositRefund
        ? prev.depositSettlements.find(
            (s) =>
              (targetClaim?.settlementId && (s.id === targetClaim.settlementId || s.id === `DEP-SETTLE-${targetClaim.settlementId}` || s.id.replace(/^DEP-SETTLE-/i, '') === targetClaim.settlementId.replace(/^DEP-SETTLE-/i, ''))) ||
              (targetClaim?.moveOutId && (s.id === `DEP-SETTLE-${targetClaim.moveOutId}` || (s as any).moveOutId === targetClaim.moveOutId)) ||
              (targetClaim && s.cashClaimId === targetClaim.id) ||
              (targetClaim?.unit && s.unit === targetClaim.unit && s.status !== 'refunded')
          )
        : undefined;

      if (targetSettle) {
        updatedSettlements = prev.depositSettlements.map((s) => {
          if (s.id === targetSettle.id) {
            const upSettle: MobileDepositSettlement = {
              ...s,
              status: 'refunded',
              tenantConfirmedReceipt: true,
              tenantConfirmedAt: now,
            };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'depositSettlements', s.id), cleanFirestoreObject(upSettle), { merge: true }).catch(console.warn);
            }
            return upSettle;
          }
          return s;
        });
      }

      const targetMoveOut = prev.moveOuts.find(
        (m) =>
          m.id === claimOrMoveOutId ||
          m.id === claimOrMoveOutId.replace(/^DEP-SETTLE-/i, '') ||
          (targetClaim?.moveOutId && (m.id === targetClaim.moveOutId || m.id === targetClaim.moveOutId.replace(/^DEP-SETTLE-/i, ''))) ||
          (targetSettle && (m.id === targetSettle.id.replace(/^DEP-SETTLE-/i, '') || m.id === (targetSettle as any).moveOutId)) ||
          (targetClaim?.unit && m.unit === targetClaim.unit && m.status !== 'refund_completed') ||
          m.cashRefundHandover
      );

      const updatedMoveOuts = prev.moveOuts.map((m) => {
        if (m.id === claimOrMoveOutId || (targetMoveOut && m.id === targetMoveOut.id)) {
          const upMo = {
            ...m,
            status: 'refund_completed' as const,
            settledAt: now,
            tenantConfirmedReceipt: true,
            tenantConfirmedAt: now,
            cashRefundHandover: m.cashRefundHandover
              ? { ...m.cashRefundHandover, status: 'confirmed' as const }
              : undefined,
          };
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'moveouts', m.id), cleanFirestoreObject(upMo), { merge: true }).catch(console.warn);
          }
          return upMo;
        }
        return m;
      });

      const sideEffects = applyMoveOutSettlementState(prev, targetMoveOut);

      const notif: MobileInAppNotification = {
        id: `notif-csh-${Date.now()}`,
        title: 'Cash Handover Verified & Settled ✓',
        body: `Cash payment receipt of ${formatCurrencyAmount(targetClaim?.amount || targetMoveOut?.netRefundAmount || 0, targetClaim?.currency || targetMoveOut?.currency)} has been verified and settled in ledger.`,
        category: 'bills',
        isRead: false,
        createdAt: now,
      };

      return {
        ...prev,
        cashClaims: updatedCashClaims,
        payments: updatedPayments,
        invoices: updatedInvoices,
        depositSettlements: updatedSettlements,
        moveOuts: updatedMoveOuts,
        ...sideEffects,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const rejectCashClaim = (claimOrMoveOutId: string, reason?: string) => {
    setState((prev) => {
      const updatedCashClaims = (prev.cashClaims || []).map((c) =>
        c.id === claimOrMoveOutId
          ? { ...c, status: 'rejected' as const, rejectionReason: reason || 'Cash handover not received' }
          : c
      );
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'cashClaims', claimOrMoveOutId), {
          status: 'rejected',
          rejectionReason: reason || 'Cash handover not received',
        }, { merge: true }).catch(console.warn);
      }

      const updatedPayments = prev.payments.map((p) =>
        p.cashClaimId === claimOrMoveOutId || p.id === claimOrMoveOutId
          ? { ...p, status: 'disputed' as const, notes: `Cash handover contested: ${reason || 'Not received'}` }
          : p
      );

      const updatedMoveOuts = prev.moveOuts.map((m) => {
        if (m.id === claimOrMoveOutId || m.cashRefundHandover) {
          return {
            ...m,
            status: 'disputed' as const,
            cashRefundHandover: m.cashRefundHandover
              ? { ...m.cashRefundHandover, status: 'rejected' as const, rejectedReason: reason || 'Discrepancy noted' }
              : undefined,
          };
        }
        return m;
      });

      const notif: MobileInAppNotification = {
        id: `notif-csh-rej-${Date.now()}`,
        title: 'Cash Claim Declined',
        body: `Cash claim for Unit ${claimOrMoveOutId} declined: "${reason || 'Not received'}".`,
        category: 'bills',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        cashClaims: updatedCashClaims,
        payments: updatedPayments,
        moveOuts: updatedMoveOuts,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const submitCashClaim = (claimData: any) => {
    setState((prev) => {
      const newClaim: MobileCashHandoverClaim = {
        id: claimData.id || `CSH-${Date.now().toString().slice(-6)}`,
        direction: claimData.direction || 'inflow',
        type: claimData.type || 'rent',
        amount: claimData.amount || 0,
        currency: claimData.currency || DEFAULT_CURRENCY_SYMBOL,
        ownerId: claimData.ownerId || '',
        tenantId: claimData.tenantId || '',
        tenantName: claimData.tenantName || 'Resident',
        unit: claimData.unit || 'Unit',
        propertyName: claimData.propertyName,
        propertyId: claimData.propertyId,
        invoiceId: claimData.invoiceId,
        claimedBy: claimData.claimedBy || '',
        claimedByRole: claimData.claimedByRole || 'owner',
        claimedByName: claimData.claimedByName || 'Property Owner',
        claimedAt: new Date().toISOString(),
        handoverDate: claimData.handoverDate || new Date().toISOString().split('T')[0],
        handoverLocation: claimData.handoverLocation || 'On-Site Handover',
        notes: claimData.notes,
        status: 'pending_confirmation',
      };

      if (isFirebaseConfigured) {
        setDoc(doc(db, 'cashClaims', newClaim.id), newClaim, { merge: true }).catch(console.warn);
      }

      const updatedMoveOuts = prev.moveOuts.map((m) => {
        if (m.id === claimData.moveOutId || m.unit === claimData.unit) {
          return {
            ...m,
            cashRefundHandover: {
              claimedByName: claimData.claimedByName || 'Property Owner',
              amount: claimData.amount || m.netRefundAmount,
              currency: claimData.currency || m.currency,
              handoverDate: claimData.handoverDate || new Date().toISOString().split('T')[0],
              handoverLocation: claimData.handoverLocation || 'On-Site',
              notes: claimData.notes,
              status: 'pending_confirmation' as const,
            },
          };
        }
        return m;
      });

      return {
        ...prev,
        cashClaims: [newClaim, ...(prev.cashClaims || [])],
        moveOuts: updatedMoveOuts,
      };
    });
  };

  const saveDispute = (dispute: MobileDispute) => {
    const ownerIdToSet = dispute.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const disputeToSave: MobileDispute = { ...dispute, ownerId: ownerIdToSet };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'disputes', disputeToSave.id), disputeToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.disputes.some((d) => d.id === disputeToSave.id);
      const updated = exists
        ? prev.disputes.map((d) => (d.id === disputeToSave.id ? disputeToSave : d))
        : [disputeToSave, ...prev.disputes];

      const notif: MobileInAppNotification = {
        id: `notif-dsp-${Date.now()}`,
        title: `Formal Dispute Filed: ${disputeToSave.category}`,
        body: `${disputeToSave.raisedByName} filed dispute for ${formatCurrencyAmount(disputeToSave.amountDisputed, disputeToSave.currency)}`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
        relatedEntityId: disputeToSave.id,
        recipientId: ownerIdToSet,
        ownerId: ownerIdToSet,
      };

      return { ...prev, disputes: updated, notifications: [notif, ...prev.notifications] };
    });
  };

  const resolveDispute = (disputeId: string, resolution: string) => {
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'disputes', disputeId), {
        status: 'resolved',
        managerResolution: resolution,
        resolvedAt: new Date().toISOString(),
      }, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      disputes: prev.disputes.map((d) =>
        d.id === disputeId
          ? {
              ...d,
              status: 'resolved' as const,
              managerResolution: resolution,
              resolvedAt: new Date().toISOString(),
            }
          : d
      ),
    }));
  };

  const saveTenant = async (tenant: MobileTenantRecord, password?: string): Promise<string | void> => {
    const ownerIdToSet = tenant.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    let uid = tenant.id;
    const cleanEmail = (tenant.email || '').trim().toLowerCase();

    // Preserve existing account if user or tenant record already exists
    const existingUser = (state.users || []).find((u) => u.email?.trim().toLowerCase() === cleanEmail);
    const existingTenant = (state.tenants || []).find((t) => t.email?.trim().toLowerCase() === cleanEmail);
    if (existingUser?.id) {
      uid = existingUser.id;
    } else if (existingTenant?.id) {
      uid = existingTenant.id;
    }

    if (cleanEmail && isFirebaseConfigured) {
      const pass = password || 'Tenant@123';
      try {
        const createdUid = await createSecondaryAuthUser(cleanEmail, pass);
        if (createdUid) {
          uid = createdUid;
        }
      } catch (err: any) {
        console.warn('Firebase secondary user creation for tenant:', err?.message || err);
      }
    }

    const tenantToSave: MobileTenantRecord = {
      ...tenant,
      id: uid,
      ownerId: ownerIdToSet,
      rating: existingTenant?.rating ?? tenant.rating ?? 5,
      kycStatus: existingTenant?.kycStatus || tenant.kycStatus || 'pending',
      kycDocuments: existingTenant?.kycDocuments || tenant.kycDocuments || [],
      history: existingTenant?.history || tenant.history || [],
      unitsRented: Array.from(new Set([...(existingTenant?.unitsRented || []), ...(tenant.unitsRented || []), tenant.unit].filter(Boolean))),
    };

    if (cleanEmail && isFirebaseConfigured) {
      const tenantUserProfile: MobileUserProfile = {
        id: uid,
        email: cleanEmail,
        displayName: tenant.name,
        role: 'tenant',
        phone: tenant.phone || '',
        ownerId: ownerIdToSet,
        ownerName: user?.displayName || 'Property Owner',
        status: 'active',
        createdAt: existingUser?.createdAt || new Date().toISOString(),
      };
      setDoc(doc(db, 'users', uid), tenantUserProfile, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'userClaimRequests', uid), {
        uid,
        role: 'tenant',
        ownerId: ownerIdToSet || null,
        requestedAt: new Date().toISOString(),
        processed: false,
      }).catch(console.warn);
    }

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'tenants', tenantToSave.id), tenantToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.tenants.some((t) => t.id === tenantToSave.id);
      return {
        ...prev,
        tenants: exists
          ? prev.tenants.map((t) => (t.id === tenantToSave.id ? tenantToSave : t))
          : [tenantToSave, ...prev.tenants],
      };
    });
    return uid;
  };

  const updateAgreement = (agreementId: string, updates: Partial<MobileAgreement>) => {
    const sanitizedUpdates = { ...updates };
    if ((sanitizedUpdates as any).status === 'awaiting_owner_signature') {
      sanitizedUpdates.status = 'pending_approval';
    }
    if (isFirebaseConfigured) {
      sanitizeAgreementForFirestore(sanitizedUpdates, agreementId)
        .then((prepared) => {
          setDoc(doc(db, 'agreements', agreementId), prepared, { merge: true }).catch(console.warn);
        })
        .catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      agreements: prev.agreements.map((a) => (a.id === agreementId ? { ...a, ...sanitizedUpdates } : a)),
    }));
  };

  const updateMoveOut = (moveOutId: string, updates: Partial<MobileMoveOut>) => {
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'moveouts', moveOutId), updates, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const target = prev.moveOuts.find((m) => m.id === moveOutId);
      const updatedMoveOuts = prev.moveOuts.map((m) => (m.id === moveOutId ? { ...m, ...updates } : m));
      if (updates.status === 'settled') {
        const sideEffects = applyMoveOutSettlementState(prev, target, updates);
        return {
          ...prev,
          moveOuts: updatedMoveOuts,
          ...sideEffects,
        };
      }
      return {
        ...prev,
        moveOuts: updatedMoveOuts,
      };
    });
  };

  const updateDispute = (disputeId: string, updates: Partial<MobileDispute>) => {
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'disputes', disputeId), updates, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      disputes: prev.disputes.map((d) => (d.id === disputeId ? { ...d, ...updates } : d)),
    }));
  };

  const addStaff = async (member: MobileStaffMember, password?: string): Promise<string | void> => {
    const ownerIdToSet = member.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    let uid = member.id;
    const cleanEmail = (member.email || '').trim().toLowerCase();

    if (cleanEmail && isFirebaseConfigured) {
      const pass = password || 'Staff@123';
      try {
        const createdUid = await createSecondaryAuthUser(cleanEmail, pass);
        if (createdUid) {
          uid = createdUid;
        }
      } catch (err: any) {
        console.warn('Firebase secondary user creation for staff:', err?.message || err);
      }
    }

    const memberToSave: MobileStaffMember = { ...member, id: uid, ownerId: ownerIdToSet };

    if (cleanEmail && isFirebaseConfigured) {
      const staffProfile: MobileUserProfile = {
        id: uid,
        email: cleanEmail,
        displayName: member.name,
        role: 'staff',
        phone: member.phone || '',
        ownerId: ownerIdToSet,
        ownerName: user?.displayName || 'Property Owner',
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      setDoc(doc(db, 'users', uid), staffProfile, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'userClaimRequests', uid), {
        uid,
        role: 'staff',
        ownerId: ownerIdToSet || null,
        requestedAt: new Date().toISOString(),
        processed: false,
      }).catch(console.warn);
    }

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'staff', memberToSave.id), memberToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      staff: [memberToSave, ...prev.staff.filter((s) => s.id !== memberToSave.id)],
    }));
    return uid;
  };

  const saveManager = async (manager: MobilePropertyManager, password?: string): Promise<string | void> => {
    const ownerIdToSet = manager.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    let uid = manager.id;
    const cleanEmail = (manager.email || '').trim().toLowerCase();

    if (cleanEmail && isFirebaseConfigured) {
      const pass = password || 'Manager@123';
      try {
        const createdUid = await createSecondaryAuthUser(cleanEmail, pass);
        if (createdUid) {
          uid = createdUid;
        }
      } catch (err: any) {
        console.warn('Firebase secondary user creation for manager:', err?.message || err);
      }
    }

    const managerToSave: MobilePropertyManager = { ...manager, id: uid, ownerId: ownerIdToSet };

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'propertyManagers', managerToSave.id), managerToSave, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'users', managerToSave.id), {
        id: managerToSave.id,
        displayName: managerToSave.name,
        email: managerToSave.email,
        phone: managerToSave.phone,
        role: 'manager',
        ownerId: ownerIdToSet,
        ownerName: managerToSave.ownerName,
        propertyId: managerToSave.propertyId,
        status: 'active',
        createdAt: new Date().toISOString(),
      }, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'userClaimRequests', managerToSave.id), {
        uid: managerToSave.id,
        role: 'manager',
        ownerId: ownerIdToSet || null,
        requestedAt: new Date().toISOString(),
        processed: false,
      }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      propertyManagers: [managerToSave, ...prev.propertyManagers.filter((m) => m.id !== managerToSave.id)],
    }));
    return uid;
  };

  const reassignManagerProperty = async (managerId: string, propertyId: string | null) => {
    const pmIdStr = String(managerId);
    const cleanPropId = propertyId ? String(propertyId) : '';

    setState((prev) => ({
      ...prev,
      propertyManagers: (prev.propertyManagers || []).map((m) =>
        m.id === pmIdStr
          ? {
              ...m,
              propertyId: cleanPropId || undefined,
              assignedProperties: cleanPropId ? [cleanPropId] : [],
            }
          : m
      ),
      properties: prev.properties.map((p) => {
        if (p.assignedManagerId === pmIdStr && p.id !== cleanPropId) {
          return { ...p, assignedManagerId: undefined };
        }
        if (cleanPropId && p.id === cleanPropId) {
          return { ...p, assignedManagerId: pmIdStr };
        }
        return p;
      }),
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(
          doc(db, 'propertyManagers', pmIdStr),
          {
            propertyId: cleanPropId || null,
            assignedProperties: cleanPropId ? [cleanPropId] : [],
          },
          { merge: true }
        );
        const prevAssignedProps = state.properties.filter(
          (p) => p.assignedManagerId === pmIdStr && p.id !== cleanPropId
        );
        for (const p of prevAssignedProps) {
          await setDoc(doc(db, 'properties', p.id), { assignedManagerId: null }, { merge: true });
        }
        if (cleanPropId) {
          await setDoc(doc(db, 'properties', cleanPropId), { assignedManagerId: pmIdStr }, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore reassignManagerProperty mobile error:', err);
      }
    }
  };

  const deleteManager = (managerId: string) => {
    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'propertyManagers', managerId)).catch(console.warn);
      deleteDoc(doc(db, 'users', managerId)).catch(console.warn);
      const affectedProps = state.properties.filter((p) => p.assignedManagerId === managerId);
      for (const p of affectedProps) {
        setDoc(doc(db, 'properties', p.id), { assignedManagerId: null }, { merge: true }).catch(console.warn);
      }
    }
    setState((prev) => ({
      ...prev,
      propertyManagers: prev.propertyManagers.filter((m) => m.id !== managerId),
      properties: prev.properties.map((p) =>
        p.assignedManagerId === managerId ? { ...p, assignedManagerId: undefined } : p
      ),
    }));
  };

  const recordManagerPayout = (payout: MobileManagerPayout) => {
    const ownerIdToSet = payout.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const payoutToSave: MobileManagerPayout = { ...payout, ownerId: ownerIdToSet };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'managerPayouts', payoutToSave.id), payoutToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      managerPayouts: [payoutToSave, ...prev.managerPayouts.filter((p) => p.id !== payoutToSave.id)],
    }));
  };

  const saveStaffSchedule = (item: MobileStaffScheduleItem) => {
    const ownerIdToSet = item.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const schedId = `SCHED-${Date.now()}`;
    const itemToSave: MobileStaffScheduleItem = { ...item, ownerId: ownerIdToSet };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'staffSchedules', schedId), itemToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      staffSchedules: [...prev.staffSchedules, itemToSave],
    }));
  };

  const deleteStaffSchedule = (id: string) => {
    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'staffSchedules', id)).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      staffSchedules: prev.staffSchedules.filter((s: any) => s.id !== id),
    }));
  };


  const updatePlanUsage = (updates: Partial<MobilePlanUsage>) => {
    setPlanConfig((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const markNotificationRead = (notifId: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === notifId ? { ...n, isRead: true } : n)),
    }));
  };

  const markAllNotificationsRead = () => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, isRead: true })),
    }));
  };

  const confirmOfflinePayment = (paymentId: string) => {
    setState((prev) => {
      const targetPayment = prev.payments.find((p) => p.id === paymentId);
      const updatedPayments = prev.payments.map((p) =>
        p.id === paymentId ? { ...p, status: 'paid' as const } : p
      );
      const updatedInvoices = prev.invoices.map((inv) =>
        inv.id === targetPayment?.invoiceId ? { ...inv, status: 'paid' as const, paidAt: new Date().toISOString() } : inv
      );
      const notif: MobileInAppNotification = {
        id: `notif-${Date.now()}`,
        title: 'Payment Verified ✓',
        body: `Offline payment of ${formatCurrencyAmount(targetPayment?.amount || 0, targetPayment?.currency)} for Unit ${targetPayment?.unit} has been approved.`,
        category: 'bills',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured && targetPayment?.id) {
        setDoc(doc(db, 'payments', targetPayment.id), { status: 'paid' }, { merge: true }).catch(console.warn);
        if (targetPayment.invoiceId) {
          setDoc(doc(db, 'invoices', targetPayment.invoiceId), { status: 'paid', paidAt: new Date().toISOString() }, { merge: true }).catch(console.warn);
        }
      }

      return {
        ...prev,
        payments: updatedPayments,
        invoices: updatedInvoices,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const rejectOfflinePayment = (paymentId: string, reason: string) => {
    setState((prev) => {
      const targetPayment = prev.payments.find((p) => p.id === paymentId);
      const updatedPayments = prev.payments.map((p) =>
        p.id === paymentId ? { ...p, status: 'failed' as const, notes: reason } : p
      );
      const updatedInvoices = prev.invoices.map((inv) =>
        inv.id === targetPayment?.invoiceId ? { ...inv, status: 'sent' as const } : inv
      );
      const notif: MobileInAppNotification = {
        id: `notif-${Date.now()}`,
        title: 'Payment Proof Rejected',
        body: `Payment proof for ${targetPayment?.unit} was contested: ${reason}. Please submit a valid UTR.`,
        category: 'bills',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured && targetPayment?.id) {
        setDoc(doc(db, 'payments', targetPayment.id), { status: 'failed', notes: reason }, { merge: true }).catch(console.warn);
      }

      return {
        ...prev,
        payments: updatedPayments,
        invoices: updatedInvoices,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const savePaymentMethods = (methods: MobilePaymentMethodsConfig, ownerId?: string) => {
    setState((prev) => {
      // Update global paymentMethods (used by legacy code / owner-only sessions)
      const updated: MobileAppState = { ...prev, paymentMethods: methods };
      // If an ownerId is provided, also update ownerSettings[ownerId].paymentMethods for
      // real-time tenant-side resolution via state.ownerSettings[ownerId].paymentMethods
      if (ownerId) {
        updated.ownerSettings = {
          ...prev.ownerSettings,
          [ownerId]: {
            ...(prev.ownerSettings[ownerId] || { ownerId, planId: '', planName: '', planStatus: 'trialing', trialEndsAt: null, subscriptionEndsAt: null }),
            paymentMethods: methods,
          } as MobileOwnerSettings,
        };
      }
      return updated;
    });
    // Persist to Firestore so Web app (and other mobile sessions) see the update instantly
    if (isFirebaseConfigured && ownerId) {
      setDoc(doc(db, 'owners', ownerId), { paymentMethods: methods }, { merge: true }).catch(console.warn);
    }
  };

  const saveAnnouncement = (ann: MobileAnnouncement) => {
    const ownerIdToSet = ann.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    const annToSave: MobileAnnouncement = { ...ann, ownerId: ownerIdToSet };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'announcements', annToSave.id), annToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const exists = prev.announcements.some((a) => a.id === annToSave.id);
      const updated = exists ? prev.announcements.map((a) => (a.id === annToSave.id ? annToSave : a)) : [annToSave, ...prev.announcements];
      const notif: MobileInAppNotification = {
        id: `notif-${Date.now()}`,
        title: annToSave.title,
        body: annToSave.body,
        category: annToSave.category === 'emergency' ? 'system' : 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
        ownerId: ownerIdToSet,
      };
      return {
        ...prev,
        announcements: updated,
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const togglePinAnnouncement = (id: string) => {
    const target = state.announcements.find((a) => a.id === id);
    if (isFirebaseConfigured && target) {
      setDoc(doc(db, 'announcements', id), { isPinned: !target.isPinned }, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      announcements: prev.announcements.map((a) => (a.id === id ? { ...a, isPinned: !a.isPinned } : a)),
    }));
  };

  const archiveAnnouncement = (id: string) => {
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'announcements', id), { status: 'archived' }, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      announcements: prev.announcements.map((a) => (a.id === id ? { ...a, status: 'archived' as const } : a)),
    }));
  };

  const deleteAnnouncement = (id: string) => {
    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'announcements', id)).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      announcements: prev.announcements.filter((a) => a.id !== id),
    }));
  };

  const acknowledgeAnnouncement = (id: string, userId?: string) => {
    setState((prev) => ({
      ...prev,
      announcements: prev.announcements.map((a) =>
        a.id === id
          ? { ...a, acknowledgedBy: Array.from(new Set([...(a.acknowledgedBy || []), userId || 'current-user'])) }
          : a
      ),
    }));
  };

  const sendTenancyRequest = (req: MobileTenancyRequest) => {
    let targetOwnerId = req.ownerId;
    if (!targetOwnerId) {
      const targetUnit = rawState.units.find((u) => u.id === req.unitId);
      const targetProp = rawState.properties.find((p) => p.id === req.propertyId || p.id === targetUnit?.propertyId);
      targetOwnerId = targetProp?.ownerId || (user?.role === 'owner' ? user.id : user?.ownerId) || '';
    }
    const reqToSave: MobileTenancyRequest = { ...req, ownerId: targetOwnerId };
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'tenancyRequests', reqToSave.id), reqToSave, { merge: true }).catch(console.warn);
    }
    setState((prev) => ({
      ...prev,
      tenancyRequests: [reqToSave, ...prev.tenancyRequests],
    }));
  };

  const updateTenancyRequest = (id: string, status: 'accepted' | 'declined' | 'cancelled') => {
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'tenancyRequests', id), { status }, { merge: true }).catch(console.warn);
    }
    setState((prev) => {
      const targetReq = prev.tenancyRequests.find((r) => r.id === id);
      const updatedRequests = prev.tenancyRequests.map((r) => (r.id === id ? { ...r, status } : r));

      if (!targetReq) {
        return { ...prev, tenancyRequests: updatedRequests };
      }

      const unitNum = targetReq.unitNumber || targetReq.unit || '';
      const propId = targetReq.propertyId;

      if (status === 'accepted') {
        const agreementId = `AG-${Date.now().toString().slice(-6)}`;
        const newAgreement: MobileAgreement = {
          id: agreementId,
          ownerId: targetReq.ownerId,
          ownerName: targetReq.ownerName,
          propertyId: targetReq.propertyId,
          propertyName: targetReq.propertyName,
          unit: unitNum,
          tenant: targetReq.tenantName,
          tenantId: targetReq.tenantId || `TEN-${Date.now().toString().slice(-4)}`,
          tenantEmail: targetReq.tenantEmail,
          tenantPhone: targetReq.tenantPhone,
          start: targetReq.leaseStart || new Date().toISOString().split('T')[0],
          end: targetReq.leaseEnd || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
          rent: targetReq.rent || 0,
          deposit: targetReq.deposit || (targetReq.rent ? targetReq.rent * 2 : 0),
          currency: targetReq.currency || DEFAULT_CURRENCY_SYMBOL,
          escalationPercent: 8,
          lockInMonths: 11,
          noticePeriodDays: 30,
          status: 'awaiting_tenant_upload',
          executionMode: targetReq.agreementFileName ? 'already_executed_offline' : 'digital_dispatch',
          initialAgreementName: targetReq.agreementFileName || 'Lease_Agreement.pdf',
          initialAgreementUrl: targetReq.agreementFileData || targetReq.agreementFileUrl || undefined,
          documentUrl: targetReq.agreementFileData || targetReq.agreementFileUrl || undefined,
          requireTenantId: targetReq.requireTenantId,
          requiredIdType: targetReq.requiredIdType,
          requiredIdTypes: targetReq.requiredIdTypes,
          requiredIdList: targetReq.requiredIdList,
          createdAt: new Date().toISOString(),
        };

        if (isFirebaseConfigured) {
          setDoc(doc(db, 'agreements', agreementId), newAgreement, { merge: true }).catch(console.warn);
        }

        const updatedUnits = prev.units.map((u) => {
          if ((u.unitNumber === unitNum || u.id === targetReq.unitId) && (!propId || u.propertyId === propId)) {
            const upUnit: MobileUnit = {
              ...u,
              status: 'reserved' as const,
              currentTenantId: newAgreement.tenantId,
              tenant: newAgreement.tenant,
            };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'units', u.id), upUnit, { merge: true }).catch(console.warn);
            }
            return upUnit;
          }
          return u;
        });

        const updatedTenants = prev.tenants.map((t) => {
          if (t.id === newAgreement.tenantId || t.email === newAgreement.tenantEmail) {
            const currentUnits = t.unitsRented || [];
            const nextUnits = currentUnits.includes(unitNum) ? currentUnits : [...currentUnits, unitNum];
            const upTenant: MobileTenantRecord = {
              ...t,
              unit: (!t.unit || t.unit === 'Unassigned') ? unitNum : t.unit,
              unitsRented: nextUnits,
              propertyName: (!t.propertyName || t.propertyName === 'Unassigned') ? (targetReq.propertyName || t.propertyName) : t.propertyName,
              propertyId: (!t.propertyId) ? (targetReq.propertyId || t.propertyId) : t.propertyId,
              ownerId: (!t.ownerId) ? (targetReq.ownerId || t.ownerId) : t.ownerId,
            };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'tenants', t.id), upTenant, { merge: true }).catch(console.warn);
            }
            return upTenant;
          }
          return t;
        });

        const notif: MobileInAppNotification = {
          id: `notif-req-acc-${Date.now()}`,
          title: 'Tenancy Offer Accepted! 🎉',
          body: `${targetReq.tenantName} accepted the offer for Unit ${unitNum}. Unit reserved. Awaiting signed lease upload.`,
          category: 'leases',
          isRead: false,
          createdAt: new Date().toISOString(),
          relatedEntityId: agreementId,
        };

        return {
          ...prev,
          tenancyRequests: updatedRequests,
          agreements: [newAgreement, ...prev.agreements],
          units: updatedUnits,
          tenants: updatedTenants,
          notifications: [notif, ...prev.notifications],
        };
      } else if (status === 'declined' || status === 'cancelled') {
        const updatedUnits = prev.units.map((u) => {
          const matchUnit = (u.unitNumber.toLowerCase() === unitNum.toLowerCase() || u.id === targetReq.unitId) && (!propId || u.propertyId === propId);
          if (matchUnit) {
            const upUnit: MobileUnit = {
              ...u,
              status: 'vacant' as const,
              currentTenantId: null,
              tenant: null,
            };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'units', u.id), upUnit, { merge: true }).catch(console.warn);
            }
            return upUnit;
          }
          return u;
        });

        const updatedProperties = prev.properties.map((p) => {
          if (!propId || p.id === propId) {
            const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
            const upP = { ...p, occupied: occ };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'properties', p.id), { occupied: occ }, { merge: true }).catch(console.warn);
            }
            return upP;
          }
          return p;
        });

        // 1. Cancel any active or pending agreements associated with this declined request / unit
        const cleanTargetUnit = (unitNum || '').toLowerCase().trim();
        const updatedAgreements = prev.agreements.map((a) => {
          const matchesReq = (a as any).tenancyRequestId === targetReq.id;
          const aUnitClean = (a.unit || '').toLowerCase().trim();
          const matchesUnitTenant =
            ((cleanTargetUnit && aUnitClean === cleanTargetUnit) || (targetReq.unitId && a.unitId === targetReq.unitId)) &&
            (a.tenantId === targetReq.tenantId || (targetReq.tenantEmail && a.tenantEmail?.toLowerCase().trim() === targetReq.tenantEmail.toLowerCase().trim()));
          if (matchesReq || matchesUnitTenant) {
            const cancelledAg: MobileAgreement = {
              ...a,
              status: 'cancelled',
            };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'agreements', a.id), { status: 'cancelled' }, { merge: true }).catch(console.warn);
            }
            return cancelledAg;
          }
          return a;
        });

        // 2. Void any unconfirmed invoices for this unaccepted tenancy (security deposit, rent invoice)
        const updatedInvoices = prev.invoices.map((inv) => {
          const matchesAg = updatedAgreements.some((a) => a.status === 'cancelled' && (inv.leaseAgreementId === a.id || inv.id === a.depositInvoiceId));
          const invUnitClean = (inv.unit || '').toLowerCase().trim();
          const matchesUnitTenant =
            (cleanTargetUnit && invUnitClean === cleanTargetUnit) &&
            (inv.tenantId === targetReq.tenantId || (inv.tenant && targetReq.tenantName && inv.tenant.toLowerCase().trim() === targetReq.tenantName.toLowerCase().trim()) || (targetReq.tenantEmail && inv.tenantEmail?.toLowerCase().trim() === targetReq.tenantEmail.toLowerCase().trim())) &&
            (inv.status === 'sent' || inv.status === 'draft' || inv.status === 'pending_confirmation');
          if (matchesAg || matchesUnitTenant) {
            const voidedInv: MobileInvoice = {
              ...inv,
              status: 'cancelled',
            };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'invoices', inv.id), { status: 'cancelled' }, { merge: true }).catch(console.warn);
            }
            return voidedInv;
          }
          return inv;
        });

        // 3. Clear tenant directory unit assignment and owner association if unaccepted
        const updatedTenants = prev.tenants.map((t) => {
          if (t.id === targetReq.tenantId || (targetReq.tenantEmail && t.email?.toLowerCase().trim() === targetReq.tenantEmail.toLowerCase().trim())) {
            const tUnitClean = (t.unit || '').toLowerCase().trim();
            const nextUnits = (t.unitsRented || []).filter((uN) => (uN || '').toLowerCase().trim() !== cleanTargetUnit && uN !== targetReq.unitId);
            const isMatchUnit = (cleanTargetUnit && tUnitClean === cleanTargetUnit) || t.unit === targetReq.unitId;
            const remainingUnits = nextUnits.length > 0;

            const upTenant = {
              ...t,
              unitsRented: nextUnits,
              unit: isMatchUnit ? (remainingUnits ? nextUnits[0] : 'Unassigned') : t.unit,
              ownerId: remainingUnits ? t.ownerId : (t.ownerId === targetReq.ownerId ? '' : t.ownerId),
              propertyId: remainingUnits ? t.propertyId : (t.propertyId === targetReq.propertyId ? '' : t.propertyId),
              propertyName: remainingUnits ? t.propertyName : 'Unassigned',
              rent: remainingUnits ? t.rent : 0,
              deposit: remainingUnits ? t.deposit : 0,
            };
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'tenants', t.id), upTenant, { merge: true }).catch(console.warn);
            }
            return upTenant;
          }
          return t;
        });

        const notif: MobileInAppNotification = {
          id: `notif-req-dec-${Date.now()}`,
          title: 'Tenancy Invitation Declined',
          body: `${targetReq.tenantName} declined the invitation for Unit ${unitNum}. Unit has been returned to vacant, active lease cancelled, and pending invoices voided.`,
          category: 'leases',
          isRead: false,
          createdAt: new Date().toISOString(),
        };

        return {
          ...prev,
          tenancyRequests: updatedRequests,
          units: updatedUnits,
          properties: updatedProperties,
          agreements: updatedAgreements,
          invoices: updatedInvoices,
          tenants: updatedTenants,
          notifications: [notif, ...prev.notifications],
        };
      }

      return {
        ...prev,
        tenancyRequests: updatedRequests,
      };
    });
  };

  const approveSignedAgreement = async (
    agreementId: string,
    signatoryName?: string,
    notes?: string
  ): Promise<string> => {
    let depositInvoiceId = '';
    setState((prev) => {
      const targetAg = prev.agreements.find((a) => a.id === agreementId);
      if (!targetAg) return prev;

      const depAmount = targetAg.deposit || (targetAg.rent * 2) || 1000;
      depositInvoiceId = targetAg.depositInvoiceId || `INV-DEP-${targetAg.id}`;

      const depInvoice: MobileInvoice = {
        id: depositInvoiceId,
        ownerId: targetAg.ownerId,
        propertyId: targetAg.propertyId,
        tenant: targetAg.tenant,
        tenantId: targetAg.tenantId,
        unit: targetAg.unit,
        propertyName: targetAg.propertyName,
        amount: depAmount,
        tax: 0,
        total: depAmount,
        due: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        status: 'sent',
        currency: targetAg.currency || DEFAULT_CURRENCY_SYMBOL,
        type: 'deposit',
        invoiceType: 'deposit',
        leaseAgreementId: targetAg.id,
        items: [{ description: `Refundable Security Deposit - Unit ${targetAg.unit}`, amount: depAmount }],
        createdAt: new Date().toISOString(),
      };

      const updatedAg: MobileAgreement = {
        ...targetAg,
        status: 'pending_deposit',
        depositInvoiceId,
        depositStatus: 'unpaid',
        rejectionReason: undefined,
        rejectedAt: undefined,
      };

      if (isFirebaseConfigured) {
        setDoc(doc(db, 'agreements', targetAg.id), {
          ...updatedAg,
          rejectionReason: null,
          rejectedAt: null,
        }, { merge: true }).catch(console.warn);
        setDoc(doc(db, 'invoices', depInvoice.id), depInvoice, { merge: true }).catch(console.warn);
      }

      const notif: MobileInAppNotification = {
        id: `notif-appr-${Date.now()}`,
        title: 'Lease Approved! Security Deposit Requested 📄',
        body: `Lease for Unit ${targetAg.unit} approved by landlord. Please pay the refundable security deposit of ${formatCurrencyAmount(depAmount, targetAg.currency)} (${depositInvoiceId}) to complete move-in.`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
        relatedEntityId: targetAg.id,
      };

      return {
        ...prev,
        agreements: prev.agreements.map((a) => (a.id === agreementId ? updatedAg : a)),
        invoices: [depInvoice, ...prev.invoices.filter((i) => i.id !== depInvoice.id)],
        notifications: [notif, ...prev.notifications],
      };
    });
    return depositInvoiceId;
  };

  const rejectSignedAgreement = async (
    agreementId: string,
    reason: string
  ): Promise<void> => {
    setState((prev) => {
      const targetAg = prev.agreements.find((a) => a.id === agreementId);
      if (!targetAg) return prev;

      const updatedAg: MobileAgreement = {
        ...targetAg,
        status: 'awaiting_tenant_upload',
        signedDocumentUrl: undefined,
        signedDocumentName: undefined,
        signedUploadedAt: undefined,
        rejectionReason: reason || 'Document requires corrections or re-signing.',
        rejectedAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured) {
        setDoc(doc(db, 'agreements', targetAg.id), {
          status: 'awaiting_tenant_upload',
          signedDocumentUrl: null,
          signedDocumentName: null,
          signedUploadedAt: null,
          rejectionReason: reason || 'Document requires corrections or re-signing.',
          rejectedAt: new Date().toISOString(),
        }, { merge: true }).catch(console.warn);
      }

      const notif: MobileInAppNotification = {
        id: `notif-rej-${Date.now()}`,
        title: 'Signed Agreement Rejected by Landlord ⚠️',
        body: `Uploaded agreement for Unit ${targetAg.unit} was rejected by your landlord. Reason: "${reason || 'Please re-upload corrected document.'}". Please re-upload your document.`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
        relatedEntityId: targetAg.id,
      };

      return {
        ...prev,
        agreements: prev.agreements.map((a) => (a.id === agreementId ? updatedAg : a)),
        notifications: [notif, ...prev.notifications],
      };
    });
  };

  const requestLeaseRenewal = async (unit: string, tenantNotes?: string, propertyId?: string) => {
    const tenantRec = state.tenants.find((t) => t.unit === unit && (!propertyId || !t.propertyId || t.propertyId === propertyId));
    const agreement = state.agreements.find(
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || (a.status as string) === 'signed' || a.status === 'pending_deposit')
    );
    const resolvedOwnerId = agreement?.ownerId || tenantRec?.ownerId || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const leaseEnd = agreement?.renewalTerms?.newLeaseEnd || agreement?.end || tenantRec?.leaseEnd || 'Next Year';
    const effectiveRent = Number(agreement?.renewalTerms?.newRent || agreement?.rent || tenantRec?.rent) || 0;
    const daysLeft = leaseEnd && !isNaN(new Date(leaseEnd).getTime())
      ? Math.max(0, Math.ceil((new Date(leaseEnd).getTime() - Date.now()) / (1000 * 3600 * 24)))
      : 60;
    const effPropId = propertyId || agreement?.propertyId || tenantRec?.propertyId;
    const effPropName = tenantRec?.propertyName || (effPropId ? state.properties.find((p) => p.id === effPropId)?.name : '') || 'Residence Property';

    const renItem: MobileRenewalItem = {
      id: `REN-${effPropId ? effPropId.slice(-6) + '-' : ''}${unit}-${Date.now().toString().slice(-4)}`,
      unit,
      tenant: tenantName,
      tenantId: agreement?.tenantId || tenantRec?.id,
      ownerId: resolvedOwnerId,
      propertyId: effPropId,
      propertyName: effPropName,
      currency: agreement?.currency || tenantRec?.currency || DEFAULT_CURRENCY_SYMBOL,
      currentRent: effectiveRent,
      leaseEnd,
      daysLeft,
      status: 'renewal_requested',
      requestedAt: new Date().toISOString(),
      tenantNotes,
    };

    const notif: MobileInAppNotification = {
      id: `notif_${Date.now()}_o`,
      userId: resolvedOwnerId,
      title: 'Tenant Requested Lease Renewal',
      body: `${tenantName} has requested to renew their lease for Unit ${unit} (${effPropName}). Review terms and propose renewal terms.`,
      category: 'leases',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      renewals: [
        ...(prev.renewals || []).filter((r) => !(r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId))),
        renItem,
      ],
      notifications: resolvedOwnerId ? [notif, ...(prev.notifications || [])] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      const docKey = effPropId ? `${effPropId}_${unit}` : unit;
      setDoc(doc(db, 'renewals', docKey), renItem, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'renewals', unit), renItem, { merge: true }).catch(console.warn);
      if (resolvedOwnerId) {
        setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
      }
    }
  };

  const offerLeaseRenewal = async (
    unit: string,
    terms: {
      currentRent: number;
      percentageIncrease: number;
      proposedRent: number;
      termMonths: number;
      newLeaseStart: string;
      newLeaseEnd: string;
      ownerNotes?: string;
      ownerAgreementFileUrl?: string | null;
      ownerAgreementFileName?: string | null;
      ownerAgreementFileSize?: number | null;
      currency?: string;
      propertyId?: string;
    }
  ) => {
    const effPropId = terms.propertyId;
    const tenantRec = state.tenants.find((t) => t.unit === unit && (!effPropId || !t.propertyId || t.propertyId === effPropId));
    const agreement = state.agreements.find(
      (a) => a.unit === unit && (!effPropId || !a.propertyId || a.propertyId === effPropId) && (a.status === 'active' || a.status === 'pending_approval' || a.status === 'pending_deposit')
    );
    const resolvedTenantId = agreement?.tenantId || tenantRec?.id || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const rentIncreaseAmount = Math.max(0, terms.proposedRent - terms.currentRent);
    const effectiveLeaseEnd = agreement?.renewalTerms?.newLeaseEnd || agreement?.end || tenantRec?.leaseEnd || '';
    const daysLeft = effectiveLeaseEnd && !isNaN(new Date(effectiveLeaseEnd).getTime())
      ? Math.max(0, Math.ceil((new Date(effectiveLeaseEnd).getTime() - Date.now()) / (1000 * 3600 * 24)))
      : 60;
    const renewalCurrency = terms.currency || agreement?.currency || tenantRec?.currency || DEFAULT_CURRENCY_SYMBOL;
    const resolvedPropId = effPropId || agreement?.propertyId || tenantRec?.propertyId;

    const updatedItem: MobileRenewalItem = {
      id: `REN-${resolvedPropId ? resolvedPropId.slice(-6) + '-' : ''}${unit}-${Date.now().toString().slice(-4)}`,
      unit,
      tenant: tenantName,
      tenantId: resolvedTenantId,
      ownerId: agreement?.ownerId || tenantRec?.ownerId,
      propertyId: resolvedPropId,
      propertyName: tenantRec?.propertyName || agreement?.propertyName,
      currentRent: terms.currentRent,
      percentageIncrease: terms.percentageIncrease,
      proposedRent: terms.proposedRent,
      currency: renewalCurrency,
      rentIncreaseAmount,
      termMonths: terms.termMonths,
      leaseEnd: effectiveLeaseEnd,
      newLeaseStart: terms.newLeaseStart,
      newLeaseEnd: terms.newLeaseEnd,
      daysLeft,
      status: 'renewal_offered',
      offeredAt: new Date().toISOString(),
      ownerNotes: terms.ownerNotes,
      ownerAgreementFileUrl: terms.ownerAgreementFileUrl || null,
      ownerAgreementFileName: terms.ownerAgreementFileName || null,
      ownerAgreementFileSize: terms.ownerAgreementFileSize || null,
    };

    const notif: MobileInAppNotification = {
      id: `notif_${Date.now()}_t`,
      userId: resolvedTenantId,
      title: 'Lease Renewal Offer Received',
      body: `Your landlord proposed renewal terms (+${terms.percentageIncrease}%: ${formatCurrencyAmount(terms.proposedRent, renewalCurrency)}/mo) for Unit ${unit}. Please review and sign.`,
      category: 'leases',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      renewals: [
        ...(prev.renewals || []).filter(
          (r) => !(r.unit === unit && (!resolvedPropId || !r.propertyId || r.propertyId === resolvedPropId))
        ),
        updatedItem,
      ],
      notifications: [notif, ...(prev.notifications || [])],
    }));

    if (isFirebaseConfigured) {
      const docKey = resolvedPropId ? `${resolvedPropId}_${unit}` : unit;
      setDoc(doc(db, 'renewals', docKey), updatedItem, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'renewals', unit), updatedItem, { merge: true }).catch(console.warn);
      if (resolvedTenantId) {
        setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
      }
    }
  };

  const submitTenantSignedRenewal = async (
    unit: string,
    fileData: string,
    fileName: string,
    fileSize?: number,
    propertyId?: string
  ) => {
    const existingRenewal = (state.renewals || []).find(
      (r) => r.unit === unit && (!propertyId || !r.propertyId || r.propertyId === propertyId)
    );
    if (!existingRenewal) return;

    const tenantRec = state.tenants.find((t) => t.unit === unit && (!propertyId || !t.propertyId || t.propertyId === propertyId));
    const agreement = state.agreements.find(
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || (a.status as string) === 'signed' || a.status === 'pending_deposit')
    );
    const resolvedOwnerId = agreement?.ownerId || tenantRec?.ownerId || existingRenewal.ownerId || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const effPropId = propertyId || existingRenewal.propertyId || agreement?.propertyId || tenantRec?.propertyId;

    const updatedItem: MobileRenewalItem = {
      ...existingRenewal,
      status: 'signed_by_tenant',
      tenantSignedFileUrl: fileData,
      tenantSignedFileName: fileName,
      tenantSignedFileSize: fileSize || null,
      tenantSignedAt: new Date().toISOString(),
    };

    const ownerNotif: MobileInAppNotification = {
      id: `notif_${Date.now()}_o`,
      userId: resolvedOwnerId,
      title: 'Tenant Signed Renewal Agreement!',
      body: `${tenantName} has signed and uploaded the renewal agreement for Unit ${unit}. Please review and approve.`,
      category: 'leases',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      renewals: (prev.renewals || []).map((r) =>
        r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedItem : r
      ),
      notifications: resolvedOwnerId ? [ownerNotif, ...(prev.notifications || [])] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      const docKey = effPropId ? `${effPropId}_${unit}` : unit;
      setDoc(doc(db, 'renewals', docKey), updatedItem, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'renewals', unit), updatedItem, { merge: true }).catch(console.warn);
      if (resolvedOwnerId) {
        setDoc(doc(db, 'notifications', ownerNotif.id), ownerNotif).catch(console.warn);
      }
    }
  };

  const respondToLeaseRenewal = async (
    unit: string,
    decision: 'accepted' | 'rejected',
    feedback?: string,
    propertyId?: string
  ) => {
    const existingRenewal = (state.renewals || []).find(
      (r) => r.unit === unit && (!propertyId || !r.propertyId || r.propertyId === propertyId)
    );
    if (!existingRenewal) return;

    const tenantRec = state.tenants.find((t) => t.unit === unit && (!propertyId || !t.propertyId || t.propertyId === propertyId));
    const agreement = state.agreements.find(
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || (a.status as string) === 'signed' || a.status === 'pending_deposit')
    );
    const resolvedOwnerId = agreement?.ownerId || tenantRec?.ownerId || existingRenewal.ownerId || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const effPropId = propertyId || existingRenewal.propertyId || agreement?.propertyId || tenantRec?.propertyId;

    if (decision === 'accepted') {
      const newRent = existingRenewal.proposedRent || existingRenewal.currentRent || agreement?.rent || 0;
      const newEnd = existingRenewal.newLeaseEnd || agreement?.end || '';
      const effectiveStart = existingRenewal.newLeaseStart || agreement?.end || '';

      const updatedRenewal: MobileRenewalItem = {
        ...existingRenewal,
        status: 'accepted',
        respondedAt: new Date().toISOString(),
        tenantNotes: feedback,
      };

      let updatedAgreements = state.agreements;
      if (agreement) {
        const renewedAg: MobileAgreement = {
          ...agreement,
          end: newEnd,
          rent: newRent,
          renewalTerms: {
            effectiveDate: effectiveStart,
            previousRent: existingRenewal.currentRent || agreement.rent,
            newRent,
            percentageIncrease: existingRenewal.percentageIncrease || 0,
            newLeaseEnd: newEnd,
            acceptedAt: new Date().toISOString(),
            ownerNotes: existingRenewal.ownerNotes,
          },
        };
        updatedAgreements = state.agreements.map((a) => (a.id === agreement.id ? renewedAg : a));
      }

      const updatedTenants = state.tenants.map((t) =>
        t.unit === unit && (!effPropId || !t.propertyId || t.propertyId === effPropId)
          ? { ...t, leaseEnd: newEnd, rent: newRent }
          : t
      );

      const unitObj = state.units.find(
        (u) => (u.unitNumber === unit || u.id === unit) && (!effPropId || !u.propertyId || u.propertyId === effPropId)
      );
      const updatedUnits = state.units.map((u) =>
        u.id === unitObj?.id ? { ...u, rent: newRent } : u
      );

      const renCurr = existingRenewal.currency || agreement?.currency || tenantRec?.currency || DEFAULT_CURRENCY_SYMBOL;
      const renRentStr = formatCurrencyAmount(newRent, renCurr);

      const ownerNotif: MobileInAppNotification = {
        id: `notif_${Date.now()}_o`,
        userId: resolvedOwnerId,
        title: 'Lease Renewal Accepted!',
        body: `${tenantName} has accepted the lease renewal terms for Unit ${unit} at ${renRentStr}/mo (effective ${effectiveStart}).`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      const tenantNotif: MobileInAppNotification = {
        id: `notif_${Date.now()}_t`,
        userId: existingRenewal.tenantId || tenantRec?.id || '',
        title: 'Lease Renewal Confirmed',
        body: `You accepted the renewal terms for Unit ${unit}. New lease end: ${newEnd} (Rent: ${renRentStr}/mo).`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        agreements: updatedAgreements,
        tenants: updatedTenants,
        units: updatedUnits,
        renewals: (prev.renewals || []).map((r) =>
          r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedRenewal : r
        ),
        notifications: [
          ...(resolvedOwnerId ? [ownerNotif] : []),
          ...(existingRenewal.tenantId || tenantRec?.id ? [tenantNotif] : []),
          ...(prev.notifications || []),
        ],
      }));

      if (isFirebaseConfigured) {
        const docKey = effPropId ? `${effPropId}_${unit}` : unit;
        setDoc(doc(db, 'renewals', docKey), updatedRenewal, { merge: true }).catch(console.warn);
        setDoc(doc(db, 'renewals', unit), updatedRenewal, { merge: true }).catch(console.warn);
        if (agreement) {
          setDoc(doc(db, 'agreements', agreement.id), { end: newEnd, rent: newRent }, { merge: true }).catch(console.warn);
        }
        if (resolvedOwnerId) {
          setDoc(doc(db, 'notifications', ownerNotif.id), ownerNotif).catch(console.warn);
        }
        if (existingRenewal.tenantId || tenantRec?.id) {
          setDoc(doc(db, 'notifications', tenantNotif.id), tenantNotif).catch(console.warn);
        }
      }
    } else {
      // Rejected
      const updatedRenewal: MobileRenewalItem = {
        ...existingRenewal,
        status: 'rejected',
        respondedAt: new Date().toISOString(),
        tenantNotes: feedback,
      };

      const ownerNotif: MobileInAppNotification = {
        id: `notif_${Date.now()}_o`,
        userId: resolvedOwnerId,
        title: 'Lease Renewal Declined',
        body: `${tenantName} has declined the renewal offer for Unit ${unit}.${feedback ? ` Reason: "${feedback}"` : ''}`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      const tenantNotif: MobileInAppNotification = {
        id: `notif_${Date.now()}_t`,
        userId: existingRenewal.tenantId || tenantRec?.id || '',
        title: 'Lease Renewal Offer Declined',
        body: `You declined the lease renewal offer for Unit ${unit}. Your existing lease end date remains in effect.`,
        category: 'leases',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        renewals: (prev.renewals || []).map((r) =>
          r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedRenewal : r
        ),
        notifications: [
          ...(resolvedOwnerId ? [ownerNotif] : []),
          ...(existingRenewal.tenantId || tenantRec?.id ? [tenantNotif] : []),
          ...(prev.notifications || []),
        ],
      }));

      if (isFirebaseConfigured) {
        const docKey = effPropId ? `${effPropId}_${unit}` : unit;
        setDoc(doc(db, 'renewals', docKey), updatedRenewal, { merge: true }).catch(console.warn);
        setDoc(doc(db, 'renewals', unit), updatedRenewal, { merge: true }).catch(console.warn);
        if (resolvedOwnerId) {
          setDoc(doc(db, 'notifications', ownerNotif.id), ownerNotif).catch(console.warn);
        }
        if (existingRenewal.tenantId || tenantRec?.id) {
          setDoc(doc(db, 'notifications', tenantNotif.id), tenantNotif).catch(console.warn);
        }
      }
    }
  };

  const approveLeaseRenewal = async (unit: string, propertyId?: string) => {
    const existingRenewal = (state.renewals || []).find(
      (r) => r.unit === unit && (!propertyId || !r.propertyId || r.propertyId === propertyId)
    );
    if (!existingRenewal) return;

    const tenantRec = state.tenants.find((t) => t.unit === unit && (!propertyId || !t.propertyId || t.propertyId === propertyId));
    const currentAgreement = state.agreements.find(
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || a.status === 'pending_approval' || a.status === 'pending_deposit')
    );
    const resolvedOwnerId = currentAgreement?.ownerId || tenantRec?.ownerId || existingRenewal.ownerId || '';
    const tenantName = currentAgreement?.tenant || tenantRec?.name || 'Resident';
    const tenantId = currentAgreement?.tenantId || tenantRec?.id || existingRenewal.tenantId || '';
    const newRent = existingRenewal.proposedRent || existingRenewal.currentRent || currentAgreement?.rent || 0;
    const newStart = existingRenewal.newLeaseStart || currentAgreement?.end || '';
    const newEnd = existingRenewal.newLeaseEnd || '';
    const effPropId = propertyId || existingRenewal.propertyId || currentAgreement?.propertyId || tenantRec?.propertyId || 'prop-1';

    const updatedRenewal: MobileRenewalItem = {
      ...existingRenewal,
      status: 'accepted',
      ownerApprovedAt: new Date().toISOString(),
    };

    const renewalAgId = `AG-REN-${Math.floor(1000 + Math.random() * 9000)}`;
    const renewalAgreement: MobileAgreement = {
      id: renewalAgId,
      ownerId: resolvedOwnerId,
      ownerName: currentAgreement?.ownerName || 'Property Owner',
      propertyId: effPropId,
      propertyName: currentAgreement?.propertyName || tenantRec?.propertyName || 'Palm Residency',
      unit,
      tenant: tenantName,
      tenantId,
      tenantEmail: currentAgreement?.tenantEmail || tenantRec?.email,
      tenantPhone: currentAgreement?.tenantPhone || tenantRec?.phone,
      executionMode: 'digital_dispatch',
      signedDocumentUrl: existingRenewal.tenantSignedFileUrl || undefined,
      signedDocumentName: existingRenewal.tenantSignedFileName || `Renewal_Agreement_${unit}.pdf`,
      signedUploadedAt: existingRenewal.tenantSignedAt,
      start: newStart,
      end: newEnd,
      rent: newRent,
      deposit: currentAgreement?.deposit || tenantRec?.deposit || 0,
      currency: currentAgreement?.currency || tenantRec?.currency || existingRenewal.currency || DEFAULT_CURRENCY_SYMBOL,
      escalationPercent: existingRenewal.percentageIncrease || 8,
      lockInMonths: 11,
      noticePeriodDays: 30,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const unitObj = state.units.find(
      (u) => (u.unitNumber === unit || u.id === unit) && (!effPropId || !u.propertyId || u.propertyId === effPropId)
    );

    const updatedTenants = state.tenants.map((t) =>
      t.id === tenantId || (t.unit === unit && (!effPropId || t.propertyId === effPropId))
        ? { ...t, rent: newRent, leaseEnd: newEnd }
        : t
    );

    const updatedUnits = state.units.map((u) =>
      u.id === unitObj?.id
        ? { ...u, rent: newRent }
        : u
    );

    const updatedAgreements = [...state.agreements.filter((a) => a.id !== renewalAgId), renewalAgreement];

    const tenantNotif: MobileInAppNotification = {
      id: `notif_${Date.now()}_t`,
      userId: tenantId,
      title: 'Lease Renewal Finalized & Active! 🎉',
      body: `Your landlord has approved and activated your lease renewal for Unit ${unit}. Extended through ${newEnd} at ${formatCurrencyAmount(newRent, renewalAgreement.currency)}/mo.`,
      category: 'leases',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      agreements: updatedAgreements,
      tenants: updatedTenants,
      units: updatedUnits,
      renewals: (prev.renewals || []).map((r) =>
        r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedRenewal : r
      ),
      notifications: tenantId ? [tenantNotif, ...(prev.notifications || [])] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      const docKey = effPropId ? `${effPropId}_${unit}` : unit;
      setDoc(doc(db, 'agreements', renewalAgId), renewalAgreement, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'renewals', docKey), updatedRenewal, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'renewals', unit), updatedRenewal, { merge: true }).catch(console.warn);
      if (unitObj) {
        setDoc(doc(db, 'units', unitObj.id), { rent: newRent }, { merge: true }).catch(console.warn);
      }
      if (tenantId) {
        setDoc(doc(db, 'tenants', tenantId), { rent: newRent, leaseEnd: newEnd }, { merge: true }).catch(console.warn);
        setDoc(doc(db, 'notifications', tenantNotif.id), tenantNotif).catch(console.warn);
      }
    }
  };

  const createPlatformSupportTicket = async (
    ticket: Omit<MobilePlatformSupportTicket, 'id' | 'createdAt' | 'status'> & { id?: string }
  ): Promise<MobilePlatformSupportTicket> => {
    const fullTicket: MobilePlatformSupportTicket = {
      ...ticket,
      id: ticket.id || `TKT-${Math.floor(10000 + Math.random() * 90000)}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      platformSupport: [fullTicket, ...(prev.platformSupport || [])],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformSupport', fullTicket.id), fullTicket);
      } catch (err) {
        console.warn('Firestore createPlatformSupportTicket error:', err);
      }
    }

    return fullTicket;
  };

  const resolvePlatformSupportTicket = async (ticketId: string, reply?: string): Promise<void> => {
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      platformSupport: (prev.platformSupport || []).map((t) =>
        t.id === ticketId ? { ...t, status: 'resolved', resolvedAt: now, ...(reply ? { reply } : {}) } : t
      ),
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(
          doc(db, 'platformSupport', ticketId),
          { status: 'resolved', resolvedAt: now, ...(reply ? { reply } : {}) },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore resolvePlatformSupportTicket error:', err);
      }
    }
  };

  const saveReview = async (review: MobileTenantReview): Promise<void> => {
    const fullReview: MobileTenantReview = {
      ...review,
      id: review.id || `rev-${Date.now()}`,
      createdAt: review.createdAt || new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      reviews: [fullReview, ...(prev.reviews || []).filter((r) => r.id !== fullReview.id)],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'reviews', fullReview.id), fullReview);
      } catch (err) {
        console.warn('Firestore saveReview error:', err);
      }
    }
  };

  const savePlatformInvoice = async (invoice: MobilePlatformInvoice) => {
    setState((prev) => ({
      ...prev,
      platformInvoices: [invoice, ...(prev.platformInvoices || []).filter((i) => i.id !== invoice.id)],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformInvoices', invoice.id), invoice, { merge: true });
      } catch (err) {
        console.warn('Firestore savePlatformInvoice error:', err);
      }
    }
  };

  const saveOwnerSettings = async (ownerId: string, settings: Partial<MobileOwnerSettings>) => {
    setState((prev) => ({
      ...prev,
      ownerSettings: {
        ...prev.ownerSettings,
        [ownerId]: {
          ...(prev.ownerSettings[ownerId] || {}),
          ...settings,
          ownerId,
        } as MobileOwnerSettings,
      },
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'owners', ownerId), settings, { merge: true });
      } catch (err) {
        console.warn('Firestore saveOwnerSettings sync error:', err);
      }
    }
  };

  const isOwnerPlanActive = (ownerId?: string): boolean => {
    const targetOwner = ownerId;
    if (!targetOwner) return false;

    // Check if owner has an active/paid platform invoice
    const hasPaidInvoice = (state.platformInvoices || []).some(
      (inv) =>
        inv.status === 'paid' &&
        inv.ownerId === targetOwner &&
        (!inv.periodEnd || new Date(inv.periodEnd).getTime() > Date.now())
    );
    if (hasPaidInvoice) return true;

    // Check specific ownerSettings
    const settings = state.ownerSettings[targetOwner];

    if (settings) {
      if (settings.planStatus === 'active') {
        if (!settings.subscriptionEndsAt) return true;
        return new Date(settings.subscriptionEndsAt).getTime() > Date.now();
      }
      if (settings.planStatus === 'trialing') {
        const dynamicTrialDays = typeof state.defaultTrialDays === 'number'
          ? state.defaultTrialDays
          : 14;
        if (dynamicTrialDays === 0) return false;
        if (!settings.trialEndsAt) return true;
        return new Date(settings.trialEndsAt).getTime() > Date.now();
      }
      if (settings.planStatus === 'expired' || settings.planStatus === 'past_due') {
        return false;
      }
    }

    // Dynamic global trial policy
    const dynamicTrialDays = typeof state.defaultTrialDays === 'number'
      ? state.defaultTrialDays
      : 14;
    return dynamicTrialDays > 0;
  };

  const logCommunication = async (entry: Omit<MobileCommunicationLog, 'id' | 'createdAt'>): Promise<string> => {
    const logId = `COMM-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    // Accurate initial delivery status based on requested channels
    const wantsInApp = entry.channels.includes('in_app');
    const wantsEmail = entry.channels.includes('email');
    const wantsSms = entry.channels.includes('sms');

    const deliveryStatus: MobileCommunicationLog['deliveryStatus'] = {
      inApp: wantsInApp ? 'delivered' : 'not_requested',
      email: wantsEmail ? (entry.recipientContact?.email ? 'delivered' : 'skipped') : 'not_requested',
      sms: wantsSms ? (entry.recipientContact?.phone ? 'delivered' : 'skipped') : 'not_requested',
    };

    let smsSid: string | undefined = entry.smsSid;
    let emailMessageId: string | undefined = entry.emailMessageId;
    let errorMessage: string | undefined = entry.errorMessage;

    // Check cloud comms gateway configuration
    const hasSg = Boolean(state.commsConfig?.sendgridKey);
    const hasTw = Boolean(state.commsConfig?.twilioSid && state.commsConfig?.twilioAuthToken);

    if (isFirebaseConfigured && (wantsEmail || wantsSms)) {
      if ((wantsEmail && hasSg) || (wantsSms && hasTw)) {
        try {
          const sendFn = httpsCallable<any, any>(functions, 'sendReminderNotification');
          const channelParam = (wantsEmail && hasSg && wantsSms && hasTw)
            ? 'both'
            : (wantsSms && hasTw)
            ? 'sms'
            : 'email';

          const res = await sendFn({
            targetUserId: entry.recipientId,
            title: entry.title,
            message: entry.body,
            channel: channelParam,
            targetPhone: (wantsSms && hasTw) ? entry.recipientContact?.phone : undefined,
            targetEmail: (wantsEmail && hasSg) ? entry.recipientContact?.email : undefined,
            commsConfig: state.commsConfig,
          });

          if (wantsEmail && hasSg) {
            const statusStr = String(res.data?.emailStatus || '');
            deliveryStatus.email = statusStr.includes('delivered') ? 'delivered' : 'failed';
            emailMessageId = res.data?.emailMessageId;
          }
          if (wantsSms && hasTw) {
            const statusStr = String(res.data?.smsStatus || '');
            deliveryStatus.sms = statusStr.includes('delivered') ? 'delivered' : 'failed';
            smsSid = res.data?.smsSid;
          }
        } catch (err: any) {
          console.warn('External comms dispatch error:', err);
          if (wantsEmail && hasSg) deliveryStatus.email = 'failed';
          if (wantsSms && hasTw) deliveryStatus.sms = 'failed';
          errorMessage = err?.message || 'Dispatch failed';
        }
      }
    }

    // In-App Notification dispatch
    if (wantsInApp) {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const notifItem: MobileInAppNotification = {
        id: notifId,
        title: entry.title,
        body: entry.body,
        category: entry.category === 'maintenance' ? 'repairs' : entry.category === 'leasing' ? 'leases' : 'bills',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        notifications: [notifItem, ...(prev.notifications || [])],
      }));
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'notifications', notifId), notifItem).catch(console.warn);
      }
    }

    const fullLog: MobileCommunicationLog = {
      ...entry,
      id: logId,
      createdAt: new Date().toISOString(),
      deliveryStatus,
      smsSid,
      emailMessageId,
      errorMessage,
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'communicationLogs', logId), fullLog).catch(console.warn);
    }

    setState((prev) => ({
      ...prev,
      communicationLogs: [fullLog, ...(prev.communicationLogs || [])],
    }));

    return logId;
  };

  const saveCommsConfig = async (config: Partial<MobileCommsConfig>): Promise<void> => {
    setState((prev) => ({
      ...prev,
      commsConfig: {
        ...prev.commsConfig,
        ...config,
      },
    }));
    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'platformConfig', 'comms'), { commsConfig: config }, { merge: true }).catch(console.warn);
    }
  };

  const updateAgreementAutopay = async (
    agreementId: string,
    autopayData: Partial<NonNullable<MobileAgreement['autopay']>>
  ): Promise<void> => {
    setState((prev) => {
      const targetAg = prev.agreements.find((a) => a.id === agreementId);
      if (!targetAg) return prev;
      const updatedAutopay = {
        ...(targetAg.autopay || {}),
        ...autopayData,
        updatedAt: new Date().toISOString(),
      };
      const updatedAg: MobileAgreement = {
        ...targetAg,
        autopay: updatedAutopay as any,
      };
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'agreements', targetAg.id), { autopay: updatedAutopay }, { merge: true }).catch(console.warn);
      }
      return {
        ...prev,
        agreements: prev.agreements.map((a) => (a.id === agreementId ? updatedAg : a)),
      };
    });
  };

  const cancelAgreementAutopay = async (agreementId: string): Promise<void> => {
    await updateAgreementAutopay(agreementId, {
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });
  };

  const updateOwnerAutopay = async (
    ownerId: string,
    mandateData: Partial<NonNullable<MobileOwnerSettings['subscriptionMandate']>>
  ): Promise<void> => {
    setState((prev) => {
      const existingSettings = prev.ownerSettings[ownerId] || {
        ownerId,
        planId: '',
        planName: '',
        planStatus: 'active',
        trialEndsAt: null,
        subscriptionEndsAt: null,
      };
      const updatedMandate = {
        ...(existingSettings.subscriptionMandate || {}),
        ...mandateData,
        updatedAt: new Date().toISOString(),
      };
      const updatedSettings: MobileOwnerSettings = {
        ...existingSettings,
        autoRenew: mandateData.autoRenew !== undefined ? mandateData.autoRenew : existingSettings.autoRenew,
        cancelsAtPeriodEnd: mandateData.autoRenew !== undefined ? !mandateData.autoRenew : existingSettings.cancelsAtPeriodEnd,
        subscriptionMandate: updatedMandate as any,
      };
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'owners', ownerId), {
          autoRenew: updatedSettings.autoRenew,
          cancelsAtPeriodEnd: updatedSettings.cancelsAtPeriodEnd,
          subscriptionMandate: updatedMandate,
        }, { merge: true }).catch(console.warn);
      }
      return {
        ...prev,
        ownerSettings: {
          ...prev.ownerSettings,
          [ownerId]: updatedSettings,
        },
      };
    });
  };

  const cancelOwnerAutopay = async (ownerId: string): Promise<void> => {
    await updateOwnerAutopay(ownerId, {
      status: 'cancelled',
      autoRenew: false,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <MobileAppDataContext.Provider
      value={{
        state,
        planUsage,
        saveProperty,
        saveUnit,
        deleteUnit,
        saveAgreement,
        saveAgreementTemplate,
        deleteAgreementTemplate,
        deleteAgreement,
        addAgreement: saveAgreement,
        updateAgreement,
        saveInvoice,
        markInvoicePaid,
        waiveInvoiceLateFee,
        updateLateFeeSettings,
        savePayment,
        recordPayment: savePayment,
        confirmOfflinePayment,
        rejectOfflinePayment,
        savePaymentMethods,
        saveAnnouncement,
        togglePinAnnouncement,
        archiveAnnouncement,
        deleteAnnouncement,
        acknowledgeAnnouncement,
        sendTenancyRequest,
        updateTenancyRequest,
        saveTicket,
        updateTicket,
        sendStaffPaymentReminder,
        saveMoveOut,
        addMoveOut: saveMoveOut,
        updateMoveOut,
        createDepositSettlement,
        confirmCashClaim,
        rejectCashClaim,
        submitCashClaim,
        saveDispute,
        updateDispute,
        resolveDispute,
        saveTenant,
        addTenant: saveTenant,
        addStaff,
        saveManager,
        deleteManager,
        reassignManagerProperty,
        recordManagerPayout,
        saveStaffSchedule,
        deleteStaffSchedule,
        updatePlanUsage,
        markNotificationRead,
        markAllNotificationsRead,
        createPlatformSupportTicket,
        resolvePlatformSupportTicket,
        saveReview,
        savePlatformInvoice,
        saveOwnerSettings,
        isOwnerPlanActive,
        approveSignedAgreement,
        rejectSignedAgreement,
        requestLeaseRenewal,
        offerLeaseRenewal,
        submitTenantSignedRenewal,
        respondToLeaseRenewal,
        approveLeaseRenewal,
        saveDepositSettlement,
        respondToDepositSettlement,
        confirmRefundReceipt,
        logCommunication,
        saveCommsConfig,
        selectedTenantUnitId,
        setSelectedTenantUnitId,
        updateAgreementAutopay,
        cancelAgreementAutopay,
        updateOwnerAutopay,
        cancelOwnerAutopay,
      }}
    >
      {children}
    </MobileAppDataContext.Provider>
  );
};

export const useMobileAppData = () => {
  const context = useContext(MobileAppDataContext);
  if (!context) {
    throw new Error('useMobileAppData must be used within a MobileAppDataProvider');
  }
  return context;
};
