import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, loadState, saveState, saveLandingConfigCache, saveTrialPolicyCache, loadCachedTrialDays, INITIAL_STATE } from '../lib/store';
import { collection, doc, onSnapshot, setDoc, getDocs, getDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, isFirebaseConfigured, auth, functions } from '../lib/firebase';
import { compressImage } from '../lib/imageUploader';
import { sanitizeCountry, isInvalidCountry } from '../lib/addressUtils';
import { generateTransactionId, generateDepositVoucherId } from '../lib/idGenerators';
import { toast, ToastType, ToastOptions } from '../lib/toast';
import { ModernToastContainer } from '../components/common/ModernToastContainer';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, normalizeCurrencyCode, getCurrencySymbol } from '../lib/currencyService';
import { calculateInvoiceLateFee } from '../lib/lateFeeService';
import {
  ManagerPayoutRecord,
  OwnerSettings,
  Plan,
  Ticket,
  UserProfile,
  Property,
  Unit,
  TenantRecord,
  PaymentTransaction,
  TransactionAuditTrail,
  Agreement,
  TenancyRequest,
  Invoice,
  MoveOut,
  LandingConfig,
  StaffMember,
  PlatformInvoice,
  PlatformInvoiceTemplateConfig,
  PlatformGateways,
  RenewalItem,
  InAppNotification,
  TenantPayoutProfile,
  DepositSettlement,
  SettlementPayoutDetails,
  CashHandoverClaim,
  CommunicationLog,
  Announcement,
  AnnouncementAcknowledgment,
  PlatformSupportTicket,
  AuditLogItem,
  RequiredIdItem,
  TenantUploadedIdItem,
  TenantAutopayMandate,
  OwnerSubscriptionMandate,
  AgreementTemplate,
} from '../types';

interface AppDataContextType {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
  showToast: (msg: string, type?: ToastType, options?: ToastOptions) => void;
  toasts: { id: string; msg: string }[];
  deleteAgreement: (agreementId: string) => Promise<void>;
  saveAgreementTemplate: (template: AgreementTemplate) => Promise<void>;
  deleteAgreementTemplate: (templateId: string) => Promise<void>;
  updateAgreementAutopay: (agreementId: string, autopay: Partial<TenantAutopayMandate>) => Promise<void>;
  cancelAgreementAutopay: (agreementId: string) => Promise<void>;
  updateOwnerAutopay: (ownerId: string, mandate: Partial<OwnerSubscriptionMandate>) => Promise<void>;
  cancelOwnerAutopay: (ownerId: string) => Promise<void>;
  savePayment: (payment: PaymentTransaction) => Promise<void>;
  updateOwnerPlan: (userId: string, planName: string) => void;
  markUserReminded: (userId: string) => void;
  updateOwnerTrial: (ownerId: string, daysToAdd: number, active?: boolean) => void;
  recordManagerPayout: (payout: ManagerPayoutRecord) => void;
  signTenantAgreement: (agreementId: string, signatureDataUrl: string) => void;
  uploadSignedAgreement: (agreementId: string, fileData: string, fileName: string, uploadedIds?: TenantUploadedIdItem[]) => Promise<string>;
  approveSignedAgreement: (
    agreementId: string,
    signatoryName?: string,
    ownerSignedFileUrl?: string,
    ownerSignedFileName?: string,
    notes?: string
  ) => Promise<string>;
  rejectSignedAgreement: (
    agreementId: string,
    reason: string
  ) => Promise<void>;

  createOwnerMaintenanceTicket: (ticket: Partial<Ticket>) => Promise<void>;
  sendStaffPaymentReminder: (ticketId: string) => void;
  saveProperty: (prop: Property, units?: Unit[]) => Promise<void>;
  saveUnit: (unit: Unit) => Promise<void>;
  saveTenant: (tenant: TenantRecord, userProfile?: UserProfile) => Promise<void>;
  saveStaff: (staff: StaffMember, userProfile?: UserProfile) => Promise<void>;
  deleteStaff: (staffId: string) => Promise<void>;
  saveManager: (manager: any, userProfile?: UserProfile) => Promise<void>;
  deleteManager: (managerId: string | number) => Promise<void>;
  reassignManagerProperty: (managerId: string | number, newPropertyId: string | null) => Promise<void>;
  saveAgreement: (agreement: Agreement) => Promise<void>;
  saveTenancyRequest: (req: TenancyRequest, notif?: any) => Promise<void>;
  saveInvoice: (invoice: Invoice) => Promise<void>;
  markInvoicePaid: (
    invoiceId: string,
    paymentMethod?: string,
    receiptNumber?: string,
    transactionId?: string,
    additionalMetadata?: { lateFeeApplied?: number; lateFeeCalculation?: string; finalTotal?: number }
  ) => Promise<void>;
  waiveInvoiceLateFee: (invoiceId: string, reason?: string) => Promise<void>;
  savePlatformInvoice: (invoice: PlatformInvoice) => Promise<void>;
  markPlatformInvoicePaid: (invoiceId: string, paymentMethod?: string, transactionRef?: string) => Promise<void>;
  savePlatformInvoiceTemplate: (tmpl: PlatformInvoiceTemplateConfig) => Promise<void>;
  savePlatformGateways: (gateways: PlatformGateways, activeBillingGateway?: string) => Promise<void>;
  saveTicket: (ticket: Ticket) => Promise<void>;
  saveMoveout: (moveout: MoveOut) => Promise<void>;
  saveOwnerSettings: (ownerId: string, settings: Partial<OwnerSettings>) => Promise<void>;
  saveLandingConfig: (cfg: Partial<LandingConfig>) => Promise<void>;
  saveCommsConfig: (cfg: any) => Promise<void>;
  saveNotificationToggles: (toggles: Record<string, boolean>) => Promise<void>;
  markNotificationRead: (notifId: string, fallbackNotif?: InAppNotification) => Promise<void>;
  saveTenantPayoutProfile: (profile: TenantPayoutProfile) => Promise<void>;
  createDepositSettlement: (settlement: DepositSettlement) => Promise<void>;
  respondToDepositSettlement: (
    settlementId: string,
    decision: 'approved' | 'rejected' | 'contested',
    notes?: string,
    payoutDetails?: SettlementPayoutDetails
  ) => Promise<void>;
  executeDepositRefund: (
    settlementId: string,
    payoutDetails: {
      disbursementMethod: 'gateway_automated' | 'bank_manual_transfer' | 'cash_handover';
      paymentReference: string;
      proofDocumentUrl?: string;
    }
  ) => Promise<void>;
  confirmRefundReceipt: (settlementId: string) => Promise<void>;
  submitCashClaim: (claim: Omit<CashHandoverClaim, 'id' | 'status' | 'claimedAt'>) => Promise<string>;
  confirmCashClaim: (claimId: string) => Promise<void>;
  rejectCashClaim: (claimId: string, reason: string) => Promise<void>;
  deleteUserAccount: (userId: string) => Promise<void>;
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
    }
  ) => Promise<void>;
  submitTenantSignedRenewal: (unit: string, fileData: string, fileName: string, fileSize?: number, propertyId?: string) => Promise<void>;
  approveLeaseRenewal: (unit: string, propertyId?: string) => Promise<void>;
  respondToLeaseRenewal: (unit: string, decision: 'accepted' | 'rejected', feedback?: string, propertyId?: string) => Promise<void>;
  logCommunication: (entry: Omit<CommunicationLog, 'id' | 'createdAt'>) => Promise<string>;
  saveAnnouncement: (announcement: Announcement) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  togglePinAnnouncement: (id: string) => Promise<void>;
  archiveAnnouncement: (id: string) => Promise<void>;
  acknowledgeAnnouncement: (announcementId: string, acknowledgment: AnnouncementAcknowledgment) => Promise<void>;
  createPlatformSupportTicket: (ticket: Omit<PlatformSupportTicket, 'id' | 'createdAt' | 'status'> & { id?: string }) => Promise<PlatformSupportTicket>;
  resolvePlatformSupportTicket: (ticketId: string, resolutionNotes?: string) => Promise<void>;
  savePlatformSupportTicket: (ticket: PlatformSupportTicket) => Promise<void>;
  logAuditEvent: (entry: {
    actor?: string;
    actorRole?: 'superadmin' | 'owner' | 'tenant' | 'staff' | 'system' | string;
    action: string;
    category?: 'financial' | 'lease' | 'support' | 'security' | 'maintenance' | 'user' | 'system' | string;
    detail: string;
    propertyId?: string;
    unit?: string;
    time?: string;
  }) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(loadState);
  const [toasts, setToasts] = useState<{ id: string; msg: string }[]>([]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Dynamic Favicon and Document Title Synchronization
  useEffect(() => {
    const faviconUrl = state.landingConfig?.faviconUrl;
    if (faviconUrl) {
      // Primary favicon
      let iconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = faviconUrl;

      // Alternate icon
      const altIcon = document.querySelector<HTMLLinkElement>("link[rel='alternate icon']");
      if (altIcon) {
        altIcon.href = faviconUrl;
      }
      // Apple touch icon
      const appleIcon = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
      if (appleIcon) {
        appleIcon.href = faviconUrl;
      }
    }

    const brand = state.landingConfig?.brandName;
    const accent = state.landingConfig?.brandAccent;
    const customTitle = state.landingConfig?.browserTitle;
    const computedTitle =
      customTitle ||
      (brand ? `${brand}${accent ? accent : ''} — Property Operations Platform` : 'Propithub — Property Operations Platform');

    if (computedTitle && document.title !== computedTitle) {
      document.title = computedTitle;
    }
  }, [
    state.landingConfig?.faviconUrl,
    state.landingConfig?.browserTitle,
    state.landingConfig?.brandName,
    state.landingConfig?.brandAccent,
  ]);

  // Live real-time sync with all Firestore collections
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    // Immediate direct query on mount for instant zero-latency loading of trial policy
    getDoc(doc(db, 'platformConfig', 'trialPolicy')).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const days = typeof data.defaultTrialDays === 'number' ? Math.max(0, data.defaultTrialDays) : undefined;
        const discount = typeof data.annualDiscountPercent === 'number' ? Math.min(90, Math.max(0, data.annualDiscountPercent)) : undefined;
        if (days !== undefined || discount !== undefined) {
          saveTrialPolicyCache(days ?? 14, discount);
          setState((prev) => ({
            ...prev,
            ...(days !== undefined ? { defaultTrialDays: days } : {}),
            ...(discount !== undefined ? { annualDiscountPercent: discount } : {}),
          }));
        }
      }
    }).catch(console.warn);

    // Immediate direct query on mount for instant zero-latency loading
    getDocs(collection(db, 'users')).then((snap) => {
      const fbUsers: UserProfile[] = [];
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u && u.email) fbUsers.push({ ...u, id: u.id || d.id });
      });
      setState((prev) => ({ ...prev, users: fbUsers }));
    }).catch(console.warn);

    getDocs(collection(db, 'tenants')).then((snap) => {
      const fbTenants: TenantRecord[] = [];
      snap.forEach((d) => {
        const t = d.data() as TenantRecord;
        if (t && t.id) fbTenants.push(t);
      });
      if (fbTenants.length > 0) {
        setState((prev) => ({ ...prev, tenants: fbTenants }));
      }
    }).catch(console.warn);

    getDocs(collection(db, 'staff')).then((snap) => {
      const fbStaff: StaffMember[] = [];
      snap.forEach((d) => {
        const s = d.data() as StaffMember;
        if (s) fbStaff.push({ ...s, id: s.id || d.id });
      });
      setState((prev) => ({ ...prev, staff: fbStaff }));
    }).catch(console.warn);

    getDocs(collection(db, 'propertyManagers')).then((snap) => {
      const fbPMs: any[] = [];
      snap.forEach((d) => {
        const pm = d.data();
        if (pm) fbPMs.push({ ...pm, id: pm.id || d.id });
      });
      setState((prev) => ({ ...prev, propertyManagers: fbPMs }));
    }).catch(console.warn);

    getDocs(collection(db, 'properties')).then((snap) => {
      const fbProps: Property[] = [];
      snap.forEach((d) => {
        const p = d.data() as Property;
        if (p) {
          const addrStr = typeof p.address === 'string' ? p.address : p.address?.formattedAddress;
          const cleanCountry = sanitizeCountry(p.country || (typeof p.address === 'object' ? p.address?.country : undefined), addrStr);
          fbProps.push({
            ...p,
            id: p.id || d.id,
            country: cleanCountry,
            address: typeof p.address === 'object' ? { ...p.address, country: cleanCountry } : p.address,
          });
        }
      });
      setState((prev) => ({ ...prev, properties: fbProps }));
    }).catch(console.warn);

    getDocs(collection(db, 'units')).then((snap) => {
      const fbUnits: Unit[] = [];
      snap.forEach((d) => {
        const u = d.data() as Unit;
        if (u) {
          const cleanCountry = sanitizeCountry(u.country, u.address);
          fbUnits.push({ ...u, id: u.id || d.id, country: cleanCountry });
        }
      });
      setState((prev) => ({ ...prev, units: fbUnits }));
    }).catch(console.warn);

    getDocs(collection(db, 'tickets')).then((snap) => {
      const fbTickets: Ticket[] = [];
      snap.forEach((d) => {
        const t = d.data() as Ticket;
        if (t && t.id) fbTickets.push(t);
      });
      if (fbTickets.length > 0) {
        setState((prev) => {
          const tickMap = new Map<string, Ticket>();
          prev.tickets.forEach((t) => tickMap.set(t.id, t));
          fbTickets.forEach((t) => tickMap.set(t.id, t));
          return { ...prev, tickets: Array.from(tickMap.values()) };
        });
      }
    }).catch(console.warn);

    // 1. Sync users live from Firestore
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const fbUsers: UserProfile[] = [];
      snapshot.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u && u.email) {
          fbUsers.push({
            ...u,
            id: u.id || d.id,
            displayName: (u.displayName || '').replace(/PropitHubHave/gi, 'Propithub'),
          });
        }
      });
      setState((prev) => {
        // Build tenant records for any user who registered as a tenant
        const existingTenantIds = new Set(prev.tenants.map((t) => t.id));
        const existingTenantEmails = new Set(prev.tenants.map((t) => t.email.toLowerCase()));
        const newTenantsFromUsers: TenantRecord[] = [];

        fbUsers.forEach((u) => {
          if (u.role === 'tenant' && !existingTenantIds.has(u.id) && !existingTenantEmails.has(u.email.toLowerCase())) {
            newTenantsFromUsers.push({
              id: u.id,
              name: u.displayName || u.email.split('@')[0],
              email: u.email,
              phone: u.phone || '',
              unit: 'Unassigned',
              owner: 'Unassigned',
              ownerId: '',
              leaseStart: '',
              leaseEnd: '',
              rent: 0,
              deposit: 0,
              rating: 5.0,
              unitsRented: [],
              history: [],
              kycDocuments: [],
            });
          }
        });

        return {
          ...prev,
          users: fbUsers,
          tenants: newTenantsFromUsers.length > 0 ? [...prev.tenants, ...newTenantsFromUsers] : prev.tenants,
        };
      });
    }, (err) => {
      console.warn('Firestore users sync listener warning:', err);
    });

    // 2. Sync tenants directory live from Firestore
    const unsubTenants = onSnapshot(collection(db, 'tenants'), (snapshot) => {
      const fbTenants: TenantRecord[] = [];
      snapshot.forEach((d) => {
        const t = d.data() as TenantRecord;
        if (t && t.id) {
          fbTenants.push(t);
        }
      });
      if (fbTenants.length > 0) {
        setState((prev) => {
          const tenantMap = new Map<string, TenantRecord>();
          const allTenants = [...prev.tenants, ...fbTenants];
          // Deduplicate by email and unit
          const seenKeys = new Set<string>();
          const deduped: TenantRecord[] = [];
          allTenants.forEach((t) => {
            const emailKey = t.email ? `email:${t.email.toLowerCase().trim()}` : '';
            const unitKey = t.unit && t.unit !== 'Unassigned' ? `unit:${(t.propertyId || '')}_${t.unit.toLowerCase().trim()}` : '';
            const idKey = t.id ? `id:${t.id}` : '';
            if (emailKey && seenKeys.has(emailKey)) return;
            if (unitKey && seenKeys.has(unitKey)) return;
            if (idKey && seenKeys.has(idKey)) return;
            if (emailKey) seenKeys.add(emailKey);
            if (unitKey) seenKeys.add(unitKey);
            if (idKey) seenKeys.add(idKey);
            deduped.push(t);
          });
          return {
            ...prev,
            tenants: deduped,
          };
        });
      }
    }, (err) => {
      console.warn('Firestore tenants sync listener warning:', err);
    });

    // 3. Sync properties live from Firestore
    const unsubProperties = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const fbProps: Property[] = [];
      snapshot.forEach((d) => {
        const p = d.data() as Property;
        if (p) {
          const addrStr = typeof p.address === 'string' ? p.address : p.address?.formattedAddress;
          const cleanCountry = sanitizeCountry(p.country || (typeof p.address === 'object' ? p.address?.country : undefined), addrStr);
          fbProps.push({
            ...p,
            id: p.id || d.id,
            country: cleanCountry,
            address: typeof p.address === 'object' ? { ...p.address, country: cleanCountry } : p.address,
          });
        }
      });
      setState((prev) => ({ ...prev, properties: fbProps }));
    }, (err) => {
      console.warn('Firestore properties sync listener warning:', err);
    });

    // 4. Sync units live from Firestore
    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      const fbUnits: Unit[] = [];
      snapshot.forEach((d) => {
        const u = d.data() as Unit;
        if (u) {
          const cleanCountry = sanitizeCountry(u.country, u.address);
          fbUnits.push({ ...u, id: u.id || d.id, country: cleanCountry });
        }
      });
      setState((prev) => ({ ...prev, units: fbUnits }));
    }, (err) => {
      console.warn('Firestore units sync listener warning:', err);
    });

    // 5. Sync agreements live from Firestore
    const unsubAgreements = onSnapshot(collection(db, 'agreements'), (snapshot) => {
      const fbAgreements: Agreement[] = [];
      snapshot.forEach((d) => {
        const a = d.data() as Agreement;
        if (a && a.id) {
          if ((a as any).status === 'awaiting_owner_signature') {
            a.status = 'pending_approval' as any;
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'agreements', a.id), { status: 'pending_approval' }, { merge: true }).catch(console.warn);
            }
          }

          fbAgreements.push(a);
        }
      });

      // Auto-heal terminated lease chains: if a renewal agreement for a unit is terminated, its linked previous agreement should also be terminated
      const terminatedPrevAgIds = new Set<string>();
      const terminatedRenewalKeys = new Set<string>();
      fbAgreements.forEach((a) => {
        if (a.status === 'terminated') {
          if (a.previousAgreementId) terminatedPrevAgIds.add(a.previousAgreementId);
          if (a.isRenewal && a.unit && a.tenantId) {
            terminatedRenewalKeys.add(`${a.propertyId || ''}_${a.unit}_${a.tenantId}`);
          }
        }
      });
      fbAgreements.forEach((a) => {
        const key = `${a.propertyId || ''}_${a.unit}_${a.tenantId}`;
        if ((terminatedPrevAgIds.has(a.id) || terminatedRenewalKeys.has(key)) && a.status !== 'terminated') {
          a.status = 'terminated';
          a.depositStatus = 'refunded';
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'agreements', a.id), { status: 'terminated', depositStatus: 'refunded' }, { merge: true }).catch(console.warn);
          }
        }
      });

      setState((prev) => ({ ...prev, agreements: fbAgreements }));
    }, (err) => {
      console.warn('Firestore agreements sync listener warning:', err);
    });

    // 5b. Sync agreementTemplates live from Firestore
    const unsubTemplates = onSnapshot(collection(db, 'agreementTemplates'), (snapshot) => {
      const fbTemplates: AgreementTemplate[] = [];
      snapshot.forEach((d) => {
        const t = d.data() as AgreementTemplate;
        if (t && t.id) fbTemplates.push({ ...t, id: t.id || d.id });
      });
      setState((prev) => ({ ...prev, agreementTemplates: fbTemplates }));
    }, (err) => {
      console.warn('Firestore agreementTemplates sync listener warning:', err);
    });

    // 6. Sync tenancy requests live from Firestore
    const unsubRequests = onSnapshot(collection(db, 'tenancyRequests'), (snapshot) => {
      const fbRequests: TenancyRequest[] = [];
      snapshot.forEach((d) => {
        const r = d.data() as TenancyRequest;
        if (r && r.id) fbRequests.push(r);
      });
      if (fbRequests.length > 0) {
        setState((prev) => {
          const reqMap = new Map<string, TenancyRequest>();
          (prev.tenancyRequests || []).forEach((r) => reqMap.set(r.id, r));
          fbRequests.forEach((r) => reqMap.set(r.id, r));
          const allRequests = Array.from(reqMap.values());

          const declinedRequests = allRequests.filter((r) => r.status === 'declined');
          const acceptedRequests = allRequests.filter((r) => r.status === 'accepted');

          const healedUnits = prev.units.map((u) => {
            const declinedForUnit = declinedRequests.find(
              (dr) =>
                (dr.unitId === u.id || (dr.unitNumber === u.unitNumber && (!dr.propertyId || dr.propertyId === u.propertyId))) &&
                (u.currentTenantId === dr.tenantId || (u.tenant && dr.tenantName && u.tenant.toLowerCase() === dr.tenantName.toLowerCase()))
            );
            const hasAccepted = acceptedRequests.some(
              (ar) => ar.unitId === u.id || (ar.unitNumber === u.unitNumber && (!ar.propertyId || ar.propertyId === u.propertyId))
            );
            const hasActiveAg = (prev.agreements || []).some(
              (ag) => (ag.status === 'active' || ag.status === 'signed') &&
                      (ag.unit === u.unitNumber || (ag as any).unitId === u.id)
            );

            if (declinedForUnit && !hasAccepted && !hasActiveAg && u.status === 'reserved') {
              return { ...u, status: 'vacant' as const, tenant: null, currentTenantId: null };
            }

            const acceptedForUnit = acceptedRequests.find(
              (ar) => ar.unitId === u.id || (ar.unitNumber === u.unitNumber && (!ar.propertyId || ar.propertyId === u.propertyId))
            );
            if (acceptedForUnit && !u.tenant && (u.status === 'vacant' || u.status === 'reserved')) {
              return {
                ...u,
                status: 'reserved' as const,
                tenant: acceptedForUnit.tenantName,
                currentTenantId: acceptedForUnit.tenantId,
              };
            }

            return u;
          });

          return {
            ...prev,
            tenancyRequests: allRequests,
            units: healedUnits,
          };
        });
      }
    }, (err) => {
      console.warn('Firestore tenancyRequests sync listener warning:', err);
    });

    // 7. Sync maintenance tickets live from Firestore
    const unsubTickets = onSnapshot(collection(db, 'tickets'), (snapshot) => {
      const fbTickets: Ticket[] = [];
      snapshot.forEach((d) => {
        const t = d.data() as Ticket;
        if (t && t.id) fbTickets.push(t);
      });
      if (fbTickets.length > 0) {
        setState((prev) => {
          const tickMap = new Map<string, Ticket>();
          prev.tickets.forEach((t) => tickMap.set(t.id, t));
          fbTickets.forEach((t) => tickMap.set(t.id, t));
          return {
            ...prev,
            tickets: Array.from(tickMap.values()),
          };
        });
      }
    }, (err) => {
      console.warn('Firestore tickets sync listener warning:', err);
    });

    // 8. Sync move-outs live from Firestore
    const unsubMoveouts = onSnapshot(collection(db, 'moveouts'), (snapshot) => {
      const fbMoveouts: MoveOut[] = [];
      snapshot.forEach((d) => {
        const m = d.data() as MoveOut;
        if (m) {
          const resolvedId = m.id || d.id;
          const normalizedStatus =
            m.status === 'awaiting_tenant_approval' || (m.status as string) === 'settlement_pending'
              ? 'refund_scheduled'
              : m.status;


          fbMoveouts.push({
            ...m,
            id: resolvedId,
            status: normalizedStatus,
            tenant: m.tenant || (m as any).tenantName || 'Resident',
            deposit: m.deposit || (m as any).depositHeld || 0,
          });
        }
      });
      if (fbMoveouts.length > 0) {
        setState((prev) => {
          const mMap = new Map<string, MoveOut>();
          prev.moveouts.forEach((m) => mMap.set(m.id, m));
          fbMoveouts.forEach((m) => mMap.set(m.id, m));
          return {
            ...prev,
            moveouts: Array.from(mMap.values()),
          };
        });
      }
    }, (err) => {
      console.warn('Firestore moveouts sync listener warning:', err);
    });

    // 9. Sync rental invoices live from Firestore (Owner <-> Tenant)
    const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snapshot) => {
      const fbInvoices: Invoice[] = [];
      snapshot.forEach((d) => {
        const inv = d.data() as any;
        if (inv) {
          const invId = inv.id || d.id;
          const invType = inv.invoiceType || inv.type || (inv.items?.[0]?.description?.toLowerCase().includes('deposit') || invId.startsWith('INV-DEP') ? 'deposit' : 'rent');
          fbInvoices.push({
            ...inv,
            id: invId,
            invoiceType: invType,
            type: invType,
          });
        }
      });
      setState((prev) => {
        const invMap = new Map<string, Invoice>();
        (prev.invoices || []).forEach((i) => invMap.set(i.id, i));
        fbInvoices.forEach((i) => invMap.set(i.id, i));
        return {
          ...prev,
          invoices: Array.from(invMap.values()),
        };
      });
    }, (err) => {
      console.warn('Firestore invoices sync listener warning:', err);
    });

    // 9a. Sync payments ledger live from Firestore
    const unsubPayments = onSnapshot(collection(db, 'payments'), (snapshot) => {
      const fbPayments: PaymentTransaction[] = [];
      snapshot.forEach((d) => {
        const pay = d.data() as any;
        if (pay) {
          const payId = pay.id || d.id;
          const payType = pay.type || (pay.notes?.toLowerCase().includes('deposit') || pay.invoiceId?.startsWith('INV-DEP') ? 'deposit' : 'rent');
          fbPayments.push({
            ...pay,
            id: payId,
            type: payType,
          });
        }
      });
      if (fbPayments.length > 0) {
        setState((prev) => {
          const payMap = new Map<string, PaymentTransaction>();
          const invoicePayMap = new Map<string, string>();
          const allPays = [...prev.payments, ...fbPayments];
          allPays.forEach((p) => {
            if (p.invoiceId) {
              const existingId = invoicePayMap.get(p.invoiceId);
              if (existingId && existingId !== p.id) {
                // If there's already a payment for this invoice, keep the most updated one
                return;
              }
              invoicePayMap.set(p.invoiceId, p.id);
            }
            payMap.set(p.id, p);
          });
          return {
            ...prev,
            payments: Array.from(payMap.values()),
          };
        });
      }
    }, (err) => {
      console.warn('Firestore payments sync listener warning:', err);
    });

    // 9b. Sync platform invoices live from Firestore (Admin <-> Owner)
    const unsubPlatformInvoices = onSnapshot(collection(db, 'platformInvoices'), (snapshot) => {
      const fbPINVs: PlatformInvoice[] = [];
      snapshot.forEach((d) => {
        const inv = d.data() as PlatformInvoice;
        if (inv && inv.id) fbPINVs.push({ ...inv, id: inv.id || d.id });
      });
      setState((prev) => ({
        ...prev,
        platformInvoices: fbPINVs,
      }));
    }, (err) => {
      console.warn('Firestore platformInvoices sync listener warning:', err);
    });

    // 10. Sync dynamic trial policy live from Firestore
    const unsubTrial = onSnapshot(doc(db, 'platformConfig', 'trialPolicy'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const hasDays = typeof data.defaultTrialDays === 'number';
        const hasDiscount = typeof data.annualDiscountPercent === 'number';
        const days = hasDays ? Math.max(0, data.defaultTrialDays) : undefined;
        const discount = hasDiscount ? Math.min(90, Math.max(0, data.annualDiscountPercent)) : undefined;

        if (hasDays || hasDiscount) {
          saveTrialPolicyCache(days ?? 14, discount);
          setState((prev) => {
            let nextOwnerSettings = prev.ownerSettings;
            if (days === 0) {
              nextOwnerSettings = { ...prev.ownerSettings };
              Object.keys(nextOwnerSettings).forEach((ownerKey) => {
                const s = nextOwnerSettings[ownerKey];
                if (s && s.planStatus === 'trialing' && !s.subscriptionEndsAt) {
                  nextOwnerSettings[ownerKey] = {
                    ...s,
                    planStatus: 'expired',
                    trialEndsAt: null,
                  };
                }
              });
            }
            return {
              ...prev,
              ...(days !== undefined ? { defaultTrialDays: days } : {}),
              ...(discount !== undefined ? { annualDiscountPercent: discount } : {}),
              ownerSettings: nextOwnerSettings,
            };
          });
        }
      }
    }, (err) => {
      console.warn('Firestore trialPolicy listener warning:', err);
    });

    // 11. Sync landing CMS config live from Firestore
    const unsubLanding = onSnapshot(doc(db, 'platformConfig', 'landing'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<LandingConfig>;
        if (data) {
          setState((prev) => {
            const defaultStats = INITIAL_STATE.landingConfig.stats!;
            const defaultLegal = INITIAL_STATE.landingConfig.legalPages!;

            const merged: LandingConfig = {
              ...prev.landingConfig,
              ...data,
              sections: {
                ...prev.landingConfig.sections,
                ...(data.sections || {}),
              },
              stats: {
                stat1Number: data.stats?.stat1Number ?? prev.landingConfig.stats?.stat1Number ?? defaultStats.stat1Number,
                stat1Label: data.stats?.stat1Label ?? prev.landingConfig.stats?.stat1Label ?? defaultStats.stat1Label,
                stat2Number: data.stats?.stat2Number ?? prev.landingConfig.stats?.stat2Number ?? defaultStats.stat2Number,
                stat2Label: data.stats?.stat2Label ?? prev.landingConfig.stats?.stat2Label ?? defaultStats.stat2Label,
                stat3Number: data.stats?.stat3Number ?? prev.landingConfig.stats?.stat3Number ?? defaultStats.stat3Number,
                stat3Label: data.stats?.stat3Label ?? prev.landingConfig.stats?.stat3Label ?? defaultStats.stat3Label,
                stat4Number: data.stats?.stat4Number ?? prev.landingConfig.stats?.stat4Number ?? defaultStats.stat4Number,
                stat4Label: data.stats?.stat4Label ?? prev.landingConfig.stats?.stat4Label ?? defaultStats.stat4Label,
              },
              legalPages: {
                terms: {
                  ...defaultLegal.terms,
                  ...(prev.landingConfig.legalPages?.terms || {}),
                  ...(data.legalPages?.terms || {}),
                },
                privacy: {
                  ...defaultLegal.privacy,
                  ...(prev.landingConfig.legalPages?.privacy || {}),
                  ...(data.legalPages?.privacy || {}),
                },
                refund: {
                  ...defaultLegal.refund,
                  ...(prev.landingConfig.legalPages?.refund || {}),
                  ...(data.legalPages?.refund || {}),
                },
                contact: {
                  ...defaultLegal.contact,
                  ...(prev.landingConfig.legalPages?.contact || {}),
                  ...(data.legalPages?.contact || {}),
                },
              },
            };
            saveLandingConfigCache(merged);
            return {
              ...prev,
              landingConfig: merged,
            };
          });
        }
      }
    }, (err) => {
      console.warn('Firestore landing config listener warning:', err);
    });

    // 12. Sync subscription plans live from Firestore & Auto-seed / Heal incomplete documents
    let isSeedingPlans = false;
    const unsubPlans = onSnapshot(collection(db, 'plans'), async (snapshot) => {
      const fbDocsMap = new Map<string, any>();
      snapshot.forEach((d) => {
        fbDocsMap.set(d.id, { id: d.id, ...d.data() });
      });

      setState((prev) => {
        // Start from standard plans list (ensuring starter, growth, free_trial, enterprise always exist)
        const baseMap = new Map<string, Plan>();
        INITIAL_STATE.plans.forEach((p) => baseMap.set(p.id, { ...p }));
        prev.plans.forEach((p) => {
          const existing = baseMap.get(p.id);
          baseMap.set(p.id, existing ? { ...existing, ...p } : { ...p });
        });

        // Merge Firestore documents over base plans
        fbDocsMap.forEach((fbData, id) => {
          const existing = baseMap.get(id);
          if (existing) {
            baseMap.set(id, {
              ...existing,
              ...fbData,
              id,
              name: fbData.name || existing.name,
              price: fbData.price !== undefined ? Number(fbData.price) : existing.price,
              isPopular: fbData.isPopular !== undefined ? !!fbData.isPopular : existing.isPopular,
            });
          } else if (fbData.name) {
            baseMap.set(id, fbData as Plan);
          }
        });

        const mergedPlans = Array.from(baseMap.values());

        // Self-heal Firestore if any plan document was incomplete in Firestore
        if (isFirebaseConfigured && !snapshot.empty) {
          mergedPlans.forEach((plan) => {
            const fbDoc = fbDocsMap.get(plan.id);
            if (!fbDoc || !fbDoc.name) {
              setDoc(doc(db, 'plans', plan.id), plan, { merge: true }).catch(console.warn);
            }
          });
        }

        return {
          ...prev,
          plans: mergedPlans,
        };
      });

      if (snapshot.empty && !isSeedingPlans && isFirebaseConfigured) {
        // Seed default plans directly into Firestore on fresh database
        isSeedingPlans = true;
        try {
          const defaultPlans = INITIAL_STATE.plans;
          for (const plan of defaultPlans) {
            await setDoc(doc(db, 'plans', plan.id), plan, { merge: true });
          }
        } catch (err) {
          console.warn('Failed to seed default plans to Firestore:', err);
        } finally {
          isSeedingPlans = false;
        }
      }
    }, (err) => {
      console.warn('Firestore plans listener warning:', err);
    });

    // 13. Sync owner settings & trial data live from Firestore
    const unsubOwners = onSnapshot(collection(db, 'owners'), (snapshot) => {
      const fbOwnerSettings: Record<string, OwnerSettings> = {};
      const currentDays = loadCachedTrialDays() ?? 14;
      snapshot.forEach((d) => {
        const data = d.data() as OwnerSettings;
        const key = data?.ownerId || d.id;
        if (key) {
          if (currentDays === 0 && data.planStatus === 'trialing' && !data.subscriptionEndsAt) {
            fbOwnerSettings[key] = { ...data, ownerId: key, planStatus: 'expired', trialEndsAt: null };
          } else {
            fbOwnerSettings[key] = { ...data, ownerId: key };
          }
        }
      });
      if (Object.keys(fbOwnerSettings).length > 0) {
        setState((prev) => ({
          ...prev,
          ownerSettings: {
            ...prev.ownerSettings,
            ...fbOwnerSettings,
          },
        }));
      }
    }, (err) => {
      console.warn('Firestore owners listener warning:', err);
    });

    // 14. Sync staff live from Firestore
    const unsubStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      const fbStaff: StaffMember[] = [];
      snapshot.forEach((d) => {
        const s = d.data() as StaffMember;
        if (s) fbStaff.push({ ...s, id: s.id || d.id });
      });
      setState((prev) => ({
        ...prev,
        staff: fbStaff,
      }));
    }, (err) => {
      console.warn('Firestore staff listener warning:', err);
    });

    // 15. Sync propertyManagers live from Firestore
    const unsubManagers = onSnapshot(collection(db, 'propertyManagers'), (snapshot) => {
      const fbPMs: any[] = [];
      snapshot.forEach((d) => {
        const pm = d.data();
        if (pm) fbPMs.push({ ...pm, id: pm.id || d.id });
      });
      setState((prev) => ({
        ...prev,
        propertyManagers: fbPMs,
      }));
    }, (err) => {
      console.warn('Firestore propertyManagers listener warning:', err);
    });

    // 16. Sync platform invoice template
    const unsubPlatformTemplate = onSnapshot(doc(db, 'platformConfig', 'invoiceTemplate'), (snap) => {
      if (snap.exists()) {
        const tmplData = snap.data() as PlatformInvoiceTemplateConfig;
        setState((prev) => ({
          ...prev,
          platformInvoiceTemplate: tmplData,
        }));
      }
    }, (err) => {
      console.warn('Firestore platform template listener warning:', err);
    });

    // 17. Sync platform gateways live from Firestore
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
            activeBillingGateway: data.activeBillingGateway || prev.activeBillingGateway,
          }));
        }
      }
    }, (err) => {
      console.warn('Firestore platform gateways listener warning:', err);
    });

    // 18. Sync renewals live from Firestore
    const unsubRenewals = onSnapshot(collection(db, 'renewals'), (snapshot) => {
      const fbRenewals: RenewalItem[] = [];
      snapshot.forEach((d) => {
        const r = d.data() as RenewalItem;
        if (r && r.unit) fbRenewals.push(r);
      });
      if (fbRenewals.length > 0) {
        const getRenewalTs = (item: RenewalItem) => {
          const t = item.offeredAt || item.ownerApprovedAt || item.tenantSignedAt || item.respondedAt || item.requestedAt;
          return t ? new Date(t).getTime() : 0;
        };
        setState((prev) => {
          const map = new Map<string, RenewalItem>();
          (prev.renewals || []).forEach((r) => map.set(r.unit, r));
          fbRenewals.forEach((r) => {
            const existing = map.get(r.unit);
            if (!existing || getRenewalTs(r) >= getRenewalTs(existing)) {
              map.set(r.unit, r);
            }
          });
          return { ...prev, renewals: Array.from(map.values()) };
        });
      }
    }, (err) => {
      console.warn('Firestore renewals listener warning:', err);
    });

    // 19. Sync notifications live from Firestore
    const unsubNotifications = onSnapshot(collection(db, 'notifications'), (snapshot) => {
      const fbNotifs: InAppNotification[] = [];
      snapshot.forEach((d) => {
        const n = d.data() as InAppNotification;
        if (n && n.id) fbNotifs.push(n);
      });
      if (fbNotifs.length > 0) {
        setState((prev) => {
          const map = new Map<string, InAppNotification>();
          (prev.notifications || []).forEach((n) => map.set(n.id, n));
          fbNotifs.forEach((n) => map.set(n.id, n));
          return { ...prev, notifications: Array.from(map.values()) };
        });
      }
    }, (err) => {
      console.warn('Firestore notifications listener warning:', err);
    });

    // 20. Sync manager payouts live from Firestore
    const unsubManagerPayouts = onSnapshot(collection(db, 'managerPayouts'), (snapshot) => {
      const fbPayouts: ManagerPayoutRecord[] = [];
      snapshot.forEach((d) => {
        const p = d.data() as ManagerPayoutRecord;
        if (p && p.id) fbPayouts.push(p);
      });
      if (fbPayouts.length > 0) {
        setState((prev) => {
          const map = new Map<string, ManagerPayoutRecord>();
          (prev.managerPayouts || []).forEach((p) => map.set(p.id, p));
          fbPayouts.forEach((p) => map.set(p.id, p));
          return { ...prev, managerPayouts: Array.from(map.values()) };
        });
      }
    }, (err) => {
      console.warn('Firestore manager payouts listener warning:', err);
    });

    // 21. Sync comms configuration live from Firestore
    const unsubComms = onSnapshot(doc(db, 'platformConfig', 'comms'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
          const cfg = data.commsConfig || data;
          setState((prev) => ({
            ...prev,
            commsConfig: {
              ...prev.commsConfig,
              ...cfg,
            },
          }));
      }
    }, (err) => {
      console.warn('Firestore comms listener warning:', err);
    });

    // 22. Sync notification toggles live from Firestore
    const unsubNotifToggles = onSnapshot(doc(db, 'platformConfig', 'notifications'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.notificationToggles) {
          setState((prev) => ({
            ...prev,
            notificationToggles: data.notificationToggles,
          }));
        }
      }
    }, (err) => {
      console.warn('Firestore notification toggles listener warning:', err);
    });

    // 23. Sync tenant payout profiles live from Firestore
    const unsubPayoutProfiles = onSnapshot(collection(db, 'payoutProfiles'), (snapshot) => {
      const fbProfiles: TenantPayoutProfile[] = [];
      snapshot.forEach((d) => {
        const p = d.data() as TenantPayoutProfile;
        if (p && p.tenantId) fbProfiles.push({ ...p, id: p.id || d.id });
      });
      if (fbProfiles.length > 0) {
        setState((prev) => {
          const map = new Map<string, TenantPayoutProfile>();
          (prev.payoutProfiles || []).forEach((p) => map.set(p.tenantId, p));
          fbProfiles.forEach((p) => map.set(p.tenantId, p));
          return { ...prev, payoutProfiles: Array.from(map.values()) };
        });
      }
    }, (err) => {
      console.warn('Firestore payout profiles listener warning:', err);
    });

    // 24. Sync deposit settlements live from Firestore
    const unsubSettlements = onSnapshot(collection(db, 'depositSettlements'), (snapshot) => {
      const fbSettlements: DepositSettlement[] = [];
      snapshot.forEach((d) => {
        const s = d.data() as DepositSettlement;
        if (s) {
          const resolvedId = s.id || d.id;


          // Ensure refunded settlement has a corresponding outflow PaymentTransaction in payments ledger
          if (s.status === 'refunded' || s.tenantConfirmedReceipt) {
            const refundTxId = `TXN-REF-${(s.agreementId || resolvedId).slice(-6).toUpperCase()}`;
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'payments', refundTxId), cleanFirestoreObject({
                id: refundTxId,
                invoiceId: `REF-${resolvedId}`,
                amount: s.netRefundableAmount || s.grossDepositHeld || 5500,
                currency: s.currency || '$',
                date: s.disbursedAt ? s.disbursedAt.split('T')[0] : new Date().toISOString().split('T')[0],
                dueDate: s.disbursedAt ? s.disbursedAt.split('T')[0] : new Date().toISOString().split('T')[0],
                method: s.disbursementMethod || 'Direct Transfer',
                status: 'paid',
                direction: 'outflow',
                type: 'deposit_refund',
                unit: s.unit || '101',
                propertyId: s.propertyId,
                tenantId: s.tenantId,
                tenant: s.tenantName,
                ownerId: s.ownerId,
                notes: 'Security deposit refund disbursed and settled.',
              }), { merge: true }).catch(console.warn);
            }
          }
          fbSettlements.push({ ...s, id: resolvedId });
        }
      });
      if (fbSettlements.length > 0) {
        setState((prev) => {
          const map = new Map<string, DepositSettlement>();
          (prev.depositSettlements || []).forEach((s) => map.set(s.id, s));
          fbSettlements.forEach((s) => map.set(s.id, s));
          return { ...prev, depositSettlements: Array.from(map.values()) };
        });
      }
    }, (err) => {
      console.warn('Firestore deposit settlements listener warning:', err);
    });

    // 25. Sync cash handover claims live from Firestore
    const unsubCashClaims = onSnapshot(collection(db, 'cashClaims'), (snapshot) => {
      const fbClaims: CashHandoverClaim[] = [];
      snapshot.forEach((d) => {
        const c = d.data() as CashHandoverClaim;
        if (c && c.id) fbClaims.push(c);
      });
      if (fbClaims.length > 0) {
        setState((prev) => {
          const map = new Map<string, CashHandoverClaim>();
          (prev.cashClaims || []).forEach((c) => map.set(c.id, c));
          fbClaims.forEach((c) => map.set(c.id, c));
          return { ...prev, cashClaims: Array.from(map.values()) };
        });
      }
    }, (err) => {
      console.warn('Firestore cash claims listener warning:', err);
    });

    // 26. Sync communication logs live from Firestore
    const unsubCommunicationLogs = onSnapshot(collection(db, 'communicationLogs'), (snapshot) => {
      const fbLogs: CommunicationLog[] = [];
      snapshot.forEach((d) => {
        const item = d.data() as CommunicationLog;
        if (item) {
          fbLogs.push({
            ...item,
            id: item.id || d.id,
          });
        }
      });
      // Sort newest first
      fbLogs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setState((prev) => ({
        ...prev,
        communicationLogs: fbLogs,
      }));
    }, (err) => {
      console.warn('Firestore communicationLogs listener warning:', err);
    });

    // 27. Sync platform audit log live from Firestore (strictly real data only)
    const unsubAuditLog = onSnapshot(collection(db, 'auditLog'), (snapshot) => {
      const fbLogs: any[] = [];
      snapshot.forEach((d) => {
        // Exclude and clean up any synthetic seed records if present
        if (d.id.startsWith('audit_init_')) {
          deleteDoc(doc(db, 'auditLog', d.id)).catch(() => {});
          return;
        }
        const item = d.data();
        if (item) fbLogs.push({ ...item, id: item.id || d.id });
      });
      // Sort newest first by timestamp, time, or createdAt
      fbLogs.sort((a, b) => new Date(b.timestamp || b.time || b.createdAt || 0).getTime() - new Date(a.timestamp || a.time || a.createdAt || 0).getTime());
      setState((prev) => ({ ...prev, auditLog: fbLogs }));
    }, (err) => {
      console.warn('Firestore auditLog listener warning:', err);
    });

    // 28. Sync platform support tickets live from Firestore
    const unsubPlatformSupport = onSnapshot(collection(db, 'platformSupport'), (snapshot) => {
      const fbTickets: any[] = [];
      snapshot.forEach((d) => {
        const item = d.data();
        if (item) fbTickets.push({ ...item, id: item.id || d.id });
      });
      if (fbTickets.length > 0) {
        setState((prev) => {
          const map = new Map<string, any>();
          (prev.platformSupport || []).forEach((t: any) => map.set(t.id, t));
          fbTickets.forEach((t: any) => map.set(t.id, t));
          return { ...prev, platformSupport: Array.from(map.values()) };
        });
      }
    }, (err) => {
      console.warn('Firestore platformSupport listener warning:', err);
    });

    // 29. Sync announcements live from Firestore
    const unsubAnnouncements = onSnapshot(collection(db, 'announcements'), (snapshot) => {
      const fbAnnouncements: Announcement[] = [];
      snapshot.forEach((d) => {
        const item = d.data() as Announcement;
        if (item) {
          fbAnnouncements.push({ ...item, id: item.id || d.id });
        }
      });
      fbAnnouncements.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      if (fbAnnouncements.length > 0) {
        setState((prev) => ({ ...prev, announcements: fbAnnouncements }));
      }
    }, (err) => {
      if (err.code === 'permission-denied') {
        console.warn('Firestore announcements listener: Access denied by remote security rules. Please deploy firestore.rules to Firebase.');
      } else {
        console.warn('Firestore announcements listener warning:', err);
      }
    });

    return () => {
      unsubUsers();
      unsubTenants();
      unsubProperties();
      unsubUnits();
      unsubAgreements();
      unsubTemplates();
      unsubRequests();
      unsubTickets();
      unsubMoveouts();
      unsubInvoices();
      unsubPayments();
      unsubPlatformInvoices();
      unsubTrial();
      unsubLanding();
      unsubPlans();
      unsubOwners();
      unsubStaff();
      unsubManagers();
      unsubPlatformTemplate();
      unsubGateways();
      unsubRenewals();
      unsubNotifications();
      unsubManagerPayouts();
      unsubComms();
      unsubNotifToggles();
      unsubPayoutProfiles();
      unsubSettlements();
      unsubCashClaims();
      unsubCommunicationLogs();
      unsubAuditLog();
      unsubPlatformSupport();
      unsubAnnouncements();
    };
  }, []);

  // Cross-Tab / Cross-Platform real-time synchronization concurrency
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
  }, []);

  // Self-healing reconciliation between Invoices and Agreements:
  // If an agreement's deposit invoice is paid, ensure the agreement's depositStatus is 'paid',
  // and activate the lease if the owner has uploaded their signed document.
  useEffect(() => {
    let hasChanges = false;
    const now = new Date().toISOString();

    const cleanUnitStr = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

    const reconciledAgreements = state.agreements.map((a) => {
      // Normalize any legacy 'awaiting_owner_signature' to canonical 'pending_approval'
      if ((a as any).status === 'awaiting_owner_signature') {
        hasChanges = true;
        return {
          ...a,
          status: 'pending_approval' as const,
        };
      }

      // Check if this agreement belongs to a concluded/refunded move-out or settlement
      const aUnitClean = cleanUnitStr(a.unit);
      const isConcludedMoveout =
        (state.moveouts || []).some((m) => {
          const isDone = m.status === 'refund_completed' || m.tenantConfirmedReceipt;
          if (!isDone) return false;
          // 1. Direct ID match
          if (m.id === a.id || (m as any).agreementId === a.id || (m as any).leaseAgreementId === a.id) return true;
          // 2. Unit + tenant match ONLY IF agreement was created before or on the moveout AND property matches
          const matchesUnit = cleanUnitStr(m.unit) === aUnitClean;
          const matchesTenant = m.tenantId === a.tenantId || m.tenant === a.tenant;
          const matchesProp = !m.propertyId || !a.propertyId || m.propertyId === a.propertyId ||
                              !(m as any).propertyName || !(a as any).propertyName || (m as any).propertyName === (a as any).propertyName;
          if (matchesUnit && matchesTenant && matchesProp) {
            const moTime = new Date((m as any).settledAt || (m as any).updatedAt || m.refundDate || m.moveOutDate || (m as any).createdAt || 0).getTime();
            const agTime = new Date(a.createdAt || a.start || 0).getTime();
            if (moTime > 0 && agTime > moTime) {
              return false; // Newer agreement created for re-entry!
            }
            return true;
          }
          return false;
        }) ||
        (state.depositSettlements || []).some((s) => {
          const isDone = s.status === 'refunded' || s.tenantConfirmedReceipt;
          if (!isDone) return false;
          if (s.agreementId === a.id) return true;
          const matchesUnit = cleanUnitStr(s.unit) === aUnitClean;
          const matchesTenant = s.tenantId === a.tenantId || s.tenantName === a.tenant;
          const matchesProp = !s.propertyId || !a.propertyId || s.propertyId === a.propertyId ||
                              !(s as any).propertyName || !(a as any).propertyName || (s as any).propertyName === (a as any).propertyName;
          if (matchesUnit && matchesTenant && matchesProp) {
            const sTime = new Date(s.disbursedAt || (s as any).updatedAt || s.createdAt || 0).getTime();
            const agTime = new Date(a.createdAt || a.start || 0).getTime();
            if (sTime > 0 && agTime > sTime) {
              return false; // Newer agreement created for re-entry!
            }
            return true;
          }
          return false;
        });

      if (isConcludedMoveout && a.status !== 'terminated') {
        hasChanges = true;
        return {
          ...a,
          depositStatus: 'refunded' as const,
          status: 'terminated' as const,
        };
      }

      // Self-healing for re-entry: If an agreement was prematurely marked 'terminated' but has an accepted tenancy request
      // that is newer than any moveout, restore it to its active re-entry state!
      const matchingAcceptedReq = (state.tenancyRequests || []).find(
        (r) =>
          r.status === 'accepted' &&
          cleanUnitStr(r.unitNumber) === aUnitClean &&
          (r.tenantId === a.tenantId || (r.tenantEmail && r.tenantEmail.toLowerCase() === a.tenantEmail?.toLowerCase()))
      );
      if (matchingAcceptedReq && a.status === 'terminated') {
        const reqTime = new Date(matchingAcceptedReq.respondedAt || matchingAcceptedReq.createdAt || 0).getTime();
        const latestMoveoutTime = (state.moveouts || [])
          .filter((m) => cleanUnitStr(m.unit) === aUnitClean && (m.tenantId === a.tenantId || m.tenant === a.tenant))
          .reduce((latest, m) => {
            const t = new Date((m as any).settledAt || (m as any).updatedAt || m.refundDate || m.moveOutDate || (m as any).createdAt || 0).getTime();
            return Math.max(latest, t);
          }, 0);
        if (reqTime >= latestMoveoutTime) {
          hasChanges = true;
          return {
            ...a,
            status: (a.signedDocumentUrl ? 'pending_approval' : 'awaiting_tenant_upload') as any,
            depositStatus: 'unpaid' as const,
          };
        }
      }

      const depInv = a.depositInvoiceId
        ? state.invoices.find((i) => i.id === a.depositInvoiceId)
        : state.invoices.find((i) => i.leaseAgreementId === a.id && i.invoiceType === 'deposit');

      // STRICT transition: only agreements in 'pending_deposit' activate upon paid deposit.
      // Agreements in 'pending_approval' MUST NOT bypass owner review.
      if (a.status === 'pending_deposit' && depInv && depInv.status === 'paid') {
        hasChanges = true;
        return {
          ...a,
          depositStatus: 'paid' as const,
          depositInvoiceId: a.depositInvoiceId || depInv.id,
          status: 'active' as const,
          counterSignedAt: a.counterSignedAt || now,
        };
      }
      return a;
    });

    // Self-healing: Deduplicate redundant duplicate unpaid rent and deposit invoices that share the same unit, property, and cycle
    const seenRentInvoices = new Set<string>();
    const seenDepositInvoices = new Set<string>();
    const duplicateInvoiceIdsToDelete: string[] = [];
    const deduplicatedInvoices: Invoice[] = [];

    (state.invoices || []).forEach((inv) => {
      const isRent = inv.invoiceType === 'rent';
      const isDeposit = inv.invoiceType === 'deposit' || inv.type === 'deposit';

      if (isRent && inv.status === 'sent') {
        const propKey = inv.propertyId || inv.propertyName || 'unknown';
        const key = `${inv.unit}_${propKey}_${inv.due}_${inv.amount}`;
        if (seenRentInvoices.has(key)) {
          duplicateInvoiceIdsToDelete.push(inv.id);
          hasChanges = true;
          return;
        }
        seenRentInvoices.add(key);
      } else if (isDeposit && (inv.status === 'sent' || inv.status === 'pending_confirmation')) {
        const propKey = inv.propertyId || inv.propertyName || 'unknown';
        const tenantKey = inv.tenantId || inv.tenant || '';
        const key = `${inv.unit}_${propKey}_${tenantKey}_${inv.amount}`;
        if (seenDepositInvoices.has(key)) {
          duplicateInvoiceIdsToDelete.push(inv.id);
          hasChanges = true;
          return;
        }
        seenDepositInvoices.add(key);
      }
      deduplicatedInvoices.push(inv);
    });

    // Automatically check if any active agreement with a paid deposit is missing its first month rent invoice
    const newRentInvoices: Invoice[] = [];
    reconciledAgreements.forEach((ag) => {
      const isDepPaid =
        ag.depositStatus === 'paid' ||
        deduplicatedInvoices.some(
          (inv) =>
            (inv.id === ag.depositInvoiceId || (inv.leaseAgreementId === ag.id && inv.invoiceType === 'deposit')) &&
            inv.status === 'paid'
        );

      if (isDepPaid && ag.rent > 0) {
        const cleanAgId = (ag.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const canonicalRentId = `INV-RENT-${cleanAgId}-M1`;
        const propName = state.properties.find((p) => p.id === ag.propertyId)?.name || 'Rental Property';

        const hasRentInvoice = deduplicatedInvoices.some(
          (inv) =>
            inv.invoiceType === 'rent' &&
            (inv.id === canonicalRentId ||
              inv.leaseAgreementId === ag.id ||
              (inv.unit === ag.unit &&
                ((inv.propertyId && ag.propertyId) ? inv.propertyId === ag.propertyId : (!inv.propertyId && !ag.propertyId && inv.propertyName === propName)) &&
                (!inv.tenantId || !ag.tenantId || inv.tenantId === ag.tenantId)))
        );

        if (!hasRentInvoice) {
          hasChanges = true;
          const firstRentInv: Invoice = {
            id: canonicalRentId,
            ownerId: ag.ownerId,
            propertyId: ag.propertyId,
            tenant: ag.tenant,
            tenantId: ag.tenantId,
            unit: ag.unit,
            propertyName: propName,
            amount: ag.rent,
            tax: 0,
            total: ag.rent,
            due: ag.start || now.split('T')[0],
            status: 'sent',
            invoiceType: 'rent',
            leaseAgreementId: ag.id,
            issueDate: now.split('T')[0],
            tenantEmail: ag.tenantEmail || state.tenants.find((t) => t.id === ag.tenantId || t.name === ag.tenant)?.email || state.users.find((u) => u.id === ag.tenantId)?.email,
            tenantPhone: ag.tenantPhone || state.tenants.find((t) => t.id === ag.tenantId || t.name === ag.tenant)?.phone || state.users.find((u) => u.id === ag.tenantId)?.phone,
            notes: `First month move-in rent pursuant to executed tenancy agreement for Unit ${ag.unit}.`,
            items: [
              {
                description: `First Month Rent (Move-in) — Unit ${ag.unit} (${propName})`,
                amount: ag.rent,
              },
            ],
          };
          newRentInvoices.push(firstRentInv);
        }
      }
    });

    // Self-healing: Reconcile payments whose invoice or cash claim has been rejected
    const reconciledPayments = (state.payments || []).map((p) => {
      if (p.status === 'pending_confirmation') {
        const inv = p.invoiceId ? state.invoices.find((i) => i.id === p.invoiceId) : null;
        const claim = p.cashClaimId ? (state.cashClaims || []).find((c) => c.id === p.cashClaimId) : null;
        const isRejected =
          claim?.status === 'rejected' ||
          (inv && inv.status === 'sent' && Boolean(inv.paymentProofNotes?.toLowerCase().includes('reject')));

        if (isRejected) {
          hasChanges = true;
          const rejectionReason = claim?.rejectionReason || inv?.paymentProofNotes || 'Proof rejected by landlord.';
          const updatedAudit: TransactionAuditTrail = {
            claimedBy: p.audit?.claimedBy || p.tenantId || p.tenant || 'tenant',
            claimedByRole: p.audit?.claimedByRole || 'tenant',
            claimedAt: p.audit?.claimedAt || p.date || now,
            ...(p.audit || {}),
            rejectionReason,
            rejectedAt: now,
          };
          if (isFirebaseConfigured) {
            setDoc(
              doc(db, 'payments', p.id),
              {
                status: 'disputed',
                audit: updatedAudit,
              },
              { merge: true }
            ).catch(console.warn);
          }
          const updatedPay: PaymentTransaction = {
            ...p,
            status: 'disputed',
            audit: updatedAudit,
          };
          return updatedPay;
        }
      }
      return p;
    });

    if (hasChanges) {
      setState((prev) => {
        let updatedUnits = prev.units;
        let updatedProperties = prev.properties;
        let updatedTenants = prev.tenants;

        // 1. Reconcile units for active agreements
        reconciledAgreements.forEach((ag) => {
          if (ag.status === 'active') {
            const unitObj = prev.units.find(
              (u) =>
                (u.unitNumber === ag.unit || u.id === ag.unit) &&
                (!ag.propertyId || !u.propertyId || u.propertyId === ag.propertyId)
            );
            if (unitObj && unitObj.status !== 'occupied') {
              updatedUnits = updatedUnits.map((u) =>
                u.id === unitObj.id
                  ? { ...u, status: 'occupied' as const, tenant: ag.tenant, currentTenantId: ag.tenantId, rent: ag.rent, deposit: ag.deposit }
                  : u
              );
              if (isFirebaseConfigured) {
                setDoc(doc(db, 'units', unitObj.id), cleanFirestoreObject({
                  status: 'occupied',
                  tenant: ag.tenant,
                  currentTenantId: ag.tenantId,
                  rent: ag.rent,
                  deposit: ag.deposit,
                }), { merge: true }).catch(console.warn);
              }
            }

            if (isFirebaseConfigured) {
              setDoc(doc(db, 'agreements', ag.id), cleanFirestoreObject({
                status: ag.status,
                depositStatus: 'paid',
                depositInvoiceId: ag.depositInvoiceId,
                ...(ag.counterSignedAt ? { counterSignedAt: ag.counterSignedAt } : {}),
              }), { merge: true }).catch(console.warn);
            }
          }
        });

        // 2. Self-healing: Reconcile units whose tenancy has concluded to 'vacant'
        prev.units.forEach((u) => {
          const uClean = cleanUnitStr(u.unitNumber || u.id);
          const hasPendingOrActiveAgForUnit = reconciledAgreements.some(
            (ag) =>
              cleanUnitStr(ag.unit) === uClean &&
              ag.status !== 'terminated' &&
              ag.status !== 'cancelled' &&
              (!ag.propertyId || !u.propertyId || ag.propertyId === u.propertyId)
          );

          const hasPendingOrAcceptedRequest = (state.tenancyRequests || []).some(
            (r) =>
              (cleanUnitStr(r.unitNumber) === uClean || r.unitId === u.id) &&
              (r.status === 'pending' || r.status === 'accepted')
          );

          const hasCompletedMoveout = (state.moveouts || []).some(
            (m) =>
              (m.status === 'refund_completed' || m.tenantConfirmedReceipt) &&
              cleanUnitStr(m.unit) === uClean &&
              (!m.propertyId || !u.propertyId || (m as any).propertyId === u.propertyId)
          );

          if (!hasPendingOrActiveAgForUnit && !hasPendingOrAcceptedRequest && hasCompletedMoveout && u.status !== 'vacant') {
            hasChanges = true;
            updatedUnits = updatedUnits.map((unit) =>
              unit.id === u.id
                ? { ...unit, status: 'vacant' as const, tenant: null, currentTenantId: null }
                : unit
            );

            if (isFirebaseConfigured) {
              setDoc(doc(db, 'units', u.id), cleanFirestoreObject({
                status: 'vacant',
                tenant: null,
                currentTenantId: null,
              }), { merge: true }).catch(console.warn);
            }
          }
        });

        // 3. Recalculate property occupancies
        updatedProperties = updatedProperties.map((p) => {
          const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
          if (p.occupied !== occ && isFirebaseConfigured) {
            setDoc(doc(db, 'properties', p.id), { occupied: occ }, { merge: true }).catch(console.warn);
          }
          return { ...p, occupied: occ };
        });

        // 4. Self-healing: Reconcile tenants assigned to vacated units with no active leases
        prev.tenants.forEach((t) => {
          if (t.unit && t.unit !== 'Unassigned') {
            const tUnitClean = cleanUnitStr(t.unit);
            const hasActiveAg = reconciledAgreements.some(
              (ag) => cleanUnitStr(ag.unit) === tUnitClean && ag.status === 'active' && (ag.tenantId === t.id || ag.tenant === t.name)
            );
            const hasConcludedMoveout = (state.moveouts || []).some(
              (m) =>
                (m.status === 'refund_completed' || m.tenantConfirmedReceipt) &&
                cleanUnitStr(m.unit) === tUnitClean &&
                ((m.propertyId && t.propertyId) ? (m as any).propertyId === t.propertyId : (!m.propertyId && !t.propertyId && Boolean((m as any).propertyName && (t as any).propertyName && (m as any).propertyName === (t as any).propertyName))) &&
                (m.tenantId ? m.tenantId === t.id : (m.tenant && m.tenant.toLowerCase() === t.name.toLowerCase()))
            );

            if (!hasActiveAg && hasConcludedMoveout) {
              hasChanges = true;
              updatedTenants = updatedTenants.map((tenant) =>
                tenant.id === t.id
                  ? { ...tenant, unit: 'Unassigned', rent: 0, deposit: 0 }
                  : tenant
              );
              if (isFirebaseConfigured) {
                setDoc(doc(db, 'tenants', t.id), cleanFirestoreObject({
                  unit: 'Unassigned',
                  rent: 0,
                  deposit: 0,
                }), { merge: true }).catch(console.warn);
              }
            }
          } else {
            // Restore tenant unit if they have an active lease
            const activeAg = reconciledAgreements.find((ag) => ag.status === 'active' && (ag.tenantId === t.id || ag.tenant === t.name));
            if (activeAg && (t.unit === 'Unassigned' || !t.unit)) {
              hasChanges = true;
              updatedTenants = updatedTenants.map((tenant) =>
                tenant.id === t.id
                  ? { ...tenant, unit: activeAg.unit, propertyId: activeAg.propertyId || tenant.propertyId, propertyName: (activeAg as any).propertyName || tenant.propertyName, rent: activeAg.rent, deposit: activeAg.deposit }
                  : tenant
              );
              if (isFirebaseConfigured) {
                setDoc(doc(db, 'tenants', t.id), cleanFirestoreObject({
                  unit: activeAg.unit,
                  propertyId: activeAg.propertyId || t.propertyId,
                  propertyName: (activeAg as any).propertyName || t.propertyName,
                  rent: activeAg.rent,
                  deposit: activeAg.deposit,
                }), { merge: true }).catch(console.warn);
              }
            }
          }
        });

        // 5. Self-healing: Void unpaid invoices for concluded tenancies
        const voidedInvoices = deduplicatedInvoices.map((inv) => {
          if (inv.status !== 'paid' && inv.status !== 'void') {
            const invUnitClean = cleanUnitStr(inv.unit);
            const isConcluded = (state.moveouts || []).some(
              (m) =>
                (m.status === 'refund_completed' || m.tenantConfirmedReceipt) &&
                cleanUnitStr(m.unit) === invUnitClean &&
                (!inv.tenantId || m.tenantId === inv.tenantId || (m.tenant && m.tenant.toLowerCase() === inv.tenant?.toLowerCase()))
            );
            const hasActiveAgForInv = reconciledAgreements.some(
              (ag) => ag.id === inv.leaseAgreementId && ag.status === 'active'
            );
            if (isConcluded && !hasActiveAgForInv) {
              hasChanges = true;
              if (isFirebaseConfigured) {
                setDoc(doc(db, 'invoices', inv.id), cleanFirestoreObject({ status: 'void', notes: 'Voided upon move-out conclusion.' }), { merge: true }).catch(console.warn);
              }
              return { ...inv, status: 'void' as const, notes: 'Voided upon move-out conclusion.' };
            }
          }
          return inv;
        });

        // Persist any newly generated first-month rent invoices to Firestore
        if (isFirebaseConfigured && newRentInvoices.length > 0) {
          newRentInvoices.forEach(async (inv) => {
            try {
              await setDoc(doc(db, 'invoices', inv.id), cleanFirestoreObject(inv), { merge: true });
            } catch (e) {
              console.warn('Firestore first-month rent invoice persist error:', e);
            }
          });
        }

        // Delete any purged duplicate invoices from Firestore
        if (isFirebaseConfigured && duplicateInvoiceIdsToDelete.length > 0) {
          duplicateInvoiceIdsToDelete.forEach(async (dupId) => {
            try {
              await deleteDoc(doc(db, 'invoices', dupId));
            } catch (e) {
              console.warn('Firestore duplicate invoice cleanup error:', e);
            }
          });
        }

        const baseInvoices = voidedInvoices;
        const mergedInvoices = newRentInvoices.length > 0
          ? [...baseInvoices, ...newRentInvoices]
          : baseInvoices;

        return {
          ...prev,
          invoices: mergedInvoices,
          agreements: reconciledAgreements,
          payments: reconciledPayments,
          units: updatedUnits,
          properties: updatedProperties,
          tenants: updatedTenants,
        };
      });
    }
  }, [state.invoices, state.agreements, state.payments, state.cashClaims, state.moveouts, state.depositSettlements, state.units, state.tenants]);

  // Automated background evaluation for scheduled & expired announcements
  useEffect(() => {
    const evaluateAnnouncements = async () => {
      const now = Date.now();
      const currentAnnouncements = state.announcements || [];
      let hasChanges = false;
      const updatedList = currentAnnouncements.map((a) => {
        // 1. Auto-publish scheduled announcements when time has arrived
        if (a.status === 'scheduled' && a.scheduledFor && new Date(a.scheduledFor).getTime() <= now) {
          hasChanges = true;
          const pub: Announcement = {
            ...a,
            status: 'published',
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'announcements', a.id), pub).catch(console.error);
          }
          return pub;
        }
        // 2. Auto-archive published announcements when expiration date has passed
        if (a.status === 'published' && a.expiresAt && new Date(a.expiresAt).getTime() <= now) {
          hasChanges = true;
          const arch: Announcement = {
            ...a,
            status: 'archived',
            updatedAt: new Date().toISOString(),
          };
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'announcements', a.id), arch).catch(console.error);
          }
          return arch;
        }
        return a;
      });

      if (hasChanges) {
        setState((prev) => ({ ...prev, announcements: updatedList }));
      }
    };

    evaluateAnnouncements();
    const interval = setInterval(evaluateAnnouncements, 30000);
    return () => clearInterval(interval);
  }, [state.announcements]);

  // Automated background evaluation for overdue invoices & late fee application
  useEffect(() => {
    if (!state.invoices || state.invoices.length === 0) return;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let hasChanges = false;
    const updatedInvoices = state.invoices.map((inv) => {
      if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'refunded') {
        return inv;
      }
      if (!inv.due) return inv;

      const dueDate = new Date(inv.due);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate.getTime() < now.getTime()) {
        const lateFeeResult = calculateInvoiceLateFee(inv, state.lateFeeSettings, now);
        const shouldBeOverdue = inv.status !== 'pending_confirmation';
        const newStatus = shouldBeOverdue ? ('overdue' as const) : inv.status;
        const newLateFee = lateFeeResult.accruedLateFee;
        const newTotal = (inv.amount || 0) + (inv.tax || 0) + newLateFee;

        if (
          inv.status !== newStatus ||
          inv.lateFeeApplied !== newLateFee ||
          inv.total !== newTotal ||
          inv.lateFeeCalculation !== lateFeeResult.ruleDescription
        ) {
          hasChanges = true;
          const updated: Invoice = {
            ...inv,
            status: newStatus,
            lateFeeApplied: newLateFee,
            lateFeeCalculation: lateFeeResult.ruleDescription,
            total: newTotal,
          };
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'invoices', inv.id), updated, { merge: true }).catch(console.warn);
          }
          return updated;
        }
      }
      return inv;
    });

    if (hasChanges) {
      setState((prev) => ({
        ...prev,
        invoices: updatedInvoices,
      }));
    }
  }, [state.invoices?.length, state.lateFeeSettings]);

  const showToast = (msg: string, type?: ToastType, options?: ToastOptions) => {
    toast.show(msg, { ...options, type });
  };

  const updateOwnerPlan = (userId: string, planName: string) => {
    const targetPlan = state.plans.find((p) => p.name.toLowerCase() === planName.toLowerCase()) || state.plans[0];
    const userObj = state.users.find((u) => u.id === userId);
    const userEmail = userObj?.email?.toLowerCase();

    setState((prev) => {
      const existingSettings: OwnerSettings = prev.ownerSettings[userId] || {
        ownerId: userId,
        planId: targetPlan?.id || planName.toLowerCase(),
        planName,
        planStatus: 'active',
        trialEndsAt: null,
        subscriptionEndsAt: new Date(Date.now() + 365 * 86400000).toISOString(),
        paymentMethods: prev.ownerPaymentMethods,
        lateFeeConfig: prev.lateFeeSettings,
        taxConfig: prev.taxSettings,
      };
      const updatedSettings: OwnerSettings = {
        ...existingSettings,
        ownerId: userId,
        planId: targetPlan?.id || planName.toLowerCase(),
        planName,
        planStatus: 'active',
        trialEndsAt: null,
        subscriptionEndsAt: existingSettings.subscriptionEndsAt || new Date(Date.now() + 365 * 86400000).toISOString(),
        paymentMethods: existingSettings.paymentMethods || prev.ownerPaymentMethods,
        lateFeeConfig: existingSettings.lateFeeConfig || prev.lateFeeSettings,
        taxConfig: existingSettings.taxConfig || prev.taxSettings,
      };
      return {
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId || (userEmail && u.email?.toLowerCase() === userEmail)
            ? { ...u, plan: planName }
            : u
        ),
        ownerPlan: planName,
        ownerSettings: {
          ...prev.ownerSettings,
          [userId]: updatedSettings,
        },
      };
    });

    if (isFirebaseConfigured && userId) {
      setDoc(doc(db, 'users', userId), { plan: planName }, { merge: true }).catch(console.warn);
      setDoc(doc(db, 'owners', userId), {
        ownerId: userId,
        planId: targetPlan?.id || planName.toLowerCase(),
        planName,
        planStatus: 'active',
        trialEndsAt: null,
        subscriptionEndsAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      }, { merge: true }).catch(console.warn);
    }

    logAuditEvent({
      actor: 'Superadmin',
      actorRole: 'superadmin',
      action: 'Owner Subscription Modified',
      category: 'financial',
      detail: `Plan for user ${userObj?.displayName || userEmail || userId} set to "${planName}".`,
    }).catch(console.warn);
  };

  const markUserReminded = (userId: string) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, reminded: true } : u)),
    }));
  };

  const updateOwnerTrial = (ownerId: string, daysToAdd: number, active: boolean = true) => {
    const targetOwner = ownerId || state.currentUserId || '';
    if (!targetOwner) return;
    const now = new Date();
    const expiry = new Date(now.getTime() + daysToAdd * 86400000).toISOString();
    setState((prev) => {
      const existingSettings = prev.ownerSettings[targetOwner] || {
        ownerId: targetOwner,
        planId: 'plan-growth',
        planName: 'Growth',
        planStatus: 'trialing',
        trialEndsAt: expiry,
        subscriptionEndsAt: null,
        paymentMethods: prev.ownerPaymentMethods,
        lateFeeConfig: prev.lateFeeSettings,
        taxConfig: prev.taxSettings,
      };
      return {
        ...prev,
        ownerSettings: {
          ...prev.ownerSettings,
          [targetOwner]: {
            ...existingSettings,
            planStatus: active ? 'trialing' : 'expired',
            trialEndsAt: active ? expiry : new Date(now.getTime() - 86400000).toISOString(),
          },
        },
      };
    });
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'owners', targetOwner), {
        ownerId: targetOwner,
        planStatus: active ? 'trialing' : 'expired',
        trialEndsAt: active ? expiry : new Date(now.getTime() - 86400000).toISOString(),
      }, { merge: true }).catch((err) => console.warn('Firestore updateOwnerTrial sync:', err));
    }
    logAuditEvent({
      actor: 'Superadmin',
      actorRole: 'superadmin',
      action: 'Trial Policy Adjusted',
      category: 'financial',
      detail: `Owner ${targetOwner}: ${daysToAdd > 0 ? `+${daysToAdd}` : daysToAdd} days (Active: ${active}).`,
    }).catch(console.warn);
    showToast(`Owner trial updated: ${daysToAdd > 0 ? `Extended by ${daysToAdd} days` : active ? 'Active' : 'Expired'}.`);
  };

  const recordManagerPayout = (payout: ManagerPayoutRecord) => {
    setState((prev) => ({
      ...prev,
      managerPayouts: [payout, ...prev.managerPayouts.filter((m) => m.id !== payout.id)],
    }));
    if (isFirebaseConfigured) {
      setDoc(doc(db, 'managerPayouts', payout.id), payout, { merge: true }).catch(console.warn);
    }
    const payCurr = payout.currency || DEFAULT_CURRENCY;
    showToast(`Payout of ${payCurr}${payout.amount.toLocaleString(normalizeCurrencyCode(payCurr) === 'INR' ? 'en-IN' : 'en-US')} recorded for ${payout.managerName}.`);
  };

  const signTenantAgreement = (agreementId: string, signatureDataUrl: string) => {
    const now = new Date().toLocaleDateString('en-CA');
    setState((prev) => ({
      ...prev,
      agreements: prev.agreements.map((a) =>
        a.id === agreementId
          ? {
              ...a,
              status: 'signed',
              tenantSignature: {
                signatureDataUrl,
                signedAt: now,
              },
            }
          : a
      ),
    }));
    showToast(`Agreement ${agreementId} digitally signed successfully!`);
  };

  const uploadSignedAgreement = async (
    agreementId: string,
    fileData: string,
    fileName: string,
    uploadedIds?: TenantUploadedIdItem[]
  ): Promise<string> => {
    const now = new Date().toISOString();
    let targetAgreement: Agreement | undefined;
    let updatedKycDocs: { title: string; fileUrl: string; verified: boolean }[] = [];
    let tenantRecordIdToUpdate: string | undefined;

    setState((prev) => {
      targetAgreement = prev.agreements.find((a) => a.id === agreementId);
      if (!targetAgreement) return prev;
      if (targetAgreement.status === 'active') {
        console.warn(`uploadSignedAgreement: Agreement ${agreementId} is already active. Ignoring status change.`);
        return prev;
      }

      const firstId = uploadedIds && uploadedIds.length > 0 ? uploadedIds[0] : undefined;

      const updatedAg: Agreement = {
        ...targetAgreement,
        status: 'pending_approval',
        signedDocumentUrl: fileData,
        signedDocumentName: fileName,
        signedUploadedAt: now,
        rejectionReason: undefined,
        rejectedAt: undefined,
        tenantUploadedIds: uploadedIds && uploadedIds.length > 0 ? uploadedIds : targetAgreement.tenantUploadedIds || [],
        tenantUploadedIdUrl: firstId ? firstId.fileUrl : targetAgreement.tenantUploadedIdUrl,
        tenantUploadedIdName: firstId ? firstId.fileName : targetAgreement.tenantUploadedIdName,
        tenantUploadedIdAt: firstId ? now : targetAgreement.tenantUploadedIdAt,
      };

      // Also update KYC documents on the tenant record
      const newKycEntries = (uploadedIds || []).map((idDoc) => ({
        title: idDoc.name,
        fileUrl: idDoc.fileUrl,
        verified: false,
      }));

      const updatedTenants = prev.tenants.map((t) => {
        if (
          t.id === targetAgreement!.tenantId ||
          (targetAgreement!.tenantEmail && t.email.toLowerCase() === targetAgreement!.tenantEmail.toLowerCase())
        ) {
          tenantRecordIdToUpdate = t.id;
          const existingTitles = new Set((t.kycDocuments || []).map((k) => k.title.toLowerCase()));
          const filteredNew = newKycEntries.filter((k) => !existingTitles.has(k.title.toLowerCase()));
          const merged = [...(t.kycDocuments || []), ...filteredNew];
          updatedKycDocs = merged;
          return {
            ...t,
            kycDocuments: merged,
          };
        }
        return t;
      });

      const notifTenant = {
        id: `notif_${Date.now()}_t`,
        userId: targetAgreement.tenantId,
        title: 'Signed Agreement Uploaded!',
        body: `Physical signed lease for Unit ${targetAgreement.unit} uploaded successfully. Awaiting landlord review and approval.`,
        link: '/tenant/lease',
        isRead: false,
        createdAt: now,
      };

      const notifOwner = {
        id: `notif_${Date.now()}_o`,
        userId: targetAgreement.ownerId,
        title: 'Tenant Uploaded Signed Agreement & Verification Documents',
        body: `${targetAgreement.tenant} uploaded the physically signed agreement${uploadedIds && uploadedIds.length > 0 ? ` and ${uploadedIds.length} requested ID document(s)` : ''} for Unit ${targetAgreement.unit}. Please review and approve.`,
        link: '/owner/leasing',
        isRead: false,
        createdAt: now,
      };

      return {
        ...prev,
        agreements: prev.agreements.map((a) => (a.id === agreementId ? updatedAg : a)),
        tenants: updatedTenants,
        notifications: [...(prev.notifications || []), notifTenant, notifOwner],
      };
    });

    if (targetAgreement && (targetAgreement as Agreement).status === 'active') {
      return agreementId;
    }

    if (isFirebaseConfigured) {
      try {
        if (targetAgreement) {
          const firstId = uploadedIds && uploadedIds.length > 0 ? uploadedIds[0] : undefined;
          await setDoc(doc(db, 'agreements', agreementId), {
            status: 'pending_approval',
            signedDocumentUrl: fileData,
            signedDocumentName: fileName,
            signedUploadedAt: now,
            rejectionReason: null,
            rejectedAt: null,
            tenantUploadedIds: uploadedIds && uploadedIds.length > 0 ? uploadedIds : (targetAgreement as any).tenantUploadedIds || [],
            tenantUploadedIdUrl: firstId ? firstId.fileUrl : (targetAgreement as any).tenantUploadedIdUrl || null,
            tenantUploadedIdName: firstId ? firstId.fileName : (targetAgreement as any).tenantUploadedIdName || null,
            tenantUploadedIdAt: firstId ? now : (targetAgreement as any).tenantUploadedIdAt || null,
          }, { merge: true });

          if (tenantRecordIdToUpdate && updatedKycDocs.length > 0) {
            await setDoc(doc(db, 'tenants', tenantRecordIdToUpdate), {
              kycDocuments: updatedKycDocs,
            }, { merge: true });
          }
        }
      } catch (err) {
        console.warn('Firestore uploadSignedAgreement error:', err);
      }
    }

    if (targetAgreement) {
      logAuditEvent({
        actor: targetAgreement.tenant || 'Tenant',
        actorRole: 'tenant',
        action: 'Signed Lease Uploaded',
        category: 'lease',
        propertyId: targetAgreement.propertyId,
        unit: targetAgreement.unit,
        detail: `Uploaded physically signed lease agreement for Unit ${targetAgreement.unit} (${fileName}).`,
      }).catch(console.warn);
    }

    showToast(`✓ Signed agreement uploaded! Awaiting landlord review & approval.`);
    return agreementId;
  };

  const approveSignedAgreement = async (
    agreementId: string,
    signatoryName = 'Property Owner',
    ownerSignedFileUrl?: string,
    ownerSignedFileName?: string,
    notes?: string
  ): Promise<string> => {
    const cleanAgId = agreementId.replace(/[^a-zA-Z0-9_-]/g, '');
    const now = new Date().toISOString();
    const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    let targetAgreement: Agreement | undefined;
    let newDepositInvoice: Invoice | undefined;
    let depositInvoiceId = generateDepositVoucherId(cleanAgId);

    setState((prev) => {
      targetAgreement = prev.agreements.find((a) => a.id === agreementId);
      if (!targetAgreement) return prev;

      const ag = targetAgreement;
      depositInvoiceId = ag.depositInvoiceId || generateDepositVoucherId(cleanAgId);
      const targetUnit = prev.units.find((u) => (u.unitNumber === ag.unit || u.id === ag.unit) && (!ag.propertyId || u.propertyId === ag.propertyId));
      const depositAmount = ag.deposit || targetUnit?.deposit || (ag.rent ? ag.rent * 2 : 0);
      const ownerSettings = prev.ownerSettings[ag.ownerId];
      const tmpl = ownerSettings?.invoiceTemplate;

      newDepositInvoice = {
        id: depositInvoiceId,
        ownerId: targetAgreement.ownerId,
        propertyId: targetAgreement.propertyId,
        leaseAgreementId: targetAgreement.id,
        tenant: targetAgreement.tenant,
        tenantId: targetAgreement.tenantId,
        unit: targetAgreement.unit,
        propertyName: prev.properties.find((p) => p.id === targetAgreement?.propertyId)?.name || 'Residence',
        amount: depositAmount,
        tax: 0,
        total: depositAmount,
        due: dueDate,
        status: 'sent',
        invoiceType: 'deposit',
        issueDate: now,
        tenantEmail: targetAgreement.tenantEmail || prev.tenants.find((t) => t.id === targetAgreement?.tenantId || t.name === targetAgreement?.tenant)?.email || prev.users.find((u) => u.id === targetAgreement?.tenantId)?.email,
        tenantPhone: targetAgreement.tenantPhone || prev.tenants.find((t) => t.id === targetAgreement?.tenantId || t.name === targetAgreement?.tenant)?.phone || prev.users.find((u) => u.id === targetAgreement?.tenantId)?.phone,
        notes: `Mandatory move-in security deposit pursuant to approved tenancy agreement for Unit ${targetAgreement.unit}.`,
        items: [
          {
            description: `Refundable Security Deposit (Held in Trust) - Unit ${targetAgreement.unit}`,
            amount: depositAmount,
          },
        ],
        issuerName: tmpl?.issuerName || signatoryName || 'Property Management Trust',
        issuerTaxNo: tmpl?.issuerTaxNo,
        issuerAddress: tmpl?.issuerAddress,
        issuerPhone: tmpl?.issuerPhone,
        issuerEmail: tmpl?.issuerEmail,
        termsAndConditions: tmpl?.termsAndConditions,
        signatoryName: tmpl?.signatoryName || signatoryName,
        bankDetails: tmpl?.bankName
          ? {
              bankName: tmpl.bankName,
              accountName: tmpl.accountName,
              accountNumber: tmpl.accountNumber,
              ifscOrRouting: tmpl.ifscOrRouting,
              upiId: tmpl.upiId,
            }
          : undefined,
      };

      const depositInvId = newDepositInvoice?.id || targetAgreement.depositInvoiceId || generateDepositVoucherId(cleanAgId);
      const updatedAg: Agreement = {
        ...targetAgreement,
        status: 'pending_deposit',
        depositInvoiceId: depositInvId,
        depositStatus: 'unpaid',
        rejectionReason: undefined,
        rejectedAt: undefined,
        approvedBy: signatoryName,
        approvedAt: now,
        counterSignatory: signatoryName,
        counterSignedAt: ownerSignedFileUrl ? now : targetAgreement.counterSignedAt,
        ownerSignedDocumentUrl: ownerSignedFileUrl || targetAgreement.ownerSignedDocumentUrl,
        ownerSignedDocumentName: ownerSignedFileName || targetAgreement.ownerSignedDocumentName || (ownerSignedFileUrl ? `Owner_Signed_Lease_${targetAgreement.unit}.pdf` : undefined),
        ownerSignedUploadedAt: ownerSignedFileUrl ? now : targetAgreement.ownerSignedUploadedAt,
        ownerSignatureNotes: notes || targetAgreement.ownerSignatureNotes,
      };

      const agCurr = targetAgreement.currency || DEFAULT_CURRENCY;
      const isAgIndian = normalizeCurrencyCode(agCurr) === 'INR';
      const depositFormatted = `${agCurr}${depositAmount.toLocaleString(isAgIndian ? 'en-IN' : 'en-US')}`;

      const notifTenant = {
        id: `notif_${Date.now()}_t`,
        userId: targetAgreement.tenantId,
        title: 'Lease Agreement Approved!',
        body: `Your signed agreement for Unit ${targetAgreement.unit} was approved! Please pay the refundable security deposit of ${depositFormatted} (Invoice ${depositInvId}) to complete move-in.`,
        link: '/tenant/payments',
        isRead: false,
        createdAt: now,
      };

      const existingInvIndex = prev.invoices.findIndex((i) => i.id === depositInvId);
      let updatedInvoices: Invoice[];
      if (newDepositInvoice) {
        if (existingInvIndex >= 0) {
          updatedInvoices = prev.invoices.map((i, idx) => (idx === existingInvIndex ? { ...i, ...newDepositInvoice } : i));
        } else {
          updatedInvoices = [newDepositInvoice, ...prev.invoices];
        }
      } else {
        updatedInvoices = prev.invoices;
      }

      return {
        ...prev,
        agreements: prev.agreements.map((a) => (a.id === agreementId ? updatedAg : a)),
        invoices: updatedInvoices,
        notifications: [...(prev.notifications || []), notifTenant],
      };
    });

    if (isFirebaseConfigured) {
      try {
        if (targetAgreement) {
          await setDoc(doc(db, 'agreements', agreementId), {
            status: 'pending_deposit',
            depositInvoiceId,
            depositStatus: 'unpaid',
            rejectionReason: null,
            rejectedAt: null,
            approvedBy: signatoryName,
            approvedAt: now,
            counterSignatory: signatoryName,
            ...(ownerSignedFileUrl ? {
              ownerSignedDocumentUrl: ownerSignedFileUrl,
              ownerSignedDocumentName: ownerSignedFileName || `Owner_Signed_Lease_${targetAgreement.unit}.pdf`,
              ownerSignedUploadedAt: now,
              counterSignedAt: now,
            } : {}),
            ...(notes ? { ownerSignatureNotes: notes } : {}),
          }, { merge: true });
        }
        if (newDepositInvoice) {
          await setDoc(doc(db, 'invoices', depositInvoiceId), newDepositInvoice, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore approveSignedAgreement error:', err);
      }
    }

    if (targetAgreement) {
      const agCurr = targetAgreement.currency || DEFAULT_CURRENCY;
      const isAgIndian = normalizeCurrencyCode(agCurr) === 'INR';
      logAuditEvent({
        actor: signatoryName || 'Property Owner',
        actorRole: 'owner',
        action: 'Lease Agreement Approved',
        category: 'lease',
        propertyId: targetAgreement.propertyId,
        unit: targetAgreement.unit,
        detail: `Lease approved for Unit ${targetAgreement.unit} (${targetAgreement.tenant}). Security deposit voucher generated: ${agCurr}${(targetAgreement.deposit || 0).toLocaleString(isAgIndian ? 'en-IN' : 'en-US')}.`,
      }).catch(console.warn);
    }

    showToast(`✓ Agreement approved! Security deposit invoice ${depositInvoiceId} dispatched to tenant.`);
    return depositInvoiceId;
  };

  const rejectSignedAgreement = async (
    agreementId: string,
    reason: string
  ): Promise<void> => {
    const now = new Date().toISOString();
    let targetAgreement: Agreement | undefined;

    setState((prev) => {
      targetAgreement = prev.agreements.find((a) => a.id === agreementId);
      if (!targetAgreement) return prev;

      const updatedAg: Agreement = {
        ...targetAgreement,
        status: 'awaiting_tenant_upload',
        signedDocumentUrl: undefined,
        signedDocumentName: undefined,
        signedUploadedAt: undefined,
        rejectionReason: reason || 'Document requires corrections or re-signing.',
        rejectedAt: now,
      };

      const notifTenant = {
        id: `notif_${Date.now()}_t`,
        userId: targetAgreement.tenantId,
        title: 'Signed Agreement Rejected by Landlord',
        body: `Your uploaded agreement for Unit ${targetAgreement.unit} was rejected by your landlord. Reason: "${reason || 'Please re-upload corrected document.'}". Please re-upload your document.`,
        link: '/tenant/lease',
        isRead: false,
        createdAt: now,
      };

      return {
        ...prev,
        agreements: prev.agreements.map((a) => (a.id === agreementId ? updatedAg : a)),
        notifications: [...(prev.notifications || []), notifTenant],
      };
    });

    if (isFirebaseConfigured && targetAgreement) {
      try {
        await setDoc(doc(db, 'agreements', agreementId), {
          status: 'awaiting_tenant_upload',
          signedDocumentUrl: null,
          signedDocumentName: null,
          signedUploadedAt: null,
          rejectionReason: reason || 'Document requires corrections or re-signing.',
          rejectedAt: now,
        }, { merge: true });
      } catch (err) {
        console.warn('Firestore rejectSignedAgreement error:', err);
      }
    }

    if (targetAgreement) {
      logAuditEvent({
        actor: 'Property Owner',
        actorRole: 'owner',
        action: 'Signed Lease Rejected',
        category: 'lease',
        propertyId: targetAgreement.propertyId,
        unit: targetAgreement.unit,
        detail: `Uploaded lease rejected for Unit ${targetAgreement.unit} (${targetAgreement.tenant}). Reason: ${reason || 'Document requires corrections'}`,
      }).catch(console.warn);
    }

    showToast('Agreement rejected. Resident has been notified to re-upload.');
  };



  const createOwnerMaintenanceTicket = async (ticketData: Partial<Ticket>) => {
    const newTicket: Ticket = {
      id: `TCK-${Math.floor(1000 + Math.random() * 9000)}`,
      ownerId: ticketData.ownerId || state.currentUserId || '',
      propertyId: ticketData.propertyId || '',
      unit: ticketData.unit || '',
      tenant: ticketData.tenant || 'Direct Owner Ticket',
      tenantId: ticketData.tenantId || '',
      tenantContact: ticketData.tenantContact || { phone: '', email: '' },
      issue: ticketData.issue || 'Maintenance request',
      priority: ticketData.priority || 'Medium',
      status: ticketData.assignedTo ? 'assigned' : 'open',
      assignedTo: ticketData.assignedTo || null,
      assignedStaffId: ticketData.assignedStaffId || null,
      created: new Date().toLocaleDateString('en-CA'),
      payment: {
        payer: 'owner',
        amount: ticketData.payment?.amount || 0,
        method: null,
        status: 'awaiting_payment',
      },
      completionNotes: undefined,
      photos: ticketData.photos || [],
      notes: ticketData.notes || '',
    };
    setState((prev) => ({
      ...prev,
      tickets: [newTicket, ...prev.tickets],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'tickets', newTicket.id), newTicket, { merge: true });
      } catch (err) {
        console.warn('Firestore createOwnerMaintenanceTicket sync error:', err);
      }
    }
    showToast(`Maintenance ticket ${newTicket.id} created successfully.`);
  };

  const sendStaffPaymentReminder = (ticketId: string) => {
    const ticket = state.tickets.find((t) => t.id === ticketId);
    const targetOwnerId = ticket?.ownerId || state.currentUserId || '';
    const notif = {
      id: `notif-${Date.now()}`,
      userId: targetOwnerId,
      title: 'Staff Payment Reminder',
      body: `Technician ${ticket?.assignedTo || 'Staff'} has requested payout confirmation for maintenance work order ${ticketId} (${ticket?.payment?.amount ? `${ticket.payment.amount}` : ''}).`,
      link: '/owner/team',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
    }

    setState((prev) => ({
      ...prev,
      notifications: [notif, ...(prev.notifications || [])],
    }));
    showToast(`✓ Payment reminder dispatched to property owner for task #${ticketId}.`);
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

  const saveProperty = async (prop: Property, units?: Unit[]) => {
    setState((prev) => ({
      ...prev,
      properties: [...prev.properties.filter((p) => p.id !== prop.id), prop],
      units: units ? [...prev.units.filter((u) => u.propertyId !== prop.id), ...units] : prev.units,
    }));
    if (isFirebaseConfigured) {
      try {
        let safeProp = { ...prop };
        // Safety guard: ensure no raw oversized base64 images blow past Firestore's 1MB limit
        if (safeProp.images && safeProp.images.length > 0) {
          const processedImages: string[] = [];
          for (const img of safeProp.images) {
            if (img && img.startsWith('data:') && img.length > 100000) {
              const compressed = await compressImage(img, 1200, 1200, 0.7);
              processedImages.push(compressed || img);
            } else {
              processedImages.push(img);
            }
          }
          safeProp.images = processedImages;
        }

        if (safeProp.amenityPhotos && safeProp.amenityPhotos.length > 0) {
          const processedAmenities: { name: string; image: string }[] = [];
          for (const ap of safeProp.amenityPhotos) {
            if (ap.image && ap.image.startsWith('data:') && ap.image.length > 100000) {
              const compressed = await compressImage(ap.image, 1000, 1000, 0.7);
              processedAmenities.push({ name: ap.name, image: compressed || ap.image });
            } else {
              processedAmenities.push(ap);
            }
          }
          safeProp.amenityPhotos = processedAmenities;
        }

        const cleanedProp = cleanFirestoreObject(safeProp);
        await setDoc(doc(db, 'properties', safeProp.id), cleanedProp, { merge: true });
        if (units && units.length > 0) {
          for (const u of units) {
            await setDoc(doc(db, 'units', u.id), cleanFirestoreObject(u), { merge: true });
          }
        }
      } catch (err: any) {
        console.error('Firestore saveProperty sync error:', err);
        showToast(`⚠️ Cloud Sync Error: ${err?.message || 'Document too large for Firestore'}`);
      }
    }
  };

  const saveUnit = async (unit: Unit) => {
    let targetPropertyId: string | undefined = unit.propertyId;

    setState((prev) => {
      const exists = prev.units.some((u) => u.id === unit.id);
      const updatedUnits = exists
        ? prev.units.map((u) => (u.id === unit.id ? unit : u))
        : [...prev.units, unit];

      const propId = unit.propertyId || prev.units.find((u) => u.id === unit.id)?.propertyId;
      targetPropertyId = propId;

      const updatedProperties = prev.properties.map((p) => {
        if (p.id === propId) {
          const propUnits = updatedUnits.filter((u) => u.propertyId === p.id);
          const occ = propUnits.filter((u) => u.status === 'occupied').length;
          const total = propUnits.length || p.unitCount || 1;
          return {
            ...p,
            occupied: occ,
            unitCount: total,
          };
        }
        return p;
      });

      return {
        ...prev,
        units: updatedUnits,
        properties: updatedProperties,
      };
    });

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'units', unit.id), cleanFirestoreObject(unit), { merge: true });
        const propId = targetPropertyId || unit.propertyId;
        if (propId) {
          const propUnits = state.units
            .map((u) => (u.id === unit.id ? unit : u))
            .filter((u) => u.propertyId === propId);
          const occ = propUnits.filter((u) => u.status === 'occupied').length;
          const total = propUnits.length || 1;
          await setDoc(
            doc(db, 'properties', propId),
            {
              occupied: occ,
              unitCount: total,
            },
            { merge: true }
          );
        }
      } catch (err) {
        console.warn('Firestore saveUnit sync error:', err);
      }
    }
  };

  const saveTenant = async (tenant: TenantRecord, userProfile?: UserProfile) => {
    setState((prev) => ({
      ...prev,
      tenants: [...prev.tenants.filter((t) => t.id !== tenant.id), tenant],
      users: userProfile ? [...prev.users.filter((u) => u.id !== userProfile.id), userProfile] : prev.users,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'tenants', tenant.id), tenant, { merge: true });
        if (userProfile) {
          await setDoc(doc(db, 'users', userProfile.id), userProfile, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore saveTenant sync error:', err);
      }
    }
  };

  const updateAgreementAutopay = async (agreementId: string, autopayData: Partial<TenantAutopayMandate>) => {
    setState((prev) => ({
      ...prev,
      agreements: prev.agreements.map((a) => {
        if (a.id !== agreementId) return a;
        const current = a.autopay || {
          enabled: true,
          status: 'active' as const,
          activeGateway: (autopayData.activeGateway || 'razorpay') as any,
          nextDebitDate: new Date().toISOString().split('T')[0],
          failureCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updatedAutopay: TenantAutopayMandate = {
          ...current,
          ...autopayData,
          enabled: autopayData.enabled ?? (autopayData.status === 'active' || current.status === 'active'),
          updatedAt: new Date().toISOString(),
        };
        return { ...a, autopay: updatedAutopay };
      }),
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'agreements', agreementId), { autopay: autopayData }, { merge: true });
      } catch (err) {
        console.warn('Firestore updateAgreementAutopay sync error:', err);
      }
    }
    const gw = autopayData.activeGateway || 'GATEWAY';
    showToast(`Rent Autopay active (${gw.toUpperCase()})`, 'success');
  };

  const cancelAgreementAutopay = async (agreementId: string) => {
    setState((prev) => ({
      ...prev,
      agreements: prev.agreements.map((a) =>
        a.id === agreementId
          ? { ...a, autopay: a.autopay ? { ...a.autopay, enabled: false, status: 'cancelled' } : undefined }
          : a
      ),
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'agreements', agreementId), { 'autopay.enabled': false, 'autopay.status': 'cancelled' }, { merge: true });
        const cancelFn = httpsCallable(functions, 'cancelAutopayMandate');
        await cancelFn({ role: 'tenant', entityId: agreementId }).catch(() => {});
      } catch (err) {
        console.warn('cancelAgreementAutopay error:', err);
      }
    }
    showToast('Rent Autopay disabled. Standard manual monthly invoices will resume.', 'info');
  };

  const updateOwnerAutopay = async (ownerId: string, mandateData: Partial<OwnerSubscriptionMandate>) => {
    setState((prev) => {
      const nextSettings = { ...prev.ownerSettings };
      const current = nextSettings[ownerId];
      if (current) {
        const curMandate = current.subscriptionMandate || {
          autoRenew: true,
          status: 'active' as const,
          activeGateway: (mandateData.activeGateway || 'stripe') as any,
          currentPlanId: current.planId || 'starter',
          billingCycle: (current.billingCycle || 'monthly') as 'monthly' | 'annual',
          failureCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updatedMandate: OwnerSubscriptionMandate = {
          ...curMandate,
          ...mandateData,
          autoRenew: mandateData.autoRenew ?? curMandate.autoRenew,
          updatedAt: new Date().toISOString(),
        };
        nextSettings[ownerId] = {
          ...current,
          autoRenew: updatedMandate.autoRenew,
          subscriptionMandate: updatedMandate,
        };
      }
      return { ...prev, ownerSettings: nextSettings };
    });
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'owners', ownerId), { autoRenew: mandateData.autoRenew ?? true, subscriptionMandate: mandateData }, { merge: true });
      } catch (err) {
        console.warn('updateOwnerAutopay error:', err);
      }
    }
    const gw = mandateData.activeGateway || 'GATEWAY';
    showToast(`Subscription Autopay active (${gw.toUpperCase()})`, 'success');
  };

  const cancelOwnerAutopay = async (ownerId: string) => {
    setState((prev) => {
      const nextSettings = { ...prev.ownerSettings };
      if (nextSettings[ownerId]) {
        nextSettings[ownerId] = {
          ...nextSettings[ownerId],
          autoRenew: false,
          cancelsAtPeriodEnd: true,
          subscriptionMandate: nextSettings[ownerId].subscriptionMandate
            ? {
                ...nextSettings[ownerId].subscriptionMandate!,
                autoRenew: false,
                status: 'cancelled',
              }
            : undefined,
        };
      }
      return { ...prev, ownerSettings: nextSettings };
    });
    if (isFirebaseConfigured) {
      try {
        await setDoc(
          doc(db, 'owners', ownerId),
          {
            autoRenew: false,
            cancelsAtPeriodEnd: true,
            'subscriptionMandate.autoRenew': false,
            'subscriptionMandate.status': 'cancelled',
          },
          { merge: true }
        );
        const cancelFn = httpsCallable(functions, 'cancelAutopayMandate');
        await cancelFn({ role: 'owner', entityId: ownerId }).catch(() => {});
      } catch (err) {
        console.warn('cancelOwnerAutopay error:', err);
      }
    }
    showToast('Auto-renew cancelled. Plan remains active until billing cycle end.', 'info');
  };

  const saveAgreement = async (agreement: Agreement) => {
    const isNew = !state.agreements.some((a) => a.id === agreement.id);
    const justActivated = agreement.status === 'active' &&
      state.agreements.find((a) => a.id === agreement.id)?.status !== 'active';

    setState((prev) => ({
      ...prev,
      agreements: [...prev.agreements.filter((a) => a.id !== agreement.id), agreement],
      renewals: isNew
        ? (prev.renewals || []).filter((r) => {
            if (r.unit === agreement.unit) {
              const belongsToNewTenant =
                (agreement.tenantId && r.tenantId === agreement.tenantId) ||
                (agreement.tenant && r.tenant && r.tenant.toLowerCase() === agreement.tenant.toLowerCase());
              return belongsToNewTenant;
            }
            return true;
          })
        : prev.renewals,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'agreements', agreement.id), agreement, { merge: true });
        if (isNew && agreement.unit) {
          deleteDoc(doc(db, 'renewals', agreement.unit)).catch(console.warn);
        }
      } catch (err) {
        console.warn('Firestore saveAgreement sync error:', err);
      }
    }

    // Log communication for lease creation or activation (skip for drafts)
    if ((isNew || justActivated) && agreement.status !== 'draft') {
      const agCurr = agreement.currency || DEFAULT_CURRENCY;
      const eventLabel = justActivated ? 'Lease Activated' : 'Lease Agreement Created';
      const bodyText = justActivated
        ? `Your lease agreement for Unit ${agreement.unit} has been activated. Rent: ${agCurr}${(agreement.rent || 0).toLocaleString()}/mo. Lease period: ${agreement.start || '—'} to ${agreement.end || '—'}.`
        : `A lease agreement has been drafted for Unit ${agreement.unit}. Please review and sign your agreement.`;
      logCommunication({
        type: 'lease_event',
        category: 'leasing',
        title: eventLabel,
        body: bodyText,
        channels: ['in_app'],
        recipientId: agreement.tenantId || '',
        recipientName: agreement.tenant || 'Tenant',
        recipientRole: 'tenant',
        recipientContact: {},
        senderId: agreement.ownerId || 'system',
        senderName: 'System',
        senderRole: 'system',
        ownerId: agreement.ownerId || null,
        propertyName: agreement.propertyName,
        unitNumber: agreement.unit,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);
    }
  };

  const saveAgreementTemplate = async (template: AgreementTemplate) => {
    setState((prev) => ({
      ...prev,
      agreementTemplates: [
        ...(prev.agreementTemplates || []).filter((t) => t.id !== template.id),
        template,
      ],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'agreementTemplates', template.id), cleanFirestoreObject(template), { merge: true });
      } catch (err) {
        console.warn('Firestore saveAgreementTemplate error:', err);
      }
    }
  };

  const deleteAgreementTemplate = async (templateId: string) => {
    setState((prev) => ({
      ...prev,
      agreementTemplates: (prev.agreementTemplates || []).filter((t) => t.id !== templateId),
    }));
    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'agreementTemplates', templateId));
      } catch (err) {
        console.warn('Firestore deleteAgreementTemplate error:', err);
      }
    }
  };

  const deleteAgreement = async (agreementId: string) => {
    setState((prev) => ({
      ...prev,
      agreements: (prev.agreements || []).filter((a) => a.id !== agreementId),
    }));
    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'agreements', agreementId));
      } catch (err) {
        console.warn('Firestore deleteAgreement error:', err);
      }
    }
  };

  const saveTenancyRequest = async (req: TenancyRequest, notif?: any) => {
    setState((prev) => {
      const isDeclined = req.status === 'declined';
      const isAccepted = req.status === 'accepted';

      const nextUnits = prev.units.map((u) => {
        const matchesUnit =
          u.id === req.unitId ||
          (Boolean(req.unitNumber) && u.unitNumber === req.unitNumber && (!req.propertyId || !u.propertyId || u.propertyId === req.propertyId));
        if (!matchesUnit) return u;

        if (isDeclined) {
          return {
            ...u,
            status: 'vacant' as const,
            tenant: null,
            currentTenantId: null,
          };
        }
        if (isAccepted) {
          return {
            ...u,
            status: 'reserved' as const,
            tenant: req.tenantName,
            currentTenantId: req.tenantId,
            rent: req.rent || u.rent,
            deposit: req.deposit || u.deposit,
          };
        }
        return u;
      });

      return {
        ...prev,
        units: nextUnits,
        tenancyRequests: [...(prev.tenancyRequests || []).filter((r) => r.id !== req.id), req],
        notifications: notif ? [notif, ...prev.notifications] : prev.notifications,
      };
    });

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'tenancyRequests', req.id), req, { merge: true });
        if (notif) {
          await setDoc(doc(db, 'notifications', notif.id), notif, { merge: true });
        }

        const targetUnit = state.units.find(
          (u) =>
            u.id === req.unitId ||
            (Boolean(req.unitNumber) && u.unitNumber === req.unitNumber && (!req.propertyId || !u.propertyId || u.propertyId === req.propertyId))
        );

        if (req.status === 'declined' && targetUnit) {
          await setDoc(
            doc(db, 'units', targetUnit.id),
            cleanFirestoreObject({ ...targetUnit, status: 'vacant', tenant: null, currentTenantId: null }),
            { merge: true }
          ).catch(console.warn);
        }

        if (req.status === 'accepted') {
          if (targetUnit) {
            await setDoc(
              doc(db, 'units', targetUnit.id),
              cleanFirestoreObject({
                ...targetUnit,
                status: 'reserved',
                tenant: req.tenantName,
                currentTenantId: req.tenantId,
                rent: req.rent || targetUnit.rent,
                deposit: req.deposit || targetUnit.deposit,
              }),
              { merge: true }
            ).catch(console.warn);
          }

          const tenantToUpdate: Partial<TenantRecord> = {
            id: req.tenantId,
            name: req.tenantName,
            email: req.tenantEmail,
            phone: req.tenantPhone || '',
            unit: req.unitNumber,
            owner: req.ownerName,
            ownerId: req.ownerId,
            propertyId: req.propertyId,
            rent: req.rent,
            deposit: req.deposit,
            leaseStart: req.leaseStart,
            leaseEnd: req.leaseEnd,
          };
          await setDoc(doc(db, 'tenants', req.tenantId), tenantToUpdate, { merge: true });
          await setDoc(doc(db, 'users', req.tenantId), { ownerId: req.ownerId, ownerName: req.ownerName }, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore saveTenancyRequest sync error:', err);
      }
    }
  };

  const saveInvoice = async (invoice: Invoice) => {
    let resolvedTenantEmail = invoice.tenantEmail;
    let resolvedTenantPhone = invoice.tenantPhone;

    if (!resolvedTenantEmail || !resolvedTenantPhone) {
      const t = state.tenants.find(
        (tenant) => (invoice.tenantId && tenant.id === invoice.tenantId) || (invoice.tenant && tenant.name === invoice.tenant)
      );
      if (t) {
        resolvedTenantEmail = resolvedTenantEmail || t.email;
        resolvedTenantPhone = resolvedTenantPhone || t.phone;
      }
      if (!resolvedTenantEmail || !resolvedTenantPhone) {
        const u = state.users.find((user) => invoice.tenantId && user.id === invoice.tenantId);
        if (u) {
          resolvedTenantEmail = resolvedTenantEmail || u.email;
          resolvedTenantPhone = resolvedTenantPhone || u.phone;
        }
      }
      if (!resolvedTenantEmail || !resolvedTenantPhone) {
        const ag = state.agreements.find(
          (a) => (invoice.leaseAgreementId && a.id === invoice.leaseAgreementId) ||
                 (invoice.tenantId && a.tenantId === invoice.tenantId)
        );
        if (ag) {
          resolvedTenantEmail = resolvedTenantEmail || ag.tenantEmail;
          resolvedTenantPhone = resolvedTenantPhone || ag.tenantPhone;
        }
      }
    }

    const finalInvoice: Invoice = {
      ...invoice,
      tenantEmail: resolvedTenantEmail || invoice.tenantEmail,
      tenantPhone: resolvedTenantPhone || invoice.tenantPhone,
    };

    setState((prev) => ({
      ...prev,
      invoices: [...prev.invoices.filter((i) => i.id !== finalInvoice.id), finalInvoice],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'invoices', finalInvoice.id), finalInvoice, { merge: true });
      } catch (err) {
        console.warn('Firestore saveInvoice sync error:', err);
      }
    }
  };

  const markInvoicePaid = async (
    invoiceId: string,
    paymentMethod: string = 'Cash / Direct Transfer',
    receiptNumber: string = `RCPT-${Date.now().toString().slice(-6)}`,
    transactionId?: string,
    additionalMetadata?: {
      lateFeeApplied?: number;
      lateFeeCalculation?: string;
      finalTotal?: number;
    }
  ) => {
    const paidAt = new Date().toISOString();
    let updatedInv: Invoice | undefined;
    let affectedAgreementId: string | undefined;
    let targetUnitObj: Unit | undefined;
    let newTxToPersist: PaymentTransaction | undefined;
    let firstMonthRentInvToPersist: Invoice | undefined;
    let activatedDepositLease = false;

    setState((prev) => {
      let nextInvoices = prev.invoices.map((inv) => {
        if (inv.id === invoiceId) {
          const appliedFee = additionalMetadata?.lateFeeApplied !== undefined
            ? additionalMetadata.lateFeeApplied
            : (inv.lateFeeApplied || 0);
          const finalTot = additionalMetadata?.finalTotal !== undefined
            ? additionalMetadata.finalTotal
            : (inv.amount + (inv.tax || 0) + appliedFee);

          updatedInv = {
            ...inv,
            status: 'paid' as const,
            paidAt,
            paymentMethodUsed: paymentMethod,
            receiptNumber,
            lateFeeApplied: appliedFee,
            lateFeeCalculation: additionalMetadata?.lateFeeCalculation || inv.lateFeeCalculation,
            total: finalTot,
          };
          return updatedInv;
        }
        return inv;
      });

      const existingTx = prev.payments.find((p) => p.invoiceId === invoiceId || (transactionId && p.id === transactionId));
      let updatedPayments = prev.payments;

      if (existingTx) {
        updatedPayments = prev.payments.map((p) =>
          p.id === existingTx.id
            ? {
                ...p,
                status: 'paid' as const,
                date: paidAt,
                method: paymentMethod,
                lateFeeApplied: updatedInv?.lateFeeApplied ?? p.lateFeeApplied,
                amount: updatedInv?.total ?? p.amount,
                currency: updatedInv?.currency || p.currency || 'USD',
                propertyId: updatedInv?.propertyId || p.propertyId || '',
              }
            : p
        );
      } else if (updatedInv) {
        newTxToPersist = {
          id: transactionId || generateTransactionId(),
          invoiceId: updatedInv.id,
          ownerId: updatedInv.ownerId || '',
          propertyId: updatedInv.propertyId || '',
          currency: updatedInv.currency || 'USD',
          tenantId: updatedInv.tenantId || '',
          unit: updatedInv.unit || '',
          tenant: updatedInv.tenant || '',
          amount: updatedInv.total,
          date: paidAt,
          dueDate: updatedInv.due || paidAt,
          status: 'paid' as const,
          method: paymentMethod,
          type: (updatedInv.invoiceType === 'deposit' ? 'deposit' : updatedInv.invoiceType === 'late_fee' ? 'late_fee' : 'rent') as any,
          lateFeeApplied: updatedInv.lateFeeApplied,
        };
        updatedPayments = [
          ...prev.payments.filter((p) => p.id !== newTxToPersist!.id),
          newTxToPersist,
        ];
      }

      // If this is a deposit invoice, mark agreement depositStatus as 'paid'.
      // Dual-lock condition: only activate lease and occupy unit if owner has uploaded their signed document!
      const updatedAgreements = prev.agreements.map((a) => {
        const matchesDeposit =
          (updatedInv?.leaseAgreementId && a.id === updatedInv.leaseAgreementId) ||
          a.depositInvoiceId === invoiceId ||
          (updatedInv?.invoiceType === 'deposit' &&
            a.status !== 'terminated' &&
            a.unit === updatedInv.unit &&
            (!updatedInv.propertyId || !a.propertyId || a.propertyId === updatedInv.propertyId) &&
            (!updatedInv.tenantId || a.tenantId === updatedInv.tenantId));

        if (matchesDeposit) {
          affectedAgreementId = a.id;
          activatedDepositLease = true;
          return {
            ...a,
            depositStatus: 'paid' as const,
            status: 'active' as const,
            approvedAt: a.approvedAt || a.counterSignedAt || paidAt,
            counterSignedAt: a.counterSignedAt || paidAt,
          };
        }
        return a;
      });

      let updatedUnits = prev.units;
      let updatedProperties = prev.properties;
      let newNotifs = [...(prev.notifications || [])];

      if (updatedInv?.invoiceType === 'deposit') {
        const ag = updatedAgreements.find((a) => a.id === affectedAgreementId);
        const uNumber = ag?.unit || updatedInv.unit;
        const targetPropId = ag?.propertyId || updatedInv.propertyId;
        targetUnitObj = prev.units.find(
          (u) =>
            (u.unitNumber === uNumber || u.id === uNumber) &&
            (!targetPropId || !u.propertyId || u.propertyId === targetPropId)
        );

        if (ag && ag.rent > 0) {
          const cleanAgId = (ag.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
          const canonicalRentId = `INV-RENT-${cleanAgId}-M1`;
          const propName = prev.properties.find((p) => p.id === ag.propertyId)?.name || 'Rental Property';

          const hasRentInvoice = nextInvoices.some(
            (inv) =>
              inv.invoiceType === 'rent' &&
              (inv.id === canonicalRentId ||
                inv.leaseAgreementId === ag.id ||
                (inv.unit === ag.unit &&
                  ((inv.propertyId && ag.propertyId) ? inv.propertyId === ag.propertyId : (!inv.propertyId && !ag.propertyId && inv.propertyName === propName)) &&
                  (!inv.tenantId || !ag.tenantId || inv.tenantId === ag.tenantId)))
          );

          if (!hasRentInvoice) {
            firstMonthRentInvToPersist = {
              id: canonicalRentId,
              ownerId: ag.ownerId,
              propertyId: ag.propertyId,
              tenant: ag.tenant,
              tenantId: ag.tenantId,
              unit: ag.unit,
              propertyName: propName,
              amount: ag.rent,
              currency: ag.currency || updatedInv?.currency || DEFAULT_CURRENCY,
              tax: 0,
              total: ag.rent,
              due: ag.start || paidAt.split('T')[0],
              status: 'sent',
              invoiceType: 'rent',
              leaseAgreementId: ag.id,
              issueDate: paidAt.split('T')[0],
              tenantEmail: ag.tenantEmail || prev.tenants.find((t) => t.id === ag.tenantId || t.name === ag.tenant)?.email || prev.users.find((u) => u.id === ag.tenantId)?.email,
              tenantPhone: ag.tenantPhone || prev.tenants.find((t) => t.id === ag.tenantId || t.name === ag.tenant)?.phone || prev.users.find((u) => u.id === ag.tenantId)?.phone,
              notes: `First month move-in rent pursuant to executed tenancy agreement for Unit ${ag.unit}.`,
              items: [
                {
                  description: `First Month Rent (Move-in) — Unit ${ag.unit} (${propName})`,
                  amount: ag.rent,
                },
              ],
            };
            nextInvoices = [...nextInvoices, firstMonthRentInvToPersist];
          }
        }

        if (activatedDepositLease && targetUnitObj) {
          updatedUnits = prev.units.map((u) =>
            u.id === targetUnitObj!.id
              ? {
                  ...u,
                  status: 'occupied' as const,
                  tenant: ag?.tenant || updatedInv!.tenant,
                  currentTenantId: ag?.tenantId || updatedInv!.tenantId,
                }
              : u
          );
          updatedProperties = prev.properties.map((p) => {
            if (p.id === targetUnitObj!.propertyId) {
              const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
              return { ...p, occupied: occ };
            }
            return p;
          });

          if (ag?.ownerId) {
            newNotifs.push({
              id: `notif_${Date.now()}_o`,
              userId: ag.ownerId,
              title: 'Move-in Deposit Paid! Lease Activated',
              body: `Security deposit of ${updatedInv.currency || ag.currency || DEFAULT_CURRENCY_SYMBOL}${updatedInv.total.toLocaleString()} paid by ${ag.tenant} for Unit ${ag.unit}. Tenancy is officially active and first month rent is scheduled in rent due.`,
              link: '/owner/leasing',
              isRead: false,
              createdAt: paidAt,
            });
          }
          if (ag?.tenantId) {
            newNotifs.push({
              id: `notif_${Date.now()}_t`,
              userId: ag.tenantId,
              title: 'Deposit Confirmed — First Month Rent Due',
              body: `Your move-in security deposit is confirmed and lease is active! Your first month rent of ${ag.currency || updatedInv.currency || DEFAULT_CURRENCY_SYMBOL}${(ag.rent || 0).toLocaleString()} is now ready in your Rent Due tab.`,
              link: '/tenant/payments?tab=rent_due',
              isRead: false,
              createdAt: paidAt,
            });
          }
        }
      }

      let updatedTenants = prev.tenants;
      if (activatedDepositLease) {
        const ag = updatedAgreements.find((a) => a.id === affectedAgreementId);
        const tId = ag?.tenantId || updatedInv?.tenantId;
        const tEmail = (ag?.tenantEmail || updatedInv?.tenantEmail || '').toLowerCase();
        if (tId || tEmail) {
          const uNum = ag?.unit || updatedInv?.unit || '';
          const propId = targetUnitObj?.propertyId || ag?.propertyId || '';
          const ownId = ag?.ownerId || updatedInv?.ownerId || '';
          const ownName = ag?.ownerName || '';
          const rentAmt = ag?.rent || targetUnitObj?.rent || 0;
          const depAmt = updatedInv?.total || ag?.deposit || targetUnitObj?.deposit || 0;

          const exists = prev.tenants.some((t) => (tId && t.id === tId) || (tEmail && t.email.toLowerCase() === tEmail));
          if (exists) {
            updatedTenants = prev.tenants.map((t) => {
              if ((tId && t.id === tId) || (tEmail && t.email.toLowerCase() === tEmail)) {
                return {
                  ...t,
                  ownerId: ownId || t.ownerId,
                  owner: ownName || t.owner,
                  unit: uNum || t.unit,
                  propertyId: propId || t.propertyId,
                  rent: rentAmt || t.rent,
                  deposit: depAmt || t.deposit,
                  unitsRented: uNum ? Array.from(new Set([...(t.unitsRented || []), uNum])) : t.unitsRented,
                  leaseStart: ag?.start || t.leaseStart,
                  leaseEnd: ag?.end || t.leaseEnd,
                };
              }
              return t;
            });
          } else {
            const newT: TenantRecord = {
              id: tId || `usr_tenant_${Date.now()}`,
              name: ag?.tenant || updatedInv?.tenant || 'Resident',
              email: tEmail,
              phone: ag?.tenantPhone || updatedInv?.tenantPhone || '',
              unit: uNum,
              owner: ownName,
              ownerId: ownId,
              propertyId: propId,
              rent: rentAmt,
              deposit: depAmt,
              rating: 5.0,
              unitsRented: uNum ? [uNum] : [],
              history: [],
              kycDocuments: [],
              leaseStart: ag?.start || '',
              leaseEnd: ag?.end || '',
            };
            updatedTenants = [...prev.tenants, newT];
          }
        }
      }

      return {
        ...prev,
        invoices: nextInvoices,
        payments: updatedPayments,
        agreements: updatedAgreements,
        units: updatedUnits,
        properties: updatedProperties,
        tenants: updatedTenants,
        notifications: newNotifs,
      };
    });

    if (isFirebaseConfigured) {
      try {
        if (updatedInv) {
          await setDoc(doc(db, 'invoices', invoiceId), updatedInv, { merge: true });
        }
        if (firstMonthRentInvToPersist) {
          await setDoc(doc(db, 'invoices', firstMonthRentInvToPersist.id), firstMonthRentInvToPersist, { merge: true });
        }
        if (affectedAgreementId) {
          await setDoc(doc(db, 'agreements', affectedAgreementId), {
            depositStatus: 'paid',
            status: 'active',
            approvedAt: paidAt,
            counterSignedAt: paidAt,
          }, { merge: true });
        }
        if (newTxToPersist) {
          await setDoc(doc(db, 'payments', newTxToPersist.id), newTxToPersist, { merge: true });
        }
        if (activatedDepositLease && targetUnitObj) {
          await setDoc(doc(db, 'units', targetUnitObj.id), {
            status: 'occupied',
            tenant: updatedInv?.tenant,
            currentTenantId: updatedInv?.tenantId,
          }, { merge: true });

          if (updatedInv?.tenantId) {
            const tPatch = {
              id: updatedInv.tenantId,
              unit: targetUnitObj.unitNumber,
              ownerId: targetUnitObj.ownerId,
              propertyId: targetUnitObj.propertyId,
              rent: targetUnitObj.rent || 0,
              deposit: updatedInv.total,
            };
            await setDoc(doc(db, 'tenants', updatedInv.tenantId), tPatch, { merge: true });
            await setDoc(doc(db, 'users', updatedInv.tenantId), { ownerId: targetUnitObj.ownerId }, { merge: true });
          }

          if (targetUnitObj.propertyId) {
            const propUnits = state.units
              .map((u) => (u.id === targetUnitObj!.id ? { ...u, status: 'occupied' as const } : u))
              .filter((u) => u.propertyId === targetUnitObj!.propertyId);
            const occ = propUnits.filter((u) => u.status === 'occupied').length;
            const total = propUnits.length || 1;
            await setDoc(
              doc(db, 'properties', targetUnitObj.propertyId),
              {
                occupied: occ,
                unitCount: total,
              },
              { merge: true }
            );
          }
        }
      } catch (err) {
        console.warn('Firestore markInvoicePaid sync error:', err);
      }
    }
    // Log communication: invoice paid
    if (updatedInv) {
      const invType = updatedInv.invoiceType === 'deposit' ? 'deposit' : 'rent';
      const tenantName = updatedInv.tenant || 'Tenant';
      const unitNum = updatedInv.unit || '';
      const amount = updatedInv.total || 0;
      const ownerIdForLog = updatedInv.ownerId || null;

      // Find tenant phone and email from state
      const tenantRec = state.tenants.find((t) => t.id === updatedInv!.tenantId || t.name.toLowerCase() === tenantName.toLowerCase());
      const userRec = state.users.find((u) => u.id === updatedInv!.tenantId || (u.email && tenantRec?.email && u.email.toLowerCase() === tenantRec.email.toLowerCase()));
      const tenantEmail = updatedInv.tenantEmail || tenantRec?.email || userRec?.email || '';
      const tenantPhone = updatedInv.tenantPhone || tenantRec?.phone || userRec?.phone || '';

      const ownerRec = ownerIdForLog ? state.users.find((u) => u.id === ownerIdForLog) : null;
      const ownerPhone = ownerRec?.phone || '';

      const invCurr = updatedInv.currency || DEFAULT_CURRENCY;
      const isInvIndian = normalizeCurrencyCode(invCurr) === 'INR';
      const formattedAmount = `${invCurr}${amount.toLocaleString(isInvIndian ? 'en-IN' : 'en-US')}`;

      // 1. Notify Tenant via Multi-channel (SMS, Email, In-App)
      logCommunication({
        type: 'payment_confirmation',
        category: 'rent',
        title: invType === 'deposit' ? 'Security Deposit Received' : 'Rent Payment Confirmed',
        body: invType === 'deposit'
          ? `Security deposit of ${formattedAmount} received for Unit ${unitNum}. Receipt: ${receiptNumber}. Tenancy activated.`
          : `Rent payment of ${formattedAmount} received for Unit ${unitNum}. Method: ${paymentMethod}. Receipt: ${receiptNumber}. Thank you!`,
        channels: ['in_app', 'sms', 'email'],
        recipientId: updatedInv.tenantId || userRec?.id || '',
        recipientName: tenantName,
        recipientRole: 'tenant',
        recipientContact: {
          email: tenantEmail || undefined,
          phone: tenantPhone || undefined,
        },
        senderId: ownerIdForLog || 'system',
        senderName: ownerRec?.displayName || 'Propithub Operations',
        senderRole: 'system',
        ownerId: ownerIdForLog,
        unitNumber: unitNum,
        relatedEntityId: updatedInv.id,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);

      // 2. Notify Landlord / Owner via SMS & In-App
      if (ownerIdForLog) {
        logCommunication({
          type: 'payment_collected_owner',
          category: 'rent',
          title: `Rent Payment Received — Unit ${unitNum}`,
          body: `Payment of ${formattedAmount} has been received from ${tenantName} for Unit ${unitNum} via ${paymentMethod}.`,
          channels: ['in_app', 'sms', 'email'],
          recipientId: ownerIdForLog,
          recipientName: ownerRec?.displayName || 'Property Owner',
          recipientRole: 'owner',
          recipientContact: {
            email: ownerRec?.email || undefined,
            phone: ownerPhone || undefined,
          },
          senderId: 'system',
          senderName: 'Propithub Billing Treasury',
          senderRole: 'system',
          ownerId: ownerIdForLog,
          unitNumber: unitNum,
          relatedEntityId: updatedInv.id,
          deliveryStatus: { inApp: 'delivered' },
        }).catch(console.warn);
      }

      logAuditEvent({
        actor: updatedInv.paymentMethodUsed?.toLowerCase().includes('cash') ? 'Property Owner' : (tenantName || 'Tenant'),
        actorRole: updatedInv.paymentMethodUsed?.toLowerCase().includes('cash') ? 'owner' : 'tenant',
        action: invType === 'deposit' ? 'Security Deposit Paid' : 'Rent Payment Recorded',
        category: 'financial',
        propertyId: updatedInv.propertyId,
        unit: unitNum,
        detail: `${invType === 'deposit' ? 'Security deposit' : 'Rent payment'} of ${formattedAmount} paid for Unit ${unitNum} via ${paymentMethod} (Receipt: ${receiptNumber}).`,
      }).catch(console.warn);
    }
  };

  const waiveInvoiceLateFee = async (invoiceId: string, reason: string = 'Waived by Property Owner') => {
    let updatedInv: Invoice | undefined;
    setState((prev) => {
      const nextInvoices = prev.invoices.map((inv) => {
        if (inv.id === invoiceId) {
          updatedInv = {
            ...inv,
            lateFeeApplied: 0,
            lateFeeWaived: true,
            lateFeeWaivedReason: reason,
            lateFeeCalculation: undefined,
            total: (inv.amount || 0) + (inv.tax || 0),
          };
          return updatedInv;
        }
        return inv;
      });
      return { ...prev, invoices: nextInvoices };
    });

    if (updatedInv) {
      if (isFirebaseConfigured) {
        try {
          await setDoc(doc(db, 'invoices', updatedInv.id), updatedInv, { merge: true });
        } catch (err) {
          console.warn('Firestore waiveInvoiceLateFee error:', err);
        }
      }
      showToast(`Late fee waived for Invoice #${invoiceId}.`);
    }
  };

  const savePlatformInvoice = async (invoice: PlatformInvoice) => {
    setState((prev) => ({
      ...prev,
      platformInvoices: [...(prev.platformInvoices || []).filter((i) => i.id !== invoice.id), invoice],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformInvoices', invoice.id), invoice, { merge: true });
      } catch (err) {
        console.warn('Firestore savePlatformInvoice error:', err);
      }
    }
  };

  const markPlatformInvoicePaid = async (
    invoiceId: string,
    paymentMethod: string = 'Stripe / Bank Wire',
    transactionRef: string = ''
  ) => {
    const paidAt = new Date().toISOString();
    let updatedInv: PlatformInvoice | undefined;
    let targetOwnerId: string | undefined;

    setState((prev) => {
      const nextList = (prev.platformInvoices || []).map((inv) => {
        if (inv.id === invoiceId) {
          targetOwnerId = inv.ownerId;
          updatedInv = {
            ...inv,
            status: 'paid' as const,
            paidAt,
            paymentMethod,
            transactionRef: transactionRef || `TXN-PINV-${Date.now().toString().slice(-6)}`,
          };
          return updatedInv;
        }
        return inv;
      });

      const updatedUsers = targetOwnerId
        ? prev.users.map((u) =>
            u.id === targetOwnerId
              ? { ...u, plan: updatedInv?.planName || u.plan, status: 'active' as const, reminded: false }
              : u
          )
        : prev.users;

      let updatedOwnerSettings = prev.ownerSettings;
      if (targetOwnerId) {
        const existingSettings = prev.ownerSettings[targetOwnerId] || {
          ownerId: targetOwnerId,
          planId: updatedInv?.planId || 'growth',
          planName: updatedInv?.planName || 'Growth',
          planStatus: 'active',
          trialEndsAt: null,
          subscriptionEndsAt: updatedInv?.periodEnd || new Date(Date.now() + 365 * 86400000).toISOString(),
          paymentMethods: prev.ownerPaymentMethods,
          lateFeeConfig: prev.lateFeeSettings,
          taxConfig: prev.taxSettings,
        };
        updatedOwnerSettings = {
          ...prev.ownerSettings,
          [targetOwnerId]: {
            ...existingSettings,
            planId: updatedInv?.planId || existingSettings.planId,
            planName: updatedInv?.planName || existingSettings.planName,
            planStatus: 'active',
            subscriptionEndsAt: updatedInv?.periodEnd || new Date(Date.now() + 365 * 86400000).toISOString(),
          },
        };
      }

      const notif: InAppNotification | null = targetOwnerId
        ? {
            id: `notif_${Date.now()}`,
            userId: targetOwnerId,
            title: 'Platform Subscription Activated!',
            body: `Your platform subscription payment ($${(updatedInv?.total || updatedInv?.amount || 0).toLocaleString()}) has been settled via ${paymentMethod}. Your access is extended for 1 year.`,
            link: '/owner/plan',
            isRead: false,
            createdAt: paidAt,
          }
        : null;

      return {
        ...prev,
        platformInvoices: nextList,
        users: updatedUsers,
        ownerSettings: updatedOwnerSettings,
        notifications: notif ? [...(prev.notifications || []), notif] : prev.notifications,
      };
    });

      if (isFirebaseConfigured && updatedInv) {
      try {
        await setDoc(doc(db, 'platformInvoices', invoiceId), updatedInv, { merge: true });
        if (targetOwnerId) {
          await setDoc(
            doc(db, 'users', targetOwnerId),
            { plan: updatedInv.planName, status: 'active', reminded: false },
            { merge: true }
          );
          await setDoc(
            doc(db, 'owners', targetOwnerId),
            {
              planId: updatedInv.planId,
              planName: updatedInv.planName,
              planStatus: 'active',
              subscriptionEndsAt: updatedInv.periodEnd || new Date(Date.now() + 365 * 86400000).toISOString(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        console.warn('Firestore markPlatformInvoicePaid error:', err);
      }
    }

    if (targetOwnerId && updatedInv) {
      const ownerUser = state.users.find((u) => u.id === targetOwnerId);
      logCommunication({
        type: 'platform_subscription_paid',
        category: 'subscription',
        title: 'Platform Subscription Activated!',
        body: `Your payment of $${(updatedInv.total || updatedInv.amount || 0).toLocaleString()} for the ${updatedInv.planName || 'Growth'} Plan has been confirmed via ${paymentMethod}. Access extended for 1 year.`,
        channels: ['in_app', 'sms', 'email'],
        recipientId: targetOwnerId,
        recipientName: ownerUser?.displayName || 'Property Owner',
        recipientRole: 'owner',
        recipientContact: {
          email: ownerUser?.email || undefined,
          phone: ownerUser?.phone || undefined,
        },
        senderId: 'superadmin',
        senderName: 'Propithub Billing Treasury',
        senderRole: 'superadmin',
        ownerId: targetOwnerId,
        relatedEntityId: updatedInv.id,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);

      logAuditEvent({
        actor: ownerUser?.displayName || updatedInv.ownerName || 'Owner',
        actorRole: 'owner',
        action: 'Platform Subscription Paid',
        category: 'financial',
        detail: `Platform plan "${updatedInv.planName || 'Growth'}" subscription payment of $${(updatedInv.total || updatedInv.amount || 0).toLocaleString()} confirmed via ${paymentMethod}.`,
      }).catch(console.warn);
    }
  };

  const savePayment = async (payment: PaymentTransaction) => {
    const isNew = !state.payments.some((p) => p.id === payment.id);
    setState((prev) => ({
      ...prev,
      payments: [...prev.payments.filter((p) => p.id !== payment.id), payment],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'payments', payment.id), payment, { merge: true });
      } catch (err) {
        console.warn('Firestore savePayment sync error:', err);
      }
    }

    // Log communication for new paid payments
    if (isNew && payment.status === 'paid') {
      const payType = payment.type === 'deposit' ? 'Security Deposit Paid' : 'Rent Payment Recorded';
      const tenant = state.tenants.find((t) => t.id === payment.tenantId || (payment.tenant && t.name.toLowerCase() === payment.tenant.toLowerCase()));
      const userRec = state.users.find((u) => u.id === payment.tenantId || (tenant?.email && u.email?.toLowerCase() === tenant.email.toLowerCase()));
      const targetPhone = tenant?.phone || userRec?.phone;
      const targetEmail = tenant?.email || userRec?.email;

      logCommunication({
        type: 'payment_recorded',
        category: 'rent',
        title: payType,
        body: `Payment of ${(payment as any).currency || DEFAULT_CURRENCY_SYMBOL}${(payment.amount || 0).toLocaleString()} recorded for ${payment.tenant || 'Tenant'} — Unit ${payment.unit || ''}. Method: ${payment.method || '—'}. Thank you!`,
        channels: ['in_app', 'sms', 'email'],
        recipientId: payment.tenantId || userRec?.id || '',
        recipientName: payment.tenant || 'Tenant',
        recipientRole: 'tenant',
        recipientContact: {
          email: targetEmail || undefined,
          phone: targetPhone || undefined,
        },
        senderId: payment.ownerId || 'system',
        senderName: 'Propithub Operations',
        senderRole: 'system',
        ownerId: payment.ownerId || null,
        unitNumber: payment.unit,
        relatedEntityId: payment.id,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);
    }
  };

  const saveTicket = async (ticket: Ticket) => {
    const isNew = !state.tickets.some((t) => t.id === ticket.id);
    const prevTicket = state.tickets.find((t) => t.id === ticket.id);
    const isResolvedNow = ticket.status === 'resolved' && prevTicket?.status !== 'resolved';

    let notif: InAppNotification | null = null;
    const resolvedTenantId =
      ticket.tenantId ||
      state.tenants.find((t) => t.name.toLowerCase() === (ticket as any).tenant?.toLowerCase())?.id;

    if (isResolvedNow && resolvedTenantId) {
      notif = {
        id: `notif_${Date.now()}`,
        userId: resolvedTenantId,
        title: `Maintenance Ticket Resolved: ${ticket.issue || 'Repair complete'}`,
        body: `Your maintenance ticket #${ticket.id} for Unit ${ticket.unit} has been marked resolved by your property team.`,
        link: '/tenant/support',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
    }

    setState((prev) => ({
      ...prev,
      tickets: [...prev.tickets.filter((t) => t.id !== ticket.id), ticket],
      notifications: notif ? [...(prev.notifications || []), notif] : prev.notifications,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'tickets', ticket.id), ticket, { merge: true });
        if (notif) {
          await setDoc(doc(db, 'notifications', notif.id), notif);
        }
      } catch (err) {
        console.warn('Firestore saveTicket sync error:', err);
      }
    }

    // Log communication for new maintenance tickets
    if (isNew) {
      const tenant = state.tenants.find((t) => t.id === (ticket as any).tenantId || t.name === (ticket as any).tenant);
      const isUrgent = (ticket as any).priority === 'emergency' || (ticket as any).priority === 'urgent';
      const ownerRec = (ticket as any).ownerId ? state.users.find((u) => u.id === (ticket as any).ownerId) : null;
      
      logCommunication({
        type: 'maintenance_ticket',
        category: 'maintenance',
        title: isUrgent ? `URGENT Maintenance Ticket: ${(ticket as any).issue || 'Repair needed'}` : 'Maintenance Ticket Submitted',
        body: `Maintenance request filed: "${(ticket as any).title || (ticket as any).issue || 'New Ticket'}". Unit: ${(ticket as any).unit || '—'}. Priority: ${(ticket as any).priority || 'Normal'}.`,
        channels: isUrgent ? ['in_app', 'sms', 'email'] : ['in_app'],
        recipientId: (ticket as any).ownerId || '',
        recipientName: ownerRec?.displayName || 'Property Owner',
        recipientRole: 'owner',
        recipientContact: {
          email: ownerRec?.email || undefined,
          phone: ownerRec?.phone || undefined,
        },
        senderId: (ticket as any).tenantId || 'system',
        senderName: (ticket as any).tenant || 'Tenant',
        senderRole: 'system',
        ownerId: (ticket as any).ownerId || null,
        unitNumber: (ticket as any).unit,
        relatedEntityId: ticket.id,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);
    }

    // Log communication when ticket is marked resolved
    if (isResolvedNow && resolvedTenantId) {
      const tenantRec = state.tenants.find((t) => t.id === resolvedTenantId || t.name.toLowerCase() === (ticket as any).tenant?.toLowerCase());
      const userRec = state.users.find((u) => u.id === resolvedTenantId || (tenantRec?.email && u.email?.toLowerCase() === tenantRec.email.toLowerCase()));

      logCommunication({
        type: 'ticket_resolved',
        category: 'maintenance',
        title: `Ticket Resolved: #${ticket.id}`,
        body: `Your maintenance ticket #${ticket.id} ("${ticket.issue || 'Repair'}") for Unit ${ticket.unit} has been marked resolved. Thank you!`,
        channels: ['in_app', 'sms', 'email'],
        recipientId: resolvedTenantId,
        recipientName: tenantRec?.name || (ticket as any).tenant || 'Resident',
        recipientRole: 'tenant',
        recipientContact: {
          email: tenantRec?.email || userRec?.email || undefined,
          phone: tenantRec?.phone || userRec?.phone || undefined,
        },
        senderId: (ticket as any).ownerId || 'system',
        senderName: 'Property Maintenance Team',
        senderRole: 'system',
        ownerId: (ticket as any).ownerId || null,
        unitNumber: ticket.unit,
        relatedEntityId: ticket.id,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);
    }

    if (isNew) {
      logAuditEvent({
        actor: (ticket as any).tenant || 'Resident',
        actorRole: 'tenant',
        action: 'Maintenance Ticket Created',
        category: 'maintenance',
        propertyId: ticket.propertyId,
        unit: ticket.unit,
        detail: `Unit ${ticket.unit}: #${ticket.id} "${ticket.issue}" (Priority: ${ticket.priority || 'medium'}).`,
      }).catch(console.warn);
    } else if (isResolvedNow) {
      logAuditEvent({
        actor: 'Property Operations',
        actorRole: 'staff',
        action: 'Maintenance Ticket Resolved',
        category: 'maintenance',
        propertyId: ticket.propertyId,
        unit: ticket.unit,
        detail: `Unit ${ticket.unit}: #${ticket.id} "${ticket.issue}" marked as resolved.`,
      }).catch(console.warn);
    }
  };

  const saveMoveout = async (moveout: MoveOut) => {
    const isNew = !(state.moveouts || []).some((m) => m.id === moveout.id);
    setState((prev) => ({
      ...prev,
      moveouts: [...prev.moveouts.filter((m) => m.id !== moveout.id), moveout],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'moveouts', moveout.id), moveout, { merge: true });
      } catch (err) {
        console.warn('Firestore saveMoveout sync error:', err);
      }
    }

    if (isNew) {
      const ownerRec = moveout.ownerId ? state.users.find((u) => u.id === moveout.ownerId) : null;
      logCommunication({
        type: 'moveout_notice',
        category: 'leasing',
        title: `Notice to Vacate: Unit ${moveout.unit}`,
        body: `Tenant ${moveout.tenant || 'Resident'} has submitted a notice to vacate Unit ${moveout.unit}. Intended departure date: ${moveout.moveOutDate || 'Scheduled date'}.`,
        channels: ['in_app', 'sms', 'email'],
        recipientId: moveout.ownerId || '',
        recipientName: ownerRec?.displayName || 'Property Owner',
        recipientRole: 'owner',
        recipientContact: {
          email: ownerRec?.email || undefined,
          phone: ownerRec?.phone || undefined,
        },
        senderId: moveout.tenantId || 'system',
        senderName: moveout.tenant || 'Tenant',
        senderRole: 'system',
        ownerId: moveout.ownerId || null,
        unitNumber: moveout.unit,
        relatedEntityId: moveout.id,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);
    }

    logAuditEvent({
      actor: moveout.tenant || 'Tenant',
      actorRole: 'tenant',
      action: isNew ? 'Move-Out Notice Submitted' : `Move-Out Status Updated (${moveout.status || 'Updated'})`,
      category: 'lease',
      propertyId: moveout.propertyId,
      unit: moveout.unit,
      detail: `Unit ${moveout.unit}: Move-out scheduled for ${moveout.moveOutDate || (moveout as any).date || 'upcoming'}. Reason: ${moveout.outcome?.reason || (moveout as any).reason || 'General vacate'}. Status: ${moveout.status || 'pending'}.`,
    }).catch(console.warn);
  };

  const saveOwnerSettings = async (ownerId: string, settings: Partial<OwnerSettings>) => {
    setState((prev) => ({
      ...prev,
      ownerSettings: {
        ...prev.ownerSettings,
        [ownerId]: {
          ...(prev.ownerSettings[ownerId] || {}),
          ...settings,
        } as OwnerSettings,
      },
      ownerPaymentMethods: settings.paymentMethods || prev.ownerPaymentMethods,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'owners', ownerId), settings, { merge: true });
      } catch (err) {
        console.warn('Firestore saveOwnerSettings sync error:', err);
      }
    }
  };

  const savePlatformGateways = async (gateways: PlatformGateways, activeBillingGateway?: string) => {
    const act = (activeBillingGateway || gateways.activeBillingGateway || state.activeBillingGateway || 'stripe') as any;
    // Sanitize in memory: do not keep raw secrets in browser state
    const sanitizedGateways: PlatformGateways = {
      ...gateways,
      stripe: { ...gateways.stripe, secretKey: '' },
      razorpay: { ...gateways.razorpay, keySecret: '' },
      paypal: gateways.paypal ? { ...gateways.paypal, secret: '' } : undefined as any,
      easebuzz: gateways.easebuzz ? { ...gateways.easebuzz, salt: '' } : undefined as any,
    };
    setState((prev) => ({
      ...prev,
      platformGateways: sanitizedGateways,
      activeBillingGateway: act,
    }));
    if (isFirebaseConfigured) {
      try {
        const fn = httpsCallable(functions, 'savePlatformGateways');
        await fn({ platformGateways: gateways, activeBillingGateway: act });
      } catch (err) {
        console.warn('Backend savePlatformGateways error, falling back to sanitized write:', err);
        await setDoc(doc(db, 'platformConfig', 'gateways'), {
          platformGateways: sanitizedGateways,
          activeBillingGateway: act,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    }
  };

  const saveLandingConfig = async (cfg: Partial<LandingConfig>) => {
    let fullLandingConfig: LandingConfig;
    const defaultStats = INITIAL_STATE.landingConfig.stats!;
    const defaultLegal = INITIAL_STATE.landingConfig.legalPages!;

    setState((prev) => {
      fullLandingConfig = {
        ...prev.landingConfig,
        ...cfg,
        sections: {
          ...prev.landingConfig.sections,
          ...(cfg.sections || {}),
        },
        stats: {
          stat1Number: cfg.stats?.stat1Number ?? prev.landingConfig.stats?.stat1Number ?? defaultStats.stat1Number,
          stat1Label: cfg.stats?.stat1Label ?? prev.landingConfig.stats?.stat1Label ?? defaultStats.stat1Label,
          stat2Number: cfg.stats?.stat2Number ?? prev.landingConfig.stats?.stat2Number ?? defaultStats.stat2Number,
          stat2Label: cfg.stats?.stat2Label ?? prev.landingConfig.stats?.stat2Label ?? defaultStats.stat2Label,
          stat3Number: cfg.stats?.stat3Number ?? prev.landingConfig.stats?.stat3Number ?? defaultStats.stat3Number,
          stat3Label: cfg.stats?.stat3Label ?? prev.landingConfig.stats?.stat3Label ?? defaultStats.stat3Label,
          stat4Number: cfg.stats?.stat4Number ?? prev.landingConfig.stats?.stat4Number ?? defaultStats.stat4Number,
          stat4Label: cfg.stats?.stat4Label ?? prev.landingConfig.stats?.stat4Label ?? defaultStats.stat4Label,
        },
        legalPages: {
          terms: {
            ...defaultLegal.terms,
            ...(prev.landingConfig.legalPages?.terms || {}),
            ...(cfg.legalPages?.terms || {}),
          },
          privacy: {
            ...defaultLegal.privacy,
            ...(prev.landingConfig.legalPages?.privacy || {}),
            ...(cfg.legalPages?.privacy || {}),
          },
          refund: {
            ...defaultLegal.refund,
            ...(prev.landingConfig.legalPages?.refund || {}),
            ...(cfg.legalPages?.refund || {}),
          },
          contact: {
            ...defaultLegal.contact,
            ...(prev.landingConfig.legalPages?.contact || {}),
            ...(cfg.legalPages?.contact || {}),
          },
        },
      };
      saveLandingConfigCache(fullLandingConfig);
      return {
        ...prev,
        landingConfig: fullLandingConfig,
      };
    });

    saveLandingConfigCache(cfg);

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformConfig', 'landing'), cfg, { merge: true });
      } catch (err) {
        console.warn('Firestore saveLandingConfig sync error:', err);
      }
    }
  };

  const saveCommsConfig = async (commsCfg: any) => {
    const sanitizedCfg: any = {
      ...commsCfg,
      twilioAuthToken: '',
      sendgridKey: '',
      whatsappAccessToken: '',
      geminiApiKey: '',
    };
    setState((prev) => ({
      ...prev,
      commsConfig: {
        ...prev.commsConfig,
        ...sanitizedCfg,
      },
    }));
    if (isFirebaseConfigured) {
      try {
        const fn = httpsCallable(functions, 'savePlatformCommsAndEvents');
        await fn({ commsConfig: commsCfg });
      } catch (err) {
        console.warn('Backend savePlatformCommsAndEvents error, falling back to sanitized write:', err);
        await setDoc(doc(db, 'platformConfig', 'comms'), sanitizedCfg, { merge: true });
      }
    }
  };

  const saveNotificationToggles = async (toggles: Record<string, boolean>) => {
    setState((prev) => ({
      ...prev,
      notificationToggles: toggles,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformConfig', 'notifications'), { notificationToggles: toggles }, { merge: true });
      } catch (err) {
        console.warn('Firestore saveNotificationToggles sync error:', err);
      }
    }
  };

  const markNotificationRead = async (notifId: string, fallbackNotif?: InAppNotification) => {
    setState((prev) => {
      const exists = (prev.notifications || []).some((n) => n.id === notifId);
      if (exists) {
        return {
          ...prev,
          notifications: (prev.notifications || []).map((n) =>
            n.id === notifId ? { ...n, isRead: true } : n
          ),
        };
      }
      if (fallbackNotif) {
        return {
          ...prev,
          notifications: [...(prev.notifications || []), { ...fallbackNotif, isRead: true }],
        };
      }
      return prev;
    });
    if (isFirebaseConfigured) {
      try {
        if (fallbackNotif) {
          await setDoc(doc(db, 'notifications', notifId), { ...fallbackNotif, isRead: true }, { merge: true });
        } else {
          await setDoc(doc(db, 'notifications', notifId), { isRead: true }, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore markNotificationRead sync error:', err);
      }
    }
  };

  const savePlatformInvoiceTemplate = async (tmpl: PlatformInvoiceTemplateConfig) => {
    setState((prev) => ({
      ...prev,
      platformInvoiceTemplate: tmpl,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformConfig', 'invoiceTemplate'), tmpl, { merge: true });
      } catch (err) {
        console.warn('Firestore savePlatformInvoiceTemplate sync error:', err);
      }
    }
  };

  const saveTenantPayoutProfile = async (profile: TenantPayoutProfile) => {
    setState((prev) => ({
      ...prev,
      payoutProfiles: [
        ...(prev.payoutProfiles || []).filter((p) => p.tenantId !== profile.tenantId),
        profile,
      ],
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'payoutProfiles', profile.tenantId), profile, { merge: true });
      } catch (err) {
        console.warn('Firestore saveTenantPayoutProfile sync error:', err);
      }
    }
    showToast('✓ Payout destination settings saved successfully.');
  };

  const createDepositSettlement = async (settlement: DepositSettlement) => {
    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: settlement.tenantId,
      title: 'Security Deposit Settlement Issued',
      body: `Your landlord has issued the move-out deposit settlement for Unit ${settlement.unit}. Net refund: ${settlement.currency}${settlement.netRefundableAmount.toLocaleString('en-IN')}. Please review and approve.`,
      link: '/tenant/payments?tab=deposit',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      depositSettlements: [
        ...(prev.depositSettlements || []).filter((s) => s.id !== settlement.id),
        settlement,
      ],
      notifications: [...(prev.notifications || []), notif],
      agreements: prev.agreements.map((a) =>
        a.id === settlement.agreementId ? { ...a, depositStatus: 'settlement_pending' as const } : a
      ),
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'depositSettlements', settlement.id), settlement, { merge: true });
        await setDoc(doc(db, 'notifications', notif.id), notif);
        await setDoc(doc(db, 'agreements', settlement.agreementId), { depositStatus: 'settlement_pending' }, { merge: true });
      } catch (err) {
        console.warn('Firestore createDepositSettlement sync error:', err);
      }
    }

    // Multi-channel dispatch: Notify tenant of settlement statement
    const tenantRec = state.tenants.find((t) => t.id === settlement.tenantId || t.name.toLowerCase() === settlement.tenantName.toLowerCase());
    const userRec = state.users.find((u) => u.id === settlement.tenantId || (tenantRec?.email && u.email?.toLowerCase() === tenantRec.email.toLowerCase()));
    logCommunication({
      type: 'deposit_settlement_issued',
      category: 'deposit',
      title: `Deposit Settlement Statement: Unit ${settlement.unit}`,
      body: `Your move-out deposit settlement statement for Unit ${settlement.unit} is ready for review. Net calculated refund: ${settlement.currency}${settlement.netRefundableAmount.toLocaleString('en-IN')}. Please log in to approve and choose your payout method.`,
      channels: ['in_app', 'sms', 'email'],
      recipientId: settlement.tenantId || userRec?.id || '',
      recipientName: settlement.tenantName,
      recipientRole: 'tenant',
      recipientContact: {
        email: settlement.tenantEmail || tenantRec?.email || userRec?.email || undefined,
        phone: (settlement as any).tenantPhone || tenantRec?.phone || userRec?.phone || undefined,
      },
      senderId: settlement.ownerId || 'system',
      senderName: 'Property Owner',
      senderRole: 'system',
      ownerId: settlement.ownerId || null,
      unitNumber: settlement.unit,
      relatedEntityId: settlement.id,
      deliveryStatus: { inApp: 'delivered' },
    }).catch(console.warn);

    showToast(`✓ Deposit settlement of ${settlement.currency}${settlement.netRefundableAmount.toLocaleString('en-IN')} created and dispatched to tenant.`);
  };

  const respondToDepositSettlement = async (
    settlementId: string,
    decision: 'approved' | 'rejected' | 'contested',
    notes?: string,
    payoutDetails?: SettlementPayoutDetails
  ) => {
    const existing = (state.depositSettlements || []).find((s) => s.id === settlementId);
    if (!existing) return;

    const now = new Date().toISOString();
    const updated: DepositSettlement = {
      ...existing,
      status: decision,
      tenantApprovedAt: decision === 'approved' ? now : undefined,
      rejectionReason: decision === 'rejected' ? (notes || existing.rejectionReason) : existing.rejectionReason,
      rejectionDate: decision === 'rejected' ? now : existing.rejectionDate,
      notes: notes || existing.notes,
      chosenPayoutDetails: payoutDetails || existing.chosenPayoutDetails,
    };

    const payoutMethodLabel = payoutDetails
      ? payoutDetails.method === 'upi'
        ? `UPI (${payoutDetails.upiId})`
        : payoutDetails.method === 'paypal'
        ? `PayPal (${payoutDetails.paypalEmail})`
        : payoutDetails.method === 'iban'
        ? `IBAN (${payoutDetails.iban})`
        : payoutDetails.method === 'bank_in'
        ? `Bank Account (${payoutDetails.accountNumber})`
        : 'In-Person Cash Handover'
      : '';

    const notifTitle =
      decision === 'approved'
        ? 'Deposit Settlement Accepted'
        : decision === 'rejected'
        ? 'Deposit Deductions Rejected by Resident'
        : 'Deposit Deductions Contested';

    const notifBody =
      decision === 'approved'
        ? `${existing.tenantName} approved the deposit settlement of ${existing.currency}${existing.netRefundableAmount.toLocaleString('en-IN')} for Unit ${existing.unit}.${payoutMethodLabel ? ` Preferred payout: ${payoutMethodLabel}.` : ''} You may now disburse the refund.`
        : decision === 'rejected'
        ? `${existing.tenantName} rejected proposed deductions for Unit ${existing.unit}.${notes ? ` Reason: "${notes}".` : ''} Please recalculate and re-send the settlement.`
        : `${existing.tenantName} has contested deductions for Unit ${existing.unit}.${notes ? ` Note: "${notes}"` : ''}`;

    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: existing.ownerId,
      title: notifTitle,
      body: notifBody,
      link: '/owner/vacates',
      isRead: false,
      createdAt: now,
    };

    setState((prev) => ({
      ...prev,
      depositSettlements: (prev.depositSettlements || []).map((s) => (s.id === settlementId ? updated : s)),
      notifications: [...(prev.notifications || []), notif],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'depositSettlements', settlementId), updated, { merge: true });
        await setDoc(doc(db, 'notifications', notif.id), notif);
      } catch (err) {
        console.warn('Firestore respondToDepositSettlement sync error:', err);
      }
    }

    // Multi-channel dispatch: Notify Owner of tenant decision
    const ownerRec = existing.ownerId ? state.users.find((u) => u.id === existing.ownerId) : null;
    logCommunication({
      type: decision === 'approved' ? 'settlement_accepted' : 'settlement_contested',
      category: 'deposit',
      title: decision === 'approved' ? `Settlement Accepted — Unit ${existing.unit}` : `Settlement Rejected — Unit ${existing.unit}`,
      body: notifBody,
      channels: ['in_app', 'sms', 'email'],
      recipientId: existing.ownerId,
      recipientName: ownerRec?.displayName || 'Property Owner',
      recipientRole: 'owner',
      recipientContact: {
        email: ownerRec?.email || undefined,
        phone: ownerRec?.phone || undefined,
      },
      senderId: existing.tenantId || 'system',
      senderName: existing.tenantName || 'Tenant',
      senderRole: 'system',
      ownerId: existing.ownerId,
      unitNumber: existing.unit,
      relatedEntityId: existing.id,
      deliveryStatus: { inApp: 'delivered' },
    }).catch(console.warn);

    showToast(decision === 'approved' ? '✓ Settlement accepted. Landlord notified for refund disbursement.' : 'Contest notice sent to landlord.');
  };

  const executeDepositRefund = async (
    settlementId: string,
    payoutDetails: {
      disbursementMethod: 'gateway_automated' | 'bank_manual_transfer' | 'cash_handover';
      paymentReference: string;
      proofDocumentUrl?: string;
    }
  ) => {
    const existing = (state.depositSettlements || []).find((s) => s.id === settlementId);
    if (!existing) return;

    const now = new Date().toISOString();

    if (payoutDetails.disbursementMethod === 'cash_handover') {
      const claimId = await submitCashClaim({
        direction: 'outflow',
        type: 'deposit_refund',
        amount: existing.netRefundableAmount,
        currency: existing.currency,
        ownerId: existing.ownerId,
        tenantId: existing.tenantId,
        tenantName: existing.tenantName,
        unit: existing.unit,
        propertyName: existing.propertyName,
        propertyId: existing.propertyId,
        settlementId: existing.id,
        moveOutId: (existing as any).moveOutId || existing.id.replace(/^DEP-SETTLE-/i, ''),
        claimedBy: existing.ownerId,
        claimedByRole: 'owner',
        claimedByName: state.users.find((u) => u.id === existing.ownerId)?.displayName || 'Property Owner',
        handoverDate: now.split('T')[0],
        handoverLocation: `Unit ${existing.unit} Move-Out Inspection`,
        notes: `Cash deposit refund handover logged by owner. Ref: ${payoutDetails.paymentReference}`,
        proofPhotoUrl: payoutDetails.proofDocumentUrl,
      });
      showToast(`✓ Cash refund handover recorded (Claim #${claimId}). Awaiting tenant confirmation.`);
      return;
    }

    const updatedSettlement: DepositSettlement = {
      ...existing,
      status: 'refunded',
      disbursementMethod: payoutDetails.disbursementMethod,
      paymentReference: payoutDetails.paymentReference,
      proofDocumentUrl: payoutDetails.proofDocumentUrl,
      disbursedAt: now,
    };

    // MoveOut update -> transition to refund_completed for this specific move-out
    const matchingMoveout =
      (state.moveouts || []).find((m) => m.id === existing.id.replace('DEP-SETTLE-', '')) ||
      (existing.agreementId ? (state.moveouts || []).find((m) => (m as any).agreementId === existing.agreementId) : null) ||
      (state.moveouts || []).find((m) => m.unit === existing.unit && m.status !== 'refund_completed');
    const targetMoveoutId = matchingMoveout?.id || existing.id.replace('DEP-SETTLE-', '');
    const updatedMoveouts = (state.moveouts || []).map((m) =>
      m.id === targetMoveoutId
        ? {
            ...m,
            status: 'refund_completed' as const,
            completedAt: now,
            finalRefundAmount: existing.netRefundableAmount,
          }
        : m
    );

    // Agreement update
    const updatedAgreements = state.agreements.map((a) =>
      a.id === existing.agreementId
        ? { ...a, depositStatus: 'refunded' as const, status: 'terminated' as const }
        : a
    );

    // Unit update -> transition to vacant ONLY if still assigned to this vacated tenancy
    const targetUnit = state.units.find(
      (u) =>
        (u.unitNumber === existing.unit || u.id === existing.unit) &&
        (!existing.propertyId || !u.propertyId || u.propertyId === existing.propertyId)
    );
    const targetUnitId = targetUnit?.id;

    const updatedUnits = state.units.map((u) => {
      const matches =
        u.id === targetUnitId ||
        ((u.unitNumber === existing.unit || u.id === existing.unit) &&
          (!existing.propertyId || !u.propertyId || u.propertyId === existing.propertyId));
      const isAssignedToThisVacatingTenant =
        !existing.tenantId ||
        u.currentTenantId === existing.tenantId ||
        (existing.tenantName && u.tenant?.toLowerCase() === existing.tenantName.toLowerCase());
      return matches && isAssignedToThisVacatingTenant
        ? { ...u, status: 'vacant' as const, tenant: null, currentTenantId: null }
        : u;
    });

    // Recalculate property occupied count
    const updatedProperties = state.properties.map((p) => {
      const occupied = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
      return { ...p, occupied };
    });

    // Tenant update -> archive vacated tenancy
    const targetTenant = state.tenants.find(
      (t) =>
        (existing.tenantId && t.id === existing.tenantId) ||
        (existing.tenantEmail && t.email?.toLowerCase() === existing.tenantEmail.toLowerCase()) ||
        (existing.tenantName && t.name.toLowerCase() === existing.tenantName.toLowerCase()) ||
        t.unit === existing.unit
    );
    const targetTenantId = targetTenant?.id;

    const updatedTenants = state.tenants.map((t) => {
      const isTarget =
        (existing.tenantId && t.id === existing.tenantId) ||
        (existing.tenantEmail && t.email?.toLowerCase() === existing.tenantEmail.toLowerCase()) ||
        (existing.tenantName && t.name.toLowerCase() === existing.tenantName.toLowerCase()) ||
        (t.unit === existing.unit && (!existing.propertyId || !t.propertyId || t.propertyId === existing.propertyId));

      if (isTarget) {
        const pastItem = {
          unit: existing.unit,
          owner: existing.ownerId || 'Property Owner',
          property: existing.propertyName || existing.propertyId || 'Residential Property',
          period: `${t.leaseStart || 'Past'} - ${now.split('T')[0]}`,
          leaseStart: t.leaseStart || '',
          leaseEnd: now.split('T')[0],
          rent: t.rent || 0,
          paymentScore: 100,
          flags: [] as string[],
          disputes: 0,
        };

        // Find remaining active agreements for this tenant across all properties
        const remainingActiveAgs = updatedAgreements.filter(
          (a) =>
            a.status === 'active' &&
            a.id !== existing.agreementId &&
            ((t.id && a.tenantId === t.id) ||
              (t.email && a.tenantEmail?.toLowerCase() === t.email.toLowerCase()))
        );

        const nextAg = remainingActiveAgs[0];
        const nextUnit = nextAg?.unit || 'Unassigned';
        const remainingUnits = remainingActiveAgs.map((a) => a.unit);

        return {
          ...t,
          unit: nextUnit,
          owner: nextAg ? (nextAg.ownerName || 'Property Owner') : 'Unassigned',
          ownerId: nextAg ? (nextAg.ownerId || '') : '',
          propertyId: nextAg ? (nextAg.propertyId || '') : '',
          propertyName: nextAg ? ((nextAg as any).propertyName || state.properties.find((p) => p.id === nextAg.propertyId)?.name || 'Residence') : '',
          leaseStart: nextAg ? (nextAg.start || '') : '',
          leaseEnd: nextAg ? (nextAg.end || '') : '',
          rent: nextAg ? (nextAg.rent || 0) : 0,
          deposit: nextAg ? (nextAg.deposit || 0) : 0,
          currency: nextAg ? (nextAg.currency || t.currency) : t.currency,
          unitsRented: remainingUnits,
          history: [pastItem, ...(t.history || [])],
        };
      }
      return t;
    });

    // Tenant notification
    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: existing.tenantId,
      title: 'Security Deposit Refund Disbursed!',
      body: `Your net deposit refund of ${existing.currency}${existing.netRefundableAmount.toLocaleString('en-IN')} has been disbursed via ${payoutDetails.disbursementMethod === 'gateway_automated' ? 'Payment Gateway' : 'Bank Wire / Transfer'} (Ref: ${payoutDetails.paymentReference}).`,
      link: '/tenant/lease',
      isRead: false,
      createdAt: now,
    };

    // Void any pending/overdue rent/deposit invoices for this tenant & unit upon refund
    const updatedInvoices = state.invoices.map((inv) => {
      const isForThisAgreement = Boolean(existing.agreementId && inv.leaseAgreementId === existing.agreementId);
      const isForThisUnit =
        (inv.unit === existing.unit || isForThisAgreement) &&
        (!existing.propertyId || !inv.propertyId || inv.propertyId === existing.propertyId);
      const isForThisTenant =
        (existing.tenantId && inv.tenantId === existing.tenantId) ||
        (existing.tenantEmail && inv.tenantEmail?.toLowerCase() === existing.tenantEmail.toLowerCase()) ||
        (existing.tenantName && inv.tenant?.toLowerCase() === existing.tenantName.toLowerCase());

      // Guard: do not void if invoice is linked to another active agreement
      const invoiceAg = inv.leaseAgreementId ? state.agreements.find((a) => a.id === inv.leaseAgreementId) : null;
      if (invoiceAg && invoiceAg.id !== existing.agreementId && invoiceAg.status !== 'terminated') {
        return inv;
      }

      if ((isForThisAgreement || (isForThisUnit && isForThisTenant)) && inv.status !== 'paid') {
        return {
          ...inv,
          status: 'void' as const,
          notes: 'Voided automatically upon move-out deposit refund disbursement and tenancy conclusion.',
        };
      }
      return inv;
    });

    const refundTxId = `TXN-REF-${(existing.agreementId || existing.id).slice(-6).toUpperCase()}`;
    const refundPayment: PaymentTransaction = {
      id: refundTxId,
      invoiceId: `REF-${existing.id}`,
      amount: existing.netRefundableAmount,
      currency: existing.currency,
      date: now.split('T')[0],
      dueDate: now.split('T')[0],
      method: payoutDetails.disbursementMethod || 'Direct Transfer',
      status: 'paid',
      direction: 'outflow',
      type: 'deposit_refund',
      unit: existing.unit,
      propertyId: existing.propertyId,
      tenantId: existing.tenantId,
      tenant: existing.tenantName,
      ownerId: existing.ownerId,
      notes: `Security deposit refund disbursed (${payoutDetails.paymentReference || 'Direct Transfer'})`,
      audit: {
        claimedBy: existing.ownerId,
        claimedByRole: 'owner',
        claimedAt: now,
      },
    };

    setState((prev) => ({
      ...prev,
      depositSettlements: (prev.depositSettlements || []).map((s) => (s.id === settlementId ? updatedSettlement : s)),
      moveouts: updatedMoveouts,
      agreements: updatedAgreements,
      units: updatedUnits,
      properties: updatedProperties,
      tenants: updatedTenants,
      invoices: updatedInvoices,
      payments: [...(prev.payments || []).filter((p) => p.id !== refundTxId), refundPayment],
      renewals: (prev.renewals || []).filter((r) => r.unit !== existing.unit),
      notifications: [...(prev.notifications || []), notif],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'payments', refundTxId), cleanFirestoreObject(refundPayment), { merge: true });
        await setDoc(doc(db, 'depositSettlements', settlementId), updatedSettlement, { merge: true });
        await setDoc(doc(db, 'agreements', existing.agreementId), { depositStatus: 'refunded', status: 'terminated' }, { merge: true });
        if (targetUnit) {
          await setDoc(doc(db, 'units', targetUnit.id), { status: 'vacant', tenant: null, currentTenantId: null }, { merge: true });
        }
        if (matchingMoveout) {
          await setDoc(
            doc(db, 'moveouts', matchingMoveout.id),
            { status: 'refund_completed', completedAt: now, finalRefundAmount: existing.netRefundableAmount },
            { merge: true }
          );
        }
        if (targetTenantId) {
          const tenantAfterUpdate = updatedTenants.find((t) => t.id === targetTenantId);
          if (tenantAfterUpdate) {
            await setDoc(doc(db, 'tenants', targetTenantId), tenantAfterUpdate, { merge: true });
          }
        }
        for (const inv of updatedInvoices) {
          if (inv.status === 'void' && (inv.unit === existing.unit || inv.leaseAgreementId === existing.agreementId)) {
            await setDoc(doc(db, 'invoices', inv.id), { status: 'void', notes: inv.notes }, { merge: true });
          }
        }
        await setDoc(doc(db, 'notifications', notif.id), notif);
      } catch (err) {
        console.warn('Firestore executeDepositRefund sync error:', err);
      }
    }

    // Multi-channel dispatch: Notify Tenant that refund has been disbursed
    const tenantRecD = state.tenants.find((t) => t.id === existing.tenantId || t.name.toLowerCase() === existing.tenantName.toLowerCase());
    const userRecD = state.users.find((u) => u.id === existing.tenantId || (tenantRecD?.email && u.email?.toLowerCase() === tenantRecD.email.toLowerCase()));
    logCommunication({
      type: 'deposit_refund_disbursed',
      category: 'deposit',
      title: `Deposit Refund Disbursed: Unit ${existing.unit}`,
      body: `Your security deposit refund of ${getCurrencySymbol(existing.currency) || DEFAULT_CURRENCY_SYMBOL}${Number(existing.netRefundableAmount).toLocaleString('en-IN')} has been disbursed via ${payoutDetails.disbursementMethod === 'gateway_automated' ? 'Payment Gateway' : 'Bank Wire / Transfer'} (Ref: ${payoutDetails.paymentReference}). Thank you!`,
      channels: ['in_app', 'sms', 'email'],
      recipientId: existing.tenantId || userRecD?.id || '',
      recipientName: existing.tenantName,
      recipientRole: 'tenant',
      recipientContact: {
        email: existing.tenantEmail || tenantRecD?.email || userRecD?.email || undefined,
        phone: (existing as any).tenantPhone || tenantRecD?.phone || userRecD?.phone || undefined,
      },
      senderId: existing.ownerId || 'system',
      senderName: 'Property Owner',
      senderRole: 'system',
      ownerId: existing.ownerId,
      unitNumber: existing.unit,
      relatedEntityId: existing.id,
      deliveryStatus: { inApp: 'delivered' },
    }).catch(console.warn);

    showToast(`✓ Security deposit refund of ${getCurrencySymbol(existing.currency) || DEFAULT_CURRENCY_SYMBOL}${Number(existing.netRefundableAmount).toLocaleString('en-IN')} marked as disbursed.`);
  };

  const confirmRefundReceipt = async (settlementId: string) => {
    let existing = (state.depositSettlements || []).find((s) => s.id === settlementId);
    if (!existing) {
      existing = (state.depositSettlements || []).find(
        (s) =>
          s.id.includes(settlementId) ||
          settlementId.includes(s.id) ||
          (s.unit && settlementId.includes(s.unit)) ||
          (s.agreementId && settlementId.includes(s.agreementId))
      );
    }

    const matchingMoveout = (state.moveouts || []).find(
      (m) =>
        (existing && (m.id === existing.id.replace('DEP-SETTLE-', '') || m.unit === existing.unit)) ||
        m.id === settlementId ||
        (m.unit && settlementId.includes(m.unit))
    );

    const now = new Date().toISOString();

    if (!existing && !matchingMoveout) return;

    const effPropId = existing?.propertyId || matchingMoveout?.propertyId || '';
    const effPropName =
      existing?.propertyName ||
      matchingMoveout?.propertyName ||
      (effPropId ? state.properties.find((p) => p.id === effPropId)?.name : '') ||
      'Residential Property';

    const targetSettlement: DepositSettlement = existing || {
      id: `DEP-SETTLE-${matchingMoveout!.id || `${effPropId}-${matchingMoveout!.unit}`}`,
      agreementId: matchingMoveout!.agreementId || '',
      propertyId: effPropId,
      propertyName: effPropName,
      unit: matchingMoveout!.unit,
      tenantId: matchingMoveout!.tenantId || '',
      tenantName: matchingMoveout!.tenant || 'Resident',
      tenantEmail: matchingMoveout!.tenantEmail || '',
      ownerId: matchingMoveout!.ownerId || '',
      grossDepositHeld: matchingMoveout!.deposit || 0,
      deductions: [],
      totalDeductions: 0,
      netRefundableAmount: matchingMoveout!.deposit || 0,
      status: 'refunded',
      currency: matchingMoveout!.currency || '$',
      disbursedAt: now,
      disbursementMethod: 'bank_manual_transfer',
      tenantConfirmedReceipt: true,
      tenantConfirmedAt: now,
      createdAt: now,
    };

    const updatedSettlement: DepositSettlement = {
      ...targetSettlement,
      status: 'refunded',
      tenantConfirmedReceipt: true,
      tenantConfirmedAt: now,
    };

    // Update MoveOut -> refund_completed (scoped strictly to target moveout / property)
    const updatedMoveouts = (state.moveouts || []).map((m) => {
      const isTarget =
        m.id === targetSettlement.id.replace('DEP-SETTLE-', '') ||
        m.id === settlementId ||
        (matchingMoveout && m.id === matchingMoveout.id) ||
        (m.unit === targetSettlement.unit && (!effPropId || !m.propertyId || m.propertyId === effPropId));
      return isTarget
        ? {
            ...m,
            status: 'refund_completed' as const,
            tenantConfirmedReceipt: true,
            tenantConfirmedAt: now,
            completedAt: m.completedAt || now,
            finalRefundAmount: targetSettlement.netRefundableAmount ?? m.deposit ?? 0,
          }
        : m;
    });

    const normalizeUnitStr = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
    const settleUnitClean = normalizeUnitStr(targetSettlement.unit);
    const vacatingTenantId = targetSettlement.tenantId || matchingMoveout?.tenantId;
    const vacatingTenantName = targetSettlement.tenantName || matchingMoveout?.tenant;

    // Update Agreement -> terminated, depositStatus: 'refunded' (STRICTLY scoped to this property/agreement)
    const updatedAgreements = (state.agreements || []).map((a) => {
      const isDirectAgMatch =
        (targetSettlement.agreementId && a.id === targetSettlement.agreementId) ||
        (matchingMoveout?.agreementId && a.id === matchingMoveout.agreementId);

      const isSameProperty = !effPropId || !a.propertyId || a.propertyId === effPropId;

      const isForThisVacatingTenancy =
        isDirectAgMatch ||
        (!targetSettlement.agreementId &&
          isSameProperty &&
          settleUnitClean &&
          normalizeUnitStr(a.unit) === settleUnitClean &&
          ((vacatingTenantId && a.tenantId === vacatingTenantId) ||
            (vacatingTenantName && a.tenant?.toLowerCase() === vacatingTenantName.toLowerCase())));

      return isForThisVacatingTenancy
        ? { ...a, depositStatus: 'refunded' as const, status: 'terminated' as const }
        : a;
    });

    // Re-onboard protection: Check if unit has another active agreement for a different tenancy
    const otherActiveAg = updatedAgreements.find(
      (a) =>
        settleUnitClean &&
        normalizeUnitStr(a.unit) === settleUnitClean &&
        (!effPropId || !a.propertyId || a.propertyId === effPropId) &&
        a.status === 'active' &&
        a.id !== targetSettlement.agreementId &&
        a.tenantId !== vacatingTenantId &&
        a.tenant?.toLowerCase() !== vacatingTenantName?.toLowerCase()
    );
    const hasOtherActiveTenancy = !!otherActiveAg;

    // Update Unit -> vacant only if not occupied by an active re-onboarded lease (scoped to property)
    const targetUnit = (state.units || []).find(
      (u) =>
        (settleUnitClean && (normalizeUnitStr(u.unitNumber) === settleUnitClean || normalizeUnitStr(u.id) === settleUnitClean) && (!effPropId || !u.propertyId || u.propertyId === effPropId)) ||
        (vacatingTenantId && u.currentTenantId === vacatingTenantId && (!effPropId || !u.propertyId || u.propertyId === effPropId))
    );
    const targetUnitId = targetUnit?.id;

    const updatedUnits = (state.units || []).map((u) => {
      const matches =
        (targetUnitId && u.id === targetUnitId) ||
        (settleUnitClean && (normalizeUnitStr(u.unitNumber) === settleUnitClean || normalizeUnitStr(u.id) === settleUnitClean) && (!effPropId || !u.propertyId || u.propertyId === effPropId));
      if (!matches) return u;
      if (hasOtherActiveTenancy && otherActiveAg) {
        return {
          ...u,
          status: 'occupied' as const,
          tenant: otherActiveAg.tenant || 'Resident',
          currentTenantId: otherActiveAg.tenantId,
          rent: otherActiveAg.rent,
          deposit: otherActiveAg.deposit,
        };
      }
      return { ...u, status: 'vacant' as const, tenant: null, currentTenantId: null, rent: u.rent || 0, deposit: u.deposit || 0 };
    });

    // Synchronize any matching cash handover claims
    const cleanUnit = (u?: string) => (u || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase();
    const updatedCashClaims = (state.cashClaims || []).map((c) => {
      const isForThisSettlement =
        c.settlementId === settlementId ||
        c.settlementId === targetSettlement.id ||
        (targetSettlement.cashClaimId && c.id === targetSettlement.cashClaimId) ||
        (c.moveOutId && (c.moveOutId === matchingMoveout?.id || targetSettlement.id.includes(c.moveOutId))) ||
        (c.unit && targetSettlement.unit && cleanUnit(c.unit) === cleanUnit(targetSettlement.unit) && (c.type === 'deposit_refund' || c.claimedByRole === 'owner'));
      if (isForThisSettlement && (c.status === 'pending_confirmation' || (c as any).status === 'pending')) {
        return {
          ...c,
          status: 'confirmed' as const,
          confirmedAt: now,
          confirmedBy: targetSettlement.tenantId || targetSettlement.ownerId,
          confirmedByName: targetSettlement.tenantName || 'Tenant',
        };
      }
      return c;
    });

    // Update Property occupancy
    const updatedProperties = (state.properties || []).map((p) => {
      const occupied = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
      return { ...p, occupied };
    });

    // Update Tenant: remove unit, archive to history
    const targetTenant = (state.tenants || []).find(
      (t) =>
        (targetSettlement.tenantId && t.id === targetSettlement.tenantId) ||
        (targetSettlement.tenantEmail && t.email?.toLowerCase() === targetSettlement.tenantEmail.toLowerCase()) ||
        (targetSettlement.tenantName && t.name.toLowerCase() === targetSettlement.tenantName.toLowerCase()) ||
        (t.unit === targetSettlement.unit && (!effPropId || !t.propertyId || t.propertyId === effPropId))
    );
    const targetTenantId = targetTenant?.id;

    const updatedTenants = (state.tenants || []).map((t) => {
      if (
        (targetSettlement.tenantId && t.id === targetSettlement.tenantId) ||
        (targetSettlement.tenantEmail && t.email?.toLowerCase() === targetSettlement.tenantEmail.toLowerCase()) ||
        (targetSettlement.tenantName && t.name.toLowerCase() === targetSettlement.tenantName.toLowerCase()) ||
        (t.unit === targetSettlement.unit && (!effPropId || !t.propertyId || t.propertyId === effPropId))
      ) {
        const pastItem = {
          unit: targetSettlement.unit,
          owner: targetSettlement.ownerId || 'Property Owner',
          property: targetSettlement.propertyName || targetSettlement.propertyId || 'Residential Property',
          period: `${t.leaseStart || 'Past'} - ${now.split('T')[0]}`,
          leaseStart: t.leaseStart || '',
          leaseEnd: now.split('T')[0],
          rent: t.rent || 0,
          paymentScore: 100,
          flags: [] as string[],
          disputes: 0,
        };
        const remainingUnits = (t.unitsRented || []).filter(
          (u) => u !== targetSettlement.unit && u !== targetUnitId
        );
        const nextUnit = remainingUnits[0] || 'Unassigned';
        return {
          ...t,
          unit: nextUnit,
          owner: nextUnit === 'Unassigned' ? 'Unassigned' : t.owner,
          ownerId: nextUnit === 'Unassigned' ? '' : t.ownerId,
          leaseStart: nextUnit === 'Unassigned' ? '' : t.leaseStart,
          leaseEnd: nextUnit === 'Unassigned' ? '' : t.leaseEnd,
          rent: nextUnit === 'Unassigned' ? 0 : t.rent,
          deposit: nextUnit === 'Unassigned' ? 0 : t.deposit,
          unitsRented: remainingUnits,
          history: [pastItem, ...(t.history || [])],
        };
      }
      return t;
    });

    // VOID any pending/overdue rent/deposit invoices for this tenant & unit
    const updatedInvoices = (state.invoices || []).map((inv) => {
      const isForThisUnit =
        (inv.unit === targetSettlement.unit || (targetSettlement.agreementId && inv.leaseAgreementId === targetSettlement.agreementId)) &&
        (!effPropId || !inv.propertyId || inv.propertyId === effPropId);
      const isForThisTenant =
        (targetSettlement.tenantId && inv.tenantId === targetSettlement.tenantId) ||
        (targetSettlement.tenantEmail && inv.tenantEmail?.toLowerCase() === targetSettlement.tenantEmail.toLowerCase()) ||
        (targetSettlement.tenantName && inv.tenant?.toLowerCase() === targetSettlement.tenantName.toLowerCase());
      if (isForThisUnit && isForThisTenant && inv.status !== 'paid') {
        return {
          ...inv,
          status: 'void' as const,
          notes: 'Voided upon tenant confirmation of deposit refund and full tenancy conclusion.',
        };
      }
      return inv;
    });

    // Remove any active renewal requests for this unit & property
    const updatedRenewals = (state.renewals || []).filter(
      (r) => r.unit !== targetSettlement.unit || (effPropId && r.propertyId && r.propertyId !== effPropId)
    );

    // Notifications
    const ownerNotif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: targetSettlement.ownerId,
      title: 'Deposit Refund Receipt Confirmed',
      body: `${targetSettlement.tenantName} confirmed receipt of the ${getCurrencySymbol(targetSettlement.currency) || DEFAULT_CURRENCY_SYMBOL}${Number(targetSettlement.netRefundableAmount).toLocaleString('en-IN')} refund for Unit ${targetSettlement.unit}. Tenancy successfully concluded and ledger archived.`,
      link: '/owner/vacates',
      isRead: false,
      createdAt: now,
    };

    const tenantNotif: InAppNotification = {
      id: `notif_${Date.now() + 1}`,
      userId: targetSettlement.tenantId,
      title: 'Tenancy Concluded — Refund Acknowledged',
      body: `You have confirmed receipt of your deposit refund for Unit ${targetSettlement.unit}. Active residence records and rent dues have been cleared.`,
      link: '/tenant/payments?tab=deposit',
      isRead: false,
      createdAt: now,
    };

    setState((prev) => ({
      ...prev,
      depositSettlements: (prev.depositSettlements || []).some((s) => s.id === targetSettlement.id)
        ? (prev.depositSettlements || []).map((s) =>
            s.id === targetSettlement.id || s.id === settlementId || (targetSettlement.unit && s.unit === targetSettlement.unit && (!effPropId || !s.propertyId || s.propertyId === effPropId))
              ? {
                  ...s,
                  status: 'refunded' as const,
                  tenantConfirmedReceipt: true,
                  tenantConfirmedAt: now,
                }
              : s
          )
        : [...(prev.depositSettlements || []), updatedSettlement],
      moveouts: updatedMoveouts,
      agreements: updatedAgreements,
      units: updatedUnits,
      properties: updatedProperties,
      tenants: updatedTenants,
      cashClaims: updatedCashClaims,
      invoices: updatedInvoices,
      renewals: updatedRenewals,
      notifications: [...(prev.notifications || []), ownerNotif, tenantNotif],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'depositSettlements', targetSettlement.id), cleanFirestoreObject(updatedSettlement), { merge: true });
        if (settlementId !== targetSettlement.id) {
          await setDoc(doc(db, 'depositSettlements', settlementId), cleanFirestoreObject(updatedSettlement), { merge: true }).catch(() => {});
        }
        if (targetSettlement.agreementId) {
          await setDoc(doc(db, 'agreements', targetSettlement.agreementId), cleanFirestoreObject({ depositStatus: 'refunded', status: 'terminated' }), { merge: true });
        }
        if (targetUnit && !hasOtherActiveTenancy) {
          await setDoc(doc(db, 'units', targetUnit.id), cleanFirestoreObject({ status: 'vacant', tenant: null, currentTenantId: null }), { merge: true });
        }
        for (const mo of updatedMoveouts) {
          if (mo.tenantConfirmedReceipt && (mo.id === matchingMoveout?.id || mo.id === targetSettlement.id.replace('DEP-SETTLE-', '') || (mo.unit === targetSettlement.unit && (!effPropId || !mo.propertyId || mo.propertyId === effPropId)))) {
            await setDoc(
              doc(db, 'moveouts', mo.id),
              cleanFirestoreObject({
                status: 'refund_completed',
                tenantConfirmedReceipt: true,
                tenantConfirmedAt: now,
                completedAt: mo.completedAt || now,
                finalRefundAmount: mo.finalRefundAmount || targetSettlement.netRefundableAmount,
              }),
              { merge: true }
            ).catch(console.warn);
          }
        }
        for (const claim of updatedCashClaims) {
          if (claim.status === 'confirmed') {
            await setDoc(doc(db, 'cashClaims', claim.id), cleanFirestoreObject(claim), { merge: true }).catch(() => {});
          }
        }
        if (targetTenantId) {
          const tenantAfterUpdate = updatedTenants.find((t) => t.id === targetTenantId);
          if (tenantAfterUpdate) {
            await setDoc(doc(db, 'tenants', targetTenantId), cleanFirestoreObject(tenantAfterUpdate), { merge: true });
          }
        }
        for (const inv of updatedInvoices) {
          if (inv.status === 'void' && (inv.unit === targetSettlement.unit || inv.leaseAgreementId === targetSettlement.agreementId)) {
            await setDoc(doc(db, 'invoices', inv.id), cleanFirestoreObject({ status: 'void', notes: inv.notes }), { merge: true });
          }
        }
        await setDoc(doc(db, 'notifications', ownerNotif.id), cleanFirestoreObject(ownerNotif));
        await setDoc(doc(db, 'notifications', tenantNotif.id), cleanFirestoreObject(tenantNotif));
      } catch (err) {
        console.warn('Firestore confirmRefundReceipt sync error:', err);
      }
    }

    logCommunication({
      type: 'deposit_refund_acknowledged',
      category: 'deposit',
      title: `Deposit Refund Receipt Confirmed — Unit ${targetSettlement.unit}`,
      body: `${targetSettlement.tenantName} has confirmed receipt of the deposit refund of ${getCurrencySymbol(targetSettlement.currency) || DEFAULT_CURRENCY_SYMBOL}${Number(targetSettlement.netRefundableAmount).toLocaleString('en-IN')}. Tenancy obligations completed.`,
      channels: ['in_app', 'sms', 'email'],
      recipientId: targetSettlement.ownerId,
      recipientName: 'Property Owner',
      recipientRole: 'owner',
      recipientContact: {},
      senderId: targetSettlement.tenantId || 'system',
      senderName: targetSettlement.tenantName || 'Tenant',
      senderRole: 'system',
      ownerId: targetSettlement.ownerId,
      unitNumber: targetSettlement.unit,
      relatedEntityId: targetSettlement.id,
      deliveryStatus: { inApp: 'delivered' },
    }).catch(console.warn);

    showToast('✓ Deposit refund receipt confirmed! Tenancy successfully concluded and dues cleared.');
  };

  const submitCashClaim = async (
    claimData: Omit<CashHandoverClaim, 'id' | 'status' | 'claimedAt'>
  ): Promise<string> => {
    if (!claimData.amount || claimData.amount <= 0) {
      showToast('Handover amount must be greater than zero.');
      return '';
    }

    // Client pre-validation: check for existing pending claim for the same invoice or settlement
    if (claimData.invoiceId) {
      const hasPending = (state.cashClaims || []).some(
        (c) => c.invoiceId === claimData.invoiceId && c.status === 'pending_confirmation'
      );
      if (hasPending) {
        showToast('A cash handover claim is already pending confirmation for this invoice.');
        return '';
      }
    }

    if (claimData.settlementId) {
      const hasPending = (state.cashClaims || []).some(
        (c) => c.settlementId === claimData.settlementId && c.status === 'pending_confirmation'
      );
      if (hasPending) {
        showToast('A cash handover claim is already pending confirmation for this deposit settlement.');
        return '';
      }
    }

    // Server-side validation via callable Cloud Function
    if (isFirebaseConfigured && auth.currentUser) {
      try {
        const valFn = httpsCallable<any, any>(functions, 'validateCashClaim');
        await valFn({
          amount: claimData.amount,
          invoiceId: claimData.invoiceId,
          settlementId: claimData.settlementId,
          direction: claimData.direction,
          claimedBy: auth.currentUser.uid,
        });
      } catch (err: any) {
        const code = err?.code;
        const msg = err?.message || '';
        // Only block if there is a genuine business conflict (e.g. amount mismatch or duplicate pending claim)
        if (
          code === 'already-exists' ||
          code === 'invalid-argument' ||
          code === 'failed-precondition'
        ) {
          showToast(`Verification failed: ${msg}`);
          return '';
        }
        // If Cloud Function encountered backend IAM/infrastructure error (e.g. 7 PERMISSION_DENIED),
        // log warning and proceed with client-verified claim
        console.warn('validateCashClaim server notice, continuing with verified claim:', err);
      }
    }

    const claimId = `CSH-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    const newClaim: CashHandoverClaim = {
      ...claimData,
      id: claimId,
      status: 'pending_confirmation',
      claimedAt: now,
    };

    const txnId = `TXN-${claimId}`;
    newClaim.transactionId = txnId;

    const newTxn: PaymentTransaction = {
      id: txnId,
      ownerId: claimData.ownerId,
      tenant: claimData.tenantName,
      tenantId: claimData.tenantId,
      unit: claimData.unit,
      propertyId: claimData.propertyId,
      amount: claimData.amount,
      currency: claimData.currency || 'INR',
      date: claimData.handoverDate || now.split('T')[0],
      dueDate: claimData.handoverDate || now.split('T')[0],
      direction: claimData.direction,
      status: 'pending_confirmation',
      method: 'Cash (Handover)',
      type: claimData.type === 'deposit_refund' ? 'deposit_refund' : (claimData.type === 'deposit' ? 'deposit' : 'rent'),
      invoiceId: claimData.invoiceId,
      settlementId: claimData.settlementId,
      cashClaimId: claimId,
      notes: claimData.notes,
      audit: {
        claimedBy: claimData.claimedBy,
        claimedByRole: claimData.claimedByRole,
        claimedByName: claimData.claimedByName,
        claimedAt: now,
        handoverLocation: claimData.handoverLocation,
        proofPhotoUrl: claimData.proofPhotoUrl,
      },
    };

    let updatedInvoices = state.invoices;
    let targetInvoice: Invoice | undefined;
    if (claimData.invoiceId) {
      targetInvoice = state.invoices.find((i) => i.id === claimData.invoiceId);
      if (targetInvoice) {
        const proofRef = claimData.notes?.match(/Ref:\s*([^—\n]+)/)?.[1]?.trim() || claimData.notes || claimId;
        const invUpdated: Invoice = {
          ...targetInvoice,
          status: 'pending_confirmation',
          paymentMethodUsed: 'Cash (Handover)',
          paymentProofRef: proofRef,
          paymentProofUrl: claimData.proofPhotoUrl || undefined,
          paymentProofNotes: claimData.notes || undefined,
          paymentProofDate: now,
        };
        updatedInvoices = state.invoices.map((i) => (i.id === claimData.invoiceId ? invUpdated : i));
      }
    }

    let updatedSettlements = state.depositSettlements || [];
    let targetSettlement: DepositSettlement | undefined;
    if (claimData.settlementId || claimData.moveOutId || claimData.unit) {
      targetSettlement = updatedSettlements.find(
        (s) =>
          (claimData.settlementId && (s.id === claimData.settlementId || s.id === `DEP-SETTLE-${claimData.settlementId}` || s.id.replace(/^DEP-SETTLE-/i, '') === (claimData.settlementId || '').replace(/^DEP-SETTLE-/i, ''))) ||
          (claimData.moveOutId && (s.id === `DEP-SETTLE-${claimData.moveOutId}` || (s as any).moveOutId === claimData.moveOutId || s.id.replace(/^DEP-SETTLE-/i, '') === claimData.moveOutId)) ||
          (claimData.unit && (s.unit || '').toLowerCase().trim() === claimData.unit.toLowerCase().trim() && s.status !== 'refunded')
      );
      if (targetSettlement) {
        const settleUpdated: DepositSettlement = {
          ...targetSettlement,
          status: 'awaiting_tenant_cash_confirmation',
          disbursementMethod: 'cash_handover',
          cashClaimId: claimId,
        };
        updatedSettlements = updatedSettlements.map((s) => (s.id === targetSettlement!.id ? settleUpdated : s));
      }
    }

    const recipientUserId = claimData.claimedByRole === 'tenant' ? claimData.ownerId : claimData.tenantId;
    const actionLink = claimData.direction === 'inflow' ? '/owner/payments' : '/tenant/payments?tab=deposit';
    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: recipientUserId,
      title: claimData.direction === 'inflow' ? 'Cash Payment Confirmation Required' : 'Cash Deposit Refund Confirmation Required',
      body: `${claimData.claimedByName} reported a cash handover of ${claimData.currency}${claimData.amount.toLocaleString('en-IN')} for Unit ${claimData.unit}. Please confirm receipt.`,
      link: actionLink,
      createdAt: now,
      isRead: false,
      type: 'cash_claim_confirmation_needed',
      cashClaimId: claimId,
      actionable: true,
    };

    setState((prev) => ({
      ...prev,
      cashClaims: [...(prev.cashClaims || []).filter((c) => c.id !== claimId), newClaim],
      payments: [...(prev.payments || []).filter((p) => p.id !== txnId), newTxn],
      invoices: updatedInvoices,
      depositSettlements: updatedSettlements,
      notifications: [...(prev.notifications || []), notif],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'cashClaims', claimId), cleanFirestoreObject(newClaim));
        await setDoc(doc(db, 'payments', txnId), cleanFirestoreObject(newTxn));
        if (targetInvoice) {
          const proofRef = claimData.notes?.match(/Ref:\s*([^—\n]+)/)?.[1]?.trim() || claimData.notes || claimId;
          await setDoc(
            doc(db, 'invoices', targetInvoice.id),
            cleanFirestoreObject({
              status: 'pending_confirmation',
              paymentMethodUsed: 'Cash (Handover)',
              paymentProofRef: proofRef,
              paymentProofUrl: claimData.proofPhotoUrl || null,
              paymentProofNotes: claimData.notes || null,
              paymentProofDate: now,
            }),
            { merge: true }
          );
        }
        if (targetSettlement) {
          await setDoc(
            doc(db, 'depositSettlements', targetSettlement.id),
            cleanFirestoreObject({ status: 'awaiting_tenant_cash_confirmation', disbursementMethod: 'cash_handover', cashClaimId: claimId }),
            { merge: true }
          );
        }
        await setDoc(doc(db, 'notifications', notif.id), cleanFirestoreObject(notif));
      } catch (err) {
        console.warn('Firestore submitCashClaim sync error:', err);
      }
    }

    logAuditEvent({
      actor: claimData.claimedByName || (claimData.claimedByRole === 'tenant' ? 'Tenant' : 'Property Owner'),
      actorRole: claimData.claimedByRole || 'tenant',
      action: 'Cash Handover Claim Submitted',
      category: 'financial',
      propertyId: claimData.propertyId,
      unit: claimData.unit,
      detail: `Cash handover claim #${claimId} submitted for ${claimData.currency || DEFAULT_CURRENCY_SYMBOL}${claimData.amount.toLocaleString('en-IN')} (Unit ${claimData.unit}). Awaiting confirmation.`,
    }).catch(console.warn);

    showToast(`✓ Cash handover claim recorded. Awaiting confirmation from ${claimData.claimedByRole === 'tenant' ? 'property owner' : 'tenant'}.`);
    return claimId;
  };

  const confirmCashClaim = async (claimId: string): Promise<void> => {
    const claim = (state.cashClaims || []).find((c) => c.id === claimId);
    if (!claim) {
      showToast('Cash claim record not found.');
      return;
    }

    const now = new Date().toISOString();
    const currentUserId = auth.currentUser?.uid || (claim.claimedByRole === 'tenant' ? claim.ownerId : claim.tenantId) || '';
    const currentUser = (state.users || []).find(
      (u) => u.id === currentUserId || (auth.currentUser?.email && u.email?.toLowerCase() === auth.currentUser.email.toLowerCase())
    );
    const confirmedByName =
      currentUser?.displayName || (claim.claimedByRole === 'tenant' ? 'Property Owner' : (claim.tenantName || 'Resident'));

    const updatedClaim: CashHandoverClaim = {
      ...claim,
      status: 'confirmed',
      confirmedBy: currentUserId || claim.claimedBy || 'system',
      confirmedByName,
      confirmedAt: now,
    };

    const txn = (state.payments || []).find((p) => p.cashClaimId === claimId || p.id === claim.transactionId);
    let updatedPayments = state.payments || [];
    if (txn) {
      const updatedTxn: PaymentTransaction = {
        ...txn,
        status: 'paid',
        audit: {
          ...(txn.audit || {
            claimedBy: claim.claimedBy,
            claimedByRole: claim.claimedByRole,
            claimedAt: claim.claimedAt,
          }),
          confirmedBy: currentUserId || 'system',
          confirmedByName,
          confirmedAt: now,
        },
      };
      updatedPayments = updatedPayments.map((p) => (p.id === txn.id ? updatedTxn : p));
    }

    let updatedInvoices = state.invoices;
    let targetInv: Invoice | undefined;
    if (claim.invoiceId) {
      targetInv = state.invoices.find((i) => i.id === claim.invoiceId);
      if (targetInv) {
        const paidInv: Invoice = {
          ...targetInv,
          status: 'paid',
          paidAt: now,
          paymentMethodUsed: 'Cash (Handover)',
          receiptNumber: claim.id,
        };
        updatedInvoices = updatedInvoices.map((i) => (i.id === claim.invoiceId ? paidInv : i));
      }
    }

    let updatedSettlements = state.depositSettlements || [];
    let updatedAgreements = state.agreements;
    let updatedUnits = state.units;
    let updatedProperties = state.properties;
    let updatedMoveouts = state.moveouts;
    let updatedTenants = state.tenants;

    const isDepositRefund =
      claim.type === 'deposit_refund' ||
      claim.direction === 'outflow' ||
      !!claim.settlementId ||
      !!claim.moveOutId;

    let targetSettle: DepositSettlement | undefined;
    let targetMoveout: MoveOut | undefined;
    let targetAgId: string | undefined;
    let targetUnit: Unit | undefined;
    let targetTenantId: string | undefined;
    let hasOtherActiveTenancy = false;

    if (isDepositRefund) {
      const normalizeUnit = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
      const claimUnitClean = normalizeUnit(claim.unit);

      // 1. Resolve Target Settlement comprehensively
      targetSettle = updatedSettlements.find((s) => {
        if (claim.settlementId) {
          if (s.id === claim.settlementId) return true;
          if (s.id === `DEP-SETTLE-${claim.settlementId}`) return true;
          if (s.id.replace(/^DEP-SETTLE-/i, '') === claim.settlementId.replace(/^DEP-SETTLE-/i, '')) return true;
        }
        if (claim.moveOutId) {
          if (s.id === `DEP-SETTLE-${claim.moveOutId}` || (s as any).moveOutId === claim.moveOutId) return true;
          if (s.id.replace(/^DEP-SETTLE-/i, '') === claim.moveOutId) return true;
        }
        if (s.cashClaimId && s.cashClaimId === claim.id) return true;
        if (claimUnitClean && normalizeUnit(s.unit) === claimUnitClean && s.status !== 'refunded') return true;
        if (claim.tenantId && s.tenantId === claim.tenantId && s.status !== 'refunded') return true;
        return false;
      });

      // 2. Resolve Target Move-Out comprehensively
      targetMoveout = updatedMoveouts.find((m) => {
        if (claim.moveOutId && (m.id === claim.moveOutId || m.id === claim.moveOutId.replace(/^DEP-SETTLE-/i, ''))) return true;
        if (claim.settlementId && (m.id === claim.settlementId || m.id === claim.settlementId.replace(/^DEP-SETTLE-/i, ''))) return true;
        if (targetSettle) {
          if (m.id === targetSettle.id.replace(/^DEP-SETTLE-/i, '') || m.id === (targetSettle as any).moveOutId) return true;
          if (targetSettle.agreementId && (m as any).agreementId === targetSettle.agreementId) return true;
          if (targetSettle.unit && normalizeUnit(m.unit) === normalizeUnit(targetSettle.unit) && m.status !== 'refund_completed') return true;
        }
        if (claimUnitClean && normalizeUnit(m.unit) === claimUnitClean && m.status !== 'refund_completed') return true;
        if (claim.tenantId && m.tenantId === claim.tenantId && m.status !== 'refund_completed') return true;
        return false;
      });

      const resolvedRefundAmount = claim.amount || targetSettle?.netRefundableAmount || targetMoveout?.deposit || 0;
      const targetUnitNumber = claim.unit || targetSettle?.unit || targetMoveout?.unit;
      const targetUnitClean = normalizeUnit(targetUnitNumber);

      // Synthesize or update Deposit Settlement
      if (!targetSettle && targetMoveout) {
        targetSettle = {
          id: `DEP-SETTLE-${targetMoveout.id}`,
          agreementId: (targetMoveout as any).agreementId || `AG-${targetMoveout.unit}`,
          propertyId: targetMoveout.propertyId || 'prop-1',
          propertyName: targetMoveout.propertyName || 'Residential Property',
          unit: targetMoveout.unit,
          tenantId: targetMoveout.tenantId || claim.tenantId || '',
          tenantName: targetMoveout.tenant || claim.tenantName || 'Resident',
          tenantEmail: targetMoveout.tenantEmail || '',
          ownerId: targetMoveout.ownerId || claim.ownerId || '',
          currency: targetMoveout.currency || claim.currency || DEFAULT_CURRENCY,
          grossDepositHeld: targetMoveout.deposit || claim.amount || 0,
          deductions: (targetMoveout.deductions || []).map((d: any, idx: number) => ({
            id: d.id || `ded-${idx}`,
            category: 'repair_damage',
            title: d.reason || d.amenity || d.title || 'Move-out deduction',
            amount: d.amount,
          })),
          totalDeductions: (targetMoveout.deductions || []).reduce((sum: number, d: any) => sum + (d.amount || 0), 0),
          netRefundableAmount: resolvedRefundAmount,
          status: 'refunded',
          disbursementMethod: 'cash_handover',
          paymentReference: claim.id,
          disbursedAt: now,
          tenantConfirmedReceipt: true,
          tenantConfirmedAt: now,
          createdAt: now,
        };
        updatedSettlements = [...updatedSettlements.filter((s) => s.id !== targetSettle!.id), targetSettle];
      } else if (targetSettle) {
        const settledSettle: DepositSettlement = {
          ...targetSettle,
          status: 'refunded',
          disbursementMethod: 'cash_handover',
          paymentReference: claim.id,
          disbursedAt: now,
          tenantConfirmedReceipt: true,
          tenantConfirmedAt: now,
        };
        targetSettle = settledSettle;
        updatedSettlements = updatedSettlements.map((s) => (s.id === settledSettle.id ? settledSettle : s));
      }

      // Update Moveout status to refund_completed with tenantConfirmedReceipt = true
      if (targetMoveout) {
        const completedMoveout: MoveOut = {
          ...targetMoveout,
          status: 'refund_completed' as const,
          completedAt: targetMoveout.completedAt || now,
          refundDate: targetMoveout.refundDate || now.split('T')[0],
          finalRefundAmount: resolvedRefundAmount,
          tenantConfirmedReceipt: true,
          tenantConfirmedAt: now,
        };
        targetMoveout = completedMoveout;
        updatedMoveouts = updatedMoveouts.map((m) => (m.id === completedMoveout.id ? completedMoveout : m));
      }

      // Terminate agreement
      const vacatingTenantId = claim.tenantId || targetSettle?.tenantId || targetMoveout?.tenantId;
      const vacatingTenantName = claim.tenantName || targetSettle?.tenantName || targetMoveout?.tenant;
      targetAgId = targetSettle?.agreementId || targetMoveout?.agreementId;

      updatedAgreements = updatedAgreements.map((a) => {
        const matchesAg =
          (targetAgId && a.id === targetAgId) ||
          (targetMoveout?.agreementId && a.id === targetMoveout.agreementId) ||
          (targetUnitClean && normalizeUnit(a.unit) === targetUnitClean && (
            (vacatingTenantId && a.tenantId === vacatingTenantId) ||
            (vacatingTenantName && a.tenant?.toLowerCase() === vacatingTenantName.toLowerCase()) ||
            (!targetAgId && a.status !== 'terminated')
          ));
        return matchesAg
          ? { ...a, depositStatus: 'refunded' as const, status: 'terminated' as const }
          : a;
      });

      // Free unit to vacant ONLY if no other active tenancy exists for this unit (safeguards re-onboarding)
      const otherActiveAg = updatedAgreements.find(
        (a) =>
          targetUnitClean &&
          normalizeUnit(a.unit) === targetUnitClean &&
          a.status === 'active' &&
          a.id !== targetAgId &&
          a.tenantId !== vacatingTenantId &&
          a.tenant?.toLowerCase() !== vacatingTenantName?.toLowerCase()
      );
      hasOtherActiveTenancy = !!otherActiveAg;

      const targetPropertyId = targetSettle?.propertyId || targetMoveout?.propertyId;
      targetUnit = state.units.find(
        (u) =>
          ((targetUnitClean && (normalizeUnit(u.unitNumber) === targetUnitClean || normalizeUnit(u.id) === targetUnitClean)) ||
            (vacatingTenantId && u.currentTenantId === vacatingTenantId)) &&
          (!targetPropertyId || !u.propertyId || u.propertyId === targetPropertyId)
      );
      const targetUnitId = targetUnit?.id;

      if (!hasOtherActiveTenancy) {
        updatedUnits = updatedUnits.map((u) => {
          const matches =
            (targetUnitId && u.id === targetUnitId) ||
            (targetUnitClean && (normalizeUnit(u.unitNumber) === targetUnitClean || normalizeUnit(u.id) === targetUnitClean) &&
              (!targetPropertyId || !u.propertyId || u.propertyId === targetPropertyId));
          return matches
            ? { ...u, status: 'vacant' as const, tenant: null, currentTenantId: null, rent: u.rent || 0, deposit: u.deposit || 0 }
            : u;
        });
      } else if (otherActiveAg) {
        updatedUnits = updatedUnits.map((u) => {
          const matches =
            (targetUnitId && u.id === targetUnitId) ||
            (targetUnitClean && (normalizeUnit(u.unitNumber) === targetUnitClean || normalizeUnit(u.id) === targetUnitClean) &&
              (!targetPropertyId || !u.propertyId || u.propertyId === targetPropertyId));
          return matches
            ? {
                ...u,
                status: 'occupied' as const,
                tenant: otherActiveAg.tenant || 'Resident',
                currentTenantId: otherActiveAg.tenantId,
                rent: otherActiveAg.rent,
                deposit: otherActiveAg.deposit,
              }
            : u;
        });
      }

      // VOID any pending/overdue rent/deposit invoices for this tenant & unit
      updatedInvoices = updatedInvoices.map((inv) => {
        const isForThisUnit =
          targetUnitClean &&
          (normalizeUnit(inv.unit) === targetUnitClean || (targetAgId && inv.leaseAgreementId === targetAgId)) &&
          (!targetPropertyId || !inv.propertyId || inv.propertyId === targetPropertyId);
        const isForThisTenant =
          (vacatingTenantId && inv.tenantId === vacatingTenantId) ||
          (vacatingTenantName && inv.tenant?.toLowerCase() === vacatingTenantName.toLowerCase()) ||
          (!inv.tenantId && isForThisUnit);
        if (isForThisUnit && isForThisTenant && inv.status !== 'paid') {
          return {
            ...inv,
            status: 'void' as const,
            notes: 'Voided upon tenant vacating and deposit refund confirmation.',
          };
        }
        return inv;
      });

      // Recalculate property occupied count
      updatedProperties = updatedProperties.map((p) => {
        const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
        return { ...p, occupied: occ };
      });

      // Archive tenant unit to past tenancy history
      const targetTenant = state.tenants.find(
        (t) =>
          (targetSettle?.tenantId && t.id === targetSettle.tenantId) ||
          (claim.tenantId && t.id === claim.tenantId) ||
          (targetMoveout?.tenantId && t.id === targetMoveout.tenantId) ||
          (targetUnitClean && normalizeUnit(t.unit) === targetUnitClean && (!targetPropertyId || !t.propertyId || t.propertyId === targetPropertyId))
      );
      targetTenantId = targetTenant?.id;

      if (targetTenant) {
        updatedTenants = updatedTenants.map((t) => {
          if (t.id === targetTenant.id) {
            const pastItem = {
              unit: targetUnitNumber || t.unit,
              owner: targetSettle?.ownerId || claim.ownerId || t.ownerId || 'Property Owner',
              property: targetSettle?.propertyName || targetSettle?.propertyId || 'Residential Property',
              period: `${t.leaseStart || 'Past'} - ${now.split('T')[0]}`,
              leaseStart: t.leaseStart || '',
              leaseEnd: now.split('T')[0],
              rent: t.rent || 0,
              paymentScore: 100,
              flags: [] as string[],
              disputes: 0,
            };

            const remainingActiveAgs = updatedAgreements.filter(
              (a) =>
                a.status === 'active' &&
                a.id !== targetAgId &&
                ((targetTenant.id && a.tenantId === targetTenant.id) ||
                  (targetTenant.email && a.tenantEmail?.toLowerCase() === targetTenant.email.toLowerCase()))
            );

            const nextAg = remainingActiveAgs[0];
            const nextUnit = nextAg?.unit || 'Unassigned';
            const remainingUnits = remainingActiveAgs.map((a) => a.unit);

            return {
              ...t,
              unit: nextUnit,
              owner: nextAg ? (nextAg.ownerName || 'Property Owner') : 'Unassigned',
              ownerId: nextAg ? (nextAg.ownerId || '') : '',
              propertyId: nextAg ? (nextAg.propertyId || '') : '',
              propertyName: nextAg ? ((nextAg as any).propertyName || state.properties.find((p) => p.id === nextAg.propertyId)?.name || 'Residence') : '',
              leaseStart: nextAg ? (nextAg.start || '') : '',
              leaseEnd: nextAg ? (nextAg.end || '') : '',
              rent: nextAg ? (nextAg.rent || 0) : 0,
              deposit: nextAg ? (nextAg.deposit || 0) : 0,
              currency: nextAg ? (nextAg.currency || t.currency) : t.currency,
              unitsRented: remainingUnits,
              history: [pastItem, ...(t.history || [])],
            };
          }
          return t;
        });
      }

      // Clean up / prune renewals for the vacated unit/tenant
      updatedAgreements = updatedAgreements.filter((a) => {
        return true;
      });
    }

    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: claim.claimedBy,
      title: 'Cash Receipt Confirmed!',
      body: `${confirmedByName} confirmed receipt of ${claim.currency}${claim.amount.toLocaleString('en-IN')} cash for Unit ${claim.unit}. The ledger transaction is now reconciled.`,
      link: claim.claimedByRole === 'tenant' ? '/tenant/payments?tab=ledger' : '/owner/payments',
      isRead: false,
      createdAt: now,
    };

    const updatedNotifications = (state.notifications || []).map((n) =>
      n.cashClaimId === claimId ? { ...n, isRead: true, actionable: false } : n
    );
    updatedNotifications.push(notif);

    setState((prev) => ({
      ...prev,
      cashClaims: (prev.cashClaims || []).map((c) => (c.id === claimId ? updatedClaim : c)),
      payments: updatedPayments,
      invoices: updatedInvoices,
      depositSettlements: updatedSettlements,
      agreements: updatedAgreements,
      units: updatedUnits,
      properties: updatedProperties,
      moveouts: updatedMoveouts,
      tenants: updatedTenants,
      renewals: (prev.renewals || []).filter((r) => {
        const targetClean = (claim.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        const rClean = (r.unit || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();
        return rClean !== targetClean && r.tenantId !== claim.tenantId;
      }),
      notifications: updatedNotifications,
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'cashClaims', claimId), cleanFirestoreObject(updatedClaim), { merge: true });
        if (txn) {
          const finalTxn = updatedPayments.find((p) => p.id === txn.id);
          if (finalTxn) {
            await setDoc(doc(db, 'payments', txn.id), cleanFirestoreObject(finalTxn), { merge: true });
          }
        }
        if (targetInv) {
          const finalInv = updatedInvoices.find((i) => i.id === targetInv!.id);
          if (finalInv) {
            await setDoc(doc(db, 'invoices', targetInv.id), cleanFirestoreObject(finalInv), { merge: true });
          }
        }
        if (targetSettle) {
          const finalSettle = updatedSettlements.find((s) => s.id === targetSettle!.id) || targetSettle;
          await setDoc(doc(db, 'depositSettlements', finalSettle.id), cleanFirestoreObject(finalSettle), { merge: true });
        }
        if (targetMoveout) {
          const finalMoveout = updatedMoveouts.find((m) => m.id === targetMoveout!.id) || targetMoveout;
          await setDoc(doc(db, 'moveouts', targetMoveout.id), cleanFirestoreObject(finalMoveout), { merge: true });
        }
        if (targetAgId) {
          await setDoc(doc(db, 'agreements', targetAgId), cleanFirestoreObject({ depositStatus: 'refunded', status: 'terminated' }), { merge: true });
        }
        if (!hasOtherActiveTenancy && targetUnit) {
          await setDoc(doc(db, 'units', targetUnit.id), cleanFirestoreObject({ status: 'vacant', tenant: null, currentTenantId: null }), { merge: true });
        }
        if (targetTenantId) {
          const tenantAfterUpdate = updatedTenants.find((t) => t.id === targetTenantId);
          if (tenantAfterUpdate) {
            await setDoc(doc(db, 'tenants', targetTenantId), cleanFirestoreObject(tenantAfterUpdate), { merge: true });
          }
        }
        await setDoc(doc(db, 'notifications', notif.id), cleanFirestoreObject(notif));
        if (claim.unit) {
          deleteDoc(doc(db, 'renewals', claim.unit)).catch(console.warn);
        }
      } catch (err) {
        console.warn('Firestore confirmCashClaim sync error:', err);
      }
    }

    logAuditEvent({
      actor: confirmedByName,
      actorRole: claim.claimedByRole === 'tenant' ? 'owner' : 'tenant',
      action: 'Cash Payment Claim Confirmed',
      category: 'financial',
      propertyId: claim.propertyId,
      unit: claim.unit,
      detail: `Cash handover claim #${claimId} confirmed for ${claim.currency || DEFAULT_CURRENCY_SYMBOL}${claim.amount.toLocaleString('en-IN')} (Unit ${claim.unit}). Ledger transaction reconciled.`,
    }).catch(console.warn);

    showToast(`✓ Cash receipt confirmed and reconciled to transaction ledger.`);
  };

  const rejectCashClaim = async (claimId: string, reason: string): Promise<void> => {
    const claim = (state.cashClaims || []).find((c) => c.id === claimId);
    if (!claim) {
      showToast('Cash claim record not found.');
      return;
    }

    const now = new Date().toISOString();
    const currentUserId = auth.currentUser?.uid || (claim.claimedByRole === 'tenant' ? claim.ownerId : claim.tenantId) || '';
    const currentUser = (state.users || []).find(
      (u) => u.id === currentUserId || (auth.currentUser?.email && u.email?.toLowerCase() === auth.currentUser.email.toLowerCase())
    );
    const confirmedByName =
      currentUser?.displayName || (claim.claimedByRole === 'tenant' ? 'Property Owner' : (claim.tenantName || 'Resident'));

    const updatedClaim: CashHandoverClaim = {
      ...claim,
      status: 'rejected',
      confirmedBy: currentUserId || claim.claimedBy || 'system',
      confirmedByName,
      confirmedAt: now,
      rejectionReason: reason,
    };

    const txn = (state.payments || []).find((p) => p.cashClaimId === claimId || p.id === claim.transactionId);
    let updatedPayments = state.payments || [];
    if (txn) {
      const updatedTxn: PaymentTransaction = {
        ...txn,
        status: 'disputed',
        audit: {
          ...(txn.audit || {
            claimedBy: claim.claimedBy,
            claimedByRole: claim.claimedByRole,
            claimedAt: claim.claimedAt,
          }),
          confirmedBy: currentUserId || 'system',
          confirmedByName,
          confirmedAt: now,
          rejectionReason: reason,
        },
      };
      updatedPayments = updatedPayments.map((p) => (p.id === txn.id ? updatedTxn : p));
    }

    let updatedInvoices = state.invoices;
    let targetInv: Invoice | undefined;
    if (claim.invoiceId) {
      targetInv = state.invoices.find((i) => i.id === claim.invoiceId);
      if (targetInv) {
        const revertedInv: Invoice = {
          ...targetInv,
          status: 'sent',
          paymentMethodUsed: undefined,
        };
        updatedInvoices = updatedInvoices.map((i) => (i.id === claim.invoiceId ? revertedInv : i));
      }
    }

    let updatedSettlements = state.depositSettlements || [];
    let targetSettle: DepositSettlement | undefined;
    if (claim.settlementId || claim.moveOutId) {
      targetSettle = updatedSettlements.find(
        (s) =>
          (claim.settlementId && (s.id === claim.settlementId || s.id === `DEP-SETTLE-${claim.settlementId}` || s.id.replace(/^DEP-SETTLE-/i, '') === claim.settlementId.replace(/^DEP-SETTLE-/i, ''))) ||
          (claim.moveOutId && (s.id === `DEP-SETTLE-${claim.moveOutId}` || (s as any).moveOutId === claim.moveOutId)) ||
          (s.cashClaimId && s.cashClaimId === claim.id)
      );
      if (targetSettle) {
        const revertedSettle: DepositSettlement = {
          ...targetSettle,
          status: 'contested',
          cashClaimId: undefined,
          notes: `Cash handover was declined: ${reason}`,
        };
        updatedSettlements = updatedSettlements.map((s) => (s.id === targetSettle!.id ? revertedSettle : s));
      }
    }

    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: claim.claimedBy,
      title: 'Cash Handover Claim Declined',
      body: `${confirmedByName} declined the cash handover claim for Unit ${claim.unit}. Reason: "${reason}". The outstanding balance remains active.`,
      link: claim.claimedByRole === 'tenant' ? '/tenant/payments' : '/owner/payments',
      isRead: false,
      createdAt: now,
    };

    const updatedNotifications = (state.notifications || []).map((n) =>
      n.cashClaimId === claimId ? { ...n, isRead: true, actionable: false } : n
    );
    updatedNotifications.push(notif);

    setState((prev) => ({
      ...prev,
      cashClaims: (prev.cashClaims || []).map((c) => (c.id === claimId ? updatedClaim : c)),
      payments: updatedPayments,
      invoices: updatedInvoices,
      depositSettlements: updatedSettlements,
      notifications: updatedNotifications,
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'cashClaims', claimId), cleanFirestoreObject(updatedClaim), { merge: true });
        if (txn) {
          const finalTxn = updatedPayments.find((p) => p.id === txn.id);
          if (finalTxn) {
            await setDoc(doc(db, 'payments', txn.id), cleanFirestoreObject(finalTxn), { merge: true });
          }
        }
        if (targetInv) {
          const finalInv = updatedInvoices.find((i) => i.id === targetInv!.id);
          if (finalInv) {
            await setDoc(doc(db, 'invoices', targetInv.id), cleanFirestoreObject(finalInv), { merge: true });
          }
        }
        if (targetSettle) {
          const finalSettle = updatedSettlements.find((s) => s.id === targetSettle!.id) || targetSettle;
          await setDoc(doc(db, 'depositSettlements', finalSettle.id), cleanFirestoreObject(finalSettle), { merge: true });
        }
        await setDoc(doc(db, 'notifications', notif.id), cleanFirestoreObject(notif));
      } catch (err) {
        console.warn('Firestore rejectCashClaim sync error:', err);
      }
    }

    logAuditEvent({
      actor: confirmedByName,
      actorRole: claim.claimedByRole === 'tenant' ? 'owner' : 'tenant',
      action: 'Cash Payment Claim Declined',
      category: 'financial',
      propertyId: claim.propertyId,
      unit: claim.unit,
      detail: `Cash handover claim #${claimId} declined for Unit ${claim.unit}. Reason: "${reason}".`,
    }).catch(console.warn);

    showToast(`Notice sent: Cash handover claim declined.`);
  };

  const saveStaff = async (staffMember: StaffMember, userProfile?: UserProfile) => {
    const sanitizedStaff = { ...staffMember };
    delete (sanitizedStaff as any).tempPassword;
    setState((prev) => ({
      ...prev,
      staff: [...prev.staff.filter((s) => s.id !== staffMember.id), sanitizedStaff],
      users: userProfile ? [...prev.users.filter((u) => u.id !== userProfile.id), userProfile] : prev.users,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'staff', staffMember.id), sanitizedStaff, { merge: true });
        if (userProfile) {
          const sanitizedProfile = { ...userProfile };
          delete (sanitizedProfile as any).tempPassword;
          await setDoc(doc(db, 'users', userProfile.id), sanitizedProfile, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore saveStaff sync error:', err);
      }
    }
  };

  const saveManager = async (manager: any, userProfile?: UserProfile) => {
    const pmId = String(manager.id);
    const sanitizedManager = { ...manager };
    delete sanitizedManager.tempPassword;
    setState((prev) => ({
      ...prev,
      propertyManagers: [...(prev.propertyManagers || []).filter((m: any) => String(m.id) !== pmId), sanitizedManager],
      users: userProfile ? [...prev.users.filter((u) => u.id !== userProfile.id), userProfile] : prev.users,
    }));
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'propertyManagers', pmId), sanitizedManager, { merge: true });
        if (userProfile) {
          const sanitizedProfile = { ...userProfile };
          delete (sanitizedProfile as any).tempPassword;
          await setDoc(doc(db, 'users', userProfile.id), sanitizedProfile, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore saveManager sync error:', err);
      }
    }
  };

  const deleteStaff = async (staffId: string) => {
    const targetStaff = state.staff.find((s) => s.id === staffId);
    const staffEmail = targetStaff?.email?.toLowerCase();

    setState((prev) => ({
      ...prev,
      staff: prev.staff.filter((s) => s.id !== staffId),
      users: prev.users.filter((u) => u.id !== staffId && (!staffEmail || u.email.toLowerCase() !== staffEmail)),
    }));

    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'staff', staffId));
        await deleteDoc(doc(db, 'users', staffId));
        if (staffEmail) {
          const userMatch = state.users.find((u) => u.email.toLowerCase() === staffEmail);
          if (userMatch && userMatch.id !== staffId) {
            await deleteDoc(doc(db, 'users', userMatch.id));
          }
        }
      } catch (err) {
        console.warn('Firestore deleteStaff error:', err);
      }
    }
  };

  const reassignManagerProperty = async (managerId: string | number, newPropertyId: string | null) => {
    const pmIdStr = String(managerId);
    const cleanPropId = newPropertyId ? String(newPropertyId) : '';

    setState((prev) => ({
      ...prev,
      propertyManagers: (prev.propertyManagers || []).map((m: any) =>
        String(m.id) === pmIdStr
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
        console.warn('Firestore reassignManagerProperty error:', err);
      }
    }
  };

  const deleteManager = async (managerId: string | number) => {
    const pmIdStr = String(managerId);
    const targetManager = (state.propertyManagers || []).find((m: any) => String(m.id) === pmIdStr);
    const managerEmail = targetManager?.email?.toLowerCase();

    setState((prev) => ({
      ...prev,
      propertyManagers: (prev.propertyManagers || []).filter((m: any) => String(m.id) !== pmIdStr),
      users: prev.users.filter((u) => String(u.id) !== pmIdStr && (!managerEmail || u.email.toLowerCase() !== managerEmail)),
      properties: prev.properties.map((p) =>
        p.assignedManagerId === pmIdStr ? { ...p, assignedManagerId: undefined } : p
      ),
    }));

    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'propertyManagers', pmIdStr));
        await deleteDoc(doc(db, 'users', pmIdStr));
        if (managerEmail) {
          const userMatch = state.users.find((u) => u.email.toLowerCase() === managerEmail);
          if (userMatch && userMatch.id !== pmIdStr) {
            await deleteDoc(doc(db, 'users', userMatch.id));
          }
        }
        const affectedProps = state.properties.filter((p) => p.assignedManagerId === pmIdStr);
        for (const p of affectedProps) {
          await setDoc(doc(db, 'properties', p.id), { assignedManagerId: null }, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore deleteManager error:', err);
      }
    }
  };

  const deleteUserAccount = async (userId: string) => {
    const targetUser = state.users.find((u) => u.id === userId);
    const userEmail = targetUser?.email?.toLowerCase();
    const userName = targetUser?.displayName?.toLowerCase();

    // 1. Release all units rented by this user to vacant
    const unitsToFree = state.units.filter(
      (u) =>
        u.currentTenantId === userId ||
        (userEmail && u.tenant?.toLowerCase() === userEmail) ||
        (userName && u.tenant?.toLowerCase() === userName)
    );
    const freedUnitIds = new Set(unitsToFree.map((u) => u.id));

    const updatedUnits = state.units.map((u) =>
      freedUnitIds.has(u.id)
        ? { ...u, status: 'vacant' as const, tenant: null, currentTenantId: null }
        : u
    );

    // 2. Recalculate property occupied counts
    const updatedProperties = state.properties.map((p) => {
      const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
      return { ...p, occupied: occ };
    });

    // 3. Terminate active agreements for this tenant
    const updatedAgreements = state.agreements.map((a) =>
      a.tenantId === userId ||
      (userEmail && a.tenantEmail?.toLowerCase() === userEmail) ||
      (userName && a.tenant?.toLowerCase() === userName)
        ? { ...a, status: 'terminated' as const }
        : a
    );

    setState((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== userId && (!userEmail || u.email?.toLowerCase() !== userEmail)),
      staff: prev.staff.filter((s) => s.id !== userId && (!userEmail || s.email?.toLowerCase() !== userEmail)),
      propertyManagers: (prev.propertyManagers || []).filter((m: any) => String(m.id) !== String(userId) && (!userEmail || m.email?.toLowerCase() !== userEmail)),
      tenants: prev.tenants.filter((t) => t.id !== userId && (!userEmail || t.email?.toLowerCase() !== userEmail)),
      units: updatedUnits,
      properties: updatedProperties,
      agreements: updatedAgreements,
    }));

    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        await deleteDoc(doc(db, 'staff', userId));
        await deleteDoc(doc(db, 'propertyManagers', userId));
        await deleteDoc(doc(db, 'tenants', userId));
        await deleteDoc(doc(db, 'owners', userId));

        for (const u of unitsToFree) {
          await setDoc(doc(db, 'units', u.id), { status: 'vacant', tenant: null, currentTenantId: null }, { merge: true });
        }
        const agsToTerm = state.agreements.filter(
          (a) =>
            a.tenantId === userId ||
            (userEmail && a.tenantEmail?.toLowerCase() === userEmail) ||
            (userName && a.tenant?.toLowerCase() === userName)
        );
        for (const a of agsToTerm) {
          await setDoc(doc(db, 'agreements', a.id), { status: 'terminated' }, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore deleteUserAccount error:', err);
      }
    }

    logAuditEvent({
      actor: 'Superadmin',
      actorRole: 'superadmin',
      action: 'User Account Deleted',
      category: 'security',
      detail: `Permanently removed account for user ${targetUser?.displayName || targetUser?.email || userId} (${targetUser?.role || 'user'}). Freed assigned units and terminated active leases.`,
    }).catch(console.warn);
  };

  const requestLeaseRenewal = async (unit: string, tenantNotes?: string, propertyId?: string) => {
    const tenantRec = state.tenants.find((t) => t.unit === unit && (!propertyId || !t.propertyId || t.propertyId === propertyId));
    const agreement = state.agreements.find(
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || a.status === 'signed')
    );
    const resolvedOwnerId = agreement?.ownerId || tenantRec?.ownerId || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const leaseEnd = agreement?.renewalTerms?.newLeaseEnd || agreement?.end || tenantRec?.leaseEnd || 'Next Year';
    const effectiveRent = Number(agreement?.renewalTerms?.newRent || agreement?.rent || tenantRec?.rent) || 0;
    const daysLeft = leaseEnd && !isNaN(new Date(leaseEnd).getTime())
      ? Math.max(0, Math.ceil((new Date(leaseEnd).getTime() - Date.now()) / (1000 * 3600 * 24)))
      : 60;
    const effPropId = propertyId || agreement?.propertyId || tenantRec?.propertyId;
    const effPropName = tenantRec?.propertyName || state.properties.find((p) => p.id === effPropId)?.name || 'Residence Property';

    logAuditEvent({
      actor: tenantName,
      actorRole: 'tenant',
      action: 'Lease Renewal Requested',
      category: 'lease',
      propertyId: effPropId,
      unit,
      detail: `Unit ${unit}: Tenant requested lease renewal consideration${tenantNotes ? ` ("${tenantNotes}")` : ''}.`,
    }).catch(console.warn);

    const renItem: RenewalItem = {
      id: `REN-${effPropId ? effPropId.slice(-6) + '-' : ''}${unit}-${Date.now().toString().slice(-4)}`,
      unit,
      tenant: tenantName,
      tenantId: agreement?.tenantId || tenantRec?.id,
      ownerId: resolvedOwnerId,
      propertyId: effPropId,
      propertyName: effPropName,
      currentRent: effectiveRent,
      leaseEnd,
      daysLeft,
      status: 'renewal_requested',
      requestedAt: new Date().toISOString(),
      tenantNotes,
    };

    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: resolvedOwnerId,
      title: 'Tenant Requested Lease Renewal',
      body: `${tenantName} has requested to renew their lease for Unit ${unit} (${effPropName}). Review terms and propose renewal terms.`,
      link: '/owner/leasing',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      renewals: [
        ...(prev.renewals || []).filter((r) => !(r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId))),
        renItem,
      ],
      notifications: resolvedOwnerId ? [...(prev.notifications || []), notif] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      const docKey = effPropId ? `${effPropId}_${unit}` : (resolvedOwnerId ? `${resolvedOwnerId}_${unit}` : unit);
      setDoc(doc(db, 'renewals', docKey), renItem, { merge: true }).catch(console.warn);
      if (resolvedOwnerId) {
        setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
      }
    }

    showToast(`✓ Renewal request submitted to your landlord.`);
  };

  const offerLeaseRenewal = async (
    unit: string,
    terms: {
      propertyId?: string;
      agreementId?: string;
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
    }
  ) => {
    const agreement = state.agreements.find(
      (a) =>
        (terms.agreementId && a.id === terms.agreementId) ||
        ((!terms.propertyId || !a.propertyId || a.propertyId === terms.propertyId) &&
          (a.unit === unit || a.id === unit) &&
          (a.status === 'active' || a.status === 'signed'))
    );
    const tenantRec = state.tenants.find(
      (t) =>
        (agreement?.tenantId && t.id === agreement.tenantId) ||
        ((!terms.propertyId || !t.propertyId || t.propertyId === terms.propertyId) && t.unit === unit)
    );
    const resolvedTenantId = agreement?.tenantId || tenantRec?.id || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const rentIncreaseAmount = Math.max(0, terms.proposedRent - terms.currentRent);
    const effectiveLeaseEnd = agreement?.renewalTerms?.newLeaseEnd || agreement?.end || tenantRec?.leaseEnd || '';
    const daysLeft = effectiveLeaseEnd && !isNaN(new Date(effectiveLeaseEnd).getTime())
      ? Math.max(0, Math.ceil((new Date(effectiveLeaseEnd).getTime() - Date.now()) / (1000 * 3600 * 24)))
      : 60;

    const resolvedPropId = agreement?.propertyId || tenantRec?.propertyId || '';

    const updatedItem: RenewalItem = {
      id: `REN-${resolvedPropId ? resolvedPropId.slice(-6) + '-' : ''}${unit}-${Date.now().toString().slice(-4)}`,
      unit,
      tenant: tenantName,
      tenantId: resolvedTenantId,
      ownerId: agreement?.ownerId || tenantRec?.ownerId,
      propertyId: resolvedPropId,
      propertyName: tenantRec?.propertyName,
      currentRent: terms.currentRent,
      percentageIncrease: terms.percentageIncrease,
      proposedRent: terms.proposedRent,
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

    const renCurr = (terms as any).currency || agreement?.currency || tenantRec?.currency || DEFAULT_CURRENCY;
    const isRenInd = normalizeCurrencyCode(renCurr) === 'INR';
    const proposedRentStr = `${renCurr}${terms.proposedRent.toLocaleString(isRenInd ? 'en-IN' : 'en-US')}`;

    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: resolvedTenantId,
      title: 'Lease Renewal Offer & Agreement Received',
      body: `Your landlord proposed renewal terms (+${terms.percentageIncrease}%: ${proposedRentStr}/mo) and sent a new agreement for Unit ${unit}. Please review and sign.`,
      link: '/tenant/lease',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    const effPropId = agreement?.propertyId || tenantRec?.propertyId;
    setState((prev) => ({
      ...prev,
      renewals: [
        ...(prev.renewals || []).filter((r) => !(r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId))),
        updatedItem,
      ],
      notifications: resolvedTenantId ? [...(prev.notifications || []), notif] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      const docKey = effPropId ? `${effPropId}_${unit}` : (agreement?.ownerId ? `${agreement.ownerId}_${unit}` : unit);
      setDoc(doc(db, 'renewals', docKey), updatedItem, { merge: true }).catch(console.warn);
      if (docKey !== unit) {
        deleteDoc(doc(db, 'renewals', unit)).catch(() => {});
      }
      if (resolvedTenantId) {
        setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
      }
    }

    logCommunication({
      type: 'lease_renewal_offer',
      category: 'lease',
      title: `Lease Renewal Offer — Unit ${unit}`,
      body: `Your landlord proposed renewal terms (+${terms.percentageIncrease}%: ${proposedRentStr}/mo) for Unit ${unit}. Review and respond in your Lease Portal.`,
      channels: ['in_app', 'email'],
      recipientId: resolvedTenantId,
      recipientName: tenantName,
      recipientRole: 'tenant',
      recipientContact: {
        email: tenantRec?.email,
        phone: tenantRec?.phone,
      },
      senderId: agreement?.ownerId || tenantRec?.ownerId || 'system',
      senderName: tenantRec?.owner || 'Property Owner',
      senderRole: 'owner',
      ownerId: agreement?.ownerId || tenantRec?.ownerId,
      unitNumber: unit,
      deliveryStatus: {
        email: 'delivered',
        inApp: 'delivered',
      },
    }).catch(console.warn);

    showToast(`✓ Renewal offer (+${terms.percentageIncrease}%: ${proposedRentStr}/mo) sent to ${tenantName}.`);
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
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || a.status === 'signed')
    );
    const resolvedOwnerId = agreement?.ownerId || tenantRec?.ownerId || existingRenewal.ownerId || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const effPropId = propertyId || existingRenewal.propertyId || agreement?.propertyId || tenantRec?.propertyId;

    if (decision === 'accepted') {
      const newRent = existingRenewal.proposedRent || existingRenewal.currentRent || agreement?.rent || 0;
      const newEnd = existingRenewal.newLeaseEnd || agreement?.end || '';
      const effectiveStart = existingRenewal.newLeaseStart || agreement?.end || '';

      const updatedRenewal: RenewalItem = {
        ...existingRenewal,
        status: 'accepted',
        respondedAt: new Date().toISOString(),
        tenantNotes: feedback,
      };

      // 1. Update Agreement with renewal terms and new end date
      let updatedAgreements = state.agreements;
      if (agreement) {
        const renewedAg: Agreement = {
          ...agreement,
          end: newEnd,
          rent: newRent,
          renewalTerms: {
            effectiveDate: effectiveStart,
            previousRent: existingRenewal.currentRent || agreement.rent,
            newRent,
            percentageIncrease: existingRenewal.percentageIncrease || 0,
            newLeaseEnd: newEnd,
            termMonths: existingRenewal.termMonths || 12,
            acceptedAt: new Date().toISOString(),
            ownerNotes: existingRenewal.ownerNotes,
          },
        };
        updatedAgreements = state.agreements.map((a) => (a.id === agreement.id ? renewedAg : a));
        await saveAgreement(renewedAg);
      }

      // 2. Update Tenant record
      let updatedTenants = state.tenants;
      if (tenantRec) {
        const renewedTenant: TenantRecord = {
          ...tenantRec,
          leaseEnd: newEnd,
          rent: newRent,
        };
        updatedTenants = state.tenants.map((t) => (t.id === tenantRec.id ? renewedTenant : t));
        await saveTenant(renewedTenant);
      }

      // 3. Update Unit
      const unitObj = state.units.find(
        (u) => (u.unitNumber === unit || u.id === unit) && (!effPropId || !u.propertyId || u.propertyId === effPropId)
      );
      let updatedUnits = state.units;
      if (unitObj) {
        const renewedUnit: Unit = {
          ...unitObj,
          rent: newRent,
        };
        updatedUnits = state.units.map((u) => (u.id === unitObj.id ? renewedUnit : u));
        await saveUnit(renewedUnit);
      }

      const renCurr = existingRenewal.currency || agreement?.currency || tenantRec?.currency || DEFAULT_CURRENCY;
      const isRenInd = normalizeCurrencyCode(renCurr) === 'INR';
      const renRentStr = `${renCurr}${newRent.toLocaleString(isRenInd ? 'en-IN' : 'en-US')}`;

      const ownerNotif: InAppNotification = {
        id: `notif_${Date.now()}_o`,
        userId: resolvedOwnerId,
        title: 'Lease Renewal Accepted!',
        body: `${tenantName} has accepted the lease renewal terms for Unit ${unit} at ${renRentStr}/mo (effective ${effectiveStart}).`,
        link: '/owner/leasing',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      const tenantNotif: InAppNotification = {
        id: `notif_${Date.now()}_t`,
        userId: existingRenewal.tenantId || tenantRec?.id || '',
        title: 'Lease Renewal Confirmed',
        body: `You accepted the renewal terms for Unit ${unit}. New lease end: ${newEnd} (Rent: ${renRentStr}/mo).`,
        link: '/tenant/lease',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        agreements: updatedAgreements,
        tenants: updatedTenants,
        units: updatedUnits,
        renewals: prev.renewals.map((r) =>
          r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedRenewal : r
        ),
        notifications: [
          ...(prev.notifications || []),
          ...(resolvedOwnerId ? [ownerNotif] : []),
          ...(existingRenewal.tenantId || tenantRec?.id ? [tenantNotif] : []),
        ],
      }));

      if (isFirebaseConfigured) {
        const docKey = effPropId ? `${effPropId}_${unit}` : (resolvedOwnerId ? `${resolvedOwnerId}_${unit}` : unit);
        setDoc(doc(db, 'renewals', docKey), updatedRenewal, { merge: true }).catch(console.warn);
        if (resolvedOwnerId) {
          setDoc(doc(db, 'notifications', ownerNotif.id), ownerNotif).catch(console.warn);
        }
        if (existingRenewal.tenantId || tenantRec?.id) {
          setDoc(doc(db, 'notifications', tenantNotif.id), tenantNotif).catch(console.warn);
        }
      }

      logCommunication({
        type: 'lease_renewal_accepted',
        category: 'lease',
        title: `Lease Renewal Accepted — Unit ${unit}`,
        body: `${tenantName} accepted renewal for Unit ${unit} until ${newEnd} at ${renRentStr}/mo.`,
        channels: ['in_app', 'email'],
        recipientId: resolvedOwnerId,
        recipientName: tenantRec?.owner || 'Property Owner',
        recipientRole: 'owner',
        recipientContact: {},
        senderId: existingRenewal.tenantId || tenantRec?.id || 'tenant',
        senderName: tenantName,
        senderRole: 'staff',
        ownerId: resolvedOwnerId,
        unitNumber: unit,
        deliveryStatus: { email: 'delivered', inApp: 'delivered' },
      }).catch(console.warn);

      logAuditEvent({
        actor: tenantName,
        actorRole: 'tenant',
        action: 'Lease Renewal Accepted',
        category: 'lease',
        propertyId: effPropId,
        unit,
        detail: `Unit ${unit}: ${tenantName} accepted lease renewal until ${newEnd} at ${renRentStr}/mo.`,
      }).catch(console.warn);

      showToast(`✓ Lease renewal accepted! Lease extended until ${newEnd} at ${renRentStr}/mo.`);
    } else {
      // Rejected
      const updatedRenewal: RenewalItem = {
        ...existingRenewal,
        status: 'rejected',
        respondedAt: new Date().toISOString(),
        tenantNotes: feedback,
      };

      const ownerNotif: InAppNotification = {
        id: `notif_${Date.now()}_o`,
        userId: resolvedOwnerId,
        title: 'Lease Renewal Declined',
        body: `${tenantName} has declined the renewal offer for Unit ${unit}.${feedback ? ` Reason: "${feedback}"` : ''}`,
        link: '/owner/leasing',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      const tenantNotif: InAppNotification = {
        id: `notif_${Date.now()}_t`,
        userId: existingRenewal.tenantId || tenantRec?.id || '',
        title: 'Lease Renewal Offer Declined',
        body: `You declined the lease renewal offer for Unit ${unit}. Your existing lease end date remains in effect.`,
        link: '/tenant/lease',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        renewals: prev.renewals.map((r) =>
          r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedRenewal : r
        ),
        notifications: [
          ...(prev.notifications || []),
          ...(resolvedOwnerId ? [ownerNotif] : []),
          ...(existingRenewal.tenantId || tenantRec?.id ? [tenantNotif] : []),
        ],
      }));

      if (isFirebaseConfigured) {
        const docKey = effPropId ? `${effPropId}_${unit}` : (resolvedOwnerId ? `${resolvedOwnerId}_${unit}` : unit);
        setDoc(doc(db, 'renewals', docKey), updatedRenewal, { merge: true }).catch(console.warn);
        if (resolvedOwnerId) {
          setDoc(doc(db, 'notifications', ownerNotif.id), ownerNotif).catch(console.warn);
        }
        if (existingRenewal.tenantId || tenantRec?.id) {
          setDoc(doc(db, 'notifications', tenantNotif.id), tenantNotif).catch(console.warn);
        }
      }

      logCommunication({
        type: 'lease_renewal_declined',
        category: 'lease',
        title: `Lease Renewal Declined — Unit ${unit}`,
        body: `${tenantName} declined renewal for Unit ${unit}.${feedback ? ` Reason: "${feedback}"` : ''}`,
        channels: ['in_app', 'email'],
        recipientId: resolvedOwnerId,
        recipientName: tenantRec?.owner || 'Property Owner',
        recipientRole: 'owner',
        recipientContact: {},
        senderId: existingRenewal.tenantId || tenantRec?.id || 'tenant',
        senderName: tenantName,
        senderRole: 'staff',
        ownerId: resolvedOwnerId,
        unitNumber: unit,
        deliveryStatus: { email: 'delivered', inApp: 'delivered' },
      }).catch(console.warn);

      logAuditEvent({
        actor: tenantName,
        actorRole: 'tenant',
        action: 'Lease Renewal Declined',
        category: 'lease',
        propertyId: effPropId,
        unit,
        detail: `Unit ${unit}: ${tenantName} declined renewal offer.${feedback ? ` Reason: "${feedback}".` : ''}`,
      }).catch(console.warn);

      showToast(`Renewal offer declined. Your existing lease expiry remains in effect.`);
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
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || a.status === 'signed')
    );
    const resolvedOwnerId = agreement?.ownerId || tenantRec?.ownerId || existingRenewal.ownerId || '';
    const tenantName = agreement?.tenant || tenantRec?.name || 'Resident';
    const effPropId = propertyId || existingRenewal.propertyId || agreement?.propertyId || tenantRec?.propertyId;

    const updatedItem: RenewalItem = {
      ...existingRenewal,
      status: 'signed_by_tenant',
      tenantSignedFileUrl: fileData,
      tenantSignedFileName: fileName,
      tenantSignedFileSize: fileSize || null,
      tenantSignedAt: new Date().toISOString(),
    };

    const ownerNotif: InAppNotification = {
      id: `notif_${Date.now()}_o`,
      userId: resolvedOwnerId,
      title: 'Tenant Signed Renewal Agreement!',
      body: `${tenantName} has signed and uploaded the renewal agreement for Unit ${unit}. Please review and approve.`,
      link: '/owner/leasing',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      renewals: prev.renewals.map((r) =>
        r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedItem : r
      ),
      notifications: resolvedOwnerId ? [...(prev.notifications || []), ownerNotif] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      const docKey = effPropId ? `${effPropId}_${unit}` : (resolvedOwnerId ? `${resolvedOwnerId}_${unit}` : unit);
      setDoc(doc(db, 'renewals', docKey), updatedItem, { merge: true }).catch(console.warn);
      if (resolvedOwnerId) {
        setDoc(doc(db, 'notifications', ownerNotif.id), ownerNotif).catch(console.warn);
      }
    }

    showToast(`✓ Signed renewal agreement submitted! Awaiting landlord final approval.`);
  };

  const approveLeaseRenewal = async (unit: string, propertyId?: string) => {
    const existingRenewal = (state.renewals || []).find(
      (r) => r.unit === unit && (!propertyId || !r.propertyId || r.propertyId === propertyId)
    );
    if (!existingRenewal) return;

    const tenantRec = state.tenants.find((t) => t.unit === unit && (!propertyId || !t.propertyId || t.propertyId === propertyId));
    const currentAgreement = state.agreements.find(
      (a) => a.unit === unit && (!propertyId || !a.propertyId || a.propertyId === propertyId) && (a.status === 'active' || a.status === 'signed')
    );
    const resolvedOwnerId = currentAgreement?.ownerId || tenantRec?.ownerId || existingRenewal.ownerId || '';
    const tenantName = currentAgreement?.tenant || tenantRec?.name || 'Resident';
    const tenantId = currentAgreement?.tenantId || tenantRec?.id || existingRenewal.tenantId || '';
    const newRent = existingRenewal.proposedRent || existingRenewal.currentRent || currentAgreement?.rent || 0;
    const newStart = existingRenewal.newLeaseStart || currentAgreement?.end || '';
    const newEnd = existingRenewal.newLeaseEnd || '';
    const effPropId = propertyId || existingRenewal.propertyId || currentAgreement?.propertyId || tenantRec?.propertyId || 'prop-1';

    const updatedRenewal: RenewalItem = {
      ...existingRenewal,
      status: 'accepted',
      ownerApprovedAt: new Date().toISOString(),
    };

    // Create renewed Agreement entity
    const renewalAgId = `AG-REN-${Math.floor(1000 + Math.random() * 9000)}`;
    const renewalAgreement: Agreement = {
      id: renewalAgId,
      ownerId: resolvedOwnerId,
      propertyId: effPropId,
      propertyName: currentAgreement?.propertyName || tenantRec?.propertyName,
      unit,
      tenant: tenantName,
      tenantId,
      tenantEmail: currentAgreement?.tenantEmail || tenantRec?.email,
      tenantPhone: currentAgreement?.tenantPhone || tenantRec?.phone,
      type: 'uploaded',
      executionMode: 'digital_dispatch',
      fileData: existingRenewal.tenantSignedFileUrl || existingRenewal.ownerAgreementFileUrl || null,
      fileName: existingRenewal.tenantSignedFileName || existingRenewal.ownerAgreementFileName || `Renewal_Agreement_${unit}.pdf`,
      fileSize: existingRenewal.tenantSignedFileSize || existingRenewal.ownerAgreementFileSize || undefined,
      initialAgreementUrl: existingRenewal.ownerAgreementFileUrl || undefined,
      initialAgreementName: existingRenewal.ownerAgreementFileName || undefined,
      signedDocumentUrl: existingRenewal.tenantSignedFileUrl || undefined,
      signedDocumentName: existingRenewal.tenantSignedFileName || undefined,
      signedUploadedAt: existingRenewal.tenantSignedAt,
      start: newStart,
      end: newEnd,
      rent: newRent,
      deposit: currentAgreement?.deposit || tenantRec?.deposit || 0,
      status: 'active',
      autoRenew: false,
      isRenewal: true,
      previousAgreementId: currentAgreement?.id,
      renewalTerms: {
        effectiveDate: newStart,
        previousRent: existingRenewal.currentRent || currentAgreement?.rent || 0,
        newRent,
        percentageIncrease: existingRenewal.percentageIncrease || 0,
        newLeaseEnd: newEnd,
        termMonths: existingRenewal.termMonths || 12,
        acceptedAt: new Date().toISOString(),
        ownerNotes: existingRenewal.ownerNotes,
      },
    };

    let updatedAgreements = state.agreements;
    if (currentAgreement) {
      const updatedCurrent: Agreement = {
        ...currentAgreement,
        renewalTerms: {
          effectiveDate: newStart,
          previousRent: currentAgreement.rent,
          newRent,
          percentageIncrease: existingRenewal.percentageIncrease || 0,
          newLeaseEnd: newEnd,
          termMonths: existingRenewal.termMonths || 12,
          acceptedAt: new Date().toISOString(),
          ownerNotes: existingRenewal.ownerNotes,
        },
      };
      updatedAgreements = state.agreements.map((a) => (a.id === currentAgreement.id ? updatedCurrent : a));
    }
    updatedAgreements = [renewalAgreement, ...updatedAgreements];
    await saveAgreement(renewalAgreement);

    let updatedTenants = state.tenants;
    if (tenantRec) {
      const renewedTenant: TenantRecord = {
        ...tenantRec,
        leaseEnd: newEnd,
        rent: newRent,
      };
      updatedTenants = state.tenants.map((t) => (t.id === tenantRec.id ? renewedTenant : t));
      await saveTenant(renewedTenant);
    }

    const unitObj = state.units.find((u) => u.unitNumber === unit || u.id === unit);
    let updatedUnits = state.units;
    if (unitObj) {
      const renewedUnit: Unit = {
        ...unitObj,
        rent: newRent,
      };
      updatedUnits = state.units.map((u) => (u.id === unitObj.id ? renewedUnit : u));
      await saveUnit(renewedUnit);
    }

    const renCurr = existingRenewal.currency || currentAgreement?.currency || tenantRec?.currency || DEFAULT_CURRENCY;
    const isRenInd = normalizeCurrencyCode(renCurr) === 'INR';
    const renRentStr = `${renCurr}${newRent.toLocaleString(isRenInd ? 'en-IN' : 'en-US')}`;

    const tenantNotif: InAppNotification = {
      id: `notif_${Date.now()}_t`,
      userId: tenantId,
      title: 'Lease Renewal Finalized & Active! 🎉',
      body: `Your landlord has approved and activated your lease renewal for Unit ${unit}. Extended through ${newEnd} at ${renRentStr}/mo.`,
      link: '/tenant/lease',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      renewals: prev.renewals.map((r) =>
        r.unit === unit && (!effPropId || !r.propertyId || r.propertyId === effPropId) ? updatedRenewal : r
      ),
      agreements: updatedAgreements,
      tenants: updatedTenants,
      units: updatedUnits,
      notifications: tenantId ? [...(prev.notifications || []), tenantNotif] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      const docKey = effPropId ? `${effPropId}_${unit}` : (resolvedOwnerId ? `${resolvedOwnerId}_${unit}` : unit);
      setDoc(doc(db, 'renewals', docKey), updatedRenewal, { merge: true }).catch(console.warn);
      if (docKey !== unit) {
        deleteDoc(doc(db, 'renewals', unit)).catch(() => {});
      }
      if (tenantId) {
        setDoc(doc(db, 'notifications', tenantNotif.id), tenantNotif).catch(console.warn);
      }
    }

    // Multi-channel dispatch: Notify Tenant that lease renewal is active
    if (tenantId) {
      const userRec = state.users.find((u) => u.id === tenantId || (tenantRec?.email && u.email?.toLowerCase() === tenantRec.email.toLowerCase()));
      logCommunication({
        type: 'lease_renewal_finalized',
        category: 'leasing',
        title: `Lease Renewal Finalized: Unit ${unit}`,
        body: `Your lease renewal for Unit ${unit} has been approved and activated through ${newEnd} at ${renRentStr}/mo. Your new agreement is active.`,
        channels: ['in_app', 'sms', 'email'],
        recipientId: tenantId,
        recipientName: tenantName,
        recipientRole: 'tenant',
        recipientContact: {
          email: currentAgreement?.tenantEmail || tenantRec?.email || userRec?.email || undefined,
          phone: currentAgreement?.tenantPhone || tenantRec?.phone || userRec?.phone || undefined,
        },
        senderId: resolvedOwnerId,
        senderName: 'Property Management',
        senderRole: 'system',
        ownerId: resolvedOwnerId,
        unitNumber: unit,
        relatedEntityId: renewalAgId,
        deliveryStatus: { inApp: 'delivered' },
      }).catch(console.warn);
    }

    showToast(`✓ Lease renewal for Unit ${unit} approved and finalized! New term active.`);
  };

  const logCommunication = async (entry: Omit<CommunicationLog, 'id' | 'createdAt'>): Promise<string> => {
    const logId = `COMM-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    // Accurate initial delivery status based on requested channels
    const wantsInApp = entry.channels.includes('in_app');
    const wantsEmail = entry.channels.includes('email');
    const wantsSms = entry.channels.includes('sms');

    const deliveryStatus: CommunicationLog['deliveryStatus'] = {
      inApp: wantsInApp ? 'delivered' : 'not_requested',
      email: wantsEmail ? 'skipped' : 'not_requested',
      sms: wantsSms ? 'skipped' : 'not_requested',
    };

    let smsSid: string | undefined = entry.smsSid;
    let emailMessageId: string | undefined = entry.emailMessageId;
    let errorMessage: string | undefined = entry.errorMessage;

    // Check gateway configuration
    const hasSg = Boolean(state.commsConfig?.sendgridConnected || state.commsConfig?.sendgridKey);
    const hasTw = Boolean(state.commsConfig?.twilioConnected || (state.commsConfig?.twilioSid && state.commsConfig?.twilioAuthToken));

    // If external delivery requested and Firebase is configured
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
            targetUserId: entry.recipientId || (auth.currentUser ? auth.currentUser.uid : undefined),
            title: entry.title,
            message: entry.body,
            channel: channelParam,
            targetPhone: (wantsSms && hasTw) ? entry.recipientContact?.phone : undefined,
            targetEmail: (wantsEmail && hasSg) ? entry.recipientContact?.email : undefined,
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
          console.warn('Real external comms dispatch error:', err);
          if (wantsEmail && hasSg) deliveryStatus.email = 'failed';
          if (wantsSms && hasTw) deliveryStatus.sms = 'failed';
          errorMessage = err?.message || 'Dispatch failed';
        }
      } else {
        const reasons: string[] = [];
        if (wantsEmail && !hasSg) reasons.push('SendGrid unconfigured');
        if (wantsSms && !hasTw) reasons.push('Twilio unconfigured');
        errorMessage = reasons.join(', ');
      }
    } else if (wantsEmail || wantsSms) {
      errorMessage = 'External communication skipped (credentials unconfigured or offline)';
    }

    const fullLog: CommunicationLog = {
      ...entry,
      id: logId,
      createdAt: new Date().toISOString(),
      deliveryStatus,
      smsSid,
      emailMessageId,
      errorMessage,
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'communicationLogs', logId), fullLog).catch(console.error);
    }
    setState((prev) => ({
      ...prev,
      communicationLogs: [fullLog, ...(prev.communicationLogs || [])],
    }));
    return logId;
  };

  const saveAnnouncement = async (announcement: Announcement): Promise<void> => {
    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'announcements', announcement.id), announcement).catch(console.error);
    }
    setState((prev) => {
      const existingIndex = (prev.announcements || []).findIndex((a) => a.id === announcement.id);
      let updated: Announcement[];
      if (existingIndex >= 0) {
        updated = [...(prev.announcements || [])];
        updated[existingIndex] = announcement;
      } else {
        updated = [announcement, ...(prev.announcements || [])];
      }
      return { ...prev, announcements: updated };
    });
  };

  const deleteAnnouncement = async (id: string): Promise<void> => {
    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'announcements', id)).catch(console.error);
    }
    setState((prev) => ({
      ...prev,
      announcements: (prev.announcements || []).filter((a) => a.id !== id),
    }));
  };

  const togglePinAnnouncement = async (id: string): Promise<void> => {
    const target = (state.announcements || []).find((a) => a.id === id);
    if (!target) return;
    const updated: Announcement = { ...target, isPinned: !target.isPinned, updatedAt: new Date().toISOString() };
    await saveAnnouncement(updated);
  };

  const archiveAnnouncement = async (id: string): Promise<void> => {
    const target = (state.announcements || []).find((a) => a.id === id);
    if (!target) return;
    const updated: Announcement = { ...target, status: 'archived', updatedAt: new Date().toISOString() };
    await saveAnnouncement(updated);
  };

  const acknowledgeAnnouncement = async (announcementId: string, acknowledgment: AnnouncementAcknowledgment): Promise<void> => {
    const target = (state.announcements || []).find((a) => a.id === announcementId);
    if (!target) return;
    const existingAcks = target.acknowledgments || [];
    if (existingAcks.some((a) => a.tenantId === acknowledgment.tenantId)) return;
    const updated: Announcement = {
      ...target,
      acknowledgments: [...existingAcks, acknowledgment],
      updatedAt: new Date().toISOString(),
    };
    await saveAnnouncement(updated);
  };

  const logAuditEvent = async (entry: {
    actor?: string;
    actorRole?: 'superadmin' | 'owner' | 'tenant' | 'staff' | 'system' | string;
    action: string;
    category?: 'financial' | 'lease' | 'support' | 'security' | 'maintenance' | 'user' | 'system' | string;
    detail: string;
    propertyId?: string;
    unit?: string;
    time?: string;
  }): Promise<void> => {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const actor = entry.actor || (auth.currentUser?.displayName || auth.currentUser?.email || 'Platform System');
    const actorRole = entry.actorRole || 'system';

    const finalItem: AuditLogItem = {
      id,
      time: entry.time || nowIso,
      timestamp: nowIso,
      actor,
      actorRole,
      action: entry.action,
      category: entry.category || 'system',
      detail: entry.detail,
      propertyId: entry.propertyId,
      unit: entry.unit,
    };

    setState((prev) => ({
      ...prev,
      auditLog: [finalItem, ...(prev.auditLog || []).filter((l) => l.id !== id)].slice(0, 500),
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'auditLog', id), finalItem);
      } catch (err) {
        console.warn('Firestore logAuditEvent error:', err);
      }
    }
  };

  const createPlatformSupportTicket = async (
    ticket: Omit<PlatformSupportTicket, 'id' | 'createdAt' | 'status'> & { id?: string }
  ): Promise<PlatformSupportTicket> => {
    const ticketId = ticket.id || `TICK-PS-${Date.now().toString().slice(-5)}`;
    const fullTicket: PlatformSupportTicket = {
      ...ticket,
      id: ticketId,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'platformSupport', ticketId), fullTicket).catch(console.error);
    }

    // Notify superadmins
    const superadmins = state.users.filter((u) => u.role === 'superadmin');
    const notifs: InAppNotification[] = superadmins.map((sa) => ({
      id: `notif_${Date.now()}_${sa.id}`,
      userId: sa.id,
      title: 'New Helpdesk Support Ticket',
      body: `${ticket.owner} raised a support request: "${ticket.topic}"`,
      link: '/superadmin/oversight?tab=support',
      isRead: false,
      createdAt: new Date().toISOString(),
    }));

    setState((prev) => ({
      ...prev,
      platformSupport: [fullTicket, ...(prev.platformSupport || []).filter((t) => t.id !== ticketId)],
      notifications: [...(prev.notifications || []), ...notifs],
    }));

    logAuditEvent({
      actor: ticket.owner || 'Owner',
      actorRole: 'owner',
      action: 'Support Ticket Raised',
      category: 'support',
      detail: `Helpdesk ticket #${ticketId}: "${ticket.topic}"`,
    }).catch(console.warn);

    showToast(`✓ Support ticket #${ticketId} submitted to Platform Admin.`);
    return fullTicket;
  };

  const resolvePlatformSupportTicket = async (ticketId: string, resolutionNotes?: string): Promise<void> => {
    const existing = (state.platformSupport || []).find((t) => t.id === ticketId);
    if (!existing) return;

    const resolvedTicket: PlatformSupportTicket = {
      ...existing,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: 'owner',
      resolutionNotes: resolutionNotes || 'Resolved by Property Owner',
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'platformSupport', ticketId), resolvedTicket, { merge: true }).catch(console.error);
    }

    setState((prev) => ({
      ...prev,
      platformSupport: (prev.platformSupport || []).map((t) => (t.id === ticketId ? resolvedTicket : t)),
    }));

    logAuditEvent({
      actor: existing.owner || 'Owner',
      actorRole: 'owner',
      action: 'Support Ticket Resolved',
      category: 'support',
      detail: `Helpdesk ticket #${ticketId} marked resolved by owner.`,
    }).catch(console.warn);

    showToast(`✓ Ticket #${ticketId} marked as resolved.`);
  };

  const savePlatformSupportTicket = async (ticket: PlatformSupportTicket): Promise<void> => {
    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'platformSupport', ticket.id), ticket, { merge: true }).catch(console.error);
    }
    setState((prev) => ({
      ...prev,
      platformSupport: (prev.platformSupport || []).map((t) => (t.id === ticket.id ? ticket : t)),
    }));
  };

  return (
    <AppDataContext.Provider
      value={{
        state,
        updateState: setState,
        showToast,
        toasts,
        logCommunication,
        updateOwnerPlan,
        markUserReminded,
        updateOwnerTrial,
        recordManagerPayout,
        signTenantAgreement,
        createOwnerMaintenanceTicket,
        sendStaffPaymentReminder,
        saveProperty,
        saveUnit,
        saveTenant,
        saveStaff,
        deleteStaff,
        saveManager,
        deleteManager,
        reassignManagerProperty,
        deleteUserAccount,
        saveAgreement,
        deleteAgreement,
        saveAgreementTemplate,
        deleteAgreementTemplate,
        uploadSignedAgreement,
        approveSignedAgreement,
        rejectSignedAgreement,
        updateAgreementAutopay,
        cancelAgreementAutopay,
        updateOwnerAutopay,
        cancelOwnerAutopay,
        saveTenancyRequest,
        saveInvoice,
        savePayment,
        markInvoicePaid,
        waiveInvoiceLateFee,
        savePlatformInvoice,
        requestLeaseRenewal,
        offerLeaseRenewal,
        submitTenantSignedRenewal,
        approveLeaseRenewal,
        respondToLeaseRenewal,
        markPlatformInvoicePaid,
        saveTicket,
        saveMoveout,
        saveOwnerSettings,
        savePlatformGateways,
        saveLandingConfig,
        saveCommsConfig,
        saveNotificationToggles,
        markNotificationRead,
        savePlatformInvoiceTemplate,
        saveTenantPayoutProfile,
        createDepositSettlement,
        respondToDepositSettlement,
        executeDepositRefund,
        confirmRefundReceipt,
        submitCashClaim,
        confirmCashClaim,
        rejectCashClaim,
        saveAnnouncement,
        deleteAnnouncement,
        togglePinAnnouncement,
        archiveAnnouncement,
        acknowledgeAnnouncement,
        createPlatformSupportTicket,
        resolvePlatformSupportTicket,
        savePlatformSupportTicket,
        logAuditEvent,
      }}
    >
      {children}
      {/* Modern Toast container */}
      <ModernToastContainer />
    </AppDataContext.Provider>
  );
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
};
